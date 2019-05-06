var node_env = process.env.NODE_ENV || "production"

module.exports = {
  apps: [
    {
      name: "api",
      script: "./api/server.js",
      instances: 1,
      autorestart: true,
      watch: ["./api/*.js"],
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env,
        LOG_LEVEL: "debug"
      }
    },
    {
      name: "worker",
      script: "./services/worker.service.js",
      instances: 1,
      autorestart: true,
      watch: "./services/worker.service.js",
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    }, {
      name: "controller",
      script: "./services/controller.service.js",
      instances: 2,
      autorestart: true,
      watch: "./services/controller.service.js",
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exec_mode: "cluster",
      env: {
        NODE_ENV: node_env
      }
    }, {
      name: "queuer",
      script: "./scripts/start-queuer.sh",
      instances: 1,
      autorestart: true,
      watch: [
        "./services/queuer.service.js", "./common/datastore.js", "./common/*"
      ],
      kill_timeout: 10000,
      env: {
        NODE_ENV: node_env
      }
    }, {
      name: "stealer",
      script: "./scripts/start-stealer.sh",
      instances: 1,
      autorestart: true,
      watch: "./services/stealer.service.js",
      kill_timeout: 10000,
      env: {
        NODE_ENV: node_env
      }
    }, {
      name: "nats-local",
      script: "./scripts/start-nats-local.sh",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    }, {
      name: "nats-remote",
      script: "./scripts/start-nats-remote.sh",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    }, {
      name: "nats-local-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:8222 --port 8223",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    }, {
      name: "nats-remote-board",
      script: "./node_modules/.bin/natsboard",
      args: "--nats-mon-url http://localhost:9222 --port 9223",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G"
    }, {
      name: "minio",
      script: "./scripts/start-minio.sh",
      autorestart: true
    }, {
      name: "consul",
      script: "./scripts/start-consul.sh",
      autorestart: true
    }
  ]
};
