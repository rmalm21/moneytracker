#!/bin/sh
# The 7.8 engines, frozen for the 7.9 comparison: lib/ exactly as released in 7.8 (commit f9431d4), extracted from git
# into bench/v79/baseline-v78/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v79/baseline-v78 && mkdir -p bench/v79/baseline-v78
git archive f9431d4 lib | tar -x -C bench/v79/baseline-v78
echo "baseline 7.8 → bench/v79/baseline-v78/lib"
