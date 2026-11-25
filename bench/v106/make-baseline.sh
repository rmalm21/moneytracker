#!/bin/sh
# The 10.5 engines, frozen for the 10.6 (Asisten chat 5.0) comparison: lib/ exactly as released in 10.5 (commit
# d7c4403), extracted from git into bench/v106/baseline-v105/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v106/baseline-v105 && mkdir -p bench/v106/baseline-v105
git archive d7c4403 lib | tar -x -C bench/v106/baseline-v105
echo "baseline 10.5 → bench/v106/baseline-v105/lib"
