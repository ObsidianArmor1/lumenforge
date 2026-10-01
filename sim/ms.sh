#!/bin/sh
# Print compact milestone summary for both paths
cd "$(dirname "$0")/.."
for p in "hand" "hearth 1"; do
  echo "== $p"
  node sim/sim.js ${1:-8} $p --log=99999 | grep -E "first supernova|trial t[1-8]|fusion unl|first IRON|first collapse|1e150|INFINITE|3x inf|Missing" | sed 's/^ *//' | tr '\n' '|'
  echo
done
