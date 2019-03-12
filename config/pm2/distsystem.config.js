var node_env = process.env.NODE_ENV || "production"
console.log(node_env)

module.exports = {
  apps: [
    {
      name: 'z-worker',
      script: './services/worker.service.js',
      instances: 2,
      autorestart: true,
      watch: "worker.service.js",
      max_memory_restart: '1G',
      kill_timeout: 30000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    },
    {
      name: 'z-controller',
      script: './services/controller.service.js',
      autorestart: true,
      watch: "controller.service.js",
      max_memory_restart: '1G',
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    },
    {
      name: 'z-localstore',
      script: './services/queuer.service.js',
      autorestart: true,
      watch: "queuer.service.js",
      max_memory_restart: '1G',
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    },
    {
      name: 'z-remotestore',
      script: './services/remotestore.js',
      autorestart: true,
      watch: "remotestore.js",
      max_memory_restart: '1G',
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    },
    {
      name: "z-nats-local",
      script: "/usr/local/bin/gnatsd",
      args: "-p 6222 -cluster nats://localhost:6248 -m 10222",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "z-nats-local-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:10222 --port 3002",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
};
