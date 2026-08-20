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
  doc.skuConsumables = Object.fromEntries((p?.skus || []).map((s) => [s.no, s.consumableCost || 0]))
  res.json({ doc })
}))

// POST /api/workorders  { spuNo, planItems: [{sku, qty}], materialInput: {materialSku, qty}, discardLeftover, remark }
// 建单须指定主材及输入量（作为首道工序输入）；约束 Σ各SKU计划×单位用量 ≤ 主材输入量
router.post('/', canWrite, wrap(async (req, res) => {
  const { spuNo, planItems = [], materialInput = null, discardLeftover = true, remark = '' } = req.body || {}
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

  const mainRows = product.bom.filter((b) => b.bomType === 'main')
  if (!mainRows.length) return bad(res, '该产品 BOM 未配置主材')
  const mainMaterials = [...new Set(mainRows.map((b) => b.materialSku))]
  if (!materialInput?.materialSku || !mainMaterials.includes(materialInput.materialSku)) {
    return bad(res, `请选择主材（${mainMaterials.join(' / ')}）作为首道工序输入`)
  }
  if (await Material.countDocuments({ 'skus.no': materialInput.materialSku }) === 0) {
    return bad(res, `材料 SKU ${materialInput.materialSku} 不存在`)
  }
  const inputQty = Number(materialInput.qty)
  if (!inputQty || inputQty <= 0) return bad(res, '主材输入量必须大于 0')
  const usageOf = (sku) => mainRows
    .filter((b) => !b.applySkus?.length || b.applySkus.includes(sku))
    .reduce((s, b) => s + b.usage, 0)
  const required = planItems.reduce((s, it) => s + it.qty * usageOf(it.sku), 0)
  if (required - inputQty > 1e-6) {
    return bad(res, `计划总用料 ${Math.round(required * 1000) / 1000} 超出主材输入量 ${inputQty}`)
  }

  const no = await nextNo('WKO')
  const doc = await WorkOrder.create({
    no, spuNo, remark, operator: req.user.username,
    planItems: planItems.map((it) => ({ sku: it.sku, qty: it.qty, receivedQty: 0 })),
    materialInput: { materialSku: materialInput.materialSku, qty: inputQty },
    discardLeftover: discardLeftover !== false,
    bomSnapshot: product.bom.map((b) => ({ ...b })),
    processes: product.processTemplate.map((p, i) => ({
      no: subNo(no, i + 1), seq: i + 1, name: p.name, expectedDays: p.expectedDays,
      // 数量自动流转：首道工序输入=计划数量，后续工序输入=上一道产出（开始/保存时同步）
      qtys: planItems.map((it) => ({ sku: it.sku, inQty: i === 0 ? it.qty : 0, outQty: 0 })),
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
  // 数量自动流转：首道工序输入=计划数量；后续工序输入=上一道工序产出；输出默认=输入
  const srcQtys = seq === 1
    ? doc.planItems.map((p) => ({ sku: p.sku, inQty: p.qty }))
    : (doc.processes.find((p) => p.seq === seq - 1)?.qtys || []).map((q) => ({ sku: q.sku, inQty: q.outQty }))
  for (const s of srcQtys) {
    const t = step.qtys.find((x) => x.sku === s.sku)
    if (t) { t.inQty = s.inQty; t.outQty = s.inQty }
    else step.qtys.push({ sku: s.sku, inQty: s.inQty, outQty: s.inQty })
  }
  // 首道工序开始：按建单时的主材输入自动发料（扣减材料库存；库存不足则整体回滚）
  // 丢弃余料=是：按输入量全额发料（余料成本计入本单产品）；=否：只按计划总用料发料，余料留在库存
  const mi = doc.materialInput
  if (seq === 1 && mi?.qty > 0
    && !doc.issues.some((i) => i.stepSeq === 1 && i.materialSku === mi.materialSku)) {
    let issueQty = mi.qty
    if (doc.discardLeftover === false) {
      const mainRows = doc.bomSnapshot.filter((b) => b.bomType === 'main' && b.materialSku === mi.materialSku)
      const usageOf = (sku) => mainRows
        .filter((b) => !b.applySkus?.length || b.applySkus.includes(sku))
        .reduce((s, b) => s + b.usage, 0)
      const planned = doc.planItems.reduce((s, p) => s + p.qty * usageOf(p.sku), 0)
      issueQty = Math.min(mi.qty, Math.round(planned * 10000) / 10000)
    }
    if (issueQty <= 0) { // 计划用料为 0，无料可发
      await doc.save()
      return res.json({ doc })
    }
    await withTxn(async (session) => {
      const r = await applyInventoryChange({
        itemType: 'material', sku: mi.materialSku, change: -issueQty,
        type: LOG_TYPES.ISSUE_OUT, docId: doc._id, docNo: doc.no,
        operator: req.user.username,
      }, session)
      doc.issues.push({ stepSeq: 1, materialSku: mi.materialSku, qty: issueQty, unitCost: r.avgCost })
      await doc.save({ session })
    })
    return res.json({ doc })
  }
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
    // 产出自动进入下一道工序的输入（下一道工序未完成才同步；最后一道完成后不再变动）
    const next = doc.processes.find((p) => p.seq === seq + 1)
    if (next && !next.finishedAt) {
      for (const q of step.qtys) {
        const t = next.qtys.find((x) => x.sku === q.sku)
        if (t) t.inQty = q.outQty
      }
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
 * 成本：单件成本 =（已发料成本 + 已录加工费）÷ 计划总数量；入库单位成本 = 单件成本 + 该 SKU 单位耗材成本
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
  const consumableOf = new Map((product?.skus || []).map((s) => [s.no, s.consumableCost || 0]))
  // 完工数量以末道工序实际产出为准（产出可与计划不同，如裁片后调整分配）
  const lastOut = new Map((last.qtys || []).map((q) => [q.sku, q.outQty]))

  const batch = []
  for (const it of reqItems) {
    const plan = doc.planItems.find((p) => p.sku === it.sku)
    if (!plan) return bad(res, `SKU ${it.sku} 不在计划明细中`)
    const qty = Number(it.qty)
    const remaining = (lastOut.get(it.sku) ?? plan.qty) - plan.receivedQty
    if (!qty || qty <= 0 || qty > remaining) {
      return bad(res, `SKU ${it.sku} 入库数量无效（剩余 ${remaining}）`)
    }
    batch.push({ plan, qty })
  }

  const materialCost = doc.issues.reduce((s, i) => s + i.qty * (i.unitCost || 0), 0)
  const feeTotal = doc.processes.reduce((s, p) => s + (p.fee || 0), 0)
  const totalPlanQty = doc.planItems.reduce((s, p) => s + p.qty, 0)
  const perUnit = (materialCost + feeTotal) / totalPlanQty

  await withTxn(async (session) => {
    for (const { plan, qty } of batch) {
      await applyInventoryChange({
        itemType: 'product', sku: plan.sku, change: qty,
        unitCost: perUnit + (consumableOf.get(plan.sku) || 0),
        type: LOG_TYPES.WORK_IN, docId: doc._id, docNo: doc.no,
        operator: req.user.username,
      }, session)
      plan.receivedQty += qty
    }
    if (doc.planItems.every((p) => p.receivedQty >= (lastOut.get(p.sku) ?? p.qty))) {
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
