#!/bin/sh
# The 10.3 engines, frozen for the 10.3.1 comparison: lib/ exactly as released in 10.3 (commit 59585e1), extracted from
# git into bench/v1031/baseline-v103/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v1031/baseline-v103 && mkdir -p bench/v1031/baseline-v103
git archive 59585e1 lib | tar -x -C bench/v1031/baseline-v103
echo "baseline 10.3 → bench/v1031/baseline-v103/lib"
