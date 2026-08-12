<template>
  <div>
    <el-table :data="modelValue" size="small" border>
      <el-table-column label="组件产品 SKU" min-width="240">
        <template #default="{ row }">
          <el-select v-model="row.sku" filterable placeholder="选择组件 SKU">
            <el-option v-for="s in skuOptions" :key="s.skuNo" :label="`${s.spuName} ${s.skuNo}（${attrsText(s.attrs)}）`" :value="s.skuNo" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column label="数量" width="120">
        <template #default="{ row }">
          <el-input-number v-model="row.qty" :min="1" :precision="0" size="small" controls-position="right" />
        </template>
      </el-table-column>
      <el-table-column label="" width="60">
        <template #default="{ $index }">
          <el-button link type="danger" @click="modelValue.splice($index, 1)">删</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-button link type="primary" @click="modelValue.push({ sku: '', qty: 1 })">+ 添加组件</el-button>
  </div>
</template>

<script setup>
// 虚拟组合组成明细编辑器
defineProps({
  modelValue: { type: Array, default: () => [] },
  skuOptions: { type: Array, default: () => [] }, // 实物产品 SKU 列表
})
defineEmits(['update:modelValue'])

function attrsText(attrs) {
  const entries = Object.entries(attrs || {})
  return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(',') : '默认'
}
</script>
