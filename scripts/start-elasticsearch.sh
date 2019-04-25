#/bin/sh

PATH_PROJECT="$(cd "$(dirname "$0")"/..; pwd)"
PATH_PROJECT=$PATH_PROJECT
export PATH_PROJECT=$PATH_PROJECT
cd $PATH_PROJECT

#elasticsearch -Epath.conf=$PATH_PROJECT/config/elastic/elasticsearch
ES_PATH_CONF=$PATH_PROJECT/config/elastic/elasticsearch elasticsearch