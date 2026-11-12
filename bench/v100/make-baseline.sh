#!/bin/sh
# The 9.10 engines, frozen for the 10.0 comparison: lib/ exactly as released in 9.10 (commit af55f74), extracted from
# git into bench/v100/baseline-v910/ (not committed: it is the same code as that commit).
set -e
cd "$(dirname "$0")/../.."
rm -rf bench/v100/baseline-v910 && mkdir -p bench/v100/baseline-v910
git archive af55f74 lib | tar -x -C bench/v100/baseline-v910
echo "baseline 9.10 → bench/v100/baseline-v910/lib"
