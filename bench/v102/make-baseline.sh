#!/bin/sh
# The 10.1 engines, frozen for the 10.2 comparison: lib/ exactly as released in 10.1 (commit 4dc3523), extracted from
# git into bench/v102/baseline-v101/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v102/baseline-v101 && mkdir -p bench/v102/baseline-v101
git archive 4dc3523 lib | tar -x -C bench/v102/baseline-v101
echo "baseline 10.1 → bench/v102/baseline-v101/lib"
