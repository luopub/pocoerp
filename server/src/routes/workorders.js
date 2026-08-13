import { Router } from 'express'
import { WorkOrder } from '../models/workOrder.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { nextNo, subNo } from '../services/numbering.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

function bad(res, msg) { return res.status(400).json({ message: msg }) }

// GET /api/workorders?status=&keyword=
router.get('/', wrap(async (req, res) => {
  const { status, keyword } = req.query
  const q = {}
  if (status) q.status = status
  if (keyword) q.$or = [{ no: new RegExp(keyword, 'i') }, { spuNo: new RegExp(keyword, 'i') }]
  const list = await WorkOrder.find(q).sort({ createdAt: -1 }).lean()
  // 补充产品名与当前工序名
  const spus = [...new Set(list.map((w) => w.spuNo))]
  const products = await Product.find({ no: { $in: spus } }).lean()
  const pMap = new Map(products.map((p) => [p.no, p.name]))
  for (const w of list) {
    w.spuName = pMap.get(w.spuNo) || ''
    const cur = w.processes.find((p) => p.seq === w.currentStep)
    w.currentStepName = cur ? cur.name : ''
  }
  res.json({ list })
}))

// GET /api/workorders/:id
router.get('/:id', wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  const p = await Product.findOne({ no: doc.spuNo }).lean()
  doc.spuName = p?.name || ''
  doc.consumableCost = p?.consumableCost || 0
  res.json({ doc })
}))

// POST /api/workorders  { spuNo, planItems: [{sku, qty}], remark }
router.post('/', canWrite, wrap(async (req, res) => {
  const { spuNo, planItems = [], remark = '' } = req.body || {}
  const product = await Product.findOne({ no: spuNo }).lean()
  if (!product) return bad(res, '产品不存在')
  if (product.kind !== 'physical') return bad(res, '虚拟组合产品不能下加工单')
  if (product.source === 'direct') return bad(res, '该产品来源方式为直接采购，未配置委外加工')
  if (!product.processTemplate?.length) return bad(res, '该产品未配置工序模板')
  if (!product.bom?.length) return bad(res, '该产品未配置物料清单（BOM）')
  if (!planItems.length) return bad(res, '至少一行计划明细')
  for (const it of planItems) {
    if (!it.qty || it.qty <= 0) return bad(res, '计划数量必须大于 0')
    if (!product.skus.some((s) => s.no === it.sku)) return bad(res, `SKU ${it.sku} 不属于该产品`)
  }

  const no = await nextNo('WKO')
  const doc = await WorkOrder.create({
    no, spuNo, remark, operator: req.user.username,
    planItems: planItems.map((it) => ({ sku: it.sku, qty: it.qty, receivedQty: 0 })),
    bomSnapshot: product.bom.map((b) => ({ ...b })),
    processes: product.processTemplate.map((p, i) => ({
      no: subNo(no, i + 1), seq: i + 1, name: p.name, expectedDays: p.expectedDays,
      qtys: planItems.map((it) => ({ sku: it.sku, inQty: 0, outQty: 0 })),
    })),
  })
  res.json({ doc })
}))

// GET /api/workorders/:id/suggest-issue?stepSeq=N
// 按 BOM 快照计算该工序建议发料：Σ 计划数量 × 单位用量 − 已发数量
router.get('/:id/suggest-issue', wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  const stepSeq = parseInt(req.query.stepSeq, 10)
  const step = doc.processes.find((p) => p.seq === stepSeq)
  if (!step) return bad(res, '工序不存在')

  const usageFor = (bomRow) => {
    // 适用 SKU 过滤后的总用量
    const applicable = doc.planItems.filter((pi) =>
      !bomRow.applySkus?.length || bomRow.applySkus.includes(pi.sku))
    return applicable.reduce((s, pi) => s + pi.qty * bomRow.usage, 0)
  }
  const issuedFor = (materialSku) =>
    doc.issues.filter((i) => i.stepSeq === stepSeq && i.materialSku === materialSku)
      .reduce((s, i) => s + i.qty, 0)

  const list = []
  const byMaterial = new Map() // 同一材料多行（按 SKU 不同用量）合并
  for (const b of doc.bomSnapshot) {
    const isMainHere = b.bomType === 'main' && stepSeq === 1
    const isAuxHere = b.bomType === 'aux' && b.processStep === step.name
    if (!isMainHere && !isAuxHere) continue
    byMaterial.set(b.materialSku, (byMaterial.get(b.materialSku) || 0) + usageFor(b))
  }
  for (const [materialSku, total] of byMaterial) {
    const suggested = total - issuedFor(materialSku)
    if (suggested > 0) list.push({ materialSku, qty: suggested })
  }
  res.json({ list })
}))

// POST /api/workorders/:id/steps/:seq/start  { supplier }
router.post('/:id/steps/:seq/start', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  if (doc.status === 'void' || doc.status === 'done') return bad(res, '单据已结束')
  const seq = parseInt(req.params.seq, 10)
  const step = doc.processes.find((p) => p.seq === seq)
  if (!step) return bad(res, '工序不存在')
  if (step.startedAt) return bad(res, '该工序已开始')
  const prev = doc.processes.find((p) => p.seq === seq - 1)
  if (prev && !prev.finishedAt) return bad(res, `上一道工序「${prev.name}」未完成，不能开始本工序`)

  step.startedAt = new Date()
  step.supplier = req.body?.supplier || ''
  doc.currentStep = seq
  doc.status = 'processing'
  await doc.save()
  res.json({ doc })
}))

// PUT /api/workorders/:id/steps/:seq  { supplier, fee, remark, qtys: [{sku, inQty, outQty}] }
router.put('/:id/steps/:seq', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  const seq = parseInt(req.params.seq, 10)
  const step = doc.processes.find((p) => p.seq === seq)
  if (!step) return bad(res, '工序不存在')
  if (!step.startedAt) return bad(res, '工序未开始')
  if (step.finishedAt) return bad(res, '工序已完成，不能再修改')

  const { supplier, fee, remark, qtys } = req.body || {}
  if (supplier !== undefined) step.supplier = supplier
  if (fee !== undefined) step.fee = Number(fee) || 0
  if (remark !== undefined) step.remark = remark
  if (qtys) {
    for (const q of qtys) {
      const t = step.qtys.find((x) => x.sku === q.sku)
      if (t) { t.inQty = Number(q.inQty) || 0; t.outQty = Number(q.outQty) || 0 }
    }
  }
  doc.payable = doc.processes.reduce((s, p) => s + (p.fee || 0), 0)
  await doc.save()
  res.json({ doc })
}))

// POST /api/workorders/:id/steps/:seq/finish
router.post('/:id/steps/:seq/finish', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  const seq = parseInt(req.params.seq, 10)
  const step = doc.processes.find((p) => p.seq === seq)
  if (!step) return bad(res, '工序不存在')
  if (!step.startedAt) return bad(res, '工序未开始')
  if (step.finishedAt) return bad(res, '工序已完成')

  step.finishedAt = new Date()
  await doc.save()
  res.json({ doc })
}))

// POST /api/workorders/:id/issue  { stepSeq, materialSku, qty }
router.post('/:id/issue', canWrite, wrap(async (req, res) => {
  const { stepSeq, materialSku, qty } = req.body || {}
  if (!materialSku || !qty || qty <= 0) return bad(res, '材料与数量必填')
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  if (doc.status === 'void' || doc.status === 'done') return bad(res, '单据已结束')
  const step = doc.processes.find((p) => p.seq === Number(stepSeq))
  if (!step) return bad(res, '工序不存在')
  if (!step.startedAt) return bad(res, '工序未开始，不能发料')
  if (await Material.countDocuments({ 'skus.no': materialSku }) === 0) {
    return bad(res, `材料 SKU ${materialSku} 不存在`)
  }

  await withTxn(async (session) => {
    const r = await applyInventoryChange({
      itemType: 'material', sku: materialSku, change: -qty,
      type: LOG_TYPES.ISSUE_OUT, docId: doc._id, docNo: doc.no,
      operator: req.user.username,
    }, session)
    doc.issues.push({ stepSeq: Number(stepSeq), materialSku, qty, unitCost: r.avgCost })
    await doc.save({ session })
  })
  res.json({ doc })
}))

/**
 * POST /api/workorders/:id/complete  完工入库 { items: [{sku, qty}] }
 * 最后一道工序完成后才可入库；可分次（按 SKU）。
 * 成本：单件成本 =（已发料成本 + 已录加工费）÷ 计划总数量；入库单位成本 = 单件成本 + 单位耗材成本
 */
router.post('/:id/complete', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  if (doc.status === 'void' || doc.status === 'done') return bad(res, '单据已结束')
  const last = doc.processes[doc.processes.length - 1]
  if (!last?.finishedAt) return bad(res, `最后一道工序「${last?.name || ''}」未完成，不能完工入库`)

  const reqItems = req.body?.items || []
  if (!reqItems.length) return bad(res, '至少一行入库明细')
  const product = await Product.findOne({ no: doc.spuNo }).lean()
  const consumable = product?.consumableCost || 0

  const batch = []
  for (const it of reqItems) {
    const plan = doc.planItems.find((p) => p.sku === it.sku)
    if (!plan) return bad(res, `SKU ${it.sku} 不在计划明细中`)
    const qty = Number(it.qty)
    const remaining = plan.qty - plan.receivedQty
    if (!qty || qty <= 0 || qty > remaining) {
      return bad(res, `SKU ${it.sku} 入库数量无效（剩余 ${remaining}）`)
    }
    batch.push({ plan, qty })
  }

  const materialCost = doc.issues.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0)
  const feeTotal = doc.processes.reduce((s, p) => s + (p.fee || 0), 0)
  const totalPlanQty = doc.planItems.reduce((s, p) => s + p.qty, 0)
  const perUnit = (materialCost + feeTotal) / totalPlanQty + consumable

  await withTxn(async (session) => {
    for (const { plan, qty } of batch) {
      await applyInventoryChange({
        itemType: 'product', sku: plan.sku, change: qty, unitCost: perUnit,
        type: LOG_TYPES.WORK_IN, docId: doc._id, docNo: doc.no,
        operator: req.user.username,
      }, session)
      plan.receivedQty += qty
    }
    if (doc.planItems.every((p) => p.receivedQty >= p.qty)) {
      doc.status = 'done'
      doc.finishedAt = new Date()
    }
    await doc.save({ session })
  })
  res.json({ doc, perUnitCost: perUnit })
}))

// POST /api/workorders/:id/void  作废（仅未发料且未入库）
router.post('/:id/void', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  if (doc.status === 'void') return bad(res, '单据已作废')
  if (doc.issues.length > 0) return bad(res, '已发料，不能作废')
  if (doc.planItems.some((p) => p.receivedQty > 0)) return bad(res, '已有完工入库，不能作废')
  doc.status = 'void'
  await doc.save()
  res.json({ doc })
}))

// POST /api/workorders/:id/payments  登记加工费付款 { date, amount }（情景 17）
router.post('/:id/payments', canWrite, wrap(async (req, res) => {
  const { date, amount } = req.body || {}
  if (!amount || amount <= 0) return bad(res, '付款金额必须大于 0')
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  if (doc.status === 'void') return bad(res, '单据已作废')
  const paid = doc.payments.reduce((s, p) => s + p.amount, 0)
  if (paid + amount > doc.payable + 0.0001) {
    return bad(res, `付款超出应付（应付 ${doc.payable.toFixed(2)}，已付 ${paid.toFixed(2)}）`)
  }
  doc.payments.push({ date: date ? new Date(date) : new Date(), amount })
  await doc.save()
  res.json({ doc })
}))

// DELETE /api/workorders/:id/payments/:idx
router.delete('/:id/payments/:idx', canWrite, wrap(async (req, res) => {
  const doc = await WorkOrder.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '加工单不存在' })
  const idx = parseInt(req.params.idx, 10)
  if (idx < 0 || idx >= doc.payments.length) return bad(res, '付款记录不存在')
  doc.payments.splice(idx, 1)
  await doc.save()
  res.json({ doc })
}))

export default router
