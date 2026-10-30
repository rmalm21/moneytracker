#!/bin/sh
# The 8.0 engines, frozen for the 8.1 comparison: lib/ exactly as released in 8.0 (commit 970b124), extracted from git
# into bench/v81/baseline-v80/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v81/baseline-v80 && mkdir -p bench/v81/baseline-v80
git archive 970b124 lib | tar -x -C bench/v81/baseline-v80
echo "baseline 8.0 → bench/v81/baseline-v80/lib"
