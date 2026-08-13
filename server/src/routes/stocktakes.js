import { Router } from 'express'
import { Stocktake } from '../models/stocktake.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { nextNo } from '../services/numbering.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { stockMap } from '../services/stockQuery.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

function bad(res, msg) { return res.status(400).json({ message: msg }) }

// GET /api/stocktakes?status=
router.get('/', wrap(async (req, res) => {
  const q = {}
  if (req.query.status) q.status = req.query.status
  const list = await Stocktake.find(q).sort({ createdAt: -1 }).lean()
  res.json({ list })
}))

// GET /api/stocktakes/:id
router.get('/:id', wrap(async (req, res) => {
  const doc = await Stocktake.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '盘点单不存在' })
  res.json({ doc })
}))

// POST /api/stocktakes  { items: [{itemType, sku}], remark }  创建草稿，自动带账面数量
router.post('/', canWrite, wrap(async (req, res) => {
  const { items = [], remark = '' } = req.body || {}
  if (!items.length) return bad(res, '至少选择一个 SKU')
  for (const it of items) {
    if (!['product', 'material'].includes(it.itemType) || !it.sku) return bad(res, '明细存在无效行')
    const Model = it.itemType === 'product' ? Product : Material
    if (await Model.countDocuments({ 'skus.no': it.sku }) === 0) {
      return bad(res, `SKU ${it.sku} 不存在`)
    }
  }
  const no = await nextNo('STK')
  const byType = {
    product: await stockMap('product', items.filter((i) => i.itemType === 'product').map((i) => i.sku)),
    material: await stockMap('material', items.filter((i) => i.itemType === 'material').map((i) => i.sku)),
  }
  const doc = await Stocktake.create({
    no, remark, operator: req.user.username,
    items: items.map((it) => ({
      itemType: it.itemType, sku: it.sku,
      bookQty: byType[it.itemType].get(it.sku)?.qty ?? 0,
      actualQty: null,
    })),
  })
  res.json({ doc })
}))

// PUT /api/stocktakes/:id  录入实盘数量（草稿） { items: [{sku, actualQty}], remark? }
router.put('/:id', canWrite, wrap(async (req, res) => {
  const doc = await Stocktake.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '盘点单不存在' })
  if (doc.status !== 'draft') return bad(res, '只有草稿可编辑')
  const { items = [], remark } = req.body || {}
  for (const it of items) {
    const row = doc.items.find((x) => x.sku === it.sku)
    if (!row) return bad(res, `SKU ${it.sku} 不在盘点单中`)
    if (it.actualQty !== null && (it.actualQty < 0 || !Number.isFinite(Number(it.actualQty)))) {
      return bad(res, `SKU ${it.sku} 实盘数量无效`)
    }
    row.actualQty = it.actualQty === null ? null : Number(it.actualQty)
  }
  if (remark !== undefined) doc.remark = remark
  await doc.save()
  res.json({ doc })
}))

// POST /api/stocktakes/:id/confirm  确认：库存调整为实盘，生成盘点调整流水，更新最后盘点时间
router.post('/:id/confirm', canWrite, wrap(async (req, res) => {
  const doc = await Stocktake.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '盘点单不存在' })
  if (doc.status !== 'draft') return bad(res, '只有草稿可确认')
  const unfilled = doc.items.filter((i) => i.actualQty === null)
  if (unfilled.length) return bad(res, `还有 ${unfilled.length} 行未录入实盘数量`)

  await withTxn(async (session) => {
    for (const it of doc.items) {
      const diff = it.actualQty - it.bookQty
      if (diff !== 0) {
        // 盘盈按当前加权成本入账；盘亏按当前加权成本核减（出库不重算成本）
        const after = await applyInventoryChange({
          itemType: it.itemType, sku: it.sku, change: diff,
          unitCost: undefined, // 入库时缺省取当前加权成本
          type: LOG_TYPES.STOCKTAKE_ADJ, docId: doc._id, docNo: doc.no,
          operator: req.user.username,
        }, session)
        it.unitCost = after.avgCost
      }
      // 更新 SKU 最后盘点时间
      const Model = it.itemType === 'product' ? Product : Material
      await Model.updateOne(
        { 'skus.no': it.sku },
        { $set: { 'skus.$.lastStocktakeAt': new Date() } },
        { session }
      )
    }
    doc.status = 'confirmed'
    doc.confirmedAt = new Date()
    await doc.save({ session })
  })
  res.json({ doc })
}))

// POST /api/stocktakes/:id/void  作废：草稿直接作废；已确认回滚全部调整
router.post('/:id/void', canWrite, wrap(async (req, res) => {
  const doc = await Stocktake.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '盘点单不存在' })
  if (doc.status === 'void') return bad(res, '单据已作废')

  if (doc.status === 'confirmed') {
    await withTxn(async (session) => {
      for (const it of doc.items) {
        const diff = it.actualQty - it.bookQty
        if (diff !== 0) {
          await applyInventoryChange({
            itemType: it.itemType, sku: it.sku, change: -diff, unitCost: it.unitCost,
            type: LOG_TYPES.STOCKTAKE_ADJ, docId: doc._id, docNo: `${doc.no}(作废回滚)`,
            operator: req.user.username,
          }, session)
        }
      }
      doc.status = 'void'
      doc.voidedAt = new Date()
      await doc.save({ session })
    })
  } else {
    doc.status = 'void'
    doc.voidedAt = new Date()
    await doc.save()
  }
  res.json({ doc })
}))

export default router
