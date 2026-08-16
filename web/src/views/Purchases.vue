<template>
  <div>
    <div class="toolbar">
      <el-radio-group v-model="typeFilter" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="product">成品采购</el-radio-button>
        <el-radio-button value="material">原材料采购</el-radio-button>
      </el-radio-group>
      <el-select v-model="statusFilter" placeholder="状态" clearable class="status-filter" @change="load">
        <el-option v-for="(n, v) in PO_STATUS" :key="v" :label="n" :value="v" />
      </el-select>
      <el-input v-model="keyword" placeholder="搜索单号/供应商/SKU" clearable class="search" @change="load" />
      <el-button type="primary" @click="openCreate">新建采购单</el-button>
      <el-button @click="downloadExcel('purchases')">导出 Excel</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="单号" width="115" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'product' ? 'primary' : 'success'">
            {{ row.type === 'product' ? '成品' : '原材料' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="supplier" label="供应商" min-width="120" show-overflow-tooltip />
      <el-table-column label="日期" width="105">
        <template #default="{ row }">{{ fmtDate(row.date) }}</template>
      </el-table-column>
      <el-table-column label="明细" min-width="200">
        <template #default="{ row }">
          <div v-for="it in row.items" :key="it.no" class="item-line">
            {{ skuLabel(it.sku) }} × {{ it.qty }} @ {{ it.price }}
            <span class="muted">（已入 {{ it.receivedQty }}）</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="payable" label="应付金额" width="100" align="right">
        <template #default="{ row }">{{ row.payable.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="已付" width="100" align="right">
        <template #default="{ row }">
          <span :style="{ color: paidOf(row) < row.payable - 0.005 ? '#f56c6c' : '#67c23a' }">
            {{ paidOf(row).toFixed(2) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS_TYPE[row.status]">{{ PO_STATUS[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending'" link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="row.status === 'pending' || row.status === 'partial'" link type="primary" @click="openReceive(row)">入库</el-button>
          <el-button v-if="row.status === 'partial'" link type="warning" @click="openCloseDiff(row)">差异结案</el-button>
          <el-button v-if="row.status !== 'void'" link type="primary" @click="openPayments(row)">付款</el-button>
          <el-popconfirm v-if="row.status === 'pending'" title="确定作废该采购单？" @confirm="voidOrder(row)">
            <template #reference><el-button link type="danger">作废</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建/编辑采购单 -->
    <el-dialog v-model="createDlg" :title="editId ? '编辑采购单' : '新建采购单'" width="860px" top="5vh">
      <el-form label-width="90px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="类型" required>
              <el-radio-group v-model="createForm.type" :disabled="!!editId" @change="onTypeChange">
                <el-radio value="product">成品</el-radio>
                <el-radio value="material">原材料</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="供应商" required>
              <el-select v-model="createForm.supplier" filterable>
                <el-option v-for="s in supplierOptions" :key="s._id" :label="s.name" :value="s.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="采购日期">
              <el-date-picker v-model="createForm.date" type="date" value-format="YYYY-MM-DD" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="createForm.remark" /></el-form-item>

        <el-divider content-position="left">明细</el-divider>
        <el-table :data="createForm.items" size="small" border>
          <el-table-column label="SKU" min-width="220">
            <template #default="{ row }">
              <el-select v-model="row.sku" filterable placeholder="选择 SKU" @change="(v) => onSkuPick(row, v)">
                <el-option v-for="s in skuOptions" :key="s.skuNo" :label="`${s.spuName} ${s.skuNo}（${attrsText(s.attrs)}）`" :value="s.skuNo" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column label="数量" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.qty" :min="1" :precision="0" size="small" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="单价" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.price" :min="0" :precision="2" size="small" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="小计" width="90" align="right">
            <template #default="{ row }">{{ (row.qty * row.price).toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="" width="55">
            <template #default="{ $index }">
              <el-button link type="danger" @click="createForm.items.splice($index, 1)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button link type="primary" @click="createForm.items.push({ sku: '', qty: 1, price: 0 })">+ 添加明细</el-button>
        <div class="total">应付合计：{{ createForm.items.reduce((s, i) => s + i.qty * i.price, 0).toFixed(2) }}</div>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCreate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 入库 -->
    <el-dialog v-model="recvDlg" :title="`入库 — ${recvOrder?.no || ''}`" width="640px">
      <el-alert type="info" :closable="false" title="本次入库数量默认带出全部剩余数量，可改为部分入库；超过采购数量时将提示确认后按实际数量入库" class="recv-tip" />
      <el-table :data="recvItems" size="small" border>
        <el-table-column prop="sku" label="SKU" min-width="150" />
        <el-table-column label="采购数" width="90" align="right">
          <template #default="{ row }">{{ row.qty }}</template>
        </el-table-column>
        <el-table-column label="已入库" width="90" align="right">
          <template #default="{ row }">{{ row.receivedQty }}</template>
        </el-table-column>
        <el-table-column label="本次入库" width="140">
          <template #default="{ row }">
            <el-input-number v-model="row.thisQty" :min="0" :precision="0" size="small" controls-position="right" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="recvDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveReceive">确认入库</el-button>
      </template>
    </el-dialog>

    <!-- 差异结案 -->
    <el-dialog v-model="diffDlg" :title="`差异结案 — ${diffOrder?.no || ''}`" width="480px">
      <el-alert type="warning" :closable="false" class="recv-tip"
        title="结案后未入库的剩余数量不再入库，单据转为「已入库」状态。请填写差异原因。" />
      <el-input v-model="diffNote" type="textarea" :rows="3" placeholder="差异原因，如：供应商少发 10 件，已协商不再补发" />
      <template #footer>
        <el-button @click="diffDlg = false">取消</el-button>
        <el-button type="warning" :loading="saving" @click="saveCloseDiff">确认结案</el-button>
      </template>
    </el-dialog>

    <!-- 付款登记 -->
    <el-dialog v-model="payDlg" :title="`付款登记 — ${payOrder?.no || ''}`" width="520px">
      <div class="pay-summary">
        应付 <b>{{ payOrder?.payable.toFixed(2) }}</b>，
        已付 <b :style="{ color: '#67c23a' }">{{ paidOf(payOrder).toFixed(2) }}</b>，
        未付 <b :style="{ color: '#f56c6c' }">{{ (payOrder ? payOrder.payable - paidOf(payOrder) : 0).toFixed(2) }}</b>
      </div>
      <el-table :data="payOrder?.payments || []" size="small" border>
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
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'

const PO_STATUS = { pending: '待入库', partial: '部分入库', done: '已入库', void: '已作废' }
const STATUS_TYPE = { pending: 'warning', partial: 'primary', done: 'success', void: 'info' }

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const typeFilter = ref('')
const statusFilter = ref('')
const keyword = ref('')
const createDlg = ref(false)
const recvDlg = ref(false)
const recvOrder = ref(null)
const recvItems = ref([])
const suppliers = ref([])
const productSkus = ref([])
const materialSkus = ref([])
const createForm = reactive({ type: 'material', supplier: '', date: '', remark: '', items: [] })
const editId = ref('') // 编辑中的采购单 _id；空 = 新建

const supplierOptions = computed(() => {
  const t = createForm.type === 'product' ? '成品供应商' : '原材料供应商'
  const matched = suppliers.value.filter((s) => s.types.includes(t))
  return matched.length ? matched : suppliers.value
})
const skuOptions = computed(() => (createForm.type === 'product' ? productSkus.value : materialSkus.value))

// SKU 编号 → 规格属性（列表明细列显示用）
const skuAttrsMap = computed(() => {
  const m = new Map()
  for (const s of [...productSkus.value, ...materialSkus.value]) m.set(s.skuNo, s.attrs)
  return m
})

function skuLabel(sku) {
  const attrs = skuAttrsMap.value.get(sku)
  if (!attrs) return sku
  return `${sku}（${attrsText(attrs)}）`
}

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(',') : '默认'
}
function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('zh-CN') : ''
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/purchases', {
      params: { type: typeFilter.value, status: statusFilter.value, keyword: keyword.value },
    })).list
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  suppliers.value = (await api.get('/suppliers')).list
  productSkus.value = (await api.get('/products/skus')).list.filter((s) => s.kind === 'physical')
  materialSkus.value = (await api.get('/materials/skus')).list
}

function onTypeChange() {
  createForm.supplier = ''
  createForm.items = []
}

async function onSkuPick(row, sku) {
  // 原材料 SKU 先带出档案单价作为默认值（SKU 为 0 时回落 SPU，由接口返回）
  const opt = skuOptions.value.find((s) => s.skuNo === sku)
  if (opt && opt.price) row.price = opt.price
  // 最近采购价 > 0 时以最近采购价为准（历史单据可能为 0，不能覆盖档案单价）
  const { price } = await api.get('/purchases/last-price', { params: { type: createForm.type, sku } })
  if (price > 0) row.price = price
}

function openCreate() {
  editId.value = ''
  Object.assign(createForm, { type: 'material', supplier: '', date: '', remark: '', items: [{ sku: '', qty: 1, price: 0 }] })
  createDlg.value = true
}

// 编辑（仅待入库单据可从列表进入，后端二次校验）
function openEdit(row) {
  editId.value = row._id
  Object.assign(createForm, {
    type: row.type,
    supplier: row.supplier,
    date: row.date ? new Date(row.date).toLocaleDateString('sv-SE') : '', // sv-SE = YYYY-MM-DD（本地时区）
    remark: row.remark,
    items: row.items.map((i) => ({ sku: i.sku, qty: i.qty, price: i.price })),
  })
  createDlg.value = true
}

async function saveCreate() {
  if (!createForm.supplier) return ElMessage.warning('请选择供应商')
  const items = createForm.items.filter((i) => i.sku && i.qty > 0)
  if (!items.length) return ElMessage.warning('请至少填写一行有效明细')
  saving.value = true
  try {
    if (editId.value) {
      await api.put(`/purchases/${editId.value}`, { ...createForm, items })
      ElMessage.success('采购单已更新')
    } else {
      await api.post('/purchases', { ...createForm, items })
      ElMessage.success('采购单已创建')
    }
    createDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

function openReceive(row) {
  recvOrder.value = row
  recvItems.value = row.items
    .filter((i) => i.qty - i.receivedQty > 0)
    .map((i) => ({ no: i.no, sku: i.sku, qty: i.qty, receivedQty: i.receivedQty, thisQty: i.qty - i.receivedQty }))
  recvDlg.value = true
}

async function saveReceive() {
  const items = recvItems.value.filter((i) => i.thisQty > 0).map((i) => ({ no: i.no, qty: i.thisQty }))
  if (!items.length) return ElMessage.warning('本次入库数量均为 0')
  // 超收检查：累计入库将超过采购数量时需用户确认
  const over = recvItems.value.filter((i) => i.thisQty > 0 && i.receivedQty + i.thisQty > i.qty)
  if (over.length) {
    const lines = over.map((i) =>
      `${i.sku}：采购 ${i.qty}，已入 ${i.receivedQty}，本次 ${i.thisQty}，超收 ${i.receivedQty + i.thisQty - i.qty}`)
    try {
      await ElMessageBox.confirm(
        `以下明细实际入库将超过采购数量，超出部分按相同单价计入库存：<br>${lines.join('<br>')}`,
        '确认超收入库？',
        { type: 'warning', confirmButtonText: '确认入库', cancelButtonText: '返回修改', dangerouslyUseHTMLString: true }
      )
    } catch {
      return // 用户取消，返回修改
    }
  }
  saving.value = true
  try {
    await api.post(`/purchases/${recvOrder.value._id}/receive`, { items })
    ElMessage.success('入库完成')
    recvDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function voidOrder(row) {
  await api.post(`/purchases/${row._id}/void`)
  ElMessage.success('已作废')
  load()
}

// ---- 差异结案 / 付款登记 ----
const diffDlg = ref(false)
const diffOrder = ref(null)
const diffNote = ref('')
const payDlg = ref(false)
const payOrder = ref(null)
const payForm = reactive({ date: '', amount: null })

const paidOf = (row) => (row?.payments || []).reduce((s, p) => s + p.amount, 0)

function openCloseDiff(row) {
  diffOrder.value = row
  diffNote.value = ''
  diffDlg.value = true
}

async function saveCloseDiff() {
  if (!diffNote.value.trim()) return ElMessage.warning('请填写差异原因')
  saving.value = true
  try {
    await api.post(`/purchases/${diffOrder.value._id}/close-diff`, { diffNote: diffNote.value.trim() })
    ElMessage.success('已结案')
    diffDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

function openPayments(row) {
  payOrder.value = row
  payForm.date = new Date().toISOString().slice(0, 10)
  payForm.amount = Math.max(0, Math.round((row.payable - paidOf(row)) * 100) / 100) || null
  payDlg.value = true
}

async function addPayment() {
  if (!payForm.amount || payForm.amount <= 0) return ElMessage.warning('请输入付款金额')
  saving.value = true
  try {
    const { doc } = await api.post(`/purchases/${payOrder.value._id}/payments`, payForm)
    payOrder.value = doc
    payForm.amount = Math.max(0, Math.round((doc.payable - paidOf(doc)) * 100) / 100) || null
    ElMessage.success('已登记')
    load()
  } finally {
    saving.value = false
  }
}

async function removePayment(idx) {
  const { doc } = await api.delete(`/purchases/${payOrder.value._id}/payments/${idx}`)
  payOrder.value = doc
  ElMessage.success('已删除')
  load()
}

onMounted(() => { load(); loadRefs() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
.search { width: 220px; }
.status-filter { width: 120px; }
.item-line { line-height: 1.6; }
.muted { color: #909399; font-size: 12px; }
.total { text-align: right; margin-top: 8px; font-weight: 600; }
.recv-tip { margin-bottom: 12px; }
.pay-summary { margin-bottom: 10px; }
.pay-add { display: flex; gap: 8px; margin-top: 10px; }
</style>
