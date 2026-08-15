<template>
  <div>
    <div class="toolbar">
      <el-select v-model="statusFilter" placeholder="状态" clearable class="status-filter" @change="load">
        <el-option v-for="(n, v) in WKO_STATUS" :key="v" :label="n" :value="v" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索单号/产品编号" clearable class="search" @change="load" />
      <el-button type="primary" @click="openCreate">新建加工单</el-button>
      <el-button @click="downloadExcel('workorders')">导出 Excel</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="单号" width="115" />
      <el-table-column label="产品" min-width="130">
        <template #default="{ row }">{{ row.spuName }}<div class="muted">{{ row.spuNo }}</div></template>
      </el-table-column>
      <el-table-column label="计划" min-width="170">
        <template #default="{ row }">
          <div v-for="p in row.planItems" :key="p.sku" class="line">
            {{ p.sku }} × {{ p.qty }}<span class="muted">（已入 {{ p.receivedQty }}）</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="140">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS_TYPE[row.status]">
            {{ WKO_STATUS[row.status] }}<template v-if="row.status === 'processing'">·{{ row.currentStepName }}</template>
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="加工费" width="90" align="right">
        <template #default="{ row }">{{ row.payable.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="创建时间" width="105">
        <template #default="{ row }">{{ fmtDate(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建加工单 -->
    <el-dialog v-model="createDlg" title="新建加工单" width="640px">
      <el-form label-width="90px">
        <el-form-item label="产品" required>
          <el-select v-model="createForm.spuNo" filterable placeholder="仅显示委外加工类产品" @change="onSpuPick">
            <el-option v-for="p in spuOptions" :key="p.no" :label="`${p.name}（${p.no}）`" :value="p.no" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="createForm.spu" label="工序">
          <span class="muted">{{ createForm.spu.processTemplate.map((p) => p.name).join(' → ') }}</span>
        </el-form-item>
        <el-form-item v-if="createForm.spu" label="主材输入" required>
          <div class="material-row">
            <el-select v-model="createForm.materialSku" filterable placeholder="首道工序的主材">
              <el-option v-for="m in mainMaterialOptions" :key="m.skuNo" :label="`${m.spuName} ${m.skuNo}（${attrsText(m.attrs)}）`" :value="m.skuNo" />
            </el-select>
            <el-input-number v-model="createForm.materialQty" :min="0.001" :precision="3" controls-position="right" placeholder="输入量" />
          </div>
        </el-form-item>
        <el-form-item v-if="createForm.spu" label="计划数量" required>
          <div class="plan-list">
            <div v-for="s in createForm.spu.skus.filter((x) => x.active)" :key="s.no" class="plan-row">
              <span class="plan-sku">{{ s.no }}（{{ attrsText(s.attrs) }}，用量 {{ usageOf(s.no) }}）</span>
              <el-input-number v-model="createForm.qtys[s.no]" :min="0" :precision="0" controls-position="right" />
            </div>
            <div class="muted" :class="{ 'over-limit': overLimit }">
              合计用料 {{ round3(totalUsage) }} / 主材输入 {{ createForm.materialQty || 0 }}
              <template v-if="overLimit">（已超出，请调减计划或加大输入量）</template>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="createForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCreate">创建</el-button>
      </template>
    </el-dialog>

    <!-- 详情抽屉 -->
    <el-drawer v-model="detailDlg" :title="`加工单 ${detail?.no || ''}`" size="760px">
      <template v-if="detail">
        <div class="d-head">
          <el-tag :type="STATUS_TYPE[detail.status]">{{ WKO_STATUS[detail.status] }}</el-tag>
          <span>{{ detail.spuName }}（{{ detail.spuNo }}）</span>
          <span v-if="detail.materialInput?.qty" class="muted">
            主材输入 {{ detail.materialInput.materialSku }} × {{ detail.materialInput.qty }}
          </span>
          <span v-if="consumableText" class="muted">耗材成本 {{ consumableText }}/件</span>
          <el-button v-if="detail.status !== 'void'" size="small" type="primary" plain @click="openPayments">付款登记</el-button>
          <el-popconfirm v-if="canVoid" title="确定作废该加工单？" @confirm="voidOrder">
            <template #reference><el-button size="small" type="danger" plain>作废</el-button></template>
          </el-popconfirm>
        </div>

        <el-divider content-position="left">工序流程</el-divider>
        <div v-for="p in detail.processes" :key="p.seq" class="step-card" :class="{ active: p.seq === detail.currentStep && !p.finishedAt }">
          <div class="step-head">
            <span class="step-title">{{ p.seq }}. {{ p.name }}</span>
            <el-tag v-if="p.finishedAt" size="small" type="success">已完成</el-tag>
            <el-tag v-else-if="p.startedAt" size="small" type="primary">进行中</el-tag>
            <el-tag v-else size="small" type="info">未开始</el-tag>
            <span v-if="p.expectedDays" class="muted">预期 {{ p.expectedDays }} 天</span>
          </div>
          <div class="step-body">
            <div class="step-row">
              <span class="lbl">加工商</span>
              <el-select v-model="p.supplier" size="small" filterable clearable :disabled="!p.startedAt || !!p.finishedAt" @change="saveStep(p)">
                <el-option v-for="s in processors" :key="s._id" :label="s.name" :value="s.name" />
              </el-select>
              <span class="lbl">加工费</span>
              <el-input-number v-model="p.fee" size="small" :min="0" :precision="2" controls-position="right" :disabled="!p.startedAt || !!p.finishedAt" @change="saveStep(p)" />
              <span class="muted" v-if="p.startedAt">开始 {{ fmtTime(p.startedAt) }}</span>
              <span class="muted" v-if="p.finishedAt">完成 {{ fmtTime(p.finishedAt) }}</span>
            </div>
            <div v-if="p.startedAt" class="step-row">
              <span class="lbl">数量</span>
              <span v-for="q in p.qtys" :key="q.sku" class="qty-item">
                {{ q.sku.split('-')[1] }}: 入
                <el-input-number v-model="q.inQty" size="small" :min="0" :precision="0" controls-position="right" class="qty-input" :disabled="!!p.finishedAt" @change="saveStep(p)" />
                出
                <el-input-number v-model="q.outQty" size="small" :min="0" :precision="0" controls-position="right" class="qty-input" :disabled="!!p.finishedAt" @change="saveStep(p)" />
              </span>
            </div>
            <div class="step-row">
              <el-button v-if="!p.startedAt && canStart(p)" size="small" type="primary" @click="startStep(p)">开始本工序</el-button>
              <el-button v-if="p.startedAt && !p.finishedAt" size="small" type="success" @click="finishStep(p)">完成本工序</el-button>
              <el-button v-if="p.startedAt && !p.finishedAt" size="small" @click="openIssue(p)">发料</el-button>
            </div>
            <div v-if="issuesOf(p.seq).length" class="issue-list">
              <div v-for="(i, idx) in issuesOf(p.seq)" :key="idx" class="muted">
                已发 {{ i.materialSku }} × {{ i.qty }}（@{{ i.unitCost.toFixed(2) }}，{{ fmtTime(i.issuedAt) }}）
              </div>
            </div>
          </div>
        </div>

        <template v-if="lastStepFinished && detail.status !== 'done' && detail.status !== 'void'">
          <el-divider content-position="left">完工入库</el-divider>
          <div v-for="p in detail.planItems" :key="p.sku" class="plan-row">
            <span class="plan-sku">{{ p.sku }}（计划 {{ p.qty }}，已入 {{ p.receivedQty }}）</span>
            <el-input-number v-model="completeQtys[p.sku]" :min="0" :max="p.qty - p.receivedQty" :precision="0" controls-position="right" />
          </div>
          <el-button type="primary" :loading="saving" @click="complete">确认完工入库</el-button>
        </template>
      </template>
    </el-drawer>

    <!-- 发料对话框 -->
    <el-dialog v-model="issueDlg" :title="`发料 — 工序「${issueStep?.name || ''}」`" width="520px">
      <el-alert v-if="suggested.length" type="info" :closable="false" class="issue-tip">
        <div v-for="s in suggested" :key="s.materialSku">建议：{{ s.materialSku }} × {{ s.qty }}（按 BOM 自动计算，可调整）</div>
      </el-alert>
      <el-form label-width="90px">
        <el-form-item label="材料 SKU" required>
          <el-select v-model="issueForm.materialSku" filterable>
            <el-option v-for="m in materialSkus" :key="m.skuNo" :label="`${m.spuName} ${m.skuNo}（${attrsText(m.attrs)}）`" :value="m.skuNo" />
          </el-select>
        </el-form-item>
        <el-form-item label="数量" required>
          <el-input-number v-model="issueForm.qty" :min="0.001" :precision="3" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="issueDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveIssue">确认发料</el-button>
      </template>
    </el-dialog>

    <!-- 付款登记对话框 -->
    <el-dialog v-model="payDlg" :title="`加工费付款 — ${detail?.no || ''}`" width="520px">
      <div class="pay-summary">
        应付 <b>{{ detail?.payable.toFixed(2) }}</b>，
        已付 <b :style="{ color: '#67c23a' }">{{ paidOf(detail).toFixed(2) }}</b>，
        未付 <b :style="{ color: '#f56c6c' }">{{ (detail ? detail.payable - paidOf(detail) : 0).toFixed(2) }}</b>
      </div>
      <el-table :data="detail?.payments || []" size="small" border>
        <el-table-column label="日期" width="160">
          <template #default="{ row }">{{ fmtDate(row.date) }}</template>
        </el-table-column>
        <el-table-column label="金额" align="right">
          <template #default="{ row }">{{ row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="" width="70">
          <template #default="{ $index }">
            <el-popconfirm title="删除该笔付款？" @confirm="removePayment($index)">
              <template #reference><el-button link type="danger">删除</el-button></template>
            </el-popconfirm>
          </template>
        </el-table-column>
      </el-table>
      <div class="pay-add">
        <el-date-picker v-model="payForm.date" type="date" value-format="YYYY-MM-DD" placeholder="付款日期" />
        <el-input-number v-model="payForm.amount" :min="0.01" :precision="2" controls-position="right" placeholder="金额" />
        <el-button type="primary" :loading="saving" @click="addPayment">登记</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'

const WKO_STATUS = { pending: '待开始', processing: '加工中', done: '已完成', void: '已作废' }
const STATUS_TYPE = { pending: 'info', processing: 'primary', done: 'success', void: 'info' }

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const statusFilter = ref('')
const keyword = ref('')
const createDlg = ref(false)
const detailDlg = ref(false)
const issueDlg = ref(false)
const detail = ref(null)
const issueStep = ref(null)
const suggested = ref([])
const spuOptions = ref([])
const processors = ref([])
const materialSkus = ref([])
const completeQtys = reactive({})
const createForm = reactive({ spuNo: '', spu: null, qtys: {}, materialSku: '', materialQty: null, remark: '' })
const issueForm = reactive({ materialSku: '', qty: 1 })

// BOM 主材行（建单约束：Σ各SKU计划×单位用量 ≤ 主材输入量）
const mainRows = computed(() => (createForm.spu?.bom || []).filter((b) => b.bomType === 'main'))
const mainMaterialOptions = computed(() => {
  const nos = new Set(mainRows.value.map((b) => b.materialSku))
  return materialSkus.value.filter((m) => nos.has(m.skuNo))
})
function usageOf(skuNo) {
  return mainRows.value
    .filter((b) => !b.applySkus?.length || b.applySkus.includes(skuNo))
    .reduce((s, b) => s + b.usage, 0)
}
const totalUsage = computed(() =>
  Object.entries(createForm.qtys).reduce((s, [sku, q]) => s + (q || 0) * usageOf(sku), 0))
const overLimit = computed(() =>
  createForm.materialQty > 0 && totalUsage.value - createForm.materialQty > 1e-6)
function round3(n) { return Math.round(n * 1000) / 1000 }

const lastStepFinished = computed(() => {
  if (!detail.value?.processes?.length) return false
  return !!detail.value.processes[detail.value.processes.length - 1].finishedAt
})
const canVoid = computed(() =>
  detail.value && detail.value.status !== 'void' && detail.value.status !== 'done'
  && !detail.value.issues.length && detail.value.planItems.every((p) => p.receivedQty === 0))
// 各 SKU 耗材成本（SKU 级设置，如 "001:0.8，002:0.5"）
const consumableText = computed(() =>
  Object.entries(detail.value?.skuConsumables || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k.split('-')[1]}:${v}`)
    .join('，'))

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(',') : '默认'
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '' }
function fmtTime(d) { return new Date(d).toLocaleString('zh-CN', { hour12: false }) }
function issuesOf(seq) { return (detail.value?.issues || []).filter((i) => i.stepSeq === seq) }
function canStart(p) {
  if (detail.value.status === 'void' || detail.value.status === 'done') return false
  const prev = detail.value.processes.find((x) => x.seq === p.seq - 1)
  return !prev || !!prev.finishedAt
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/workorders', { params: { status: statusFilter.value, keyword: keyword.value } })).list
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  const products = (await api.get('/products')).list
  spuOptions.value = products.filter((p) => p.kind === 'physical' && p.source !== 'direct' && p.processTemplate.length && p.bom.length)
  processors.value = (await api.get('/suppliers', { params: { type: '加工商' } })).list
  materialSkus.value = (await api.get('/materials/skus')).list
}

function onSpuPick(no) {
  createForm.spu = spuOptions.value.find((p) => p.no === no) || null
  createForm.qtys = {}
  createForm.materialSku = mainRows.value[0]?.materialSku || ''
  createForm.materialQty = null
}

function openCreate() {
  Object.assign(createForm, { spuNo: '', spu: null, qtys: {}, materialSku: '', materialQty: null, remark: '' })
  createDlg.value = true
}

async function saveCreate() {
  if (!createForm.spuNo) return ElMessage.warning('请选择产品')
  const planItems = Object.entries(createForm.qtys).filter(([, q]) => q > 0).map(([sku, qty]) => ({ sku, qty }))
  if (!planItems.length) return ElMessage.warning('请填写计划数量')
  if (!createForm.materialSku) return ElMessage.warning('请选择主材')
  if (!createForm.materialQty || createForm.materialQty <= 0) return ElMessage.warning('请填写主材输入量')
  if (totalUsage.value - createForm.materialQty > 1e-6) {
    return ElMessage.warning(`计划总用料 ${round3(totalUsage.value)} 超出主材输入量 ${createForm.materialQty}`)
  }
  saving.value = true
  try {
    await api.post('/workorders', {
      spuNo: createForm.spuNo, planItems,
      materialInput: { materialSku: createForm.materialSku, qty: createForm.materialQty },
      remark: createForm.remark,
    })
    ElMessage.success('加工单已创建')
    createDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function openDetail(row) {
  detail.value = (await api.get(`/workorders/${row._id}`)).doc
  completeQtysClear()
  detailDlg.value = true
}

function completeQtysClear() {
  for (const k of Object.keys(completeQtys)) delete completeQtys[k]
  for (const p of detail.value?.planItems || []) completeQtys[p.sku] = p.qty - p.receivedQty
}

async function refresh() {
  detail.value = (await api.get(`/workorders/${detail.value._id}`)).doc
  load()
}

async function startStep(p) {
  await api.post(`/workorders/${detail.value._id}/steps/${p.seq}/start`, {})
  ElMessage.success(`工序「${p.name}」已开始`)
  refresh()
}

async function saveStep(p) {
  await api.put(`/workorders/${detail.value._id}/steps/${p.seq}`, {
    supplier: p.supplier, fee: p.fee, qtys: p.qtys,
  })
}

async function finishStep(p) {
  await api.post(`/workorders/${detail.value._id}/steps/${p.seq}/finish`)
  ElMessage.success(`工序「${p.name}」已完成`)
  refresh()
}

async function openIssue(p) {
  issueStep.value = p
  suggested.value = (await api.get(`/workorders/${detail.value._id}/suggest-issue`, { params: { stepSeq: p.seq } })).list
  issueForm.materialSku = suggested.value[0]?.materialSku || ''
  issueForm.qty = suggested.value[0]?.qty || 1
  issueDlg.value = true
}

async function saveIssue() {
  if (!issueForm.materialSku || !issueForm.qty) return ElMessage.warning('请选择材料并填写数量')
  saving.value = true
  try {
    await api.post(`/workorders/${detail.value._id}/issue`, {
      stepSeq: issueStep.value.seq, materialSku: issueForm.materialSku, qty: issueForm.qty,
    })
    ElMessage.success('发料完成')
    issueDlg.value = false
    refresh()
  } finally {
    saving.value = false
  }
}

async function complete() {
  const items = Object.entries(completeQtys).filter(([, q]) => q > 0).map(([sku, qty]) => ({ sku, qty }))
  if (!items.length) return ElMessage.warning('入库数量均为 0')
  saving.value = true
  try {
    const r = await api.post(`/workorders/${detail.value._id}/complete`, { items })
    ElMessage.success(`完工入库完成，单件成本 ${r.perUnitCost.toFixed(2)}`)
    refresh()
  } finally {
    saving.value = false
  }
}

// ---- 加工费付款登记 ----
const payDlg = ref(false)
const payForm = reactive({ date: '', amount: null })
const paidOf = (d) => (d?.payments || []).reduce((s, p) => s + p.amount, 0)

function openPayments() {
  payForm.date = new Date().toISOString().slice(0, 10)
  payForm.amount = Math.max(0, Math.round((detail.value.payable - paidOf(detail.value)) * 100) / 100) || null
  payDlg.value = true
}

async function addPayment() {
  if (!payForm.amount || payForm.amount <= 0) return ElMessage.warning('请输入付款金额')
  saving.value = true
  try {
    await api.post(`/workorders/${detail.value._id}/payments`, payForm)
    ElMessage.success('已登记')
    payDlg.value = false
    refresh()
  } finally {
    saving.value = false
  }
}

async function removePayment(idx) {
  await api.delete(`/workorders/${detail.value._id}/payments/${idx}`)
  ElMessage.success('已删除')
  payDlg.value = false
  refresh()
}

async function voidOrder() {
  await api.post(`/workorders/${detail.value._id}/void`)
  ElMessage.success('已作废')
  detailDlg.value = false
  load()
}

onMounted(() => { load(); loadRefs() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
.search { width: 220px; }
.status-filter { width: 130px; }
.line { line-height: 1.6; }
.muted { color: #909399; font-size: 12px; }
.plan-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; width: 100%; }
.plan-sku { min-width: 260px; }
.plan-list { width: 100%; }
.material-row { display: flex; gap: 12px; width: 100%; }
.material-row .el-select { flex: 1; }
.over-limit { color: #f56c6c; }
.d-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.step-card { border: 1px solid #e4e7ed; border-radius: 6px; padding: 10px 12px; margin-bottom: 10px; }
.step-card.active { border-color: #409eff; }
.step-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.step-title { font-weight: 600; }
.step-body .step-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.lbl { color: #909399; font-size: 12px; }
.qty-item { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.qty-input { width: 90px; }
.issue-list { border-top: 1px dashed #e4e7ed; padding-top: 6px; }
.issue-tip { margin-bottom: 12px; }
.pay-summary { margin-bottom: 10px; }
.pay-add { display: flex; gap: 8px; margin-top: 10px; }
</style>
