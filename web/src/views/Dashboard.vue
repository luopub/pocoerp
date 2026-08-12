<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="8">
        <el-card>
          <el-statistic title="产品 SKU 数" :value="0">
            <template #suffix><span class="unit">种</span></template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <el-statistic title="物料 SKU 数" :value="0">
            <template #suffix><span class="unit">种</span></template>
          </el-statistic>
        </el-card>
      </el-col>
      <el-col :span="8">
        <el-card>
          <el-statistic title="库存预警" :value="0">
            <template #suffix><span class="unit">条</span></template>
          </el-statistic>
        </el-card>
      </el-col>
    </el-row>
    <el-card class="welcome">
      <h3>欢迎使用 PocoERP</h3>
      <p>Phase 0 骨架已就绪：登录、数据库连接、编号与库存核心服务（含单元测试）。</p>
      <p>产品、物料、采购、工单、库存、出库等模块将按开发计划逐步上线，届时本页会展示库存预警与工单超期提醒。</p>
    </el-card>
  </div>
</template>

<script setup>
</script>

<style scoped>
.unit {
  font-size: 14px;
  color: #909399;
}
.welcome {
  margin-top: 16px;
}
.welcome h3 {
  margin-top: 0;
}
.welcome p {
  color: #606266;
  line-height: 1.8;
}
</style>
