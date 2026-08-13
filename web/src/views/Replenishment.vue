<template>
  <div>
    <div class="toolbar">
      <el-checkbox v-model="onlyWarn" @change="load">只看预警</el-checkbox>
      <el-button type="primary" :disabled="!selected.length" :loading="generating" @click="generate">
        生成补货单据（{{ selected.length }}）
      </el-button>
      <el-button @click="load">刷新</el-button>
    </div>

    <el-alert v-if="!list.length && !loading" type="success" :closable="false" title="当前没有需要补货的 SKU" />

    <el-table :data="list" v-loading="loading" border @selection-change="selected = $event">
      <el-table-column type="selection" width="45" :selectable="(row) => row.suggestQty > 0" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.lowStock" type="danger" size="small">低于安全库存</el-tag>
          <el-tag v-else-if="row.dynamicWarn" type="warning" size="small">天数预警</el-tag>
          <el-tag v-else type="info" size="small">正常</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="skuNo" label="SKU" width="150" />
      <el-table-column prop="spuName" label="名称" min-width="120" show-overflow-tooltip />
      <el-table-column label="类型" width="80">
        <template #default="{ row }">{{ row.itemType === 'product' ? '成品' : '原材料' }}</template>
      </el-table-column>
      <el-table-column prop="qty" label="现库存" width="90" align="right" />
      <el-table-column label="消耗速度/天" width="110" align="right">
        <template #default="{ row }">{{ row.velocity.toFixed(2) }}</template>
      </el-table-column>
      <el-table-column label="可用天数" width="90" align="right">
        <template #default="{ row }">
          <span v-if="row.daysLeft === null">—</span>
          <span v-else :style="{ color: row.daysLeft < row.warnDays ? '#f56c6c' : 'inherit' }">
            {{ row.daysLeft.toFixed(1) }}
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="warnDays" label="预警天数" width="90" align="right" />
      <el-table-column prop="suggestQty" label="建议补货" width="90" align="right">
        <template #default="{ row }">
          <b v-if="row.suggestQty > 0">{{ row.suggestQty }}</b><span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="补货数量" width="140">
        <template #default="{ row }">
          <el-input-number v-model="row.planQty" :min="1" :precision="0" size="small" controls-position="right"
            :disabled="row.suggestQty <= 0" />
        </template>
      </el-table-column>
      <el-table-column label="补货方式" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.itemType === 'material' ? 'info' : row.source === 'outsourced' ? 'warning' : 'primary'">
            {{ row.itemType === 'material' ? '材料采购' : row.source === 'outsourced' ? '委外加工' : '成品采购' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="defaultSupplier" label="默认供应商" min-width="110" show-overflow-tooltip />
    </el-table>

    <el-dialog v-model="resultDlg" title="已生成单据" width="420px">
      <p>以下单据已创建为草稿，请到对应模块完善价格等信息：</p>
      <div v-for="c in created" :key="c.no" class="created-row">
        <el-tag size="small">{{ c.kind === 'workorder' ? '加工单' : '采购单' }}</el-tag>
        <el-link type="primary" @click="goDoc(c)">{{ c.no }}</el-link>
      </div>
      <template #footer><el-button type="primary" @click="resultDlg = false">知道了</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import api from '../api.js'

const router = useRouter()
const list = ref([])
const loading = ref(false)
const generating = ref(false)
const onlyWarn = ref(false)
const selected = ref([])
const resultDlg = ref(false)
const created = ref([])

async function load() {
  loading.value = true
  try {
    const data = await api.get('/alerts/replenishment')
    list.value = data.list
      .filter((r) => !onlyWarn.value || r.lowStock || r.dynamicWarn)
      .map((r) => ({ ...r, planQty: r.suggestQty || 1 }))
  } finally {
    loading.value = false
  }
}

async function generate() {
  const items = selected.value
    .filter((r) => r.planQty > 0)
    .map((r) => ({ itemType: r.itemType, sku: r.skuNo, qty: r.planQty }))
  if (!items.length) return ElMessage.warning('请选择建议补货量大于 0 的 SKU')
  generating.value = true
  try {
    created.value = (await api.post('/alerts/replenishment/generate', { items })).created
    resultDlg.value = true
    load()
  } finally {
    generating.value = false
  }
}

function goDoc(c) {
  router.push(c.kind === 'workorder' ? '/workorders' : '/purchases')
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
.created-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
</style>
