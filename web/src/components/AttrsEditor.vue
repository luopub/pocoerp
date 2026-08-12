<template>
  <div class="attrs-editor">
    <div v-for="(pair, i) in pairs" :key="i" class="pair">
      <el-input v-model="pair.key" placeholder="属性名，如 颜色" class="key" />
      <el-input v-model="pair.value" placeholder="属性值，如 红" class="value" />
      <el-button link type="danger" @click="pairs.splice(i, 1)">删除</el-button>
    </div>
    <el-button link type="primary" @click="pairs.push({ key: '', value: '' })">+ 添加属性</el-button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

// 规格属性编辑器：键值对列表 <-> 对象
const props = defineProps({ modelValue: { type: Object, default: () => ({}) } })
const emit = defineEmits(['update:modelValue'])

const pairs = ref(objToPairs(props.modelValue))

function objToPairs(obj) {
  const arr = Object.entries(obj || {}).map(([key, value]) => ({ key, value }))
  return arr.length ? arr : []
}

watch(pairs, (val) => {
  const obj = {}
  for (const p of val) if (p.key.trim()) obj[p.key.trim()] = p.value.trim()
  emit('update:modelValue', obj)
}, { deep: true })

// 外部重置（打开对话框时）
watch(() => props.modelValue, (val) => {
  const current = {}
  for (const p of pairs.value) if (p.key.trim()) current[p.key.trim()] = p.value.trim()
  if (JSON.stringify(current) !== JSON.stringify(val || {})) pairs.value = objToPairs(val)
})
</script>

<style scoped>
.pair { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
.key { width: 140px; }
.value { width: 180px; }
</style>
