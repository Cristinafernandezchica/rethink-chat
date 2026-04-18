#!/bin/sh
# Script para esperar que RethinkDB esté listo

set -e

host="$1"
port="$2"
shift 2
cmd="$@"

until nc -z "$host" "$port"; do
  >&2 echo "RethinkDB no está listo aún - esperando..."
  sleep 2
done

>&2 echo "RethinkDB está listo! Ejecutando comando..."
exec $cmd