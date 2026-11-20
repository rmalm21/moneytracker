#!/bin/sh
# The 10.3.3 engines, frozen for the 10.4 (Asisten chat 4.5) comparison: lib/ exactly as released in 10.3.3 (commit
# 3cef884), extracted from git into bench/v104/baseline-v1033/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v104/baseline-v1033 && mkdir -p bench/v104/baseline-v1033
git archive 3cef884 lib | tar -x -C bench/v104/baseline-v1033
echo "baseline 10.3.3 → bench/v104/baseline-v1033/lib"
