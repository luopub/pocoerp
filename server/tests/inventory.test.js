// 测试统一使用独立的 pocoerp_test 库；setup-env 必须是第一个 import（见该文件注释）
import './setup-env.js'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { connectDB, disconnectDB } from '../src/db.js'
import { Inventory, InventoryLog } from '../src/models/inventory.js'
import { applyInventoryChange, withTxn, getStock, LOG_TYPES } from '../src/services/inventory.js'

// 本文件专用 SKU（测试文件并行共享测试库，命名空间隔离，清理也只删自己的数据）
const SKU = 'MAT900001-001'

before(async () => {
  await connectDB()
  await Inventory.deleteMany({ sku: SKU })
  await InventoryLog.deleteMany({ sku: SKU })
})

after(async () => {
  await Inventory.deleteMany({ sku: SKU })
  await InventoryLog.deleteMany({ sku: SKU })
  await disconnectDB()
})

test('入库：移动加权平均成本', async () => {
  await withTxn((s) => applyInventoryChange(
    { itemType: 'material', sku: SKU, change: 100, unitCost: 10, type: LOG_TYPES.PURCHASE_IN, operator: 'test' }, s))
  let st = await getStock('material', SKU)
  assert.deepEqual(st, { qty: 100, avgCost: 10 })

  await withTxn((s) => applyInventoryChange(
    { itemType: 'material', sku: SKU, change: 100, unitCost: 20, type: LOG_TYPES.PURCHASE_IN, operator: 'test' }, s))
  st = await getStock('material', SKU)
  assert.equal(st.qty, 200)
  assert.ok(Math.abs(st.avgCost - 15) < 1e-9) // (100*10+100*20)/200 = 15
})

test('出库：数量扣减、成本不变、写流水', async () => {
  const r = await withTxn((s) => applyInventoryChange(
    { itemType: 'material', sku: SKU, change: -50, type: LOG_TYPES.ISSUE_OUT, operator: 'test' }, s))
  assert.equal(r.qty, 150)
  assert.equal(r.avgCost, 15)

  const logs = await InventoryLog.find({ sku: SKU }).sort({ time: 1 }).lean()
  assert.equal(logs.length, 3)
  assert.equal(logs[2].change, -50)
  assert.equal(logs[2].balance, 150)
})

test('库存不足时拒绝出库', async () => {
  await assert.rejects(
    withTxn((s) => applyInventoryChange(
      { itemType: 'material', sku: SKU, change: -9999, type: LOG_TYPES.SALE_OUT }, s)),
    /库存不足/
  )
  // 失败的事务不应留下任何痕迹
  const st = await getStock('material', SKU)
  assert.equal(st.qty, 150)
  assert.equal(await InventoryLog.countDocuments({ sku: SKU }), 3)
})
