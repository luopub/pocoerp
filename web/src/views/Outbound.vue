<template>
  <div>
    <div class="toolbar">
      <el-radio-group v-model="typeFilter" @change="load">
        <el-radio-button value="">全部</el-radio-button>
        <el-radio-button value="sale">销售出库</el-radio-button>
        <el-radio-button value="scrap">报废出库</el-radio-button>
      </el-radio-group>
      <el-input v-model="keyword" placeholder="搜索单号/渠道/SKU/平台ID" clearable class="search" @change="load" />
      <el-button type="primary" @click="openCreate">新建出库单</el-button>
    </div>

    <el-table :data="list" v-loading="loading" border>
      <el-table-column prop="no" label="单号" width="115" />
      <el-table-column label="类型" width="95">
        <template #default="{ row }">
          <el-tag size="small" :type="row.type === 'sale' ? 'primary' : 'danger'">
            {{ row.type === 'sale' ? '销售' : '报废' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="channel" label="渠道" width="105" show-overflow-tooltip />
      <el-table-column label="日期" width="105">
        <template #default="{ row }">{{ fmtDate(row.date) }}</template>
      </el-table-column>
      <el-table-column label="明细" min-width="230">
        <template #default="{ row }">
          <div v-for="(it, i) in row.items" :key="i" class="item-line">
            {{ it.sku }} × {{ it.qty }}
            <span v-if="it.platform" class="muted">[{{ it.platform }}/{{ it.id1 }}]</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="成本合计" width="100" align="right">
        <template #default="{ row }">
          {{ row.items.reduce((s, i) => s + i.qty * i.unitCost, 0).toFixed(2) }}
        </template>
      </el-table-column>
      <el-table-column prop="platformOrderNo" label="平台单号" width="120" show-overflow-tooltip />
      <el-table-column prop="scrapReason" label="报废原因" width="110" show-overflow-tooltip />
      <el-table-column label="状态" width="85">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'void' ? 'info' : 'success'">
            {{ row.status === 'void' ? '已作废' : '已出库' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="operator" label="操作人" width="85" />
      <el-table-column label="操作" width="80" fixed="right">
        <template #default="{ row }">
          <el-popconfirm v-if="row.status !== 'void'" title="作废将退回全部库存，确定？" @confirm="voidOrder(row)">
            <template #reference><el-button link type="danger">作废</el-button></template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建出库单 -->
    <el-dialog v-model="createDlg" title="新建出库单" width="900px" top="5vh">
      <el-form label-width="100px">
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="出库类型" required>
              <el-radio-group v-model="createForm.type" @change="createForm.items = []">
                <el-radio value="sale">销售出库</el-radio>
                <el-radio value="scrap">报废出库</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="8" v-if="createForm.type === 'sale'">
            <el-form-item label="去向渠道">
              <el-select v-model="createForm.channel" filterable clearable placeholder="默认取映射平台">
                <el-option v-for="c in channels" :key="c._id" :label="c.name" :value="c.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8" v-if="createForm.type === 'sale'">
            <el-form-item label="平台单号">
              <el-input v-model="createForm.platformOrderNo" />
            </el-form-item>
          </el-col>
          <el-col :span="16" v-if="createForm.type === 'scrap'">
            <el-form-item label="报废原因" required>
              <el-input v-model="createForm.scrapReason" placeholder="次品 / 损坏 / 过期…" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="备注"><el-input v-model="createForm.remark" /></el-form-item>

        <el-divider content-position="left">
          {{ createForm.type === 'sale' ? '明细（按平台映射选择）' : '明细（直接选择内部 SKU）' }}
        </el-divider>
        <el-table :data="createForm.items" size="small" border>
          <el-table-column v-if="createForm.type === 'sale'" label="图片" width="70">
            <template #default="{ row }">
              <el-image v-if="row.image" :src="row.image" fit="cover" class="img" :preview-src-list="[row.image]" preview-teleported />
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column :label="createForm.type === 'sale' ? '平台映射' : '内部 SKU'" min-width="300">
            <template #default="{ row }">
              <el-select v-if="createForm.type === 'sale'" v-model="row.mappingId" filterable placeholder="搜索平台 ID / SKU / 产品名" @change="(v) => onMappingPick(row, v)">
                <el-option v-for="m in mappingOptions" :key="m._id" :value="m._id"
                  :label="`${m.spuName}｜${m.platform}/${m.account}｜${m.id1}`" />
              </el-select>
              <el-select v-else v-model="row.sku" filterable placeholder="选择内部 SKU（虚拟组合不可报废）">
                <el-option v-for="s in physicalSkus" :key="s.skuNo" :value="s.skuNo"
                  :label="`${s.spuName} ${s.skuNo}（库存 ${s.qty}）`" />
              </el-select>
            </template>
          </el-table-column>
          <el-table-column v-if="createForm.type === 'sale'" label="内部 SKU" width="150">
            <template #default="{ row }"><span class="muted">{{ row.skuNo || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="数量" width="120">
            <template #default="{ row }">
              <el-input-number v-model="row.qty" :min="1" :precision="0" size="small" controls-position="right" />
            </template>
          </el-table-column>
          <el-table-column label="" width="55">
            <template #default="{ $index }">
              <el-button link type="danger" @click="createForm.items.splice($index, 1)">删</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-button link type="primary" @click="createForm.items.push({ mappingId: '', sku: '', skuNo: '', image: '', qty: 1 })">+ 添加明细</el-button>
      </el-form>
      <template #footer>
        <el-button @click="createDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveCreate">确认出库</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'

const list = ref([])
const loading = ref(false)
const saving = ref(false)
const typeFilter = ref('')
const keyword = ref('')
const createDlg = ref(false)
const channels = ref([])
const mappingOptions = ref([])
const physicalSkus = ref([])
const createForm = reactive({ type: 'sale', channel: '', platformOrderNo: '', scrapReason: '', remark: '', items: [] })

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('zh-CN') : '' }

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/outbounds', {
      params: { type: typeFilter.value, keyword: keyword.value },
    })).list
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  channels.value = (await api.get('/channels')).list
  mappingOptions.value = (await api.get('/mappings')).list
  physicalSkus.value = (await api.get('/products/skus')).list.filter((s) => s.kind === 'physical')
}

function onMappingPick(row, id) {
  const m = mappingOptions.value.find((x) => x._id === id)
  row.skuNo = m?.skuNo || ''
  row.image = m?.displayImage || ''
  if (!createForm.channel && m) createForm.channel = m.platform
}

function openCreate() {
  Object.assign(createForm, { type: 'sale', channel: '', platformOrderNo: '', scrapReason: '', remark: '', items: [{ mappingId: '', sku: '', skuNo: '', image: '', qty: 1 }] })
  createDlg.value = true
}

async function saveCreate() {
  const f = createForm
  if (f.type === 'scrap' && !f.scrapReason.trim()) return ElMessage.warning('请填写报废原因')
  const items = f.items.filter((i) => i.qty > 0 && (f.type === 'sale' ? i.mappingId : i.sku))
  if (!items.length) return ElMessage.warning('请至少填写一行有效明细')
  saving.value = true
  try {
    await api.post('/outbounds', {
      type: f.type, channel: f.channel, platformOrderNo: f.platformOrderNo,
      scrapReason: f.scrapReason, remark: f.remark,
      items: items.map((i) => (f.type === 'sale' ? { mappingId: i.mappingId, qty: i.qty } : { sku: i.sku, qty: i.qty })),
    })
    ElMessage.success('出库完成')
    createDlg.value = false
    load()
    loadRefs()
  } finally {
    saving.value = false
  }
}

async function voidOrder(row) {
  await api.post(`/outbounds/${row._id}/void`)
  ElMessage.success('已作废并退回库存')
  load()
  loadRefs()
}

onMounted(() => { load(); loadRefs() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; align-items: center; }
.search { width: 240px; }
.item-line { line-height: 1.6; }
.muted { color: #909399; font-size: 12px; }
.img { width: 40px; height: 40px; border-radius: 4px; }
</style>
