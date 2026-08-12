import mongoose from 'mongoose'
import { Inventory, InventoryLog } from '../models/inventory.js'

/** 库存流水类型（需求文档第 5 章） */
export const LOG_TYPES = {
  INITIAL_IN: '期初入库',
  PURCHASE_IN: '采购入库',
  RETURN_IN: '退货入库',
  ISSUE_OUT: '发料出库',
  WORK_IN: '完工入库',
  SALE_OUT: '销售出库',
  SCRAP_OUT: '报废出库',
  STOCKTAKE_ADJ: '盘点调整',
  OTHER: '其他',
}

/**
 * 在事务中执行 fn(session)。库存变更与流水写入必须放在同一事务里。
 */
export async function withTxn(fn) {
  const session = await mongoose.startSession()
  try {
    let result
    await session.withTransaction(async () => {
      result = await fn(session)
    })
    return result
  } finally {
    await session.endSession()
  }
}

/**
 * 库存变更核心（必须在事务内调用）。
 * @param {object} p
 * @param {'product'|'material'} p.itemType
 * @param {string} p.sku        SKU 编号（如 PRD000001-001 / MAT000001-002）
 * @param {number} p.change     变动数量：正=入库，负=出库
 * @param {number} [p.unitCost] 入库单价（仅入库时传，用于移动加权平均）
 * @param {string} p.type       流水类型（LOG_TYPES）
 * @param {string} [p.docId]    关联单据 _id
 * @param {string} [p.docNo]    关联单据编号
 * @param {string} [p.operator] 操作人
 * @returns {{qty:number, avgCost:number}} 变动后的库存
 */
export async function applyInventoryChange(p, session) {
  const { itemType, sku, change, unitCost, type, docId, docNo, operator } = p
  if (!change || typeof change !== 'number') throw new Error('变动数量必须为非零数字')

  let inv = await Inventory.findOne({ itemType, sku }).session(session)
  if (!inv) inv = new Inventory({ itemType, sku, qty: 0, avgCost: 0 })

  const newQty = inv.qty + change
  if (newQty < 0) {
    throw new Error(`库存不足：${sku} 当前 ${inv.qty}，需要出库 ${-change}`)
  }

  // 移动加权平均：入库时重算成本，出库不变
  if (change > 0) {
    const cost = unitCost ?? inv.avgCost ?? 0
    inv.avgCost = newQty === 0 ? 0 : (inv.qty * inv.avgCost + change * cost) / newQty
  }
  inv.qty = newQty
  inv.updatedAt = new Date()
  await inv.save({ session })

  await InventoryLog.create(
    [{ itemType, sku, type, docId, docNo, change, balance: newQty, unitCost, operator }],
    { session }
  )
  return { qty: inv.qty, avgCost: inv.avgCost }
}

/** 查询某 SKU 当前库存（无记录返回 0） */
export async function getStock(itemType, sku) {
  const inv = await Inventory.findOne({ itemType, sku }).lean()
  return inv ? { qty: inv.qty, avgCost: inv.avgCost } : { qty: 0, avgCost: 0 }
}
