import mongoose from 'mongoose'

// 退货入库明细（内嵌）
const returnItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true }, // 产品 SKU
    qty: { type: Number, required: true },
    condition: { type: String, enum: ['good', 'bad'], required: true }, // 良品/不良品
  },
  { _id: false }
)

// 退货入库单（需求文档 4.14）：良品回库（退货入库流水），不良品只记录计入损耗统计
const returnOrderSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // RTN000001
  channel: { type: String, default: '' }, // 来源渠道
  originalOutboundNo: { type: String, default: '' }, // 原出库单号（可空）
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['done', 'void'], default: 'done' },
  items: { type: [returnItemSchema], default: [] },
  remark: { type: String, default: '' },
  operator: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  voidedAt: { type: Date },
})

export const RTN_STATUS = { done: '已入库', void: '已作废' }
export const ReturnOrder = mongoose.model('ReturnOrder', returnOrderSchema)
