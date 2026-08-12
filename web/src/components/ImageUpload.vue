<template>
  <div class="image-upload">
    <el-image
      v-if="modelValue"
      :src="modelValue"
      fit="cover"
      class="preview"
      :preview-src-list="[modelValue]"
      preview-teleported
    />
    <div class="btns">
      <el-button size="small" :loading="uploading" @click="pick">上传图片</el-button>
      <el-button v-if="modelValue" size="small" link type="danger" @click="$emit('update:modelValue', '')">移除</el-button>
    </div>
    <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'

defineProps({ modelValue: { type: String, default: '' } })
const emit = defineEmits(['update:modelValue'])

const fileInput = ref(null)
const uploading = ref(false)

function pick() {
  fileInput.value.click()
}

async function onFile(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  if (file.size > 5 * 1024 * 1024) return ElMessage.warning('图片不能超过 5MB')
  uploading.value = true
  try {
    const fd = new FormData()
    fd.append('file', file)
    const data = await api.post('/upload', fd)
    emit('update:modelValue', data.path)
  } finally {
    uploading.value = false
  }
}
</script>

<style scoped>
.image-upload { display: flex; align-items: center; gap: 8px; }
.preview { width: 60px; height: 60px; border-radius: 4px; border: 1px solid #e4e7ed; }
.btns { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
</style>
