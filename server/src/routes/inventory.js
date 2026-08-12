import { Router } from 'express'
import { Inventory, InventoryLog } from '../models/inventory.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { stockMap, derivedVirtualStock } from '../services/stockQuery.js'
import { LOG_TYPES } from '../services/inventory.js'
import { requireAuth } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)

function attrsToObj(attrs) {
  if (!attrs) return {}
  return attrs instanceof Map ? Object.fromEntries(attrs) : attrs
}

// GET /api/inventory/logs/types  流水类型下拉
router.get('/logs/types', (req, res) => res.json({ list: Object.values(LOG_TYPES) }))

// GET /api/inventory/logs?sku=&type=&from=&to=&page=&size=
router.get('/logs', wrap(async (req, res) => {
  const { sku, type, from, to, page = 1, size = 50 } = req.query
  const q = {}
  if (sku) q.sku = new RegExp(sku, 'i')
  if (type) q.type = type
  if (from || to) {
    q.time = {}
    if (from) q.time.$gte = new Date(from)
    if (to) q.time.$lte = new Date(`${to}T23:59:59.999Z`)
  }
  const skip = (Math.max(1, +page) - 1) * Math.min(200, +size)
  const [total, list] = await Promise.all([
    InventoryLog.countDocuments(q),
    InventoryLog.find(q).sort({ time: -1 }).skip(skip).limit(Math.min(200, +size)).lean(),
  ])
  res.json({ total, list })
}))

// GET /api/inventory?itemType=product|material&keyword=
// SKU 级库存：数量 + 加权成本 + 库存金额；虚拟组合展示派生可售量并标注
router.get('/', wrap(async (req, res) => {
  const { itemType = 'product', keyword } = req.query
  const list = []

  if (itemType === 'product') {
    const products = await Product.find({ active: true }).lean()
    const allSkus = products.flatMap((p) => p.skus.filter((s) => s.active).map((s) => s.no))
    const stocks = await stockMap('product', allSkus)
    for (const p of products) {
      const derived = p.kind === 'virtual' ? await derivedVirtualStock(p.components, stocks) : null
      for (const s of p.skus) {
        if (!s.active) continue
        const st = stocks.get(s.no) || { qty: 0, avgCost: 0 }
        list.push({
          itemType, spuNo: p.no, spuName: p.name, category: p.category,
          skuNo: s.no, attrs: attrsToObj(s.attrs), image: s.image || '',
          kind: p.kind, safeStock: s.safeStock,
          qty: p.kind === 'virtual' ? derived : st.qty,
          avgCost: p.kind === 'virtual' ? null : st.avgCost,
          amount: p.kind === 'virtual' ? null : st.qty * st.avgCost,
          lastStocktakeAt: s.lastStocktakeAt || null,
        })
      }
    }
  } else {
    const materials = await Material.find({ active: true }).lean()
    const allSkus = materials.flatMap((m) => m.skus.filter((s) => s.active).map((s) => s.no))
    const stocks = await stockMap('material', allSkus)
    for (const m of materials) {
      for (const s of m.skus) {
        if (!s.active) continue
        const st = stocks.get(s.no) || { qty: 0, avgCost: 0 }
        list.push({
          itemType, spuNo: m.no, spuName: m.name, unit: m.unit,
          skuNo: s.no, attrs: attrsToObj(s.attrs),
          kind: 'physical', safeStock: s.safeStock,
          qty: st.qty, avgCost: st.avgCost, amount: st.qty * st.avgCost,
          lastStocktakeAt: s.lastStocktakeAt || null,
        })
      }
    }
  }

  let filtered = list
  if (keyword) {
    const re = new RegExp(keyword, 'i')
    filtered = list.filter((r) => re.test(r.spuNo) || re.test(r.spuName) || re.test(r.skuNo))
  }
  res.json({ list: filtered })
}))

export default router
