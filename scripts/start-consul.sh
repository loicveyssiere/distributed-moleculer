#/bin/sh

PATH_PROJECT="$(dirname "$0")"/../
cd $PATH_PROJECT

# dev conf
CONSUL_IP=$(internal-ip --ipv4)
CONSUL_MASTERS=( $CONSUL_IP )

# override for production
[ -f ./start.conf ] && source ./start.conf

# compute
QUORUM=${#CONSUL_MASTERS[@]}
QUORUM=$((1+QUORUM/2))
ISMASTER=
echo " ${CONSUL_MASTERS[@]} " | grep -q " $CONSUL_IP " && ISMASTER=1
RETRY=
for i in ${CONSUL_MASTERS[@]}; do
  RETRY="$RETRY -retry-join $i"
done

# run
pkill consul
set -x
if [ -n "$ISMASTER" ]; then
  consul agent -bind $CONSUL_IP -config-file ./config/consul/consul.json $RETRY -server -bootstrap-expect $QUORUM "$@"
else
  consul agent -bind $CONSUL_IP -config-file ./config/consul/consul.json $RETRY "$@"
fi
