import { Router } from 'express'
import multer from 'multer'
import ExcelJS from 'exceljs'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { withTxn, applyInventoryChange, LOG_TYPES } from '../services/inventory.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
})

// GET /api/import/template  下载期初库存导入模板
router.get('/template', wrap(async (req, res) => {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('期初库存')
  ws.columns = [
    { header: 'SKU编号', key: 'sku', width: 20 },
    { header: '数量', key: 'qty', width: 12 },
    { header: '单位成本', key: 'cost', width: 12 },
  ]
  ws.getRow(1).font = { bold: true }
  ws.addRow({ sku: 'PRD000001-001（示例，导入前请删除）', qty: 10, cost: 20.5 })
  // 附参考 sheet：所有可用 SKU
  const ref = wb.addWorksheet('可用SKU参考')
  ref.columns = [
    { header: 'SKU编号', key: 'sku', width: 20 },
    { header: '名称', key: 'name', width: 24 },
    { header: '类型', key: 'type', width: 10 },
    { header: '规格', key: 'attrs', width: 20 },
  ]
  ref.getRow(1).font = { bold: true }
  const attrsText = (a) => Object.entries(a || {}).map(([k, v]) => `${k}=${v}`).join(',')
  for (const p of await Product.find({ active: true, kind: 'physical' }).lean()) {
    for (const s of p.skus.filter((x) => x.active)) {
      ref.addRow({ sku: s.no, name: p.name, type: '成品', attrs: attrsText(s.attrs) })
    }
  }
  for (const m of await Material.find({ active: true }).lean()) {
    for (const s of m.skus.filter((x) => x.active)) {
      ref.addRow({ sku: s.no, name: m.name, type: '原材料', attrs: attrsText(s.attrs) })
    }
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', 'attachment; filename="initial-stock-template.xlsx"')
  await wb.xlsx.write(res)
  res.end()
}))

/**
 * POST /api/import/initial-stock  上传期初库存 Excel（字段名 file）
 * 校验全部通过后在一个事务内写入（期初入库流水），任一行失败则全部不导入
 */
router.post('/initial-stock', requireRole('admin', 'keeper'), upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请上传 Excel 文件' })

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(req.file.buffer)
  const ws = wb.getWorksheet('期初库存') || wb.worksheets[0]
  if (!ws) return res.status(400).json({ message: 'Excel 中没有工作表' })

  // 解析行
  const rows = []
  ws.eachRow((row, n) => {
    if (n === 1) return // 表头
    const sku = String(row.getCell(1).value || '').trim()
    const qty = Number(row.getCell(2).value)
    const cost = Number(row.getCell(3).value)
    if (!sku && !row.getCell(2).value) return // 空行
    rows.push({ line: n, sku, qty, cost })
  })
  if (!rows.length) return res.status(400).json({ message: 'Excel 中没有数据行' })

  // 逐行校验
  const errors = []
  const valid = []
  for (const r of rows) {
    if (!/^[A-Z]{3}\d{6}-\d{3}$/.test(r.sku)) {
      errors.push(`第 ${r.line} 行：SKU 编号格式无效「${r.sku}」（示例行请删除）`)
      continue
    }
    if (!r.qty || r.qty <= 0) {
      errors.push(`第 ${r.line} 行：数量必须大于 0`)
      continue
    }
    if (Number.isNaN(r.cost) || r.cost < 0) {
      errors.push(`第 ${r.line} 行：单位成本无效`)
      continue
    }
    const isProduct = r.sku.startsWith('PRD')
    const exists = isProduct
      ? await Product.countDocuments({ 'skus.no': r.sku, kind: 'physical' })
      : await Material.countDocuments({ 'skus.no': r.sku })
    if (!exists) {
      errors.push(`第 ${r.line} 行：SKU ${r.sku} 不存在（虚拟组合不能导入库存）`)
      continue
    }
    valid.push({ ...r, itemType: isProduct ? 'product' : 'material' })
  }
  if (errors.length) return res.status(400).json({ message: '校验失败，未导入任何数据', errors })

  // 同事务写入
  const results = await withTxn(async (session) => {
    const out = []
    for (const r of valid) {
      const after = await applyInventoryChange({
        itemType: r.itemType, sku: r.sku, change: r.qty, unitCost: r.cost,
        type: LOG_TYPES.INITIAL_IN, operator: req.user.username, docNo: '期初导入',
      }, session)
      out.push({ sku: r.sku, qty: r.qty, balance: after.qty })
    }
    return out
  })
  res.json({ imported: results.length, results })
}))

export default router
