<template>
  <div>
    <div class="toolbar">
      <el-input v-model="newName" placeholder="新渠道名称，如 Amazon / TikTok" class="input" @keyup.enter="add" />
      <el-button type="primary" :loading="saving" @click="add">添加渠道</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border max-width="600">
      <el-table-column prop="name" label="渠道名称" min-width="160">
        <template #default="{ row }">
          {{ row.name }}
          <el-tag v-if="row.builtin" size="small" type="info" class="tag">内置</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100">
        <template #default="{ row }">
          <el-popconfirm v-if="!row.builtin" title="确定删除该渠道？" @confirm="remove(row)">
            <template #reference><el-button link type="danger">删除</el-button></template>
          </el-popconfirm>
          <span v-else class="muted">不可删除</span>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const newName = ref('')

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/channels')).list
  } finally {
    loading.value = false
  }
}

async function add() {
  if (!newName.value.trim()) return ElMessage.warning('请输入渠道名称')
  saving.value = true
  try {
    await api.post('/channels', { name: newName.value.trim() })
    ElMessage.success('已添加')
    newName.value = ''
    load()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await api.delete(`/channels/${row._id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.input { width: 280px; }
.tag { margin-left: 6px; }
.muted { color: #c0c4cc; font-size: 12px; }
</style>
