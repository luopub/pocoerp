// 测试统一使用独立的 pocoerp_test 库；setup-env 必须是第一个 import（见该文件注释）
import './setup-env.js'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { connectDB, disconnectDB } from '../src/db.js'
import { WorkOrder } from '../src/models/workOrder.js'
import { Material } from '../src/models/material.js'
import { Product } from '../src/models/product.js'
import { Inventory, InventoryLog } from '../src/models/inventory.js'
import { applyInventoryChange, withTxn, getStock, LOG_TYPES } from '../src/services/inventory.js'
import { signToken } from '../src/middleware/auth.js'
import workorderRoutes from '../src/routes/workorders.js'

let server
let baseUrl
let authHeader

async function api(path, body, method = 'POST') {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json() }
}

async function createOrder(discardLeftover) {
  const r = await api('/', {
    spuNo: 'PRD000002',
    planItems: [{ sku: 'PRD000002-001', qty: 100 }, { sku: 'PRD000002-002', qty: 100 }],
    materialInput: { materialSku: 'MAT000003-001', qty: 500 },
    discardLeftover,
  })
  assert.equal(r.status, 200)
  return r.body.doc
}

// 本文件夹具范围（测试文件并行共享测试库，清理只删自己的数据）
const OWN_SKU = /^(MAT000003|PRD000002)-/

before(async () => {
  await connectDB()
  await Promise.all([
    WorkOrder.deleteMany({}), // 加工单集合仅本文件使用
    Material.deleteMany({ no: 'MAT000003' }), Product.deleteMany({ no: 'PRD000002' }),
    Inventory.deleteMany({ sku: OWN_SKU }), InventoryLog.deleteMany({ sku: OWN_SKU }),
  ])
  await Material.create({ no: 'MAT000003', name: '蓝花布', unit: '米', skus: [{ no: 'MAT000003-001' }] })
  await Product.create({
    no: 'PRD000002', name: '测试委外产品', source: 'outsourced',
    processTemplate: [{ name: '印花' }, { name: '裁片' }],
    bom: [{ materialSku: 'MAT000003-001', usage: 1.5, bomType: 'main', applySkus: ['PRD000002-001'] },
      { materialSku: 'MAT000003-001', usage: 1.0, bomType: 'main', applySkus: ['PRD000002-002'] }],
    skus: [{ no: 'PRD000002-001' }, { no: 'PRD000002-002' }],
  })
  // 主材期初库存 500 米 @ 2 元
  await withTxn((s) => applyInventoryChange(
    { itemType: 'material', sku: 'MAT000003-001', change: 500, unitCost: 2, type: LOG_TYPES.INITIAL_IN, operator: 'test' }, s))

  const app = express()
  app.use(express.json())
  app.use('/api/workorders', workorderRoutes)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  baseUrl = `http://127.0.0.1:${server.address().port}/api/workorders`
  authHeader = `Bearer ${signToken({ _id: new mongoose.Types.ObjectId(), username: 'tester', role: 'admin' })}`
})

after(async () => {
  await Promise.all([
    WorkOrder.deleteMany({}),
    Material.deleteMany({ no: 'MAT000003' }), Product.deleteMany({ no: 'PRD000002' }),
    Inventory.deleteMany({ sku: OWN_SKU }), InventoryLog.deleteMany({ sku: OWN_SKU }),
  ])
  server?.close()
  await disconnectDB()
})

// 计划总用料 = 100×1.5 + 100×1.0 = 250 米；主材输入 500 米，余料 250 米

test('丢弃余料=是：首工序开始按输入量全额发料（库存清零）', async () => {
  const doc = await createOrder(true)
  assert.equal(doc.discardLeftover, true)

  const r = await api(`/${doc._id}/steps/1/start`, {})
  assert.equal(r.status, 200)
  assert.equal(r.body.doc.issues.length, 1)
  assert.equal(r.body.doc.issues[0].qty, 500) // 全额发料

  const st = await getStock('material', 'MAT000003-001')
  assert.equal(st.qty, 0)
})

test('丢弃余料=否：首工序开始只发计划总用料，余料留在库存', async () => {
  // 上一用例已清空库存，补足 500 米
  await withTxn((s) => applyInventoryChange(
    { itemType: 'material', sku: 'MAT000003-001', change: 500, unitCost: 2, type: LOG_TYPES.INITIAL_IN, operator: 'test' }, s))
  const doc = await createOrder(false)
  assert.equal(doc.discardLeftover, false)

  const r = await api(`/${doc._id}/steps/1/start`, {})
  assert.equal(r.status, 200)
  assert.equal(r.body.doc.issues.length, 1)
  assert.equal(r.body.doc.issues[0].qty, 250) // 只发计划用料

  const st = await getStock('material', 'MAT000003-001')
  assert.equal(st.qty, 250) // 余料 250 米留在库存
})

test('建单约束：计划总用料超出主材输入量拒绝', async () => {
  const r = await api('/', {
    spuNo: 'PRD000002',
    planItems: [{ sku: 'PRD000002-001', qty: 400 }], // 400×1.5 = 600 > 500
    materialInput: { materialSku: 'MAT000003-001', qty: 500 },
  })
  assert.equal(r.status, 400)
  assert.match(r.body.message, /超出主材输入量/)
})
