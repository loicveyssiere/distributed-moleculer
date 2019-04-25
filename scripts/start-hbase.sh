#/bin/sh

PATH_PROJECT="$(cd "$(dirname "$0")"/..; pwd)"
PATH_PROJECT=$PATH_PROJECT
export PATH_PROJECT=$PATH_PROJECT
cd $PATH_PROJECT

#export HBASE_CONF_DIR=/usr/local/Cellar/hbase/1.2.9/libexec/conf
export HBASE_CONF_DIR=$PATH_PROJECT/tmp/hbase/conf
/usr/local/opt/hbase/bin/start-hbase.sh
python2 $PATH_PROJECT/tmp/hbase/bin/queryserver.py stop
#python2 $PATH_PROJECT/tmp/hbase/bin/queryserver.py start
python2 $PATH_PROJECT/tmp/hbase/bin/queryserver.py