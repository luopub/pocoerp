import { Router } from 'express'
import { Product } from '../models/product.js'
import { nextNo, subNo } from '../services/numbering.js'
import { ensureDefaultMapping } from '../services/mapping.js'
import { stockMap, derivedVirtualStock } from '../services/stockQuery.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)
const canWrite = requireRole('admin', 'keeper')

function attrsToObj(attrs) {
  if (!attrs) return {}
  return attrs instanceof Map ? Object.fromEntries(attrs) : attrs
}

function nextSkuNo(spu) {
  const max = spu.skus.reduce((m, s) => {
    const n = parseInt(s.no.split('-')[1] || '0', 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return subNo(spu.no, max + 1)
}

/** BOM 校验：主材最多 1 种材料（可按 SKU 分行设不同用量）；辅料需指定投入工序 */
function validateBom(bom) {
  if (!bom?.length) return null
  const mainMaterials = new Set(bom.filter((b) => b.bomType === 'main').map((b) => b.materialSku))
  if (mainMaterials.size > 1) return '主材最多只能配置 1 种材料（可按 SKU 分行设置不同用量）'
  for (const b of bom) {
    if (!b.materialSku) return 'BOM 中存在未选择材料的行'
    if (!b.usage || b.usage <= 0) return 'BOM 单位用量必须大于 0'
    if (b.bomType === 'aux' && !b.processStep) return '辅料必须指定投入工序'
  }
  return null
}

// GET /api/products?keyword=&kind=&category=&includeInactive=1
router.get('/', wrap(async (req, res) => {
  const { keyword, kind, category } = req.query
  const q = {}
  if (!req.query.includeInactive) q.active = true
  if (kind) q.kind = kind
  if (category) q.category = category
  if (keyword) q.$or = [{ name: new RegExp(keyword, 'i') }, { no: new RegExp(keyword, 'i') }]
  const list = await Product.find(q).sort({ no: 1 }).lean()
  res.json({ list })
}))

// GET /api/products/categories  分类下拉
router.get('/categories', wrap(async (req, res) => {
  const list = await Product.distinct('category', { category: { $ne: '' } })
  res.json({ list: list.sort() })
}))

// GET /api/products/skus  扁平 SKU 列表（含库存/派生可售量，下拉与库存页用）
router.get('/skus', wrap(async (req, res) => {
  const products = await Product.find({ active: true }).lean()
  const list = []
  const physicalSkus = []
  for (const p of products) {
    for (const s of p.skus) {
      if (s.active) physicalSkus.push(s.no)
    }
  }
  const stocks = await stockMap('product', physicalSkus)
  for (const p of products) {
    let derived = null
    if (p.kind === 'virtual') derived = await derivedVirtualStock(p.components, stocks)
    for (const s of p.skus) {
      if (!s.active) continue
      const st = stocks.get(s.no) || { qty: 0, avgCost: 0 }
      list.push({
        spuNo: p.no, spuName: p.name, kind: p.kind, category: p.category,
        skuNo: s.no, attrs: attrsToObj(s.attrs), image: s.image || '',
        safeStock: s.safeStock,
        qty: p.kind === 'virtual' ? derived : st.qty,
        avgCost: p.kind === 'virtual' ? 0 : st.avgCost,
      })
    }
  }
  res.json({ list })
}))

// GET /api/products/:id  详情
router.get('/:id', wrap(async (req, res) => {
  const doc = await Product.findById(req.params.id).lean()
  if (!doc) return res.status(404).json({ message: '产品不存在' })
  res.json({ doc })
}))

// POST /api/products  建档（含首批 SKU；每个 SKU 自动生成默认映射）
router.post('/', canWrite, wrap(async (req, res) => {
  const {
    name, category = '', kind = 'physical', source = 'direct',
    defaultSupplier = '', consumableCost = 0, processTemplate = [],
    bom = [], components = [], remark = '', skus = [],
    warnWindowDays = null, warnDays = null, replenishDays = null,
  } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ message: '产品名称必填' })
  const bomErr = validateBom(bom)
  if (bomErr) return res.status(400).json({ message: bomErr })
  if (kind === 'virtual' && !components.length) {
    return res.status(400).json({ message: '虚拟组合产品必须配置组成明细' })
  }
  for (const c of components) {
    if (!c.sku || !c.qty || c.qty <= 0) return res.status(400).json({ message: '组成明细存在无效行' })
  }

  const no = await nextNo('PRD')
  const doc = new Product({
    no, name: name.trim(), category, kind, source, defaultSupplier,
    consumableCost, processTemplate, bom, components, remark,
    warnWindowDays, warnDays, replenishDays,
  })
  const skuList = skus.length ? skus : [{ attrs: {}, safeStock: 0 }]
  skuList.forEach((s, i) => {
    doc.skus.push({
      no: subNo(no, i + 1), attrs: s.attrs || {}, safeStock: s.safeStock || 0,
      image: s.image || '', remark: s.remark || '',
    })
  })
  await doc.save()
  for (const s of doc.skus) await ensureDefaultMapping(doc.no, s.no)
  res.json({ doc })
}))

// PUT /api/products/:id  SPU 字段（含工序模板/BOM/组成明细整体替换）
router.put('/:id', canWrite, wrap(async (req, res) => {
  const doc = await Product.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '产品不存在' })
  const b = req.body || {}
  if (b.bom !== undefined) {
    const bomErr = validateBom(b.bom)
    if (bomErr) return res.status(400).json({ message: bomErr })
    doc.bom = b.bom
  }
  if (b.components !== undefined) {
    if (doc.kind === 'virtual' && !b.components.length) {
      return res.status(400).json({ message: '虚拟组合产品必须配置组成明细' })
    }
    doc.components = b.components
  }
  for (const f of ['name', 'category', 'source', 'defaultSupplier', 'consumableCost',
    'processTemplate', 'remark', 'warnWindowDays', 'warnDays', 'replenishDays']) {
    if (b[f] !== undefined) doc[f] = b[f]
  }
  if (b.active !== undefined) doc.active = !!b.active
  if (b.name) doc.name = b.name.trim()
  await doc.save()
  res.json({ doc })
}))

// POST /api/products/:id/skus  新增 SKU（自动生成默认映射）
router.post('/:id/skus', canWrite, wrap(async (req, res) => {
  const { attrs = {}, safeStock = 0, image = '', remark = '' } = req.body || {}
  const doc = await Product.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '产品不存在' })
  const sku = { no: nextSkuNo(doc), attrs, safeStock, image, remark }
  doc.skus.push(sku)
  await doc.save()
  await ensureDefaultMapping(doc.no, sku.no)
  res.json({ sku: doc.skus[doc.skus.length - 1], doc })
}))

// PUT /api/products/:id/skus/:skuNo
router.put('/:id/skus/:skuNo', canWrite, wrap(async (req, res) => {
  const doc = await Product.findById(req.params.id)
  if (!doc) return res.status(404).json({ message: '产品不存在' })
  const sku = doc.skus.find((s) => s.no === req.params.skuNo)
  if (!sku) return res.status(404).json({ message: 'SKU 不存在' })
  const b = req.body || {}
  for (const f of ['attrs', 'image', 'safeStock', 'warnWindowDays', 'warnDays', 'replenishDays', 'remark']) {
    if (b[f] !== undefined) sku[f] = b[f]
  }
  if (b.active !== undefined) sku.active = !!b.active
  await doc.save()
  res.json({ sku, doc })
}))

export default router
