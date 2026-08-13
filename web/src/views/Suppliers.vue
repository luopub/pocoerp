<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称/编号/联系人" clearable class="search" @change="load" />
      <el-select v-model="typeFilter" placeholder="类型" clearable class="type-filter" @change="load">
        <el-option v-for="t in SUPPLIER_TYPES" :key="t" :label="t" :value="t" />
      </el-select>
      <el-button type="primary" @click="openEdit()">新增供应商</el-button>
      <el-button @click="downloadExcel('suppliers')">导出 Excel</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="编号" width="110" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="类型" min-width="180">
        <template #default="{ row }">
          <el-tag v-for="t in row.types" :key="t" size="small" class="tag">{{ t }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="contact" label="联系人" width="100" />
      <el-table-column prop="phone" label="电话" width="130" />
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.active ? 'success' : 'info'" size="small">{{ row.active ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form._id ? '编辑供应商' : '新增供应商'" width="480px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-checkbox-group v-model="form.types">
            <el-checkbox v-for="t in SUPPLIER_TYPES" :key="t" :value="t">{{ t }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="联系人"><el-input v-model="form.contact" /></el-form-item>
        <el-form-item label="电话"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
        <el-form-item v-if="form._id" label="状态">
          <el-switch v-model="form.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'

const SUPPLIER_TYPES = ['成品供应商', '原材料供应商', '加工商']
const list = ref([])
const loading = ref(false)
const keyword = ref('')
const typeFilter = ref('')
const dlg = ref(false)
const saving = ref(false)
const form = reactive({ _id: '', name: '', types: [], contact: '', phone: '', remark: '', active: true })

async function load() {
  loading.value = true
  try {
    const data = await api.get('/suppliers', { params: { keyword: keyword.value, type: typeFilter.value } })
    list.value = data.list
  } finally {
    loading.value = false
  }
}

function openEdit(row) {
  Object.assign(form, row
    ? { _id: row._id, name: row.name, types: [...row.types], contact: row.contact, phone: row.phone, remark: row.remark, active: row.active }
    : { _id: '', name: '', types: [], contact: '', phone: '', remark: '', active: true })
  dlg.value = true
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写供应商名称')
  saving.value = true
  try {
    if (form._id) await api.put(`/suppliers/${form._id}`, form)
    else await api.post('/suppliers', form)
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.search { width: 240px; }
.type-filter { width: 160px; }
.tag { margin-right: 4px; }
</style>
