module.exports = {
  apps: [
    {
      name: 'worker',
      script: './services/worker.js',
      instances: 1,
      autorestart: true,
      watch: "worker.js",
      max_memory_restart: '1G',
      kill_timeout: 30000,
      exec_mode: "cluster",
    },
    {
      name: 'controller',
      script: './services/controller.js',
      autorestart: true,
      watch: "controller.js",
      max_memory_restart: '1G',
      kill_timeout: 10000,
      exec_mode: "cluster",
    },
    {
      name: "localstore",
      script: "./scripts/start-localstore.sh",
      autorestart: true,
      watch: [ "localstore.js", "datastore.js" ],
      kill_timeout: 10000,
    },
    {
      name: 'remotestore',
      script: "./scripts/start-remotestore.sh",
      autorestart: true,
      watch: "remotestore.js",
      kill_timeout: 10000,
    },
    {
      name: "nats-local",
      script: "./scripts/start-nats-local.sh",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-remote",
      script: "./scripts/start-nats-remote.sh",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-local-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:8222 --port 8223",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "nats-remote-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:9222 --port 9223",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
    {
      name: "minio",
      script: "./scripts/start-minio.sh",
      autorestart: true
    },
    {
      name: "consul",
      script: "./scripts/start-consul.sh",
      autorestart: true
    }
  ],
};
