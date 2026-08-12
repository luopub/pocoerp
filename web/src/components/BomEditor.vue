<template>
  <div>
    <el-table :data="modelValue" size="small" border>
      <el-table-column label="材料 SKU" min-width="200">
        <template #default="{ row }">
          <el-select v-model="row.materialSku" filterable placeholder="选择材料 SKU" @change="(v) => onMaterialChange(row, v)">
            <el-option v-for="m in materialSkus" :key="m.skuNo" :label="`${m.spuName} ${m.skuNo}（${attrsText(m.attrs)}）`" :value="m.skuNo" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-select v-model="row.bomType">
            <el-option label="主材" value="main" />
            <el-option label="辅料" value="aux" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="单位用量" width="110">
        <template #default="{ row }">
          <el-input-number v-model="row.usage" :min="0.001" :precision="3" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="投入工序" width="120">
        <template #default="{ row }">
          <el-select v-if="row.bomType === 'aux'" v-model="row.processStep" placeholder="选择工序">
            <el-option v-for="p in processSteps" :key="p" :label="p" :value="p" />
          </el-select>
          <span v-else class="muted">首道工序</span>
        </template>
      </el-table-column>
      <el-table-column label="适用 SKU" min-width="180">
        <template #default="{ row }">
          <el-select v-model="row.applySkus" multiple collapse-tags placeholder="空 = 全部 SKU">
            <el-option v-for="s in skuOptions" :key="s.no" :label="`${s.no}（${attrsText(s.attrs)}）`" :value="s.no" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="" width="60">
        <template #default="{ $index }">
          <el-button link type="danger" @click="modelValue.splice($index, 1)">删</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button link type="primary" @click="addRow">+ 添加材料行</el-button>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import api from '../api.js'

// BOM 编辑器：主材 1 种（可按 SKU 分行设用量）+ 辅料 n 种
const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  processSteps: { type: Array, default: () => [] }, // 工序名列表
  skuOptions: { type: Array, default: () => [] },   // 本产品 SKU 列表 [{no, attrs}]
})
defineEmits(['update:modelValue'])

const materialSkus = ref([])

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(',') : '默认'
}

function addRow() {
  props.modelValue.push({ materialSku: '', usage: 1, bomType: 'aux', processStep: '', applySkus: [] })
}

function onMaterialChange(row, v) {
  // 主材唯一性提示：同一材料可重复（按 SKU 分行），不同材料的主材由后端拒绝
  if (row.bomType === 'main') row.processStep = ''
}

onMounted(async () => {
  materialSkus.value = (await api.get('/materials/skus')).list
})
</script>

<style scoped>
.muted { color: #c0c4cc; font-size: 12px; }
</style>
