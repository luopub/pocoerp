import { Router } from 'express'
import { Material } from '../models/material.js'
import { nextNo, subNo } from '../services/numbering.js'
import { stockMap } from '../services/stockQuery.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

/** 下一个 SKU 子号：取 SPU 现有 SKU 最大序号 +1 */
function nextSkuNo(spu) {
  const max = spu.skus.reduce((m, s) => {
    const n = parseInt(s.no.split('-')[1] || '0', 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return subNo(spu.no, max + 1)
}

/** attrs 兼容处理：lean() 后是普通对象，非 lean 是 Map */
function attrsToObj(attrs) {
  if (!attrs) return {}
  return attrs instanceof Map ? Object.fromEntries(attrs) : attrs
}

// GET /api/materials?keyword=&includeInactive=1
router.get('/', wrap(async (req, res) => {
  const { keyword } = req.query
  const q = {}
  if (!req.query.includeInactive) q.active = true
  if (keyword) q.$or = [{ name: new RegExp(keyword, 'i') }, { no: new RegExp(keyword, 'i') }]
  const list = await Material.find(q).sort({ no: 1 }).lean()
  res.json({ list })
}))

// GET /api/materials/skus  扁平 SKU 列表（下拉选择用）
router.get('/skus', wrap(async (req, res) => {
  const mats = await Material.find({ active: true }).lean()
  const skuNos = mats.flatMap((m) => m.skus.filter((s) => s.active).map((s) => s.no))
  const stocks = await stockMap('material', skuNos)
  const list = []
  for (const m of mats) {
    for (const s of m.skus) {
      if (!s.active) continue
      list.push({
        spuNo: m.no, spuName: m.name, unit: m.unit, skuNo: s.no,
        purchaseUnit: m.purchaseUnit || '', unitRate: m.unitRate || 1,
        attrs: attrsToObj(s.attrs), qty: stocks.get(s.no)?.qty || 0,
        price: s.price || m.price || 0, // SKU 单价为 0 时回落到 SPU 单价
      })
    }
  }
  res.json({ list })
}))

// POST /api/materials  { name, unit, purchaseUnit, unitRate, defaultSupplier, price, remark, skus?: [{attrs, safeStock, price}] }
router.post('/', canWrite, wrap(async (req, res) => {
  const { name, unit = '', purchaseUnit = '', unitRate = 1, defaultSupplier = '', price = 0, remark = '', skus = [] } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ message: '材料名称必填' })
  if (!Number.isFinite(unitRate) || unitRate <= 0) return res.status(400).json({ message: '转换系数必须大于 0' })
  const no = await nextNo('MAT')
  const doc = new Material({ no, name: name.trim(), unit, purchaseUnit, unitRate, defaultSupplier, price, remark })
  // 无变体时自动建 1 个默认 SKU
  const skuList = skus.length ? skus : [{ attrs: {}, safeStock: 0 }]
  skuList.forEach((s, i) => {
    doc.skus.push({ no: subNo(no, i + 1), attrs: s.attrs || {}, safeStock: s.safeStock || 0, price: s.price || 0 })
  })
  await doc.save()
  res.json({ doc })
}))

// PUT /api/materials/:id  SPU 字段
router.put('/:id', canWrite, wrap(async (req, res) => {
  const { name, unit, purchaseUnit, unitRate, defaultSupplier, price, remark, active } = req.body || {}
  const doc = await Material.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '材料不存在' })
  if (name !== undefined) doc.name = name.trim()
  if (unit !== undefined) doc.unit = unit
  if (purchaseUnit !== undefined) doc.purchaseUnit = purchaseUnit
  if (unitRate !== undefined) {
    if (!Number.isFinite(unitRate) || unitRate <= 0) return res.status(400).json({ message: '转换系数必须大于 0' })
    doc.unitRate = unitRate
  }
  if (defaultSupplier !== undefined) doc.defaultSupplier = defaultSupplier
  if (price !== undefined) doc.price = price
  if (remark !== undefined) doc.remark = remark
  if (active !== undefined) doc.active = !!active
  await doc.save()
  res.json({ doc })
}))

// POST /api/materials/:id/skus  新增 SKU  { attrs, safeStock, price }
router.post('/:id/skus', canWrite, wrap(async (req, res) => {
  const { attrs = {}, safeStock = 0, price = 0 } = req.body || {}
  const doc = await Material.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '材料不存在' })
  const sku = { no: nextSkuNo(doc), attrs, safeStock, price }
  doc.skus.push(sku)
  await doc.save()
  res.json({ sku, doc })
}))

// PUT /api/materials/:id/skus/:skuNo  { attrs, safeStock, price, active }
router.put('/:id/skus/:skuNo', canWrite, wrap(async (req, res) => {
  const doc = await Material.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '材料不存在' })
  const sku = doc.skus.find((s) => s.no === req.params.skuNo)
  if (!sku) return res.status(404).json({ message: 'SKU 不存在' })
  const { attrs, safeStock, price, active } = req.body || {}
  if (attrs !== undefined) sku.attrs = attrs
  if (safeStock !== undefined) sku.safeStock = safeStock
  if (price !== undefined) sku.price = price
  if (active !== undefined) sku.active = !!active
  await doc.save()
  res.json({ sku, doc })
}))

export default router
