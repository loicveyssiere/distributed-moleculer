#/bin/sh

PATH_PROJECT="$(dirname "$0")"/../
cd $PATH_PROJECT

filebeat -c "filebeat.yml" --path.data $PATH_PROJECT/tmp/filebeat --path.config $PATH_PROJECT/config/elastic -e