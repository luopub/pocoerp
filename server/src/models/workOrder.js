import mongoose from 'mongoose'

// 加工单计划明细：按 SKU 分列计划数量
const planItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true }, // 产品 SKU
    qty: { type: Number, required: true }, // 计划数量
    receivedQty: { type: Number, default: 0 }, // 已完工入库数量
  },
  { _id: false }
)

// 工序内数量明细：按 SKU 记录投入/产出
const stepQtySchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    inQty: { type: Number, default: 0 },
    outQty: { type: Number, default: 0 },
  },
  { _id: false }
)

// 工序记录（按产品工序模板生成，顺序执行）：子号 WKO000001-001
const processRecordSchema = new mongoose.Schema(
  {
    no: { type: String, required: true },
    seq: { type: Number, required: true }, // 顺序，从 1 开始
    name: { type: String, required: true },
    expectedDays: { type: Number, default: null },
    supplier: { type: String, default: '' }, // 加工供应商
    startedAt: { type: Date },
    finishedAt: { type: Date },
    fee: { type: Number, default: 0 }, // 加工费（总额）
    remark: { type: String, default: '' },
    qtys: { type: [stepQtySchema], default: [] },
  },
  { _id: false }
)

// 发料记录：一道工序可发多种料、同一材料可分多次发
const issueRecordSchema = new mongoose.Schema(
  {
    stepSeq: { type: Number, required: true }, // 工序序号
    materialSku: { type: String, required: true },
    qty: { type: Number, required: true },
    unitCost: { type: Number, default: 0 }, // 发料时加权成本快照
    issuedAt: { type: Date, default: Date.now },
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

// 委外加工单（需求文档 4.6）
const workOrderSchema = new mongoose.Schema({
  no: { type: String, required: true, unique: true }, // WKO000001
  spuNo: { type: String, required: true }, // 产品 SPU
  status: { type: String, enum: ['pending', 'processing', 'done', 'void'], default: 'pending' },
  currentStep: { type: Number, default: 0 }, // 当前工序序号（0=未开始）
  planItems: { type: [planItemSchema], default: [] },
  // 创建时的 BOM 快照（此后改产品 BOM 不影响本单）
  bomSnapshot: { type: Array, default: [] },
  processes: { type: [processRecordSchema], default: [] },
  issues: { type: [issueRecordSchema], default: [] },
  payable: { type: Number, default: 0 }, // 加工费应付（各工序合计）
  payments: { type: [paymentSchema], default: [] },
  remark: { type: String, default: '' },
  operator: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  finishedAt: { type: Date },
})

export const WKO_STATUS = { pending: '待开始', processing: '加工中', done: '已完成', void: '已作废' }
export const WorkOrder = mongoose.model('WorkOrder', workOrderSchema)
