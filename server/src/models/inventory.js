import mongoose from 'mongoose'

// 库存：按 SKU 跟踪（itemType: product 成品 / material 原材料）
const inventorySchema = new mongoose.Schema({
  itemType: { type: String, enum: ['product', 'material'], required: true },
  sku: { type: String, required: true },
  qty: { type: Number, default: 0 },
  avgCost: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
})
inventorySchema.index({ itemType: 1, sku: 1 }, { unique: true })

// 库存流水：每一次变动一条记录
const inventoryLogSchema = new mongoose.Schema({
  time: { type: Date, default: Date.now },
  itemType: { type: String, enum: ['product', 'material'], required: true },
  sku: { type: String, required: true },
  type: { type: String, required: true }, // 见 services/inventory.js LOG_TYPES
  docId: { type: mongoose.Schema.Types.ObjectId },
  docNo: { type: String },
  change: { type: Number, required: true },   // 正=入，负=出
  balance: { type: Number, required: true },  // 变动后结存
  unitCost: { type: Number },                 // 入库单价（出库为空）
  operator: { type: String },
})
inventoryLogSchema.index({ sku: 1, time: -1 })
inventoryLogSchema.index({ type: 1, time: -1 })

export const Inventory = mongoose.model('Inventory', inventorySchema)
export const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema)
