<template>
  <div>
    <el-tabs v-model="tab">
      <!-- 供应商对账 -->
      <el-tab-pane label="供应商对账" name="statement">
        <el-table :data="statement" v-loading="loading" border row-key="supplier">
          <el-table-column type="expand">
            <template #default="{ row }">
              <el-table :data="row.docs" size="small" border class="docs-table">
                <el-table-column prop="kind" label="单据类型" width="90" />
                <el-table-column prop="no" label="单号" width="170" />
                <el-table-column label="日期" width="160">
                  <template #default="{ row: d }">{{ fmtTime(d.date) }}</template>
                </el-table-column>
                <el-table-column prop="payable" label="应付" width="110" align="right">
                  <template #default="{ row: d }">{{ d.payable.toFixed(2) }}</template>
                </el-table-column>
                <el-table-column prop="paid" label="已付" width="110" align="right">
                  <template #default="{ row: d }">{{ d.paid.toFixed(2) }}</template>
                </el-table-column>
                <el-table-column prop="owe" label="欠款" width="110" align="right">
                  <template #default="{ row: d }">
                    <span :style="{ color: d.owe > 0 ? '#f56c6c' : '#67c23a' }">{{ d.owe.toFixed(2) }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="payStatus" label="付款状态" width="100">
                  <template #default="{ row: d }">
                    <el-tag size="small" :type="d.payStatus === '已付清' ? 'success' : d.payStatus === '部分付款' ? 'warning' : 'danger'">
                      {{ d.payStatus }}
                    </el-tag>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </el-table-column>
          <el-table-column prop="supplier" label="供应商" min-width="140" />
          <el-table-column label="应付合计" width="130" align="right">
            <template #default="{ row }">{{ row.payable.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="已付合计" width="130" align="right">
            <template #default="{ row }">{{ row.paid.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="欠款" width="130" align="right">
            <template #default="{ row }">
              <b :style="{ color: row.owe > 0 ? '#f56c6c' : '#67c23a' }">{{ row.owe.toFixed(2) }}</b>
            </template>
          </el-table-column>
          <el-table-column label="最长欠款天数" width="120" align="right">
            <template #default="{ row }">
              <span :style="{ color: row.oweDays > 30 ? '#f56c6c' : 'inherit' }">{{ row.oweDays }} 天</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 库存周期 -->
      <el-tab-pane label="库存周期" name="period">
        <div class="toolbar">
          <el-radio-group v-model="periodType" @change="loadPeriod">
            <el-radio-button value="product">成品</el-radio-button>
            <el-radio-button value="material">原材料</el-radio-button>
          </el-radio-group>
          <el-select v-model="periodWindow" class="window-sel" @change="loadPeriod">
            <el-option :value="30" label="近 30 天" />
            <el-option :value="90" label="近 90 天" />
            <el-option :value="180" label="近 180 天" />
          </el-select>
        </div>
        <el-table :data="periods" v-loading="loading" border>
          <el-table-column prop="sku" label="SKU" width="150" />
          <el-table-column prop="spuName" label="名称" min-width="120" show-overflow-tooltip />
          <el-table-column prop="currentQty" label="现库存" width="90" align="right" />
          <el-table-column prop="avgQty" label="平均库存" width="100" align="right" />
          <el-table-column prop="outQty" label="期间出库" width="90" align="right" />
          <el-table-column label="库存周期(天)" width="120" align="right">
            <template #default="{ row }">
              <span v-if="row.periodDays === null">—</span>
              <span v-else :style="{ color: row.periodDays > 90 ? '#f56c6c' : 'inherit' }">{{ row.periodDays }}</span>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 渠道统计 -->
      <el-tab-pane label="渠道出库统计" name="channel">
        <div class="toolbar">
          <el-date-picker v-model="channelRange" type="daterange" value-format="YYYY-MM-DD"
            start-placeholder="开始日期" end-placeholder="结束日期" @change="loadChannel" />
        </div>
        <el-table :data="channels" v-loading="loading" border>
          <el-table-column prop="platform" label="平台/渠道" min-width="140" />
          <el-table-column prop="orderCount" label="出库单数" width="110" align="right" />
          <el-table-column prop="qty" label="出库数量" width="110" align="right" />
          <el-table-column label="出库成本" width="130" align="right">
            <template #default="{ row }">{{ row.cost.toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <!-- 损耗 -->
      <el-tab-pane label="损耗汇总" name="loss">
        <el-row :gutter="16" class="loss-cards">
          <el-col :span="6"><el-card><div class="num">{{ loss.scrapQty }}</div><div class="label">报废数量</div></el-card></el-col>
          <el-col :span="6"><el-card><div class="num">¥{{ loss.scrapCost.toFixed(2) }}</div><div class="label">报废成本</div></el-card></el-col>
          <el-col :span="6"><el-card><div class="num">{{ loss.badReturnQty }}</div><div class="label">退货不良品数量</div></el-card></el-col>
        </el-row>
        <el-table :data="loss.byReason" v-loading="loading" border>
          <el-table-column prop="reason" label="报废原因" min-width="160" />
          <el-table-column prop="qty" label="数量" width="110" align="right" />
          <el-table-column label="成本" width="130" align="right">
            <template #default="{ row }">{{ row.cost.toFixed(2) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import api from '../api.js'

const tab = ref('statement')
const loading = ref(false)
const statement = ref([])
const periods = ref([])
const periodType = ref('product')
const periodWindow = ref(90)
const channels = ref([])
const channelRange = ref(null)
const loss = ref({ scrapQty: 0, scrapCost: 0, badReturnQty: 0, byReason: [] })

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '')

async function loadStatement() {
  loading.value = true
  try { statement.value = (await api.get('/reports/supplier-statement')).list } finally { loading.value = false }
}
async function loadPeriod() {
  loading.value = true
  try {
    periods.value = (await api.get('/reports/inventory-period', {
      params: { itemType: periodType.value, windowDays: periodWindow.value },
    })).list
  } finally { loading.value = false }
}
async function loadChannel() {
  loading.value = true
  try {
    const [from, to] = channelRange.value || []
    channels.value = (await api.get('/reports/channel-stats', { params: { from, to } })).list
  } finally { loading.value = false }
}
async function loadLoss() {
  loading.value = true
  try { loss.value = await api.get('/reports/loss') } finally { loading.value = false }
}

watch(tab, (t) => {
  if (t === 'statement') loadStatement()
  else if (t === 'period') loadPeriod()
  else if (t === 'channel') loadChannel()
  else if (t === 'loss') loadLoss()
})

onMounted(loadStatement)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.window-sel { width: 130px; }
.docs-table { margin: 8px 24px; width: calc(100% - 48px); }
.loss-cards { margin-bottom: 16px; text-align: center; }
.num { font-size: 24px; font-weight: 600; }
.label { color: #909399; font-size: 13px; margin-top: 4px; }
</style>
