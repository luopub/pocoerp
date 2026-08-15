import { Router } from 'express'
import { PurchaseOrder } from '../models/purchaseOrder.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { Supplier } from '../models/supplier.js'
import { nextNo, subNo } from '../services/numbering.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

/** 校验 SKU 存在并返回所属 SPU（按单据类型） */
async function findSpu(type, sku) {
  if (type === 'product') return Product.findOne({ 'skus.no': sku }).lean()
  return Material.findOne({ 'skus.no': sku }).lean()
}

/** 最近采购价（下单时带出，可修改） */
async function lastPrice(type, sku) {
  const po = await PurchaseOrder.findOne({ type, 'items.sku': sku, status: { $ne: 'void' } })
    .sort({ createdAt: -1 }).lean()
  return po?.items.find((i) => i.sku === sku)?.price ?? null
}

// GET /api/purchases?type=&status=&keyword=
router.get('/', wrap(async (req, res) => {
  const { type, status, keyword } = req.query
  const q = {}
  if (type) q.type = type
  if (status) q.status = status
  if (keyword) {
    const re = new RegExp(keyword, 'i')
    q.$or = [{ no: re }, { supplier: re }, { 'items.sku': re }]
  }
  const list = await PurchaseOrder.find(q).sort({ createdAt: -1 }).lean()
  res.json({ list })
}))

// GET /api/purchases/last-price?type=&sku=
router.get('/last-price', wrap(async (req, res) => {
  const { type, sku } = req.query
  res.json({ price: await lastPrice(type, sku) })
}))

// GET /api/purchases/:id
router.get('/:id', wrap(async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  res.json({ doc })
}))

// POST /api/purchases  { type, supplier, date, remark, items: [{sku, qty, price}] }
router.post('/', canWrite, wrap(async (req, res) => {
  const { type, supplier, date, remark = '', items = [] } = req.body || {}
  if (!['product', 'material'].includes(type)) return res.status(400).json({ message: '采购单类型无效' })
  if (!supplier?.trim()) return res.status(400).json({ message: '供应商必填' })
  if (!(await Supplier.exists({ name: supplier.trim() }))) {
    return res.status(400).json({ message: `供应商「${supplier.trim()}」不存在` })
  }
  if (!items.length) return res.status(400).json({ message: '至少一行明细' })

  for (const it of items) {
    if (!it.sku || !it.qty || it.qty <= 0) return res.status(400).json({ message: '明细存在无效行（SKU/数量）' })
    if (it.price === undefined || it.price === null || it.price < 0) {
      return res.status(400).json({ message: '明细存在无效行（单价）' })
    }
    const spu = await findSpu(type, it.sku)
    if (!spu) return res.status(400).json({ message: `SKU ${it.sku} 不存在` })
  }

  const no = await nextNo(type === 'product' ? 'POP' : 'POM')
  const doc = await PurchaseOrder.create({
    no, type, supplier: supplier.trim(),
    date: date ? new Date(date) : new Date(),
    remark,
    items: items.map((it, i) => ({
      no: subNo(no, i + 1), sku: it.sku, qty: it.qty, price: it.price, receivedQty: 0,
    })),
    payable: items.reduce((s, it) => s + it.qty * it.price, 0),
    operator: req.user.username,
  })
  res.json({ doc })
}))

/**
 * POST /api/purchases/:id/receive  入库（支持分次）
 * body: { items?: [{no, qty}] }  缺省 = 全部剩余数量
 * 成品入库单位成本 = 采购单价 + 该 SKU 单位耗材成本（需求文档 4.5.1）
 */
router.post('/:id/receive', canWrite, wrap(async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  if (doc.status === 'void') return res.status(400).json({ message: '单据已作废' })
  if (doc.status === 'done') return res.status(400).json({ message: '单据已入库完成' })

  const reqItems = req.body?.items
  // 计算每行本次入库数量
  const plan = doc.items.map((it) => {
    const remaining = it.qty - it.receivedQty
    let qty = remaining
    if (reqItems?.length) {
      const r = reqItems.find((x) => x.no === it.no)
      qty = r ? Number(r.qty) : 0
    }
    if (qty < 0 || qty > remaining) {
      throw Object.assign(new Error(`明细 ${it.no} 入库数量无效（剩余 ${remaining}）`), { status: 400 })
    }
    return { item: it, qty }
  }).filter((p) => p.qty > 0)

  if (!plan.length) return res.status(400).json({ message: '本次无可入库数量' })

  await withTxn(async (session) => {
    for (const { item, qty } of plan) {
      let unitCost = item.price
      if (doc.type === 'product') {
        const spu = await Product.findOne({ 'skus.no': item.sku }).session(session).lean()
        const sku = spu?.skus.find((s) => s.no === item.sku)
        unitCost = item.price + (sku?.consumableCost || 0)
      }
      await applyInventoryChange({
        itemType: doc.type, sku: item.sku, change: qty, unitCost,
        type: LOG_TYPES.PURCHASE_IN, docId: doc._id, docNo: doc.no,
        operator: req.user.username,
      }, session)
      item.receivedQty += qty
    }
    doc.status = doc.items.every((i) => i.receivedQty >= i.qty) ? 'done' : 'partial'
    await doc.save({ session })
  })
  res.json({ doc })
}))

// POST /api/purchases/:id/void  作废（仅未入库过）
router.post('/:id/void', canWrite, wrap(async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  if (doc.status === 'void') return res.status(400).json({ message: '单据已作废' })
  if (doc.items.some((i) => i.receivedQty > 0)) {
    return res.status(400).json({ message: '已有入库记录，不能作废（可走差异结案）' })
  }
  doc.status = 'void'
  await doc.save()
  res.json({ doc })
}))

// POST /api/purchases/:id/close-diff  差异结案（情景 13）：未交数量结案，单据转已入库
router.post('/:id/close-diff', canWrite, wrap(async (req, res) => {
  const { diffNote = '' } = req.body || {}
  const doc = await PurchaseOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  if (doc.status !== 'partial') {
    return res.status(400).json({ message: '只有部分入库的单据可差异结案（未入库请直接作废）' })
  }
  if (!diffNote.trim()) return res.status(400).json({ message: '请填写差异原因' })
  doc.diffNote = diffNote.trim()
  doc.status = 'done'
  await doc.save()
  res.json({ doc })
}))

// POST /api/purchases/:id/payments  登记付款 { date, amount }（情景 17）
router.post('/:id/payments', canWrite, wrap(async (req, res) => {
  const { date, amount } = req.body || {}
  if (!amount || amount <= 0) return res.status(400).json({ message: '付款金额必须大于 0' })
  const doc = await PurchaseOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  if (doc.status === 'void') return res.status(400).json({ message: '单据已作废' })
  const paid = doc.payments.reduce((s, p) => s + p.amount, 0)
  if (paid + amount > doc.payable + 0.0001) {
    return res.status(400).json({ message: `付款超出应付（应付 ${doc.payable.toFixed(2)}，已付 ${paid.toFixed(2)}）` })
  }
  doc.payments.push({ date: date ? new Date(date) : new Date(), amount })
  await doc.save()
  res.json({ doc })
}))

// DELETE /api/purchases/:id/payments/:idx  删除一笔付款（登记错误时）
router.delete('/:id/payments/:idx', canWrite, wrap(async (req, res) => {
  const doc = await PurchaseOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '采购单不存在' })
  const idx = parseInt(req.params.idx, 10)
  if (idx < 0 || idx >= doc.payments.length) return res.status(400).json({ message: '付款记录不存在' })
  doc.payments.splice(idx, 1)
  await doc.save()
  res.json({ doc })
}))

export default router
