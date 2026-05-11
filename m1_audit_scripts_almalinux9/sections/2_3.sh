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


echo "## M1 §2.3 Time Synchronization Audit"

if systemctl is-enabled chronyd >/dev/null 2>&1 && systemctl is-active chronyd >/dev/null 2>&1; then
  print_pass "2.3.1" "Ensure time synchronization is in use" " - chronyd is enabled and active"
else
  print_fail "2.3.1" "Ensure time synchronization is in use" " - chronyd is not both enabled and active"
fi

chrony_sources="$(grep -RhsP '^\s*(server|pool)\s+\S+' /etc/chrony.conf /etc/chrony.d/*.conf 2>/dev/null || true)"
if [ -n "$chrony_sources" ]; then
  print_pass "2.3.2" "Ensure chrony is configured" " - chrony server/pool entries found:" "$chrony_sources"
else
  print_fail "2.3.2" "Ensure chrony is configured" " - no chrony server/pool entries found in /etc/chrony.conf or /etc/chrony.d/*.conf"
fi

chrony_user="$(ps -C chronyd -o user= 2>/dev/null | awk 'NR==1{print $1}' || true)"
if [ -n "$chrony_user" ] && [ "$chrony_user" != "root" ]; then
  print_pass "2.3.3" "Ensure chrony is not run as the root user" " - chronyd is running as user: $chrony_user"
else
  print_fail "2.3.3" "Ensure chrony is not run as the root user" " - chronyd user is '${chrony_user:-not running/unknown}', expected non-root"
fi

section_summary
