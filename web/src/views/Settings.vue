<template>
  <div>
    <el-tabs v-model="tab">
      <!-- 全局参数 -->
      <el-tab-pane label="预警参数" name="params">
        <el-card class="param-card">
          <el-form label-width="200px" class="param-form">
            <el-form-item label="动销统计窗口（天）">
              <el-input-number v-model="params.warnWindowDays" :min="1" :max="365" :disabled="!isAdmin" />
              <div class="hint">计算 SKU 平均日销量/日耗用时统计最近多少天</div>
            </el-form-item>
            <el-form-item label="动态预警天数">
              <el-input-number v-model="params.warnDays" :min="1" :max="365" :disabled="!isAdmin" />
              <div class="hint">按当前消耗速度，库存可用天数低于该值即触发预警</div>
            </el-form-item>
            <el-form-item label="补货覆盖天数">
              <el-input-number v-model="params.replenishDays" :min="1" :max="365" :disabled="!isAdmin" />
              <div class="hint">补货建议量 = 日消耗 × 覆盖天数 − 现有库存</div>
            </el-form-item>
            <el-form-item v-if="isAdmin">
              <el-button type="primary" :loading="saving" @click="saveParams">保存参数</el-button>
            </el-form-item>
          </el-form>
          <el-alert type="info" :closable="false"
            title="参数优先级：SKU 级 > SPU 级 > 全局。此处设置全局默认值；SKU/SPU 级参数在产品与原材料档案中设置。" />
        </el-card>
      </el-tab-pane>

      <!-- 用户管理 -->
      <el-tab-pane label="用户管理" name="users" :disabled="!isAdmin">
        <div class="toolbar">
          <el-button type="primary" @click="openUser()">新增用户</el-button>
        </div>
        <el-table :data="users" v-loading="loading" border>
          <el-table-column prop="username" label="用户名" min-width="120" />
          <el-table-column label="角色" width="110">
            <template #default="{ row }">
              <el-tag size="small" :type="{ admin: 'danger', keeper: 'primary', viewer: 'info' }[row.role]">
                {{ ROLE_NAMES[row.role] }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="90">
            <template #default="{ row }">
              <el-tag size="small" :type="row.active ? 'success' : 'info'">{{ row.active ? '启用' : '停用' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openUser(row)">编辑</el-button>
              <el-button link type="primary" @click="openReset(row)">重置密码</el-button>
              <el-button v-if="row.username !== 'admin'" link :type="row.active ? 'danger' : 'success'" @click="toggleActive(row)">
                {{ row.active ? '停用' : '启用' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <!-- 新增/编辑用户 -->
    <el-dialog v-model="userDlg" :title="userForm._id ? '编辑用户' : '新增用户'" width="420px">
      <el-form label-width="90px">
        <el-form-item label="用户名" required>
          <el-input v-model="userForm.username" :disabled="!!userForm._id" />
        </el-form-item>
        <el-form-item v-if="!userForm._id" label="密码" required>
          <el-input v-model="userForm.password" type="password" show-password />
        </el-form-item>
        <el-form-item label="角色">
          <el-select v-model="userForm.role" class="full">
            <el-option v-for="(n, r) in ROLE_NAMES" :key="r" :label="n" :value="r" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="userDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="saveUser">保存</el-button>
      </template>
    </el-dialog>

    <!-- 重置密码 -->
    <el-dialog v-model="resetDlg" :title="`重置密码 - ${resetTarget?.username}`" width="400px">
      <el-input v-model="resetPwd" type="password" show-password placeholder="新密码（至少 6 位）" />
      <template #footer>
        <el-button @click="resetDlg = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="doReset">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import api from '../api.js'
import { auth, ROLE_NAMES } from '../store.js'

const isAdmin = computed(() => auth.role === 'admin')
const tab = ref('params')
const loading = ref(false)
const saving = ref(false)
const params = reactive({ warnWindowDays: 30, warnDays: 10, replenishDays: 30 })
const users = ref([])
const userDlg = ref(false)
const userForm = reactive({ _id: '', username: '', password: '', role: 'viewer' })
const resetDlg = ref(false)
const resetTarget = ref(null)
const resetPwd = ref('')

async function loadParams() {
  const { doc } = await api.get('/settings')
  Object.assign(params, {
    warnWindowDays: doc.warnWindowDays, warnDays: doc.warnDays, replenishDays: doc.replenishDays,
  })
}

async function saveParams() {
  saving.value = true
  try {
    await api.put('/settings', params)
    ElMessage.success('参数已保存')
  } finally {
    saving.value = false
  }
}

async function loadUsers() {
  loading.value = true
  try { users.value = (await api.get('/users')).list } finally { loading.value = false }
}

function openUser(row) {
  Object.assign(userForm, row
    ? { _id: row._id, username: row.username, password: '', role: row.role }
    : { _id: '', username: '', password: '', role: 'viewer' })
  userDlg.value = true
}

async function saveUser() {
  if (!userForm._id && (!userForm.username.trim() || !userForm.password)) {
    return ElMessage.warning('用户名和密码必填')
  }
  saving.value = true
  try {
    if (userForm._id) await api.put(`/users/${userForm._id}`, { role: userForm.role })
    else await api.post('/users', userForm)
    ElMessage.success('已保存')
    userDlg.value = false
    loadUsers()
  } finally {
    saving.value = false
  }
}

function openReset(row) {
  resetTarget.value = row
  resetPwd.value = ''
  resetDlg.value = true
}

async function doReset() {
  if (resetPwd.value.length < 6) return ElMessage.warning('新密码至少 6 位')
  saving.value = true
  try {
    await api.post(`/users/${resetTarget.value._id}/reset-password`, { password: resetPwd.value })
    ElMessage.success('密码已重置')
    resetDlg.value = false
  } finally {
    saving.value = false
  }
}

async function toggleActive(row) {
  await api.put(`/users/${row._id}`, { active: !row.active })
  ElMessage.success(row.active ? '已停用' : '已启用')
  loadUsers()
}

onMounted(() => {
  loadParams()
  if (isAdmin.value) loadUsers()
})
</script>

<style scoped>
.param-card { max-width: 640px; }
.param-form :deep(.el-input-number) { width: 160px; }
.hint { color: #909399; font-size: 12px; line-height: 1.4; margin-left: 12px; }
.toolbar { display: flex; gap: 12px; margin-bottom: 12px; }
.full { width: 100%; }
</style>
