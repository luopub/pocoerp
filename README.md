# PocoERP

面向小型跨境电商卖家的轻量级库存 ERP。覆盖两条供应链的成品库存管理：**成品直采** 与 **委外加工**（原材料 → 多工序加工 → 成品入库）。

- 需求文档：[docs/需求文档.md](docs/需求文档.md)（v1.17，19 个验收场景）
- 开发计划：[docs/开发计划.md](docs/开发计划.md)
- 部署文档：[docs/部署文档.md](docs/部署文档.md)

## 系统功能

| 模块 | 功能 |
|---|---|
| 基础档案 | 供应商（成品/材料/加工商）、渠道、原材料 SPU/SKU（多规格属性） |
| 产品管理 | 实物/虚拟组合产品、BOM 物料清单（主料按 SKU 用量、辅料按工序）、工序模板、产品图片 |
| 平台映射 | 平台+账号+ID1+ID2 ↔ 内部 SKU 映射；每个 SKU 自动生成默认映射；销售出库全部走映射 |
| 采购管理 | 成品/材料采购单、分批入库、最近采购价带出、**差异结案**、付款登记 |
| 委外加工 | 加工单（BOM 快照）、工序顺序锁定、按 BOM 发料建议、加工费、完工入库自动核算单件成本 |
| 库存管理 | 移动加权平均成本、库存流水（全程可追溯）、虚拟组合库存派生、库存盘点（草稿/确认/作废回滚） |
| 出入库 | 销售出库（映射解析、虚拟组合展开扣减、超库存拦截）、报废出库（必填原因）、退货入库（良品入库/不良品记录） |
| 预警补货 | 三级参数（SKU > SPU > 全局）动态天数预警 + 安全库存预警、补货建议一键生成采购/加工单草稿、工单超期预警 |
| 报表 | 供应商对账（欠款天数）、SKU 库存周期、渠道出库统计、损耗汇总 |
| 数据导入 | 期初库存 Excel 导入（模板下载、整批校验、事务写入） |
| 系统设置 | 全局预警参数、用户管理（管理员/仓管/只读三种角色）、各列表 Excel 导出 |

## 系统架构

```
浏览器 ──> Nginx :8080 ──静态──> web/dist（Vue3 构建产物）
              ├──/api/────> Express :3100 ──> MongoDB :27017（rs0 副本集，多文档事务）
              └──/uploads/─┘      (PM2 守护)
```

- **后端**：Node.js + Express + Mongoose（ESM），JWT + bcryptjs 认证，exceljs 导入导出，multer 图片上传
- **前端**：Vue 3 + Vite + Element Plus（中文界面）
- **数据库**：MongoDB 单节点副本集（库存扣减、盘点确认等多步写入均在事务内完成）
- **关键设计**：
  - 单号：3 位前缀 + 6 位顺序号（PRD/POM/POP/WKO/OUT/STK/RTN…），作废不回收，启动时自动校正计数器
  - 库存以流水（InventoryLog）为准聚合，任何单据作废都通过反向流水回滚，报表自然净额
  - 入库成本：成品采购 = 单价 + 单位耗材成本；委外完工 =（发料成本 + 加工费）÷ 计划数量 + 耗材成本

## 目录结构

```
server/          后端（src/models、src/routes、src/services、tests/）
web/             前端（src/views、src/components）
deploy/          nginx 配置、备份脚本、服务器首装/更新脚本
scripts/         本地 SSH 运维工具（ssh-run / scp-put）
docs/            需求文档、开发计划、部署文档
```

## 本地开发

前置：Node 20+，可访问的 MongoDB 副本集。

```bash
# 1. 配置后端环境变量（Mongo 连接、JWT 密钥）
cp server/.env.example server/.env   # 按实际填写

# 2. 初始化管理员账号与内置渠道
cd server && npm ci && npm run seed

# 3. 启动后端（:3000，node --watch 热重载）
npm run dev

# 4. 另开终端启动前端（:5173，代理 /api 与 /uploads 到 :3000）
cd web && npm ci && npm run dev
```

测试：

```bash
cd server && node --test "tests/*.test.js"    # 单元测试
```

## 生产部署

详细步骤见 [docs/部署文档.md](docs/部署文档.md)。要点：

```bash
# 首次部署（服务器为 Ubuntu 22.04，凭据通过环境变量注入，不进代码库）
node scripts/scp-put.js deploy/setup-server.sh /home/dell/setup-server.sh
node scripts/ssh-run.js "chmod +x ~/setup-server.sh && \
  SUDO_PASS=<sudo密码> MONGODB_USERNAME=<mongo用户> MONGODB_PASSWORD=<mongo密码> ~/setup-server.sh"

# 日常更新（本地 push 后，在服务器执行）
~/pocoerp/deploy/deploy.sh
```

当前生产实例：**http://192.168.1.14:8080/**（Nginx :8080 → Node :3100 → MongoDB :27017，PM2 开机自启，每日 03:30 自动备份保留 14 天）。

## 默认账号

| 账号 | 密码 | 角色 |
|---|---|---|
| admin | admin123 | 管理员 |

> **首次登录后请立即在「系统设置 → 用户管理」中重置密码。**

角色说明：管理员（全部功能 + 参数/用户管理）、仓管（业务单据读写）、只读（仅查询）。

## 安全约定

- Mongo 凭据、JWT 密钥等敏感信息只通过环境变量 / 服务器端 `.env` 注入，**仓库仅保留 `.env.example` 模板**
- MongoDB 仅监听内网；若需暴露公网，请先配置防火墙与 HTTPS
