<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索 ID / SKU / SPU 编号" clearable class="search" @change="load" />
      <el-select v-model="platformFilter" placeholder="平台" clearable class="pf-filter" @change="load">
        <el-option v-for="c in channels" :key="c._id" :label="c.name" :value="c.name" />
      </el-select>
      <el-button type="primary" @click="openEdit()">新增映射</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border>
      <el-table-column label="图片" width="70">
        <template #default="{ row }">
          <el-image v-if="row.displayImage" :src="row.displayImage" fit="cover" class="img" :preview-src-list="[row.displayImage]" preview-teleported />
          <span v-else class="muted">无</span>
        </template>
      </el-table-column>
      <el-table-column label="产品" min-width="150">
        <template #default="{ row }">
          {{ row.spuName }}
          <div class="muted">{{ row.skuNo }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="platform" label="平台" width="110" />
      <el-table-column prop="account" label="账号" width="110" show-overflow-tooltip />
      <el-table-column prop="id1" label="平台 ID1" min-width="130" show-overflow-tooltip />
      <el-table-column prop="id2" label="平台 ID2" min-width="100" show-overflow-tooltip />
      <el-table-column label="默认" width="70">
        <template #default="{ row }">
          <el-tag v-if="row.isDefault" size="small" type="info">默认</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="100" show-overflow-tooltip />
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-popconfirm v-if="!row.isDefault" title="确定删除该映射？" @confirm="remove(row)">
            <template #reference><el-button link type="danger">删除</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dlg" :title="form._id ? '编辑映射' : '新增映射'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="产品 SKU" required>
          <el-select v-model="form.skuNo" filterable :disabled="!!form._id" @change="onSkuChange">
            <el-option v-for="s in skuOptions" :key="s.skuNo" :label="`${s.spuName} ${s.skuNo}`" :value="s.skuNo" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台" required>
          <el-select v-model="form.platform" filterable>
            <el-option v-for="c in channels" :key="c._id" :label="c.name" :value="c.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="账号" required>
          <el-input v-model="form.account" placeholder="店铺账号" />
        </el-form-item>
        <el-form-item label="平台 ID1" required>
          <el-input v-model="form.id1" placeholder="ASIN / itemId / 平台 SKU…" />
        </el-form-item>
        <el-form-item label="平台 ID2">
          <el-input v-model="form.id2" placeholder="可空" />
        </el-form-item>
        <el-form-item label="平台商品图">
          <ImageUpload v-model="form.image" />
          <div class="muted tip">不上传时使用内部 SKU 图片</div>
        </el-form-item>
        <el-form-item label="备注"><el-input v-model="form.remark" /></el-form-item>
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
import ImageUpload from '../components/ImageUpload.vue'

const list = ref([])
const channels = ref([])
const skuOptions = ref([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const platformFilter = ref('')
const dlg = ref(false)
const form = reactive({ _id: '', spuNo: '', skuNo: '', platform: '', account: '', id1: '', id2: '', image: '', remark: '' })

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/mappings', {
      params: { keyword: keyword.value, platform: platformFilter.value },
    })).list
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  channels.value = (await api.get('/channels')).list
  skuOptions.value = (await api.get('/products/skus')).list
}

function onSkuChange(skuNo) {
  const s = skuOptions.value.find((x) => x.skuNo === skuNo)
  form.spuNo = s?.spuNo || ''
}

function openEdit(row) {
  Object.assign(form, row
    ? { _id: row._id, spuNo: row.spuNo, skuNo: row.skuNo, platform: row.platform, account: row.account, id1: row.id1, id2: row.id2, image: row.image, remark: row.remark }
    : { _id: '', spuNo: '', skuNo: '', platform: '', account: '', id1: '', id2: '', image: '', remark: '' })
  dlg.value = true
}

async function save() {
  if (!form.skuNo || !form.platform || !form.account.trim() || !form.id1.trim()) {
    return ElMessage.warning('产品 SKU、平台、账号、ID1 均必填')
  }
  saving.value = true
  try {
    if (form._id) await api.put(`/mappings/${form._id}`, form)
    else await api.post('/mappings', form)
    ElMessage.success('已保存')
    dlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function remove(row) {
  await api.delete(`/mappings/${row._id}`)
  ElMessage.success('已删除')
  load()
}

onMounted(() => { load(); loadRefs() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.search { width: 240px; }
.pf-filter { width: 150px; }
.img { width: 40px; height: 40px; border-radius: 4px; }
.muted { color: #909399; font-size: 12px; }
.tip { line-height: 1.4; }
</style>
