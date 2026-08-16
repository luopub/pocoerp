import { Router } from 'express'
import ExcelJS from 'exceljs'
import { Product } from '../models/product.js'
import { Material } from '../models/material.js'
import { Supplier } from '../models/supplier.js'
import { ListingMapping } from '../models/listingMapping.js'
import { PurchaseOrder } from '../models/purchaseOrder.js'
import { WorkOrder } from '../models/workOrder.js'
import { OutboundOrder } from '../models/outboundOrder.js'
import { ReturnOrder } from '../models/returnOrder.js'
import { Stocktake } from '../models/stocktake.js'
import { InventoryLog } from '../models/inventory.js'
import { requireAuth } from '../middleware/auth.js'
import { wrap } from '../util.js'

const router = Router()
router.use(requireAuth)

const attrsText = (a) => Object.entries(a || {}).map(([k, v]) => `${k}=${v}`).join(',')
const fmt = (d) => (d ? new Date(d).toLocaleString('zh-CN', { hour12: false }) : '')

// 各实体导出的列定义与数据查询（与列表页同口径）
const EXPORTERS = {
  products: {
    name: '产品',
    columns: [
      { header: 'SPU编号', key: 'no', width: 14 }, { header: '名称', key: 'name', width: 20 },
      { header: '分类', key: 'category', width: 10 }, { header: '类型', key: 'kind', width: 10 },
      { header: '来源方式', key: 'source', width: 12 }, { header: '默认供应商', key: 'defaultSupplier', width: 16 },
      { header: 'SKU编号', key: 'skuNo', width: 16 },
      { header: '规格属性', key: 'attrs', width: 20 }, { header: '安全库存', key: 'safeStock', width: 10 },
      { header: '耗材成本', key: 'consumableCost', width: 10 },
    ],
    async rows() {
      const KIND = { physical: '实物', virtual: '虚拟组合' }
      const SRC = { direct: '直接采购', outsourced: '委外加工', both: '两者皆可' }
      const out = []
      for (const p of await Product.find().sort({ no: 1 }).lean()) {
        for (const s of p.skus) {
          out.push({
            no: p.no, name: p.name, category: p.category, kind: KIND[p.kind],
            source: SRC[p.source], defaultSupplier: p.defaultSupplier,
            skuNo: s.no, attrs: attrsText(s.attrs), safeStock: s.safeStock, consumableCost: s.consumableCost || 0,
          })
        }
      }
      return out
    },
  },
  materials: {
    name: '原材料',
    columns: [
      { header: 'SPU编号', key: 'no', width: 14 }, { header: '名称', key: 'name', width: 20 },
      { header: '单位', key: 'unit', width: 8 }, { header: '默认供应商', key: 'defaultSupplier', width: 16 },
      { header: 'SKU编号', key: 'skuNo', width: 16 }, { header: '规格属性', key: 'attrs', width: 20 },
      { header: '安全库存', key: 'safeStock', width: 10 }, { header: '单价', key: 'price', width: 10 },
    ],
    async rows() {
      const out = []
      for (const m of await Material.find().sort({ no: 1 }).lean()) {
        for (const s of m.skus) {
          out.push({ no: m.no, name: m.name, unit: m.unit, defaultSupplier: m.defaultSupplier, skuNo: s.no, attrs: attrsText(s.attrs), safeStock: s.safeStock, price: s.price || m.price || 0 })
        }
      }
      return out
    },
  },
  suppliers: {
    name: '供应商',
    columns: [
      { header: '编号', key: 'no', width: 12 }, { header: '名称', key: 'name', width: 20 },
      { header: '类型', key: 'types', width: 24 }, { header: '联系人', key: 'contact', width: 12 },
      { header: '电话', key: 'phone', width: 14 }, { header: '备注', key: 'remark', width: 24 },
    ],
    async rows() {
      return (await Supplier.find().sort({ no: 1 }).lean())
        .map((s) => ({ ...s, types: s.types.join('、') }))
    },
  },
  mappings: {
    name: '平台映射',
    columns: [
      { header: 'SPU编号', key: 'spuNo', width: 14 }, { header: 'SKU编号', key: 'skuNo', width: 16 },
      { header: '平台', key: 'platform', width: 12 }, { header: '账号', key: 'account', width: 12 },
      { header: 'ID1', key: 'id1', width: 20 }, { header: 'ID2', key: 'id2', width: 16 },
      { header: '默认', key: 'isDefault', width: 8 }, { header: '备注', key: 'remark', width: 20 },
    ],
    async rows() {
      return (await ListingMapping.find().sort({ spuNo: 1, skuNo: 1 }).lean())
        .map((m) => ({ ...m, isDefault: m.isDefault ? '是' : '' }))
    },
  },
  logs: {
    name: '库存流水',
    columns: [
      { header: '时间', key: 'time', width: 20 }, { header: 'SKU', key: 'sku', width: 16 },
      { header: '物品类型', key: 'itemType', width: 10 }, { header: '类型', key: 'type', width: 12 },
      { header: '变动', key: 'change', width: 10 }, { header: '结存', key: 'balance', width: 10 },
      { header: '单价', key: 'unitCost', width: 10 }, { header: '单据', key: 'docNo', width: 16 },
      { header: '操作人', key: 'operator', width: 10 },
    ],
    async rows(query) {
      const q = {}
      if (query.sku) q.sku = new RegExp(query.sku, 'i')
      if (query.type) q.type = query.type
      if (query.from || query.to) {
        q.time = {}
        if (query.from) q.time.$gte = new Date(query.from)
        if (query.to) q.time.$lte = new Date(`${query.to}T23:59:59.999Z`)
      }
      return (await InventoryLog.find(q).sort({ time: -1 }).limit(10000).lean())
        .map((l) => ({ ...l, time: fmt(l.time), itemType: l.itemType === 'product' ? '成品' : '原材料' }))
    },
  },
  purchases: {
    name: '采购单',
    columns: [
      { header: '单号', key: 'no', width: 14 }, { header: '类型', key: 'type', width: 10 },
      { header: '供应商', key: 'supplier', width: 16 }, { header: '日期', key: 'date', width: 12 },
      { header: 'SKU', key: 'sku', width: 16 }, { header: '数量', key: 'qty', width: 8 },
      { header: '单价', key: 'price', width: 10 }, { header: '已入库', key: 'receivedQty', width: 8 },
      { header: '状态', key: 'status', width: 10 }, { header: '应付', key: 'payable', width: 10 },
    ],
    async rows() {
      const ST = { pending: '待入库', partial: '部分入库', done: '已入库', void: '已作废' }
      const out = []
      for (const po of await PurchaseOrder.find().sort({ createdAt: -1 }).lean()) {
        for (const it of po.items) {
          out.push({
            no: po.no, type: po.type === 'product' ? '成品' : '原材料', supplier: po.supplier,
            date: fmt(po.date).slice(0, 10), sku: it.sku, qty: it.qty, price: it.price,
            receivedQty: it.receivedQty, status: ST[po.status], payable: po.payable,
          })
        }
      }
      return out
    },
  },
  outbounds: {
    name: '出库单',
    columns: [
      { header: '单号', key: 'no', width: 14 }, { header: '类型', key: 'type', width: 10 },
      { header: '渠道', key: 'channel', width: 12 }, { header: '日期', key: 'date', width: 12 },
      { header: '平台', key: 'platform', width: 12 }, { header: 'ID1', key: 'id1', width: 18 },
      { header: 'SKU', key: 'sku', width: 16 }, { header: '数量', key: 'qty', width: 8 },
      { header: '成本', key: 'unitCost', width: 10 }, { header: '状态', key: 'status', width: 10 },
    ],
    async rows() {
      const out = []
      for (const o of await OutboundOrder.find().sort({ createdAt: -1 }).lean()) {
        for (const it of o.items) {
          out.push({
            no: o.no, type: o.type === 'sale' ? '销售' : '报废', channel: o.channel,
            date: fmt(o.date).slice(0, 10), platform: it.platform, id1: it.id1,
            sku: it.sku, qty: it.qty, unitCost: it.unitCost, status: o.status === 'void' ? '已作废' : '已出库',
          })
        }
      }
      return out
    },
  },
  workorders: {
    name: '加工单',
    columns: [
      { header: '单号', key: 'no', width: 14 }, { header: '产品', key: 'spuNo', width: 14 },
      { header: 'SKU', key: 'sku', width: 16 }, { header: '计划', key: 'qty', width: 8 },
      { header: '已入库', key: 'receivedQty', width: 8 }, { header: '状态', key: 'status', width: 12 },
      { header: '加工费', key: 'payable', width: 10 }, { header: '创建时间', key: 'createdAt', width: 20 },
    ],
    async rows() {
      const ST = { pending: '待开始', processing: '加工中', done: '已完成', void: '已作废' }
      const out = []
      for (const w of await WorkOrder.find().sort({ createdAt: -1 }).lean()) {
        for (const p of w.planItems) {
          out.push({
            no: w.no, spuNo: w.spuNo, sku: p.sku, qty: p.qty, receivedQty: p.receivedQty,
            status: ST[w.status], payable: w.payable, createdAt: fmt(w.createdAt),
          })
        }
      }
      return out
    },
  },
  returns: {
    name: '退货入库单',
    columns: [
      { header: '单号', key: 'no', width: 14 }, { header: '渠道', key: 'channel', width: 12 },
      { header: '原出库单', key: 'originalOutboundNo', width: 14 }, { header: '日期', key: 'date', width: 12 },
      { header: 'SKU', key: 'sku', width: 16 }, { header: '数量', key: 'qty', width: 8 },
      { header: '成色', key: 'condition', width: 8 }, { header: '状态', key: 'status', width: 10 },
    ],
    async rows() {
      const out = []
      for (const r of await ReturnOrder.find().sort({ createdAt: -1 }).lean()) {
        for (const it of r.items) {
          out.push({
            no: r.no, channel: r.channel, originalOutboundNo: r.originalOutboundNo,
            date: fmt(r.date).slice(0, 10), sku: it.sku, qty: it.qty,
            condition: it.condition === 'good' ? '良品' : '不良品', status: r.status === 'void' ? '已作废' : '已入库',
          })
        }
      }
      return out
    },
  },
  stocktakes: {
    name: '盘点单',
    columns: [
      { header: '单号', key: 'no', width: 14 }, { header: '状态', key: 'status', width: 10 },
      { header: 'SKU', key: 'sku', width: 16 }, { header: '账面', key: 'bookQty', width: 8 },
      { header: '实盘', key: 'actualQty', width: 8 }, { header: '差异', key: 'diff', width: 8 },
      { header: '确认时间', key: 'confirmedAt', width: 20 },
    ],
    async rows() {
      const ST = { draft: '草稿', confirmed: '已确认', void: '已作废' }
      const out = []
      for (const s of await Stocktake.find().sort({ createdAt: -1 }).lean()) {
        for (const it of s.items) {
          out.push({
            no: s.no, status: ST[s.status], sku: it.sku, bookQty: it.bookQty,
            actualQty: it.actualQty, diff: it.actualQty === null ? '' : it.actualQty - it.bookQty,
            confirmedAt: fmt(s.confirmedAt),
          })
        }
      }
      return out
    },
  },
}

// GET /api/export/:entity  下载 Excel
router.get('/:entity', wrap(async (req, res) => {
  const exp = EXPORTERS[req.params.entity]
  if (!exp) return res.status(404).json({ message: '不支持的导出类型' })
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(exp.name)
  ws.columns = exp.columns
  ws.getRow(1).font = { bold: true }
  for (const row of await exp.rows(req.query)) ws.addRow(row)
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.entity}.xlsx"`)
  await wb.xlsx.write(res)
  res.end()
}))

export default router
