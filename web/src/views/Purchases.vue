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
            {{ it.sku }} × {{ it.qty }} @ {{ it.price }}
            <span class="muted">（已入 {{ it.receivedQty }}）</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="payable" label="应付金额" width="100" align="right">
        <template #default="{ row }">{{ row.payable.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS_TYPE[row.status]">{{ PO_STATUS[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending' || row.status === 'partial'" link type="primary" @click="openReceive(row)">入库</el-button>
          <el-popconfirm v-if="row.status === 'pending'" title="确定作废该采购单？" @confirm="voidOrder(row)">
            <template #reference><el-button link type="danger">作废</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建采购单 -->
    <el-dialog v-model="createDlg" title="新建采购单" width="860px" top="5vh">
      <el-form label-width="90px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="类型" required>
              <el-radio-group v-model="createForm.type" @change="onTypeChange">
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
      <el-alert type="info" :closable="false" title="本次入库数量默认带出全部剩余数量，可改为部分入库" class="recv-tip" />
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
            <el-input-number v-model="row.thisQty" :min="0" :max="row.qty - row.receivedQty" :precision="0" size="small" controls-position="right" />
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button @click="recvDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveReceive">确认入库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'

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

const supplierOptions = computed(() => {
  const t = createForm.type === 'product' ? '成品供应商' : '原材料供应商'
  const matched = suppliers.value.filter((s) => s.types.includes(t))
  return matched.length ? matched : suppliers.value
})
const skuOptions = computed(() => (createForm.type === 'product' ? productSkus.value : materialSkus.value))

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
  // 带出最近采购价
  const { price } = await api.get('/purchases/last-price', { params: { type: createForm.type, sku } })
  if (price !== null && price !== undefined) row.price = price
}

function openCreate() {
  Object.assign(createForm, { type: 'material', supplier: '', date: '', remark: '', items: [{ sku: '', qty: 1, price: 0 }] })
  createDlg.value = true
}

async function saveCreate() {
  if (!createForm.supplier) return ElMessage.warning('请选择供应商')
  const items = createForm.items.filter((i) => i.sku && i.qty > 0)
  if (!items.length) return ElMessage.warning('请至少填写一行有效明细')
  saving.value = true
  try {
    await api.post('/purchases', { ...createForm, items })
    ElMessage.success('采购单已创建')
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
</style>
