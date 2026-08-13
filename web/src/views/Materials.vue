<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称/编号" clearable class="search" @change="load" />
      <el-button type="primary" @click="openSpuEdit()">新增原材料</el-button>
      <el-button @click="downloadExcel('materials')">导出 Excel</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border row-key="no">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.skus" size="small" class="sku-table">
            <el-table-column prop="no" label="SKU 编号" width="150" />
            <el-table-column label="规格属性" min-width="180">
              <template #default="{ row: s }">{{ attrsText(s.attrs) }}</template>
            </el-table-column>
            <el-table-column prop="safeStock" label="安全库存" width="90" align="right" />
            <el-table-column label="状态" width="70">
              <template #default="{ row: s }">
                <el-tag :type="s.active ? 'success' : 'info'" size="small">{{ s.active ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130">
              <template #default="{ row: s }">
                <el-button link type="primary" @click="openSkuEdit(row, s)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" class="add-sku" @click="openSkuEdit(row, null)">+ 添加 SKU</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="no" label="编号" width="110" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="unit" label="单位" width="70" />
      <el-table-column prop="defaultSupplier" label="默认供应商" width="130" />
      <el-table-column label="SKU 数" width="80" align="right">
        <template #default="{ row }">{{ row.skus.length }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openSpuEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- SPU 编辑 -->
    <el-dialog v-model="spuDlg" :title="spuForm._id ? '编辑原材料' : '新增原材料'" width="520px">
      <el-form :model="spuForm" label-width="100px">
        <el-form-item label="名称" required><el-input v-model="spuForm.name" /></el-form-item>
        <el-form-item label="单位"><el-input v-model="spuForm.unit" placeholder="米 / 个 / kg…" /></el-form-item>
        <el-form-item label="默认供应商">
          <el-select v-model="spuForm.defaultSupplier" filterable clearable>
            <el-option v-for="s in suppliers" :key="s._id" :label="s.name" :value="s.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="spuForm.remark" type="textarea" :rows="2" /></el-form-item>
        <el-form-item v-if="spuForm._id" label="状态">
          <el-switch v-model="spuForm.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="spuDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSpu">保存</el-button>
      </template>
    </el-dialog>

    <!-- SKU 编辑 -->
    <el-dialog v-model="skuDlg" :title="skuForm.no ? `编辑 SKU ${skuForm.no}` : `新增 SKU（${skuForm.spuName}）`" width="480px">
      <el-form label-width="100px">
        <el-form-item label="规格属性">
          <AttrsEditor v-model="skuForm.attrs" />
        </el-form-item>
        <el-form-item label="安全库存">
          <el-input-number v-model="skuForm.safeStock" :min="0" />
        </el-form-item>
        <el-form-item v-if="skuForm.no" label="状态">
          <el-switch v-model="skuForm.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSku">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'
import AttrsEditor from '../components/AttrsEditor.vue'

const list = ref([])
const suppliers = ref([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const spuDlg = ref(false)
const skuDlg = ref(false)
const spuForm = reactive({ _id: '', name: '', unit: '', defaultSupplier: '', remark: '', active: true })
const skuForm = reactive({ spuId: '', spuName: '', no: '', attrs: {}, safeStock: 0, active: true })

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join('，') : '（默认）'
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/materials', { params: { keyword: keyword.value, includeInactive: 1 } })).list
  } finally {
    loading.value = false
  }
}

async function loadSuppliers() {
  suppliers.value = (await api.get('/suppliers', { params: { type: '原材料供应商' } })).list
}

function openSpuEdit(row) {
  Object.assign(spuForm, row
    ? { _id: row._id, name: row.name, unit: row.unit, defaultSupplier: row.defaultSupplier, remark: row.remark, active: row.active }
    : { _id: '', name: '', unit: '', defaultSupplier: '', remark: '', active: true })
  spuDlg.value = true
}

async function saveSpu() {
  if (!spuForm.name.trim()) return ElMessage.warning('请填写材料名称')
  saving.value = true
  try {
    if (spuForm._id) await api.put(`/materials/${spuForm._id}`, spuForm)
    else await api.post('/materials', spuForm)
    ElMessage.success('已保存')
    spuDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

function openSkuEdit(spu, sku) {
  Object.assign(skuForm, sku
    ? { spuId: spu._id, spuName: spu.name, no: sku.no, attrs: { ...(sku.attrs || {}) }, safeStock: sku.safeStock, active: sku.active }
    : { spuId: spu._id, spuName: spu.name, no: '', attrs: {}, safeStock: 0, active: true })
  skuDlg.value = true
}

async function saveSku() {
  saving.value = true
  try {
    if (skuForm.no) await api.put(`/materials/${skuForm.spuId}/skus/${skuForm.no}`, skuForm)
    else await api.post(`/materials/${skuForm.spuId}/skus`, skuForm)
    ElMessage.success('已保存')
    skuDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(() => { load(); loadSuppliers() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.search { width: 240px; }
.sku-table { margin: 4px 24px; width: calc(100% - 48px); }
.add-sku { margin: 4px 24px; }
</style>
