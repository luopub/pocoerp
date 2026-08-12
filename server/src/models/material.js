import mongoose from 'mongoose'

// 材料 SKU（内嵌）：子编号 MAT000001-001
const materialSkuSchema = new mongoose.Schema(
  {
    no: { type: String, required: true },
    attrs: { type: Map, of: String, default: {} }, // 规格属性，如 {颜色: '红'}
    safeStock: { type: Number, default: 0 },
    lastStocktakeAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { _id: false }
)

// 原材料 SPU（需求文档 4.3）
const materialSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // MAT000001
  name: { type: String, required: true },
  unit: { type: String, default: '' }, // 单位：米/个/kg…
  defaultSupplier: { type: String, default: '' }, // 供应商名称
  remark: { type: String, default: '' },
  active: { type: Boolean, default: true },
  skus: { type: [materialSkuSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
})
materialSchema.index({ 'skus.no': 1 }, { unique: true, sparse: true })

export const Material = mongoose.model('Material', materialSchema)
