var node_env = process.env.NODE_ENV || "production"

module.exports = {
  apps: [
    {
      name: "filebeat",
      script: "./scripts/start-filebeat.sh",
      instances: 1,
      autorestart: true,
      watch: ["./scripts/start-filebeat.sh"],
      max_memory_restart: "1G"
    }, {
        name: "logstash",
        script: "./scripts/start-logstash.sh",
        instances: 1,
        autorestart: true,
        watch: ["./scripts/start-logstash.sh"],
        max_memory_restart: "1G"
    }, {
        name: "elasticsearch",
        script: "./scripts/start-elasticsearch.sh",
        instances: 1,
        autorestart: true,
        watch: ["./scripts/start-elasticsearch.sh"],
        max_memory_restart: "1G"
    }, {
        name: "kibana",
        script: "./scripts/start-kibana.sh",
        instances: 1,
        autorestart: false,
        watch: ["./scripts/start-kibana.sh"],
        max_memory_restart: "1G"
    }
  ]
};
