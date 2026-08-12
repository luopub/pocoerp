import { Router } from 'express'
import { OutboundOrder } from '../models/outboundOrder.js'
import { ListingMapping } from '../models/listingMapping.js'
import { Product } from '../models/product.js'
import { nextNo } from '../services/numbering.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { stockMap } from '../services/stockQuery.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

// GET /api/outbounds?type=&status=&keyword=
router.get('/', wrap(async (req, res) => {
  const { type, status, keyword } = req.query
  const q = {}
  if (type) q.type = type
  if (status) q.status = status
  if (keyword) {
    const re = new RegExp(keyword, 'i')
    q.$or = [{ no: re }, { channel: re }, { platformOrderNo: re }, { 'items.sku': re }, { 'items.id1': re }]
  }
  const list = await OutboundOrder.find(q).sort({ createdAt: -1 }).lean()
  res.json({ list })
}))

// GET /api/outbounds/:id
router.get('/:id', wrap(async (req, res) => {
  const doc = await OutboundOrder.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '出库单不存在' })
  res.json({ doc })
}))

/**
 * POST /api/outbounds  创建并确认出库（一步完成）
 * 销售出库: { type:'sale', channel?, platformOrderNo?, remark?, items:[{mappingId, qty}] }
 * 报废出库: { type:'scrap', scrapReason, remark?, items:[{sku, qty}] }
 *
 * 销售明细按映射解析 → 内部 SKU；虚拟组合 SKU 展开为组件扣减。
 * 库存扣减 + 流水 + 单据在同一事务；任一组件库存不足则整单回滚。
 */
router.post('/', canWrite, wrap(async (req, res) => {
  const { type = 'sale', channel = '', platformOrderNo = '', scrapReason = '', remark = '', items = [] } = req.body || {}
  if (!['sale', 'scrap'].includes(type)) return res.status(400).json({ message: '出库类型无效' })
  if (!items.length) return res.status(400).json({ message: '至少一行明细' })
  if (type === 'scrap' && !scrapReason?.trim()) return res.status(400).json({ message: '报废出库必须填写报废原因' })
  for (const it of items) {
    if (!it.qty || it.qty <= 0) return res.status(400).json({ message: '明细存在无效数量' })
    if (type === 'sale' && !it.mappingId) return res.status(400).json({ message: '销售出库必须通过平台映射' })
    if (type === 'scrap' && !it.sku) return res.status(400).json({ message: '报废出库必须选择内部 SKU' })
  }

  // 解析明细 → 销售行 + 实际扣减行
  const lines = [] // 出库行（映射快照 + 销售 SKU）
  const deductions = new Map() // sku -> qty 实际扣减（虚拟组合展开）
  if (type === 'sale') {
    for (const it of items) {
      const mapping = await ListingMapping.findById(it.mappingId).lean()
      if (!mapping) return res.status(400).json({ message: `映射不存在：${it.mappingId}` })
      const product = await Product.findOne({ no: mapping.spuNo }).lean()
      if (!product) return res.status(400).json({ message: `映射对应的产品 ${mapping.spuNo} 不存在` })
      lines.push({
        platform: mapping.platform, account: mapping.account,
        id1: mapping.id1, id2: mapping.id2,
        sku: mapping.skuNo, qty: it.qty,
        _virtual: product.kind === 'virtual',
        _components: product.kind === 'virtual' ? product.components : null,
      })
    }
  } else {
    for (const it of items) {
      const product = await Product.findOne({ 'skus.no': it.sku }).lean()
      if (!product) return res.status(400).json({ message: `SKU ${it.sku} 不存在` })
      if (product.kind === 'virtual') {
        return res.status(400).json({ message: `虚拟组合 SKU ${it.sku} 无实物库存，不能报废` })
      }
      lines.push({ sku: it.sku, qty: it.qty, _virtual: false, _components: null })
    }
  }

  // 展开扣减：虚拟组合 → 组件；实物 → 自身
  for (const line of lines) {
    if (line._virtual) {
      if (!line._components?.length) return res.status(400).json({ message: `虚拟组合 ${line.sku} 未配置组成明细` })
      for (const c of line._components) {
        deductions.set(c.sku, (deductions.get(c.sku) || 0) + c.qty * line.qty)
      }
    } else {
      deductions.set(line.sku, (deductions.get(line.sku) || 0) + line.qty)
    }
  }

  const skuList = [...deductions.keys()]
  const stocks = await stockMap('product', skuList)
  // 预检：给出明确的缺料提示（缺哪个组件、缺多少）
  for (const [sku, need] of deductions) {
    const have = stocks.get(sku)?.qty ?? 0
    if (have < need) {
      return res.status(400).json({ message: `库存不足：${sku} 现有 ${have}，需要 ${need}` })
    }
  }

  const no = await nextNo('OUT')
  const doc = new OutboundOrder({
    no, type,
    channel: channel || (type === 'sale' ? lines[0]?.platform || '' : ''),
    platformOrderNo, scrapReason, remark,
    operator: req.user.username,
    date: new Date(),
  })

  await withTxn(async (session) => {
    // 扣减并记录每行成本
    const costBySku = new Map()
    for (const [sku, qty] of deductions) {
      const cur = stocks.get(sku)
      costBySku.set(sku, cur?.avgCost ?? 0)
      await applyInventoryChange({
        itemType: 'product', sku, change: -qty,
        type: type === 'sale' ? LOG_TYPES.SALE_OUT : LOG_TYPES.SCRAP_OUT,
        docId: doc._id, docNo: no, operator: req.user.username,
      }, session)
    }
    // 出库行成本：实物=自身加权成本；虚拟=Σ组件加权成本×单位用量
    doc.items = lines.map((l) => {
      let unitCost = 0
      if (l._virtual) {
        unitCost = l._components.reduce((s, c) => s + (costBySku.get(c.sku) || 0) * c.qty, 0)
      } else {
        unitCost = costBySku.get(l.sku) || 0
      }
      const { _virtual, _components, ...rest } = l
      return { ...rest, unitCost }
    })
    await doc.save({ session })
  })
  res.json({ doc })
}))

/**
 * POST /api/outbounds/:id/void  作废回滚：
 * 按原出库成本把扣减数量退回库存（同流水类型、正数变动，报表自然对冲）
 */
router.post('/:id/void', canWrite, wrap(async (req, res) => {
  const doc = await OutboundOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '出库单不存在' })
  if (doc.status === 'void') return res.status(400).json({ message: '单据已作废' })

  await withTxn(async (session) => {
    // 展开实际扣减行（与创建时同一逻辑）
    const spuNos = [...new Set(doc.items.map((i) => i.sku.split('-')[0]))]
    const products = await Product.find({ no: { $in: spuNos } }).session(session).lean()
    const pMap = new Map(products.map((p) => [p.no, p]))
    const deductions = new Map()
    for (const it of doc.items) {
      const product = pMap.get(it.sku.split('-')[0])
      if (product?.kind === 'virtual') {
        for (const c of product.components) {
          deductions.set(c.sku, (deductions.get(c.sku) || 0) + c.qty * it.qty)
        }
      } else {
        deductions.set(it.sku, (deductions.get(it.sku) || 0) + it.qty)
      }
    }
    for (const [sku, qty] of deductions) {
      await applyInventoryChange({
        itemType: 'product', sku, change: qty,
        unitCost: doc.items.find((i) => i.sku === sku)?.unitCost,
        type: doc.type === 'sale' ? LOG_TYPES.SALE_OUT : LOG_TYPES.SCRAP_OUT,
        docId: doc._id, docNo: `${doc.no}(作废回滚)`, operator: req.user.username,
      }, session)
    }
    doc.status = 'void'
    doc.voidedAt = new Date()
    await doc.save({ session })
  })
  res.json({ doc })
}))

export default router
