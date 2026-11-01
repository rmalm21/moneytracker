#!/bin/sh
# The 8.3.3 engines, frozen for the 8.4 comparison: lib/ exactly as released in 8.3.3 (commit ee8b6e2), extracted from
# git into bench/v84/baseline-v833/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v84/baseline-v833 && mkdir -p bench/v84/baseline-v833
git archive ee8b6e2 lib | tar -x -C bench/v84/baseline-v833
echo "baseline 8.3.3 → bench/v84/baseline-v833/lib"
