<template>
  <div v-loading="loading">
    <el-row :gutter="16" class="stat-row">
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="$router.push('/replenishment')">
          <div class="stat-num" :class="{ danger: data.alerts.length }">{{ data.alerts.length }}</div>
          <div class="stat-label">库存预警 SKU</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num" :class="{ danger: data.overdue.length }">{{ data.overdue.length }}</div>
          <div class="stat-label">超期工序</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="$router.push('/workorders')">
          <div class="stat-num">{{ data.wko.processing }}<span class="sub">/ {{ data.wko.pending }}</span></div>
          <div class="stat-label">加工中 / 待开始工单</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover" class="stat-card" @click="$router.push('/inventory')">
          <div class="stat-num">{{ data.month.inQty }}<span class="sub"> / ¥{{ data.month.inAmount.toFixed(0) }}</span></div>
          <div class="stat-label">本月入库量 / 金额</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16">
      <el-col :span="14">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>库存预警</span>
              <el-link type="primary" @click="$router.push('/replenishment')">去补货 →</el-link>
            </div>
          </template>
          <el-table :data="data.alerts" size="small" max-height="380">
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag v-if="row.lowStock" type="danger" size="small">低于安全库存</el-tag>
                <el-tag v-else type="warning" size="small">天数预警</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="skuNo" label="SKU" width="140" />
            <el-table-column prop="spuName" label="名称" min-width="110" show-overflow-tooltip />
            <el-table-column prop="qty" label="库存" width="70" align="right" />
            <el-table-column label="可用天数" width="80" align="right">
              <template #default="{ row }">{{ row.daysLeft === null ? '—' : row.daysLeft.toFixed(1) }}</template>
            </el-table-column>
            <el-table-column prop="suggestQty" label="建议补货" width="80" align="right" />
            <template #empty>暂无预警，库存健康</template>
          </el-table>
        </el-card>
      </el-col>
      <el-col :span="10">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>工单超期预警</span>
              <el-link type="primary" @click="$router.push('/workorders')">去处理 →</el-link>
            </div>
          </template>
          <el-table :data="data.overdue" size="small" max-height="380">
            <el-table-column prop="no" label="加工单" width="120" />
            <el-table-column prop="stepName" label="工序" min-width="90" />
            <el-table-column label="超期" width="90" align="right">
              <template #default="{ row }">
                <span class="danger">{{ row.overdueDays }} 天</span>
              </template>
            </el-table-column>
            <template #empty>暂无超期工序</template>
          </el-table>
        </el-card>
        <el-card class="month-card">
          <template #header><span>本月出库量</span></template>
          <div class="stat-num">{{ data.month.outQty }}</div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import api from '../api.js'

const loading = ref(false)
const data = reactive({
  alerts: [], overdue: [],
  wko: { processing: 0, pending: 0 },
  month: { inQty: 0, inAmount: 0, outQty: 0 },
})

onMounted(async () => {
  loading.value = true
  try {
    Object.assign(data, await api.get('/alerts/dashboard'))
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.stat-row { margin-bottom: 16px; }
.stat-card { cursor: pointer; text-align: center; }
.stat-num { font-size: 26px; font-weight: 600; color: #303133; }
.stat-num .sub { font-size: 14px; color: #909399; font-weight: 400; }
.stat-num.danger, .danger { color: #f56c6c; }
.stat-label { margin-top: 4px; color: #909399; font-size: 13px; }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.month-card { margin-top: 16px; text-align: center; }
</style>
