#/bin/sh

PATH_PROJECT="$(dirname "$0")"/../
cd $PATH_PROJECT

filebeat -c "filebeat.yml" --path.config $PATH_PROJECT/config/elastic -e