// 测试统一使用独立的 pocoerp_test 库；setup-env 必须是第一个 import（见该文件注释）
import './setup-env.js'
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { connectDB, disconnectDB } from '../src/db.js'
import { Counter } from '../src/models/counter.js'
import { nextNo, subNo } from '../src/services/numbering.js'

before(async () => {
  await connectDB()
  await Counter.deleteMany({})
})

after(async () => {
  await Counter.deleteMany({})
  await disconnectDB()
})

test('主号：前缀 + 6 位顺序号，连续递增', async () => {
  assert.equal(await nextNo('PRD'), 'PRD000001')
  assert.equal(await nextNo('PRD'), 'PRD000002')
  assert.equal(await nextNo('WKO'), 'WKO000001') // 不同前缀各自计数
})

test('子号：主号-3 位序号', () => {
  assert.equal(subNo('PRD000001', 1), 'PRD000001-001')
  assert.equal(subNo('PRD000001', 12), 'PRD000001-012')
})

test('非法前缀拒绝', async () => {
  await assert.rejects(() => nextNo('prd'), /3 位大写字母/)
  await assert.rejects(() => nextNo('TOOLONG'), /3 位大写字母/)
})
