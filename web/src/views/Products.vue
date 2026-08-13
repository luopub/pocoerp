<template>
  <div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索名称/编号" clearable class="search" @change="load" />
      <el-select v-model="kindFilter" placeholder="类型" clearable class="kind-filter" @change="load">
        <el-option label="实物产品" value="physical" />
        <el-option label="虚拟组合" value="virtual" />
      </el-select>
      <el-button type="primary" @click="openEdit()">新增产品</el-button>
      <el-button @click="downloadExcel('products')">导出 Excel</el-button>
    </div>
    <el-table :data="list" v-loading="loading" border row-key="no">
      <el-table-column type="expand">
        <template #default="{ row }">
          <el-table :data="row.skus" size="small" class="sku-table">
            <el-table-column label="图片" width="70">
              <template #default="{ row: s }">
                <el-image v-if="s.image" :src="s.image" fit="cover" class="sku-img" :preview-src-list="[s.image]" preview-teleported />
                <span v-else class="muted">无</span>
              </template>
            </el-table-column>
            <el-table-column prop="no" label="SKU 编号" width="150" />
            <el-table-column label="规格属性" min-width="150">
              <template #default="{ row: s }">{{ attrsText(s.attrs) }}</template>
            </el-table-column>
            <el-table-column prop="safeStock" label="安全库存" width="90" align="right" />
            <el-table-column label="状态" width="70">
              <template #default="{ row: s }">
                <el-tag :type="s.active ? 'success' : 'info'" size="small">{{ s.active ? '启用' : '停用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template #default="{ row: s }">
                <el-button link type="primary" @click="openSkuEdit(row, s)">编辑</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-button link type="primary" class="add-sku" @click="openSkuEdit(row, null)">+ 添加 SKU</el-button>
        </template>
      </el-table-column>
      <el-table-column prop="no" label="编号" width="110" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column prop="category" label="分类" width="90" />
      <el-table-column label="类型" width="100">
        <template #default="{ row }">
          <el-tag :type="row.kind === 'virtual' ? 'warning' : 'primary'" size="small">
            {{ row.kind === 'virtual' ? '虚拟组合' : '实物' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="来源方式" width="100">
        <template #default="{ row }">{{ SOURCE_NAMES[row.source] }}</template>
      </el-table-column>
      <el-table-column prop="defaultSupplier" label="默认供应商" width="120" show-overflow-tooltip />
      <el-table-column prop="consumableCost" label="耗材成本" width="90" align="right" />
      <el-table-column label="SKU 数" width="75" align="right">
        <template #default="{ row }">{{ row.skus.length }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 产品编辑 -->
    <el-dialog v-model="dlg" :title="form._id ? `编辑产品 ${form.no}` : '新增产品'" width="900px" top="4vh">
      <el-form :model="form" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="分类">
              <el-select v-model="form.category" filterable allow-create clearable>
                <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="产品类型">
              <el-radio-group v-model="form.kind" :disabled="!!form._id">
                <el-radio value="physical">实物产品</el-radio>
                <el-radio value="virtual">虚拟组合</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="来源方式">
              <el-select v-model="form.source" :disabled="form.kind === 'virtual'">
                <el-option v-for="(n, v) in SOURCE_NAMES" :key="v" :label="n" :value="v" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="默认供应商">
              <el-select v-model="form.defaultSupplier" filterable clearable>
                <el-option v-for="s in suppliers" :key="s._id" :label="s.name" :value="s.name" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="单位耗材成本">
              <el-input-number v-model="form.consumableCost" :min="0" :precision="2" controls-position="right" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="备注"><el-input v-model="form.remark" type="textarea" :rows="2" /></el-form-item>
          </el-col>
        </el-row>

        <template v-if="form.kind === 'physical' && form.source !== 'direct'">
          <el-divider content-position="left">工序模板（委外加工）</el-divider>
          <div class="tpl-editor">
            <div v-for="(p, i) in form.processTemplate" :key="i" class="tpl-row">
              <span class="seq">{{ i + 1 }}.</span>
              <el-input v-model="p.name" placeholder="工序名，如 印花" class="tpl-name" />
              <el-input-number v-model="p.expectedDays" :min="0" placeholder="预期天数" controls-position="right" />
              <span class="muted">天</span>
              <el-button link :disabled="i === 0" @click="moveStep(i, -1)">↑</el-button>
              <el-button link :disabled="i === form.processTemplate.length - 1" @click="moveStep(i, 1)">↓</el-button>
              <el-button link type="danger" @click="form.processTemplate.splice(i, 1)">删</el-button>
            </div>
            <el-button link type="primary" @click="form.processTemplate.push({ name: '', expectedDays: null })">+ 添加工序</el-button>
          </div>

          <el-divider content-position="left">物料清单（BOM）</el-divider>
          <BomEditor v-model="form.bom" :process-steps="form.processTemplate.map((p) => p.name).filter(Boolean)" :sku-options="form.skus" />
        </template>

        <template v-if="form.kind === 'virtual'">
          <el-divider content-position="left">组成明细（虚拟组合）</el-divider>
          <ComponentsEditor v-model="form.components" :sku-options="physicalSkuOptions" />
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- SKU 编辑 -->
    <el-dialog v-model="skuDlg" :title="skuForm.no ? `编辑 SKU ${skuForm.no}` : `新增 SKU（${skuForm.spuName}）`" width="480px">
      <el-form label-width="100px">
        <el-form-item label="规格属性"><AttrsEditor v-model="skuForm.attrs" /></el-form-item>
        <el-form-item label="图片"><ImageUpload v-model="skuForm.image" /></el-form-item>
        <el-form-item label="安全库存"><el-input-number v-model="skuForm.safeStock" :min="0" /></el-form-item>
        <el-form-item v-if="skuForm.no" label="状态">
          <el-switch v-model="skuForm.active" active-text="启用" inactive-text="停用" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="skuDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveSku">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { downloadExcel } from '../download.js'
import AttrsEditor from '../components/AttrsEditor.vue'
import ImageUpload from '../components/ImageUpload.vue'
import BomEditor from '../components/BomEditor.vue'
import ComponentsEditor from '../components/ComponentsEditor.vue'

const SOURCE_NAMES = { direct: '直接采购', outsourced: '委外加工', both: '两者皆可' }
const list = ref([])
const categories = ref([])
const suppliers = ref([])
const physicalSkuOptions = ref([])
const loading = ref(false)
const saving = ref(false)
const keyword = ref('')
const kindFilter = ref('')
const dlg = ref(false)
const skuDlg = ref(false)
const emptyForm = () => ({
  _id: '', no: '', name: '', category: '', kind: 'physical', source: 'direct',
  defaultSupplier: '', consumableCost: 0, remark: '', active: true,
  processTemplate: [], bom: [], components: [], skus: [],
})
const form = reactive(emptyForm())
const skuForm = reactive({ spuId: '', spuName: '', no: '', attrs: {}, image: '', safeStock: 0, active: true })

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join('，') : '（默认）'
}

function moveStep(i, dir) {
  const arr = form.processTemplate
  const j = i + dir
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}

async function load() {
  loading.value = true
  try {
    list.value = (await api.get('/products', {
      params: { keyword: keyword.value, kind: kindFilter.value, includeInactive: 1 },
    })).list
  } finally {
    loading.value = false
  }
}

async function loadRefs() {
  categories.value = (await api.get('/products/categories')).list
  suppliers.value = (await api.get('/suppliers')).list
  const skus = (await api.get('/products/skus')).list
  physicalSkuOptions.value = skus.filter((s) => s.kind === 'physical')
}

function openEdit(row) {
  Object.assign(form, emptyForm(), row ? {
    _id: row._id, no: row.no, name: row.name, category: row.category, kind: row.kind,
    source: row.source, defaultSupplier: row.defaultSupplier, consumableCost: row.consumableCost,
    remark: row.remark, active: row.active,
    processTemplate: row.processTemplate.map((p) => ({ ...p })),
    bom: row.bom.map((b) => ({ ...b, applySkus: [...(b.applySkus || [])] })),
    components: row.components.map((c) => ({ ...c })),
    skus: row.skus,
  } : {})
  dlg.value = true
}

async function save() {
  if (!form.name.trim()) return ElMessage.warning('请填写产品名称')
  if (form.kind === 'virtual' && !form.components.length) {
    return ElMessage.warning('虚拟组合产品必须配置组成明细')
  }
  saving.value = true
  try {
    if (form._id) await api.put(`/products/${form._id}`, form)
    else await api.post('/products', form)
    ElMessage.success('已保存')
    dlg.value = false
    load()
    loadRefs()
  } finally {
    saving.value = false
  }
}

function openSkuEdit(spu, sku) {
  Object.assign(skuForm, sku
    ? { spuId: spu._id, spuName: spu.name, no: sku.no, attrs: { ...(sku.attrs || {}) }, image: sku.image || '', safeStock: sku.safeStock, active: sku.active }
    : { spuId: spu._id, spuName: spu.name, no: '', attrs: {}, image: '', safeStock: 0, active: true })
  skuDlg.value = true
}

async function saveSku() {
  saving.value = true
  try {
    if (skuForm.no) await api.put(`/products/${skuForm.spuId}/skus/${skuForm.no}`, skuForm)
    else await api.post(`/products/${skuForm.spuId}/skus`, skuForm)
    ElMessage.success('已保存')
    skuDlg.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(() => { load(); loadRefs() })
</script>

<style scoped>
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.search { width: 220px; }
.kind-filter { width: 130px; }
.sku-table { margin: 4px 24px; width: calc(100% - 48px); }
.add-sku { margin: 4px 24px; }
.sku-img { width: 40px; height: 40px; border-radius: 4px; }
.muted { color: #c0c4cc; font-size: 12px; }
.tpl-editor { margin-bottom: 8px; }
.tpl-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.seq { width: 20px; color: #909399; }
.tpl-name { width: 180px; }
</style>
