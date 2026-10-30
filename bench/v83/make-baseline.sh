#!/bin/sh
# The 8.2 engines, frozen for the 8.3 comparison: lib/ exactly as released in 8.2 (commit 54f7abc), extracted from git
# into bench/v83/baseline-v82/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v83/baseline-v82 && mkdir -p bench/v83/baseline-v82
git archive 54f7abc lib | tar -x -C bench/v83/baseline-v82
echo "baseline 8.2 → bench/v83/baseline-v82/lib"
