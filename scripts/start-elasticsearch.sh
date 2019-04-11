#/bin/sh

PATH_PROJECT="$(dirname "$0")"/../
cd $PATH_PROJECT

#elasticsearch -Epath.conf=$PATH_PROJECT/config/elastic/elasticsearch
ES_PATH_CONF=$PATH_PROJECT/config/elastic/elasticsearch elasticsearch