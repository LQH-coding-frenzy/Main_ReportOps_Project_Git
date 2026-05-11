#!/usr/bin/env bash
set -u

base_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

for script in \
  "$base_dir/sections/1_1.sh" \
  "$base_dir/sections/1_2.sh" \
  "$base_dir/sections/1_4.sh" \
  "$base_dir/sections/1_5.sh" \
  "$base_dir/sections/1_6.sh" \
  "$base_dir/sections/2_3.sh" \
  "$base_dir/sections/2_4.sh"; do
  echo
  echo "============================================================"
  echo "Running: $script"
  echo "============================================================"
  bash "$script"
done
