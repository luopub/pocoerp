// PM2 进程配置（在服务器项目根目录运行：pm2 start ecosystem.config.js）
module.exports = {
  apps: [
    {
      name: 'pocoerp',
      script: 'server/src/index.js',
      env: { NODE_ENV: 'production' },
      max_memory_restart: '300M',
      out_file: 'logs/pocoerp-out.log',
      error_file: 'logs/pocoerp-err.log',
      merge_logs: true,
      time: true,
    },
  ],
}
