import { Inventory } from '../models/inventory.js'

/** 批量取库存：返回 Map sku -> { qty, avgCost } */
export async function stockMap(itemType, skus) {
  const invs = await Inventory.find({ itemType, sku: { $in: skus } }).lean()
  const map = new Map(invs.map((i) => [i.sku, { qty: i.qty, avgCost: i.avgCost }]))
  for (const sku of skus) if (!map.has(sku)) map.set(sku, { qty: 0, avgCost: 0 })
  return map
}

/**
 * 虚拟组合派生可售量 = min( ⌊组件库存 ÷ 单位用量⌋ )（需求文档 4.2/4.7）
 * @param {Array<{sku:string, qty:number}>} components 组成明细
 * @param {Map} [stocks] 可选预取库存 Map
 */
export async function derivedVirtualStock(components, stocks) {
  if (!components?.length) return 0
  const map = stocks || (await stockMap('product', components.map((c) => c.sku)))
  let min = Infinity
  for (const c of components) {
    if (!c.qty || c.qty <= 0) return 0
    const qty = map.get(c.sku)?.qty ?? 0
    min = Math.min(min, Math.floor(qty / c.qty))
  }
  return min === Infinity ? 0 : min
}
