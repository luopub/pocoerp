import mongoose from 'mongoose'

// 产品 SKU（内嵌）：子编号 PRD000001-001
const productSkuSchema = new mongoose.Schema(
  {
    no: { type: String, required: true },
    attrs: { type: Map, of: String, default: {} }, // 规格属性，如 {颜色: '红', 尺寸: '大'}
    image: { type: String, default: '' }, // 图片路径 /uploads/xxx
    safeStock: { type: Number, default: 0 },
    consumableCost: { type: Number, default: 0 }, // 单位耗材成本（情景 4，按 SKU 设置）
    // 预警/补货参数：null = 继承 SPU / 全局默认（需求文档情景 11）
    warnWindowDays: { type: Number, default: null },
    warnDays: { type: Number, default: null },
    replenishDays: { type: Number, default: null },
    lastStocktakeAt: { type: Date },
    active: { type: Boolean, default: true },
    remark: { type: String, default: '' },
  },
  { _id: false }
)

// 物料清单（简化 BOM，需求文档 4.2）
const bomSchema = new mongoose.Schema(
  {
    materialSku: { type: String, required: true }, // MAT000001-001
    usage: { type: Number, required: true }, // 单位用量
    bomType: { type: String, enum: ['main', 'aux'], required: true }, // 主材/辅料
    processStep: { type: String, default: '' }, // 辅料投入工序名；主材固定首道工序
    applySkus: { type: [String], default: [] }, // 适用产品 SKU，空=全部
  },
  { _id: false }
)

// 虚拟组合组成明细（仅虚拟组合产品）
const componentSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true }, // 组件产品 SKU（PRDxxxxx-xxx）
    qty: { type: Number, required: true }, // 单位用量
  },
  { _id: false }
)

// 工序模板
const processStepSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    expectedDays: { type: Number, default: null }, // 预期天数（超期提醒，情景 18）
  },
  { _id: false }
)

// 产品 SPU（需求文档 4.2）
const productSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // PRD000001
  name: { type: String, required: true },
  category: { type: String, default: '' },
  kind: { type: String, enum: ['physical', 'virtual'], default: 'physical' }, // 实物/虚拟组合
  source: { type: String, enum: ['direct', 'outsourced', 'both'], default: 'direct' }, // 直接采购/委外加工/两者皆可
  defaultSupplier: { type: String, default: '' },
  processTemplate: { type: [processStepSchema], default: [] }, // 委外加工类产品用
  bom: { type: [bomSchema], default: [] },
  components: { type: [componentSchema], default: [] }, // 仅虚拟组合
  // SPU 级预警参数：null = 继承全局默认
  warnWindowDays: { type: Number, default: null },
  warnDays: { type: Number, default: null },
  replenishDays: { type: Number, default: null },
  remark: { type: String, default: '' },
  active: { type: Boolean, default: true },
  skus: { type: [productSkuSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
})
productSchema.index({ 'skus.no': 1 }, { unique: true, sparse: true })

export const PRODUCT_KIND = { physical: '实物产品', virtual: '虚拟组合' }
export const PRODUCT_SOURCE = { direct: '直接采购', outsourced: '委外加工', both: '两者皆可' }
export const Product = mongoose.model('Product', productSchema)
