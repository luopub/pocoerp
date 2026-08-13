import mongoose from 'mongoose'

// 盘点单明细（内嵌）
const stocktakeItemSchema = new mongoose.Schema(
  {
    itemType: { type: String, enum: ['product', 'material'], required: true },
    sku: { type: String, required: true },
    bookQty: { type: Number, required: true }, // 账面数量（创建时快照）
    actualQty: { type: Number, default: null }, // 实盘数量
    unitCost: { type: Number, default: 0 }, // 确认时加权成本快照
  },
  { _id: false }
)

// 盘点单（需求文档 4.7.1）：草稿 → 已确认（可作废，作废回滚调整）
const stocktakeSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // STK000001
  status: { type: String, enum: ['draft', 'confirmed', 'void'], default: 'draft' },
  items: { type: [stocktakeItemSchema], default: [] },
  remark: { type: String, default: '' },
  operator: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  confirmedAt: { type: Date },
  voidedAt: { type: Date },
})

export const STK_STATUS = { draft: '草稿', confirmed: '已确认', void: '已作废' }
export const Stocktake = mongoose.model('Stocktake', stocktakeSchema)
