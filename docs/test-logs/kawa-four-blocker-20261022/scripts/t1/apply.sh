#!/bin/sh
cd /tmp/mig || exit 1
n=0
for f in $(ls *.sql | sort); do
  n=$((n+1))
  out=$(psql -U postgres -d postgres -h 127.0.0.1 -v ON_ERROR_STOP=1 -q -f "$f" 2>&1)
  if [ $? -ne 0 ]; then echo "FAILED at #$n $f"; echo "$out" | tail -8; exit 1; fi
done
echo "applied $n migrations"
