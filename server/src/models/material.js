import mongoose from 'mongoose'

// 材料 SKU（内嵌）：子编号 MAT000001-001
const materialSkuSchema = new mongoose.Schema(
  {
    no: { type: String, required: true },
    attrs: { type: Map, of: String, default: {} }, // 规格属性，如 {颜色: '红'}
    safeStock: { type: Number, default: 0 },
    price: { type: Number, default: 0 }, // 参考单价（新建采购单时自动带出）
    lastStocktakeAt: { type: Date },
    active: { type: Boolean, default: true },
  },
  { _id: false }
)

// 原材料 SPU（需求文档 4.3）
const materialSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // MAT000001
  name: { type: String, required: true },
  unit: { type: String, default: '' }, // 内部单位：库存/BOM/发料/盘点使用（米/个/kg…）
  purchaseUnit: { type: String, default: '' }, // 外部单位：采购下单与入库时使用；空 = 同内部单位
  unitRate: { type: Number, default: 1 }, // 转换系数：1 外部单位 = unitRate 内部单位（如 1 米 = 1.0936 码）
  defaultSupplier: { type: String, default: '' }, // 供应商名称
  price: { type: Number, default: 0 }, // SPU 级参考单价（外部单位单价，新建采购单时自动带出；SKU 单价为 0 时使用）
  remark: { type: String, default: '' },
  active: { type: Boolean, default: true },
  skus: { type: [materialSkuSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
})
materialSchema.index({ 'skus.no': 1 }, { unique: true, sparse: true })

export const Material = mongoose.model('Material', materialSchema)
