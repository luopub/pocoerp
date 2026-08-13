import { Router } from 'express'
import { ReturnOrder } from '../models/returnOrder.js'
import { Product } from '../models/product.js'
import { nextNo } from '../services/numbering.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

function bad(res, msg) { return res.status(400).json({ message: msg }) }

// GET /api/returns?status=&keyword=
router.get('/', wrap(async (req, res) => {
  const { status, keyword } = req.query
  const q = {}
  if (status) q.status = status
  if (keyword) {
    const re = new RegExp(keyword, 'i')
    q.$or = [{ no: re }, { channel: re }, { originalOutboundNo: re }, { 'items.sku': re }]
  }
  const list = await ReturnOrder.find(q).sort({ createdAt: -1 }).lean()
  res.json({ list })
}))

/**
 * POST /api/returns  { channel, originalOutboundNo?, remark?, items: [{sku, qty, condition}] }
 * 良品 → 退货入库（库存增加，按当前加权成本入账）；不良品 → 只记录（计入损耗统计），不动库存
 */
router.post('/', canWrite, wrap(async (req, res) => {
  const { channel = '', originalOutboundNo = '', remark = '', items = [] } = req.body || {}
  if (!items.length) return bad(res, '至少一行明细')
  for (const it of items) {
    if (!it.sku || !it.qty || it.qty <= 0) return bad(res, '明细存在无效行')
    if (!['good', 'bad'].includes(it.condition)) return bad(res, '明细必须选择成色（良品/不良品）')
    const p = await Product.findOne({ 'skus.no': it.sku }).lean()
    if (!p) return bad(res, `SKU ${it.sku} 不存在`)
    if (p.kind === 'virtual') return bad(res, `虚拟组合 SKU ${it.sku} 无实物库存，退货请按组件 SKU 录入`)
  }

  const no = await nextNo('RTN')
  const doc = new ReturnOrder({
    no, channel, originalOutboundNo, remark, items, operator: req.user.username, date: new Date(),
  })
  await withTxn(async (session) => {
    for (const it of doc.items) {
      if (it.condition === 'good') {
        await applyInventoryChange({
          itemType: 'product', sku: it.sku, change: it.qty,
          type: LOG_TYPES.RETURN_IN, docId: doc._id, docNo: no,
          operator: req.user.username,
        }, session)
      }
    }
    await doc.save({ session })
  })
  res.json({ doc })
}))

// POST /api/returns/:id/void  作废：良品回库数量退回（负向退货入库流水对冲）
router.post('/:id/void', canWrite, wrap(async (req, res) => {
  const doc = await ReturnOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '退货单不存在' })
  if (doc.status === 'void') return bad(res, '单据已作废')

  await withTxn(async (session) => {
    for (const it of doc.items) {
      if (it.condition === 'good') {
        await applyInventoryChange({
          itemType: 'product', sku: it.sku, change: -it.qty,
          type: LOG_TYPES.RETURN_IN, docId: doc._id, docNo: `${doc.no}(作废回滚)`,
          operator: req.user.username,
        }, session)
      }
    }
    doc.status = 'void'
    doc.voidedAt = new Date()
    await doc.save({ session })
  })
  res.json({ doc })
}))

export default router
