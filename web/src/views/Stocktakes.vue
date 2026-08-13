<template>
  <div>
    <div class="toolbar">
      <el-select v-model="status" placeholder="状态" clearable class="status-filter" @change="load">
        <el-option label="草稿" value="draft" />
        <el-option label="已确认" value="confirmed" />
        <el-option label="已作废" value="void" />
      </el-select>
      <el-button type="primary" @click="openCreate">新建盘点单</el-button>
      <el-button @click="downloadExcel('stocktakes')">导出 Excel</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="单号" width="130" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="{ draft: 'warning', confirmed: 'success', void: 'info' }[row.status]" size="small">
            {{ { draft: '草稿', confirmed: '已确认', void: '已作废' }[row.status] }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="盘点条目" min-width="200">
        <template #default="{ row }">
          {{ row.items.length }} 项
          <span class="diff-summary" v-if="row.status !== 'draft'">
            （差异 {{ row.items.filter((i) => i.actualQty !== null && i.actualQty !== i.bookQty).length }} 项）
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="operator" label="操作人" width="90" />
      <el-table-column label="创建时间" width="160">
        <template #default="{ row }">{{ fmtTime(row.createdAt) }}</template>
      </el-table-column>
      <el-table-column label="确认时间" width="160">
        <template #default="{ row }">{{ fmtTime(row.confirmedAt) }}</template>
      </el-table-column>
      <el-table-column prop="remark" label="备注" min-width="120" show-overflow-tooltip />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">
            {{ row.status === 'draft' ? '录入实盘' : '查看' }}
          </el-button>
          <template v-if="row.status === 'draft'">
            <el-popconfirm title="作废该盘点草稿？" @confirm="voidIt(row)">
              <template #reference><el-button link type="danger">作废</el-button></template>
            </el-popconfirm>
          </template>
          <template v-else-if="row.status === 'confirmed'">
            <el-popconfirm title="作废将回滚全部盘点调整，确认？" @confirm="voidIt(row)">
              <template #reference><el-button link type="danger">作废回滚</el-button></template>
            </el-popconfirm>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建：选择要盘点的 SKU -->
    <el-dialog v-model="createDlg" title="新建盘点单" width="640px">
      <div class="pick-bar">
        <el-select v-model="pickType" class="pick-type">
          <el-option label="成品" value="product" />
          <el-option label="原材料" value="material" />
        </el-select>
        <el-select v-model="pickSku" filterable placeholder="选择 SKU 加入盘点" class="pick-sku">
          <el-option v-for="s in skuOptions" :key="s.skuNo" :label="`${s.skuNo} ${s.spuName}`" :value="s.skuNo" />
        </el-select>
        <el-button @click="addPick">加入</el-button>
        <el-button link type="primary" @click="addAll">全部加入</el-button>
      </div>
      <el-table :data="picked" border size="small" max-height="320">
        <el-table-column prop="sku" label="SKU" width="160" />
        <el-table-column prop="itemType" label="类型" width="90">
          <template #default="{ row }">{{ row.itemType === 'product' ? '成品' : '原材料' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="70">
          <template #default="{ $index }">
            <el-button link type="danger" @click="picked.splice($index, 1)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-input v-model="createRemark" placeholder="备注（可选）" class="create-remark" />
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="create">创建草稿</el-button>
      </template>
    </el-dialog>

    <!-- 明细/实盘录入 -->
    <el-drawer v-model="detailDlg" :title="`盘点单 ${current?.no || ''}`" size="640px">
      <el-table :data="current?.items || []" border>
        <el-table-column prop="sku" label="SKU" width="150" />
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ row.itemType === 'product' ? '成品' : '原材料' }}</template>
        </el-table-column>
        <el-table-column prop="bookQty" label="账面数" width="90" align="right" />
        <el-table-column label="实盘数" width="130">
          <template #default="{ row }">
            <el-input-number v-if="current?.status === 'draft'" v-model="row.actualQty" :min="0" :precision="2" size="small" controls-position="right" />
            <span v-else>{{ row.actualQty }}</span>
          </template>
        </el-table-column>
        <el-table-column label="差异" width="90" align="right">
          <template #default="{ row }">
            <span v-if="row.actualQty !== null && row.actualQty !== undefined"
              :style="{ color: row.actualQty - row.bookQty ? '#f56c6c' : '#67c23a' }">
              {{ row.actualQty - row.bookQty > 0 ? '+' : '' }}{{ row.actualQty - row.bookQty }}
            </span>
          </template>
        </el-table-column>
      </el-table>
      <div class="drawer-footer" v-if="current?.status === 'draft'">
        <el-button :loading="saving" @click="saveActual">保存实盘数</el-button>
        <el-popconfirm title="确认后按差异调整库存，确认盘点？" @confirm="confirm">
          <template #reference><el-button type="primary" :loading="saving">确认盘点</el-button></template>
        </el-popconfirm>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const status = ref('')
const createDlg = ref(false)
const detailDlg = ref(false)
const current = ref(null)
const pickType = ref('product')
const pickSku = ref('')
const picked = ref([])
const createRemark = ref('')
const skuPool = ref({ product: [], material: [] })

const skuOptions = computed(() => skuPool.value[pickType.value])

const fmtTime = (t) => (t ? new Date(t).toLocaleString('zh-CN', { hour12: false }) : '')

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/stocktakes', { params: { status: status.value } })).list
  } finally {
    loading.value = false
  }
}

async function openCreate() {
  if (!skuPool.value.product.length) {
    const [p, m] = await Promise.all([
      api.get('/inventory', { params: { itemType: 'product' } }),
      api.get('/inventory', { params: { itemType: 'material' } }),
    ])
    skuPool.value = { product: p.list.filter((s) => s.kind !== 'virtual'), material: m.list }
  }
  picked.value = []
  createRemark.value = ''
  pickSku.value = ''
  createDlg.value = true
}

watch(pickType, () => { pickSku.value = '' })

function addPick() {
  if (!pickSku.value) return
  if (picked.value.some((x) => x.sku === pickSku.value)) return ElMessage.warning('已在列表中')
  picked.value.push({ itemType: pickType.value, sku: pickSku.value })
  pickSku.value = ''
}

function addAll() {
  for (const s of skuOptions.value) {
    if (!picked.value.some((x) => x.sku === s.skuNo)) {
      picked.value.push({ itemType: pickType.value, sku: s.skuNo })
    }
  }
}

async function create() {
  if (!picked.value.length) return ElMessage.warning('请至少选择一个 SKU')
  saving.value = true
  try {
    const { doc } = await api.post('/stocktakes', { items: picked.value, remark: createRemark.value })
    ElMessage.success(`已创建 ${doc.no}`)
    createDlg.value = false
    await load()
    openDetail(list.value.find((x) => x._id === doc._id) || doc)
  } finally {
    saving.value = false
  }
}

function openDetail(row) {
  current.value = JSON.parse(JSON.stringify(row))
  detailDlg.value = true
}

async function saveActual() {
  saving.value = true
  try {
    const { doc } = await api.put(`/stocktakes/${current.value._id}`, {
      items: current.value.items.map((i) => ({ sku: i.sku, actualQty: i.actualQty })),
    })
    current.value = doc
    ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

async function confirm() {
  saving.value = true
  try {
    const { doc } = await api.post(`/stocktakes/${current.value._id}/confirm`)
    current.value = doc
    ElMessage.success('盘点已确认，库存已调整')
    detailDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

async function voidIt(row) {
  await api.post(`/stocktakes/${row._id}/void`)
  ElMessage.success('已作废')
  load()
}

onMounted(load)
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.status-filter { width: 140px; }
.pick-bar { display: flex; gap: 8px; margin-bottom: 10px; }
.pick-type { width: 110px; }
.pick-sku { flex: 1; }
.create-remark { margin-top: 10px; }
.diff-summary { color: #909399; font-size: 12px; }
.drawer-footer { margin-top: 16px; display: flex; justify-content: flex-end; gap: 8px; }
</style>
