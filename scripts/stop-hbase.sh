#/bin/sh

PATH_PROJECT="$(cd "$(dirname "$0")"/..; pwd)"
PATH_PROJECT=$PATH_PROJECT
export PATH_PROJECT=$PATH_PROJECT
cd $PATH_PROJECT

python2 tmp/hbase/bin/queryserver.py stop
/usr/local/opt/hbase/bin/stop-hbase.sh
