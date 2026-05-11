#!/usr/bin/env bash
# ReportOps M1 CIS AlmaLinux OS 9 Audit Script
# Mode: audit-only. This script does not remediate or intentionally change system configuration.
# Output style: CIS-like stdout, suitable for raw evidence + parser normalization.

set -u

pass_count=0
fail_count=0
manual_count=0
na_count=0
error_count=0

print_pass() {
  local control_id="$1"; shift
  local title="$1"; shift
  echo
  echo "### $control_id - $title"
  printf '%s\n' "" "- Audit Result:" " ** PASS **" "$@"
  pass_count=$((pass_count + 1))
}

print_fail() {
  local control_id="$1"; shift
  local title="$1"; shift
  echo
  echo "### $control_id - $title"
  printf '%s\n' "" "- Audit Result:" " ** FAIL **" " - Reason(s) for audit failure:" "$@"
  fail_count=$((fail_count + 1))
}

print_manual() {
  local control_id="$1"; shift
  local title="$1"; shift
  echo
  echo "### $control_id - $title"
  printf '%s\n' "" "- Audit Result:" " ** REVIEW **" "$@"
  manual_count=$((manual_count + 1))
}

print_na() {
  local control_id="$1"; shift
  local title="$1"; shift
  echo
  echo "### $control_id - $title"
  printf '%s\n' "" "- Audit Result:" " ** NOT_APPLICABLE **" "$@"
  na_count=$((na_count + 1))
}

print_error() {
  local control_id="$1"; shift
  local title="$1"; shift
  echo
  echo "### $control_id - $title"
  printf '%s\n' "" "- Audit Result:" " ** ERROR **" "$@"
  error_count=$((error_count + 1))
}

section_summary() {
  echo
  echo "=============================="
  echo "Section summary"
  echo "PASS: $pass_count"
  echo "FAIL: $fail_count"
  echo "REVIEW: $manual_count"
  echo "NOT_APPLICABLE: $na_count"
  echo "ERROR: $error_count"
  echo "=============================="
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }


echo "## M1 §1.5 Process Hardening Audit"

check_sysctl_value() {
  local control_id="$1"; local title="$2"; local key="$3"; local expected="$4"
  local running
  running="$(sysctl -n "$key" 2>/dev/null || true)"
  local config
  config="$(grep -RhsP "^\s*${key//./\.}\s*=\s*${expected}\b" /etc/sysctl.conf /etc/sysctl.d/*.conf /usr/lib/sysctl.d/*.conf /run/sysctl.d/*.conf 2>/dev/null | tail -n 1 || true)"
  if [ "$running" = "$expected" ] && [ -n "$config" ]; then
    print_pass "$control_id" "$title" " - $key is $running in running configuration" " - persistent config found: $config"
  elif [ "$running" = "$expected" ]; then
    print_fail "$control_id" "$title" " - $key is correct at runtime but no matching persistent config was found"
  else
    print_fail "$control_id" "$title" " - $key is '$running', expected '$expected'"
  fi
}

check_systemd_coredump_value() {
  local control_id="$1"; local title="$2"; local key="$3"; local expected="$4"
  local value
  value="$(grep -RhsPi "^\s*${key}\s*=" /etc/systemd/coredump.conf /etc/systemd/coredump.conf.d/*.conf /usr/lib/systemd/coredump.conf.d/*.conf 2>/dev/null | tail -n 1 | awk -F= '{gsub(/[[:space:]]/,"",$2); print $2}' || true)"
  if [ "$value" = "$expected" ]; then
    print_pass "$control_id" "$title" " - $key is set to $expected"
  else
    print_fail "$control_id" "$title" " - $key is '${value:-not set}', expected '$expected'"
  fi
}

check_sysctl_value "1.5.1" "Ensure address space layout randomization is enabled" "kernel.randomize_va_space" "2"
check_sysctl_value "1.5.2" "Ensure ptrace_scope is restricted" "kernel.yama.ptrace_scope" "1"
check_systemd_coredump_value "1.5.3" "Ensure core dump backtraces are disabled" "ProcessSizeMax" "0"
check_systemd_coredump_value "1.5.4" "Ensure core dump storage is disabled" "Storage" "none"

section_summary
