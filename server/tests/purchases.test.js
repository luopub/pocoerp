// 测试统一使用独立的 pocoerp_test 库；setup-env 必须是第一个 import（见该文件注释）
import './setup-env.js'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import mongoose from 'mongoose'
import { connectDB, disconnectDB } from '../src/db.js'
import { PurchaseOrder } from '../src/models/purchaseOrder.js'
import { Material } from '../src/models/material.js'
import { Product } from '../src/models/product.js'
import { Inventory, InventoryLog } from '../src/models/inventory.js'
import { getStock, LOG_TYPES } from '../src/services/inventory.js'
import { signToken } from '../src/middleware/auth.js'
import purchaseRoutes from '../src/routes/purchases.js'

let server
let baseUrl
let authHeader

async function api(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: authHeader },
    body: JSON.stringify(body ?? {}),
  })
  return { status: res.status, body: await res.json() }
}

async function makePo(no, type, sku, qty, price) {
  return PurchaseOrder.create({
    no, type, supplier: '测试供应商',
    items: [{ no: `${no}-001`, sku, qty, price, receivedQty: 0 }],
    payable: qty * price,
    operator: 'test',
  })
}

before(async () => {
  await connectDB()
  await Promise.all([
    PurchaseOrder.deleteMany({}), Material.deleteMany({}), Product.deleteMany({}),
    Inventory.deleteMany({}), InventoryLog.deleteMany({}),
  ])
  await Material.create({
    no: 'MAT000001', name: '测试布料', unit: '米',
    skus: [{ no: 'MAT000001-001' }, { no: 'MAT000001-002' }, { no: 'MAT000001-003' }],
  })
  await Product.create({
    no: 'PRD000001', name: '测试椅套',
    skus: [{ no: 'PRD000001-001', consumableCost: 0.8 }],
  })

  const app = express()
  app.use(express.json())
  app.use('/api/purchases', purchaseRoutes)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => res.status(err.status || 500).json({ message: err.message }))
  await new Promise((resolve) => { server = app.listen(0, resolve) })
  baseUrl = `http://127.0.0.1:${server.address().port}/api/purchases`
  authHeader = `Bearer ${signToken({ _id: new mongoose.Types.ObjectId(), username: 'tester', role: 'admin' })}`
})

after(async () => {
  await Promise.all([
    PurchaseOrder.deleteMany({}), Material.deleteMany({}), Product.deleteMany({}),
    Inventory.deleteMany({}), InventoryLog.deleteMany({}),
  ])
  server?.close()
  await disconnectDB()
})

test('超收入库：按实际数量入库存并转已入库', async () => {
  const po = await makePo('POM900001', 'material', 'MAT000001-001', 100, 5)
  const r = await api(`/${po._id}/receive`, { items: [{ no: 'POM900001-001', qty: 120 }] })
  assert.equal(r.status, 200)
  assert.equal(r.body.doc.items[0].receivedQty, 120)
  assert.equal(r.body.doc.status, 'done')

  const st = await getStock('material', 'MAT000001-001')
  assert.equal(st.qty, 120)
  assert.equal(st.avgCost, 5) // 超收部分按相同单价计成本
  const log = await InventoryLog.findOne({ sku: 'MAT000001-001' }).lean()
  assert.equal(log.change, 120)
  assert.equal(log.type, LOG_TYPES.PURCHASE_IN)
  assert.equal(log.balance, 120)
})

test('分次入库后再超收：累计可超过采购数量', async () => {
  const po = await makePo('POM900002', 'material', 'MAT000001-002', 100, 5)
  let r = await api(`/${po._id}/receive`, { items: [{ no: 'POM900002-001', qty: 50 }] })
  assert.equal(r.body.doc.status, 'partial')

  r = await api(`/${po._id}/receive`, { items: [{ no: 'POM900002-001', qty: 60 }] })
  assert.equal(r.status, 200)
  assert.equal(r.body.doc.items[0].receivedQty, 110)
  assert.equal(r.body.doc.status, 'done')

  const st = await getStock('material', 'MAT000001-002')
  assert.equal(st.qty, 110)
})

test('入库数量为负拒绝，库存不变', async () => {
  const po = await makePo('POM900003', 'material', 'MAT000001-003', 100, 5)
  const r = await api(`/${po._id}/receive`, { items: [{ no: 'POM900003-001', qty: -1 }] })
  assert.equal(r.status, 400)
  const st = await getStock('material', 'MAT000001-003')
  assert.equal(st.qty, 0)
  assert.equal(await InventoryLog.countDocuments({ sku: 'MAT000001-003' }), 0)
})

test('成品超收入库：单位成本含 SKU 耗材成本', async () => {
  const po = await makePo('POP900001', 'product', 'PRD000001-001', 10, 20)
  const r = await api(`/${po._id}/receive`, { items: [{ no: 'POP900001-001', qty: 15 }] })
  assert.equal(r.status, 200)
  assert.equal(r.body.doc.items[0].receivedQty, 15)
  assert.equal(r.body.doc.status, 'done')

  const st = await getStock('product', 'PRD000001-001')
  assert.equal(st.qty, 15)
  assert.ok(Math.abs(st.avgCost - 20.8) < 1e-9) // 20 + 0.8 耗材
})
