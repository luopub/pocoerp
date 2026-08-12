<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="成品库存" name="product" />
      <el-tab-pane label="原材料库存" name="material" />
      <el-tab-pane label="库存流水" name="logs" />
    </el-tabs>

    <template v-if="tab !== 'logs'">
      <div class="toolbar">
        <el-input v-model="keyword" placeholder="搜索 SPU / SKU / 名称" clearable class="search" @change="load" />
      </div>
      <el-table :data="list" v-loading="loading" border>
        <el-table-column v-if="tab === 'product'" label="图片" width="66">
          <template #default="{ row }">
            <el-image v-if="row.image" :src="row.image" fit="cover" class="img" :preview-src-list="[row.image]" preview-teleported />
            <span v-else class="muted">无</span>
          </template>
        </el-table-column>
        <el-table-column label="产品/材料" min-width="140">
          <template #default="{ row }">
            {{ row.spuName }}
            <el-tag v-if="row.kind === 'virtual'" size="small" type="warning" class="tag">虚拟</el-tag>
            <div class="muted">{{ row.spuNo }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="skuNo" label="SKU" width="150" />
        <el-table-column label="规格" min-width="110">
          <template #default="{ row }">{{ attrsText(row.attrs) }}</template>
        </el-table-column>
        <el-table-column label="库存数量" width="110" align="right">
          <template #default="{ row }">
            <span :class="{ danger: row.kind !== 'virtual' && row.safeStock > 0 && row.qty < row.safeStock }">
              {{ row.qty }}
            </span>
            <span v-if="row.kind === 'virtual'" class="muted">（派生）</span>
          </template>
        </el-table-column>
        <el-table-column label="加权成本" width="100" align="right">
          <template #default="{ row }">{{ row.avgCost === null ? '—' : row.avgCost.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="库存金额" width="110" align="right">
          <template #default="{ row }">{{ row.amount === null ? '—' : row.amount.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="safeStock" label="安全库存" width="90" align="right" />
        <el-table-column label="最后盘点" width="105">
          <template #default="{ row }">{{ row.lastStocktakeAt ? fmtDate(row.lastStocktakeAt) : '—' }}</template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else>
      <div class="toolbar">
        <el-input v-model="logSku" placeholder="SKU 编号" clearable class="search" @change="loadLogs" />
        <el-select v-model="logType" placeholder="流水类型" clearable class="type-filter" @change="loadLogs">
          <el-option v-for="t in logTypes" :key="t" :label="t" :value="t" />
        </el-select>
        <el-date-picker v-model="logRange" type="daterange" value-format="YYYY-MM-DD" start-placeholder="开始" end-placeholder="结束" @change="loadLogs" />
      </div>
      <el-table :data="logs" v-loading="loading" border>
        <el-table-column label="时间" width="160">
          <template #default="{ row }">{{ fmtTime(row.time) }}</template>
        </el-table-column>
        <el-table-column prop="sku" label="SKU" width="150" />
        <el-table-column label="物品类型" width="90">
          <template #default="{ row }">{{ row.itemType === 'product' ? '成品' : '原材料' }}</template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column label="变动" width="90" align="right">
          <template #default="{ row }">
            <span :class="row.change > 0 ? 'in' : 'out'">{{ row.change > 0 ? '+' : '' }}{{ row.change }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="balance" label="结存" width="90" align="right" />
        <el-table-column label="单价" width="90" align="right">
          <template #default="{ row }">{{ row.unitCost != null ? row.unitCost.toFixed(2) : '—' }}</template>
        </el-table-column>
        <el-table-column prop="docNo" label="关联单据" width="120" />
        <el-table-column prop="operator" label="操作人" width="90" />
      </el-table>
      <el-pagination
        class="pager"
        layout="total, prev, pager, next"
        :total="logTotal"
        :page-size="logSize"
        :current-page="logPage"
        @current-change="(p) => { logPage = p; loadLogs() }"
      />
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import api from '../api.js'

const tab = ref('product')
const list = ref([])
const logs = ref([])
const logTypes = ref([])
const loading = ref(false)
const keyword = ref('')
const logSku = ref('')
const logType = ref('')
const logRange = ref(null)
const logPage = ref(1)
const logSize = 50
const logTotal = ref(0)

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(',') : '默认'
}
function fmtDate(d) { return new Date(d).toLocaleDateString('zh-CN') }
function fmtTime(d) { return new Date(d).toLocaleString('zh-CN', { hour12: false }) }

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/inventory', { params: { itemType: tab.value, keyword: keyword.value } })).list
  } finally {
    loading.value = false
  }
}

async function loadLogs() {
  loading.value = true
  try {
    const params = { sku: logSku.value, type: logType.value, page: logPage.value, size: logSize }
    if (logRange.value?.length === 2) { params.from = logRange.value[0]; params.to = logRange.value[1] }
    const data = await api.get('/inventory/logs', { params })
    logs.value = data.list
    logTotal.value = data.total
  } finally {
    loading.value = false
  }
}

watch(tab, (t) => { t === 'logs' ? loadLogs() : load() })

onMounted(async () => {
  load()
  logTypes.value = (await api.get('/inventory/logs/types')).list
})
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.search { width: 200px; }
.type-filter { width: 140px; }
.img { width: 40px; height: 40px; border-radius: 4px; }
.tag { margin-left: 6px; }
.muted { color: #909399; font-size: 12px; }
.danger { color: #f56c6c; font-weight: 700; }
.in { color: #67c23a; }
.out { color: #f56c6c; }
.pager { margin-top: 12px; justify-content: flex-end; }
</style>
