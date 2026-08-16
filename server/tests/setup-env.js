// 测试环境设置：必须作为【第一个 import】出现在每个测试文件中。
// ESM 会先行求值所有依赖模块，在测试文件顶层写 `process.env.X = ...`
// 对已完成求值的 config.js 无效——曾因此导致测试直连并清空生产库 pocoerp。
// 独立成模块后，依赖按导入顺序求值，本模块先于 config.js 执行，设置生效。
process.env.APP_DB_NAME = 'pocoerp_test'
