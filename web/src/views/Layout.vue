<template>
  <el-container class="layout">
    <el-aside width="200px" class="aside">
      <div class="logo">PocoERP</div>
      <el-menu :default-active="$route.path" router background-color="#1f2d3d" text-color="#bfcbd9" active-text-color="#409eff">
        <el-menu-item index="/">
          <el-icon><HomeFilled /></el-icon>
          <span>首页</span>
        </el-menu-item>
        <el-sub-menu index="basic">
          <template #title>
            <el-icon><Files /></el-icon>
            <span>基础档案</span>
          </template>
          <el-menu-item index="/basic/suppliers">供应商</el-menu-item>
          <el-menu-item index="/basic/channels">渠道</el-menu-item>
          <el-menu-item index="/basic/materials">原材料</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/products">
          <el-icon><Goods /></el-icon>
          <span>产品管理</span>
        </el-menu-item>
        <el-menu-item index="/mappings">
          <el-icon><Connection /></el-icon>
          <span>平台映射</span>
        </el-menu-item>
        <el-menu-item index="/purchases">
          <el-icon><ShoppingCart /></el-icon>
          <span>采购管理</span>
        </el-menu-item>
        <el-menu-item index="/workorders">
          <el-icon><SetUp /></el-icon>
          <span>委外加工</span>
        </el-menu-item>
        <el-sub-menu index="stock">
          <template #title>
            <el-icon><Box /></el-icon>
            <span>库存管理</span>
          </template>
          <el-menu-item index="/inventory">库存查询</el-menu-item>
          <el-menu-item index="/stocktakes">库存盘点</el-menu-item>
        </el-sub-menu>
        <el-sub-menu index="out">
          <template #title>
            <el-icon><Sell /></el-icon>
            <span>出入库</span>
          </template>
          <el-menu-item index="/outbound">出库管理</el-menu-item>
          <el-menu-item index="/returns">退货入库</el-menu-item>
        </el-sub-menu>
        <el-menu-item index="/replenishment">
          <el-icon><Bell /></el-icon>
          <span>补货建议</span>
        </el-menu-item>
        <el-menu-item index="/reports">
          <el-icon><DataAnalysis /></el-icon>
          <span>报表</span>
        </el-menu-item>
        <el-menu-item index="/import">
          <el-icon><Upload /></el-icon>
          <span>数据导入</span>
        </el-menu-item>
        <el-menu-item index="/settings">
          <el-icon><Setting /></el-icon>
          <span>系统设置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <span class="page-title">{{ $route.meta.title || '' }}</span>
        <el-dropdown @command="onCommand">
          <span class="user-info">
            {{ auth.username }}
            <el-tag size="small" class="role-tag">{{ roleName }}</el-tag>
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { HomeFilled, ArrowDown, Files, Goods, Connection, ShoppingCart, Box, Sell, SetUp, Upload, Bell, DataAnalysis, Setting } from '@element-plus/icons-vue'
import { auth, ROLE_NAMES } from '../store.js'

const router = useRouter()
const roleName = computed(() => ROLE_NAMES[auth.role] || auth.role)

function onCommand(cmd) {
  if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.layout {
  min-height: 100vh;
}
.aside {
  background-color: #1f2d3d;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}
.aside :deep(.el-menu) {
  border-right: none;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #e4e7ed;
  background: #fff;
}
.page-title {
  font-size: 16px;
  color: #303133;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #606266;
}
.role-tag {
  margin: 0 2px;
}
.main {
  background: #f5f7fa;
}
</style>
