import { InventoryLog } from '../models/inventory.js'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { WorkOrder } from '../models/workOrder.js'
import { getSettings } from '../models/settings.js'
import { LOG_TYPES } from './inventory.js'
import { stockMap } from './stockQuery.js'

/**
 * 三级参数解析（需求文档情景 11）：SKU 级 → SPU 级 → 全局默认
 */
export function resolveParam(skuVal, spuVal, globalVal) {
  if (skuVal !== null && skuVal !== undefined) return skuVal
  if (spuVal !== null && spuVal !== undefined) return spuVal
  return globalVal
}

/** 批量计算出库/消耗速度（件/天）：成品按销售出库，材料按发料出库 */
async function velocityMap(itemType, skus, windowDays) {
  const since = new Date(Date.now() - windowDays * 86400000)
  const type = itemType === 'product' ? LOG_TYPES.SALE_OUT : LOG_TYPES.ISSUE_OUT
  const agg = await InventoryLog.aggregate([
    { $match: { itemType, sku: { $in: skus }, type, change: { $lt: 0 }, time: { $gte: since } } },
    { $group: { _id: '$sku', out: { $sum: '$change' } } },
  ])
  const map = new Map(agg.map((a) => [a._id, -a.out / windowDays]))
  for (const s of skus) if (!map.has(s)) map.set(s, 0)
  return map
}

/**
 * 预警与补货计算（情景 11/14）。
 * @returns {Promise<Array>} 每个启用 SKU 一行：
 *  { itemType, spuNo, spuName, skuNo, qty, velocity, daysLeft, warnDays, replenishDays,
 *    lowStock(低于安全库存), dynamicWarn(可用天数不足), suggestQty(补货建议量) }
 */
export async function computeAlerts() {
  const settings = await getSettings()
  const rows = []

  const collect = async (itemType, spus) => {
    const skus = spus.flatMap((p) => p.skus.filter((s) => s.active).map((s) => s.no))
    if (!skus.length) return
    const stocks = await stockMap(itemType, skus)
    // 各 SKU 的预警窗口可能不同（三级参数），按窗口分组聚合
    const windows = [...new Set(spus.flatMap((p) => p.skus.filter((s) => s.active).map((s) =>
      resolveParam(s.warnWindowDays, p.warnWindowDays, settings.warnWindowDays))))]
    const velMaps = new Map()
    for (const w of windows) velMaps.set(w, await velocityMap(itemType, skus, w))

    for (const p of spus) {
      for (const s of p.skus) {
        if (!s.active) continue
        const w = resolveParam(s.warnWindowDays, p.warnWindowDays, settings.warnWindowDays)
        const warnDays = resolveParam(s.warnDays, p.warnDays, settings.warnDays)
        const replenishDays = resolveParam(s.replenishDays, p.replenishDays, settings.replenishDays)
        const velocity = velMaps.get(w)?.get(s.no) ?? 0
        const qty = stocks.get(s.no)?.qty ?? 0
        const daysLeft = velocity > 0 ? qty / velocity : null
        rows.push({
          itemType,
          spuNo: p.no, spuName: p.name, skuNo: s.no,
          safeStock: s.safeStock || 0,
          qty, velocity, daysLeft, warnDays, replenishDays, windowDays: w,
          lowStock: (s.safeStock || 0) > 0 && qty < s.safeStock,
          dynamicWarn: velocity > 0 && daysLeft !== null && daysLeft < warnDays,
          suggestQty: velocity > 0 ? Math.max(0, Math.ceil(velocity * replenishDays - qty)) : 0,
        })
      }
    }
  }

  const products = await Product.find({ active: true, kind: 'physical' }).lean()
  await collect('product', products)
  const materials = await Material.find({ active: true }).lean()
  await collect('material', materials)
  return rows
}

/** 在制工单超期（情景 18）：工序已开始、超过预期天数未完成 */
export async function computeOverdueWorkorders() {
  const list = await WorkOrder.find({ status: 'processing' }).lean()
  const now = Date.now()
  const out = []
  for (const w of list) {
    for (const p of w.processes) {
      if (p.startedAt && !p.finishedAt && p.expectedDays) {
        const deadline = new Date(p.startedAt).getTime() + p.expectedDays * 86400000
        if (now > deadline) {
          out.push({
            wkoId: w._id, no: w.no, spuNo: w.spuNo,
            stepSeq: p.seq, stepName: p.name,
            overdueDays: Math.floor((now - deadline) / 86400000),
          })
        }
      }
    }
  }
  return out
}

/** 首页看板聚合（情景 11/18 + 在制 + 本月汇总） */
export async function dashboardData() {
  const alerts = await computeAlerts()
  const overdue = await computeOverdueWorkorders()
  const processing = await WorkOrder.countDocuments({ status: 'processing' })
  const pendingWko = await WorkOrder.countDocuments({ status: 'pending' })

  // 本月汇总：出入库金额
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthAgg = await InventoryLog.aggregate([
    { $match: { time: { $gte: monthStart } } },
    { $group: { _id: '$type', qty: { $sum: '$change' }, amount: { $sum: { $multiply: [{ $abs: '$change' }, { $ifNull: ['$unitCost', 0] }] } } } },
  ])
  const inTypes = [LOG_TYPES.INITIAL_IN, LOG_TYPES.PURCHASE_IN, LOG_TYPES.RETURN_IN, LOG_TYPES.WORK_IN]
  let monthInQty = 0; let monthInAmount = 0; let monthOutQty = 0
  for (const a of monthAgg) {
    if (inTypes.includes(a._id)) { monthInQty += a.qty; monthInAmount += a.amount }
    else if (a.qty < 0) monthOutQty += -a.qty
  }

  return {
    alerts: alerts.filter((a) => a.lowStock || a.dynamicWarn),
    overdue,
    wko: { processing, pending: pendingWko },
    month: { inQty: monthInQty, inAmount: monthInAmount, outQty: monthOutQty },
  }
}
