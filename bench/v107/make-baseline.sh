#!/bin/sh
# The 10.6 engines, frozen for the 10.7 (daftar bertanggal) comparison: lib/ exactly as released in 10.6 (commit
# 8855bf8), extracted from git into bench/v107/baseline-v106/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v107/baseline-v106 && mkdir -p bench/v107/baseline-v106
git archive 8855bf8 lib | tar -x -C bench/v107/baseline-v106
echo "baseline 10.6 → bench/v107/baseline-v106/lib"
