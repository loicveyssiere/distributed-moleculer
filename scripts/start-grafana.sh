#/bin/sh

PATH_PROJECT="$(cd "$(dirname "$0")"/..; pwd)"
PATH_PROJECT=$PATH_PROJECT
export PATH_PROJECT=$PATH_PROJECT
cd $PATH_PROJECT

grafana-server\
  --config=${PATH_PROJECT}/config/elastic/grafana/grafana.ini\
  --homepath /usr/local/share/grafana\
  --packaging=brew\
  cfg:default.paths.logs=${PATH_PROJECT}/tmp/logs/grafana\
  cfg:default.paths.data=${PATH_PROJECT}/tmp/grafana/data\
  cfg:default.paths.plugins=${PATH_PROJECT}/tmp/grafana/plugins