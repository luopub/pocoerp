<template>
  <div>
    <div class="toolbar">
      <el-select v-model="status" placeholder="状态" clearable class="status-filter" @change="load">
        <el-option label="已入库" value="done" />
        <el-option label="已作废" value="void" />
      </el-select>
      <el-button type="primary" @click="openCreate">新建退货入库单</el-button>
      <el-button @click="downloadExcel('returns')">导出 Excel</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="单号" width="130" />
      <el-table-column prop="channel" label="渠道" width="110" />
      <el-table-column label="明细" min-width="220">
        <template #default="{ row }">
          <div v-for="(it, i) in row.items" :key="i" class="line">
            {{ it.sku }} × {{ it.qty }}
            <el-tag :type="it.condition === 'good' ? 'success' : 'danger'" size="small">
              {{ it.condition === 'good' ? '良品' : '不良品' }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="originalOutboundNo" label="原出库单" width="130">
        <template #default="{ row }">{{ row.originalOutboundNo || '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'void' ? 'info' : 'success'" size="small">
            {{ row.status === 'void' ? '已作废' : '已入库' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="日期" width="160">
        <template #default="{ row }">{{ fmtTime(row.date) }}</template>
      </el-table-column>
      <el-table-column prop="operator" label="操作人" width="90" />
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-popconfirm v-if="row.status !== 'void'" title="作废将回滚良品入库，确认？" @confirm="voidIt(row)">
            <template #reference><el-button link type="danger">作废</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="createDlg" title="新建退货入库单" width="680px">
      <el-form label-width="90px">
        <el-form-item label="渠道">
          <el-select v-model="form.channel" filterable class="full">
            <el-option v-for="c in channels" :key="c._id" :label="c.name" :value="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="原出库单号">
          <el-input v-model="form.originalOutboundNo" placeholder="选填，如 OUT000001" />
        </el-form-item>
        <el-form-item label="退货明细">
          <div class="items-editor">
            <div v-for="(it, i) in form.items" :key="i" class="item-row">
              <el-select v-model="it.sku" filterable placeholder="产品 SKU" class="sku-sel">
                <el-option v-for="s in productSkus" :key="s.skuNo" :label="`${s.skuNo} ${s.spuName}`" :value="s.skuNo" />
              </el-select>
              <el-input-number v-model="it.qty" :min="1" :precision="0" placeholder="数量" class="qty" />
              <el-radio-group v-model="it.condition">
                <el-radio-button value="good">良品</el-radio-button>
                <el-radio-button value="bad">不良品</el-radio-button>
              </el-radio-group>
              <el-button link type="danger" @click="form.items.splice(i, 1)">删除</el-button>
            </div>
            <el-button link type="primary" @click="form.items.push({ sku: '', qty: 1, condition: 'good' })">
              + 添加一行
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" title="良品将按当前移动加权平均成本入库；不良品仅记录，不入库存。" />
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">创建并入库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const status = ref('')
const createDlg = ref(false)
const channels = ref([])
const productSkus = ref([])
const form = reactive({ channel: '', originalOutboundNo: '', items: [], remark: '' })

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '')

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/returns', { params: { status: status.value } })).list
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  if (!channels.value.length) {
    const [c, p] = await Promise.all([
      api.get('/channels'),
      api.get('/inventory', { params: { itemType: 'product' } }),
    ])
    channels.value = c.list
    productSkus.value = p.list.filter((s) => s.kind !== 'virtual')
  }
  Object.assign(form, {
    channel: channels.value[0]?.name || '', originalOutboundNo: '',
    items: [{ sku: '', qty: 1, condition: 'good' }], remark: '',
  })
  createDlg.value = true
}

async function create() {
  const items = form.items.filter((i) => i.sku && i.qty > 0)
  if (!items.length) return ElMessage.warning('请至少填写一行有效明细')
  saving.value = true
  try {
    const { doc } = await api.post('/returns', { ...form, items })
    ElMessage.success(`已创建 ${doc.no}，良品已入库`)
    createDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function voidIt(row) {
  await api.post(`/returns/${row._id}/void`)
  ElMessage.success('已作废并回滚')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.status-filter { width: 140px; }
.line { display: flex; align-items: center; gap: 6px; }
.full { width: 100%; }
.items-editor { width: 100%; }
.item-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.sku-sel { width: 240px; }
.qty { width: 130px; }
</style>
