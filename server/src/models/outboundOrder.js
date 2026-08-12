import mongoose from 'mongoose'

// 出库单明细：映射快照 + 内部 SKU
const outboundItemSchema = new mongoose.Schema(
  {
    // 平台映射快照（销售出库）
    platform: { type: String, default: '' },
    account: { type: String, default: '' },
    id1: { type: String, default: '' },
    id2: { type: String, default: '' },
    sku: { type: String, required: true }, // 内部产品 SKU（虚拟组合 SKU 也记这里）
    virtualSku: { type: String, default: '' }, // 来源虚拟组合 SKU（组件展开行）
    qty: { type: Number, required: true },
    unitCost: { type: Number, default: 0 }, // 出库时加权成本快照
  },
  { _id: false }
)

// 出库单（需求文档 4.8）：type=sale 销售出库 / scrap 报废出库
const outboundOrderSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // OUT000001
  type: { type: String, enum: ['sale', 'scrap'], default: 'sale' },
  channel: { type: String, default: '' }, // 去向渠道
  date: { type: Date, default: Date.now },
  platformOrderNo: { type: String, default: '' }, // 关联平台单号
  scrapReason: { type: String, default: '' }, // 报废原因（报废出库必填）
  status: { type: String, enum: ['done', 'void'], default: 'done' },
  items: { type: [outboundItemSchema], default: [] },
  remark: { type: String, default: '' },
  operator: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  voidedAt: { type: Date },
})

export const OUT_STATUS = { done: '已出库', void: '已作废' }
export const OutboundOrder = mongoose.model('OutboundOrder', outboundOrderSchema)
