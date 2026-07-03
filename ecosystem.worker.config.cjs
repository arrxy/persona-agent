/** PM2 config — worker only (DigitalOcean Droplet) */
module.exports = {
  apps: [
    {
      name: "persona-worker",
      script: "./scripts/pm2-worker.sh",
      interpreter: "bash",
      autorestart: true,
      max_memory_restart: "512M",
      restart_delay: 5000,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
