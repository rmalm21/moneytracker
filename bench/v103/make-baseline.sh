#!/bin/sh
# The 10.2 engines, frozen for the 10.3 comparison: lib/ exactly as released in 10.2 (commit 07d309a), extracted from
# git into bench/v103/baseline-v102/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v103/baseline-v102 && mkdir -p bench/v103/baseline-v102
git archive 07d309a lib | tar -x -C bench/v103/baseline-v102
echo "baseline 10.2 → bench/v103/baseline-v102/lib"
