import mongoose from 'mongoose'

// 采购单明细（内嵌）：子号 POP000001-001
const poItemSchema = new mongoose.Schema(
  {
    no: { type: String, required: true },
    sku: { type: String, required: true }, // 产品 SKU 或材料 SKU
    qty: { type: Number, required: true },
    price: { type: Number, required: true },
    receivedQty: { type: Number, default: 0 }, // 已入库数量（分次入库用）
  },
  { _id: false }
)

const paymentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
)

// 采购单（需求文档 4.5）：type=product 成品采购(POP) / material 原材料采购(POM)
const purchaseOrderSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true },
  type: { type: String, enum: ['product', 'material'], required: true },
  supplier: { type: String, required: true }, // 供应商名称
  date: { type: Date, default: Date.now }, // 采购日期
  status: { type: String, enum: ['pending', 'partial', 'done', 'void'], default: 'pending' },
  items: { type: [poItemSchema], default: [] },
  payable: { type: Number, default: 0 }, // 应付金额（明细合计）
  payments: { type: [paymentSchema], default: [] }, // 付款记录
  diffNote: { type: String, default: '' }, // 差异结案说明
  remark: { type: String, default: '' },
  operator: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
})

export const PO_STATUS = { pending: '待入库', partial: '部分入库', done: '已入库', void: '已作废' }
export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema)
