#!/usr/bin/env bash
# Reproduce every measured MonoQube MVP metric. Needs python3 + cryptography (pip install cryptography).
set -e
cd "$(dirname "$0")/src"
python3 bench.py
python3 bench_extra.py
echo "Results in ../results/*.json"
