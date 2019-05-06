#/bin/sh

PATH_PROJECT="$(dirname "$0")"/../
cd $PATH_PROJECT

logstash --path.settings $PATH_PROJECT/config/elastic/logstash --config.reload.automatic