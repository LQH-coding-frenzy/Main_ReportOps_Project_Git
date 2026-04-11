// PM2 Ecosystem — Process Manager Configuration
// Deploy to: /opt/reportops/backend/ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'reportops-api',
      script: 'dist/index.js',
      cwd: '/opt/reportops/backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      // Logging
      error_file: '/var/log/reportops/api-error.log',
      out_file: '/var/log/reportops/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
