import { Router } from 'express'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { PurchaseOrder } from '../models/purchaseOrder.js'
import { WorkOrder } from '../models/workOrder.js'
import { nextNo, subNo } from '../services/numbering.js'
import { computeAlerts, computeOverdueWorkorders, dashboardData } from '../services/alerts.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

// GET /api/alerts  全部 SKU 的预警行（前端自行筛选）；?onlyWarn=1 只返回触发预警的
router.get('/', wrap(async (req, res) => {
  const rows = await computeAlerts()
  res.json({ list: req.query.onlyWarn ? rows.filter((r) => r.lowStock || r.dynamicWarn) : rows })
}))

// GET /api/alerts/overdue  工单超期（情景 18）
router.get('/overdue', wrap(async (req, res) => {
  res.json({ list: await computeOverdueWorkorders() })
}))

// GET /api/alerts/dashboard  首页看板聚合
router.get('/dashboard', wrap(async (req, res) => {
  res.json(await dashboardData())
}))

// GET /api/alerts/replenishment  补货建议（情景 14）：预警或建议量>0 的 SKU
router.get('/replenishment', wrap(async (req, res) => {
  const rows = await computeAlerts()
  const list = rows.filter((r) => r.suggestQty > 0 || r.lowStock || r.dynamicWarn)
  // 补充来源信息：产品来源方式/默认供应商，材料默认供应商
  const products = await Product.find({ no: { $in: [...new Set(list.map((r) => r.spuNo))] } }).lean()
  const pMap = new Map(products.map((p) => [p.no, p]))
  const matNos = list.filter((r) => r.itemType === 'material').map((r) => r.spuNo)
  const materials = await Material.find({ no: { $in: matNos } }).lean()
  const mMap = new Map(materials.map((m) => [m.no, m]))
  for (const r of list) {
    if (r.itemType === 'product') {
      const p = pMap.get(r.spuNo)
      r.source = p?.source || 'direct'
      r.defaultSupplier = p?.defaultSupplier || ''
    } else {
      r.defaultSupplier = mMap.get(r.spuNo)?.defaultSupplier || ''
    }
  }
  res.json({ list })
}))

/**
 * POST /api/alerts/replenishment/generate  一键生成采购/加工单草稿（情景 14）
 * body: { items: [{itemType, sku, qty}] }
 * - 材料 & 直采产品 → 按供应商分组合成采购单（状态待入库）
 * - 委外加工产品 → 按 SPU 合成加工单（状态待开始）
 */
router.post('/replenishment/generate', canWrite, wrap(async (req, res) => {
  const { items = [] } = req.body || {}
  if (!items.length) return res.status(400).json({ message: '未选择任何 SKU' })

  const created = []
  const poGroups = new Map() // key: type|supplier -> [{sku, qty}]
  const wkoGroups = new Map() // key: spuNo -> [{sku, qty}]

  for (const it of items) {
    if (!it.qty || it.qty <= 0) continue
    if (it.itemType === 'material') {
      const m = await Material.findOne({ 'skus.no': it.sku }).lean()
      if (!m) return res.status(400).json({ message: `SKU ${it.sku} 不存在` })
      const key = `material|${m.defaultSupplier || '未指定供应商'}`
      if (!poGroups.has(key)) poGroups.set(key, [])
      poGroups.get(key).push({ sku: it.sku, qty: it.qty })
    } else {
      const p = await Product.findOne({ 'skus.no': it.sku }).lean()
      if (!p) return res.status(400).json({ message: `SKU ${it.sku} 不存在` })
      if (p.source === 'outsourced' || (p.source === 'both' && p.bom.length && !p.defaultSupplier)) {
        if (!p.bom.length || !p.processTemplate.length) {
          return res.status(400).json({ message: `产品 ${p.name} 未配置 BOM/工序模板，无法生成加工单` })
        }
        if (!wkoGroups.has(p.no)) wkoGroups.set(p.no, [])
        wkoGroups.get(p.no).push({ sku: it.sku, qty: it.qty })
      } else {
        const key = `product|${p.defaultSupplier || '未指定供应商'}`
        if (!poGroups.has(key)) poGroups.set(key, [])
        poGroups.get(key).push({ sku: it.sku, qty: it.qty })
      }
    }
  }

  for (const [key, arr] of poGroups) {
    const [type, supplier] = key.split('|')
    const no = await nextNo(type === 'product' ? 'POP' : 'POM')
    created.push(await PurchaseOrder.create({
      no, type, supplier, operator: req.user.username,
      remark: '补货建议生成',
      items: arr.map((it, i) => ({ no: subNo(no, i + 1), sku: it.sku, qty: it.qty, price: 0, receivedQty: 0 })),
      payable: 0,
    }))
  }
  for (const [spuNo, arr] of wkoGroups) {
    const p = await Product.findOne({ no: spuNo }).lean()
    const no = await nextNo('WKO')
    created.push(await WorkOrder.create({
      no, spuNo, operator: req.user.username, remark: '补货建议生成',
      planItems: arr.map((it) => ({ sku: it.sku, qty: it.qty, receivedQty: 0 })),
      bomSnapshot: p.bom.map((b) => ({ ...b })),
      processes: p.processTemplate.map((t, i) => ({
        no: subNo(no, i + 1), seq: i + 1, name: t.name, expectedDays: t.expectedDays,
        qtys: arr.map((it) => ({ sku: it.sku, inQty: 0, outQty: 0 })),
      })),
    }))
  }
  res.json({ created: created.map((d) => ({ no: d.no, kind: d.planItems ? 'workorder' : 'purchase' })) })
}))

export default router
