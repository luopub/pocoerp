<template>
  <div class="page">
    <el-card class="card">
      <template #header>期初库存导入</template>
      <el-steps :active="3" simple class="steps">
        <el-step title="1. 建立产品与材料档案" />
        <el-step title="2. 下载模板并填写" />
        <el-step title="3. 上传导入" />
      </el-steps>
      <div class="actions">
        <el-button @click="download">下载 Excel 模板</el-button>
        <el-button type="primary" :loading="uploading" @click="pick">上传并导入</el-button>
        <input ref="fileInput" type="file" accept=".xlsx" hidden @change="onFile" />
      </div>
      <el-alert type="info" :closable="false" class="tip">
        <p>模板含两个工作表：「期初库存」填写 SKU编号/数量/单位成本；「可用SKU参考」列出系统内全部可用 SKU。</p>
        <p>导入在单个事务中完成：任一行校验失败则全部不导入。重复导入会累加库存，请确认只导入一次。</p>
        <p>虚拟组合产品无实物库存，不能导入。</p>
      </el-alert>
      <template v-if="result">
        <el-divider content-position="left">导入结果</el-divider>
        <el-alert type="success" :closable="false" :title="`成功导入 ${result.imported} 行`" />
        <el-table :data="result.results" size="small" border class="result-table">
          <el-table-column prop="sku" label="SKU" width="160" />
          <el-table-column prop="qty" label="导入数量" width="100" align="right" />
          <el-table-column prop="balance" label="导入后结存" width="110" align="right" />
        </el-table>
      </template>
      <template v-if="errors.length">
        <el-divider content-position="left">校验错误</el-divider>
        <el-alert v-for="(e, i) in errors" :key="i" type="error" :closable="false" :title="e" class="err" />
      </template>
    </el-card>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import api from '../api.js'
import { auth } from '../store.js'

const fileInput = ref(null)
const uploading = ref(false)
const result = ref(null)
const errors = ref([])

async function download() {
  // 带 token 下载模板
  const res = await fetch('/api/import/template', { headers: { Authorization: `Bearer ${auth.token}` } })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'initial-stock-template.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

function pick() {
  result.value = null
  errors.value = []
  fileInput.value.click()
}

async function onFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    result.value = await api.post('/import/initial-stock', fd)
  } catch (err) {
    errors.value = err.response?.data?.errors || []
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.page { max-width: 860px; }
.steps { margin-bottom: 20px; }
.actions { display: flex; gap: 12px; margin-bottom: 16px; }
.tip p { margin: 4px 0; line-height: 1.6; }
.result-table { margin-top: 12px; }
.err { margin-bottom: 6px; }
</style>
