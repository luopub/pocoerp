import { Router } from 'express'
import { PurchaseOrder } from '../models/purchaseOrder.js'
import { WorkOrder } from '../models/workOrder.js'
import { OutboundOrder } from '../models/outboundOrder.js'
import { ReturnOrder } from '../models/returnOrder.js'
import { InventoryLog } from '../models/inventory.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { LOG_TYPES } from '../services/inventory.js'
import { requireAuth } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)

/** 付款状态 */
function payStatus(payable, payments) {
  const paid = payments.reduce((s, p) => s + p.amount, 0)
  if (paid <= 0) return { paid, status: '未付款' }
  if (paid < payable - 0.0001) return { paid, status: '部分付款' }
  return { paid, status: '已付清' }
}

// GET /api/reports/supplier-statement?supplier=
// 供应商对账（情景 17）：采购应付 + 加工费应付、付款状态、欠款天数
router.get('/supplier-statement', wrap(async (req, res) => {
  const { supplier } = req.query
  const suppliers = new Map() // name -> { payable, paid, docs[] }
  const ensure = (name) => {
    if (!suppliers.has(name)) suppliers.set(name, { supplier: name, payable: 0, paid: 0, docs: [] })
    return suppliers.get(name)
  }

  const poQ = { status: { $ne: 'void' } }
  if (supplier) poQ.supplier = supplier
  for (const po of await PurchaseOrder.find(poQ).sort({ date: 1 }).lean()) {
    const { paid, status } = payStatus(po.payable, po.payments || [])
    const s = ensure(po.supplier)
    s.payable += po.payable
    s.paid += paid
    s.docs.push({
      kind: '采购单', no: po.no, date: po.date, payable: po.payable, paid,
      owe: po.payable - paid, payStatus: status,
    })
  }

  // 加工费按工序加工商归集；付款按工序顺序 FIFO 分摊
  const wkoQ = { status: { $ne: 'void' }, payable: { $gt: 0 } }
  for (const w of await WorkOrder.find(wkoQ).sort({ createdAt: 1 }).lean()) {
    let remainPaid = (w.payments || []).reduce((s, p) => s + p.amount, 0)
    for (const p of w.processes) {
      if (!p.fee || !p.supplier) continue
      const alloc = Math.min(p.fee, Math.max(0, remainPaid))
      remainPaid -= alloc
      const s = ensure(p.supplier)
      s.payable += p.fee
      s.paid += alloc
      s.docs.push({
        kind: '加工费', no: `${w.no}/${p.name}`, date: p.startedAt || w.createdAt,
        payable: p.fee, paid: alloc, owe: p.fee - alloc,
        payStatus: alloc <= 0 ? '未付款' : alloc < p.fee - 0.0001 ? '部分付款' : '已付清',
      })
    }
  }

  const now = Date.now()
  const list = [...suppliers.values()].map((s) => {
    const unpaidDocs = s.docs.filter((d) => d.owe > 0.0001)
    const oldest = unpaidDocs.length
      ? Math.min(...unpaidDocs.map((d) => new Date(d.date).getTime()))
      : null
    return {
      supplier: s.supplier,
      payable: s.payable, paid: s.paid, owe: s.payable - s.paid,
      oweDays: oldest ? Math.floor((now - oldest) / 86400000) : 0,
      docs: s.docs,
    }
  }).sort((a, b) => b.owe - a.owe)
  res.json({ list })
}))

// GET /api/reports/inventory-period?itemType=product&windowDays=90
// SKU 平均库存周期（情景 7）：时间加权平均库存 ÷ 期间出库量 × 窗口天数
router.get('/inventory-period', wrap(async (req, res) => {
  const itemType = req.query.itemType === 'material' ? 'material' : 'product'
  const windowDays = Math.min(365, Math.max(7, parseInt(req.query.windowDays, 10) || 90))
  const since = new Date(Date.now() - windowDays * 86400000)
  const outTypes = itemType === 'product'
    ? [LOG_TYPES.SALE_OUT, LOG_TYPES.SCRAP_OUT]
    : [LOG_TYPES.ISSUE_OUT, LOG_TYPES.SCRAP_OUT]

  const Model = itemType === 'product' ? Product : Material
  const spus = await Model.find({ active: true }).lean()
  const skuMeta = new Map()
  for (const p of spus) {
    for (const s of p.skus) {
      if (s.active && (itemType !== 'product' || p.kind === 'physical')) {
        skuMeta.set(s.no, { spuNo: p.no, spuName: p.name })
      }
    }
  }
  const skus = [...skuMeta.keys()]
  const list = []

  for (const sku of skus) {
    // 窗口前的结存：窗口前最近一条流水的 balance（无则 0）
    const before = await InventoryLog.findOne({ itemType, sku, time: { $lt: since } })
      .sort({ time: -1 }).lean()
    let qty = before?.balance ?? 0
    const logs = await InventoryLog.find({ itemType, sku, time: { $gte: since } }).sort({ time: 1 }).lean()

    // 时间加权平均库存
    let area = 0
    let t = since.getTime()
    let outQty = 0
    for (const l of logs) {
      const lt = new Date(l.time).getTime()
      area += qty * (lt - t)
      t = lt
      qty = l.balance
      if (outTypes.includes(l.type) && l.change < 0) outQty += -l.change
    }
    area += qty * (Date.now() - t)
    const avgQty = area / (windowDays * 86400000)
    const period = avgQty > 0 && outQty > 0 ? (avgQty / outQty) * windowDays : null
    const meta = skuMeta.get(sku)
    list.push({
      sku, ...meta, avgQty: Math.round(avgQty * 100) / 100, outQty,
      currentQty: qty, periodDays: period === null ? null : Math.round(period * 10) / 10,
    })
  }
  list.sort((a, b) => (b.periodDays ?? -1) - (a.periodDays ?? -1))
  res.json({ windowDays, list })
}))

// GET /api/reports/channel-stats?from=&to=  渠道出库统计（按映射平台分组）
router.get('/channel-stats', wrap(async (req, res) => {
  const { from, to } = req.query
  const q = { type: 'sale', status: 'done' }
  if (from || to) {
    q.date = {}
    if (from) q.date.$gte = new Date(from)
    if (to) q.date.$lte = new Date(`${to}T23:59:59.999Z`)
  }
  const orders = await OutboundOrder.find(q).lean()
  const byPlatform = new Map()
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.platform || o.channel || '未指定'
      if (!byPlatform.has(key)) byPlatform.set(key, { platform: key, qty: 0, cost: 0, orders: new Set() })
      const g = byPlatform.get(key)
      g.qty += it.qty
      g.cost += it.qty * (it.unitCost || 0)
      g.orders.add(o.no)
    }
  }
  const list = [...byPlatform.values()]
    .map((g) => ({ platform: g.platform, qty: g.qty, cost: Math.round(g.cost * 100) / 100, orderCount: g.orders.size }))
    .sort((a, b) => b.qty - a.qty)
  res.json({ list })
}))

// GET /api/reports/loss  损耗汇总（报废出库 + 退货不良品）
router.get('/loss', wrap(async (req, res) => {
  const scraps = await OutboundOrder.find({ type: 'scrap', status: 'done' }).lean()
  const byReason = new Map()
  let scrapQty = 0; let scrapCost = 0
  for (const o of scraps) {
    const key = o.scrapReason || '未填写'
    if (!byReason.has(key)) byReason.set(key, { reason: key, qty: 0, cost: 0 })
    for (const it of o.items) {
      const g = byReason.get(key)
      g.qty += it.qty
      g.cost += it.qty * (it.unitCost || 0)
      scrapQty += it.qty
      scrapCost += it.qty * (it.unitCost || 0)
    }
  }
  const returns = await ReturnOrder.find({ status: 'done' }).lean()
  let badReturnQty = 0
  for (const r of returns) {
    for (const it of r.items) if (it.condition === 'bad') badReturnQty += it.qty
  }
  res.json({
    scrapQty, scrapCost: Math.round(scrapCost * 100) / 100,
    badReturnQty,
    byReason: [...byReason.values()].map((g) => ({ ...g, cost: Math.round(g.cost * 100) / 100 })),
  })
}))

export default router
