#!/usr/bin/env bash
# ReportOps M1 CIS AlmaLinux OS 9 Audit Script
# Mode: audit-only. This script does not remediate or intentionally change system configuration.
# Output style: CIS-like stdout, suitable for raw evidence + parser normalization.

set -u

pass_count=0
fail_count=0
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
  echo "NOT_APPLICABLE: $na_count"
  echo "ERROR: $error_count"
  echo "=============================="
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }
should_run_control() { [ -z "${TARGET_CONTROL_ID:-}" ] || [ "$TARGET_CONTROL_ID" = "$1" ]; }


echo "## M1 §1.6 System-wide Crypto Policy Audit"

audit_1_6_1() {
  policy="$(update-crypto-policies --show 2>/dev/null || true)"
  if [ -n "$policy" ] && [ "$policy" != "LEGACY" ]; then
    print_pass "1.6.1" "Ensure system wide crypto policy is not set to legacy" " - current crypto policy is $policy"
  else
    print_fail "1.6.1" "Ensure system wide crypto policy is not set to legacy" " - current crypto policy is '${policy:-unknown}', expected not LEGACY"
  fi
}

audit_1_6_2() {
  if grep -Riq '^\s*CRYPTO_POLICY\s*=' /etc/sysconfig/sshd /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null; then
    print_fail "1.6.2" "Ensure system wide crypto policy is not set in sshd configuration" " - CRYPTO_POLICY override was found in sshd-related configuration"
  else
    print_pass "1.6.2" "Ensure system wide crypto policy is not set in sshd configuration" " - no sshd CRYPTO_POLICY override found"
  fi
}

audit_1_6_3() {
  current_pol="/etc/crypto-policies/state/CURRENT.pol"
  if [ -r "$current_pol" ]; then
    if grep -Piq '(^|[^A-Z0-9_])SHA1([^A-Z0-9_]|$)' "$current_pol"; then
      print_fail "1.6.3" "Ensure system wide crypto policy disables sha1 hash and signature support" " - SHA1 token found in $current_pol; review effective policy"
    else
      print_pass "1.6.3" "Ensure system wide crypto policy disables sha1 hash and signature support" " - SHA1 token not found in $current_pol"
    fi
  else
    print_error "1.6.3" "Ensure system wide crypto policy disables sha1 hash and signature support" " - cannot read $current_pol"
  fi
}

audit_1_6_4() {
  current_pol="/etc/crypto-policies/state/CURRENT.pol"
  if [ -r "$current_pol" ]; then
    if grep -Piq '(HMAC-MD5|UMAC-64|HMAC-SHA1-96)' "$current_pol"; then
      print_fail "1.6.4" "Ensure system wide crypto policy disables macs less than 128 bits" " - weak MAC token found in $current_pol"
    else
      print_pass "1.6.4" "Ensure system wide crypto policy disables macs less than 128 bits" " - common weak MAC tokens not found in $current_pol"
    fi
  else
    print_error "1.6.4" "Ensure system wide crypto policy disables macs less than 128 bits" " - cannot read $current_pol"
  fi
}

audit_1_6_5() {
  current_pol="/etc/crypto-policies/state/CURRENT.pol"
  if [ -r "$current_pol" ]; then
    if grep -Piq 'cipher@SSH\s*=.*CBC' "$current_pol"; then
      print_fail "1.6.5" "Ensure system wide crypto policy disables cbc for ssh" " - SSH CBC cipher appears enabled in $current_pol"
    else
      print_pass "1.6.5" "Ensure system wide crypto policy disables cbc for ssh" " - SSH CBC cipher not found in effective policy"
    fi
  else
    print_error "1.6.5" "Ensure system wide crypto policy disables cbc for ssh" " - cannot read $current_pol"
  fi
}

audit_1_6_6() {
  current_pol="/etc/crypto-policies/state/CURRENT.pol"
  if [ -r "$current_pol" ]; then
    if grep -Piq 'CHACHA20-POLY1305|chacha20-poly1305' "$current_pol"; then
      print_fail "1.6.6" "Ensure system wide crypto policy disables chacha20-poly1305 for ssh" " - chacha20-poly1305 appears in $current_pol"
    else
      print_pass "1.6.6" "Ensure system wide crypto policy disables chacha20-poly1305 for ssh" " - chacha20-poly1305 not found in effective policy"
    fi
  else
    print_error "1.6.6" "Ensure system wide crypto policy disables chacha20-poly1305 for ssh" " - cannot read $current_pol"
  fi
}

audit_1_6_7() {
  current_pol="/etc/crypto-policies/state/CURRENT.pol"
  if [ -r "$current_pol" ]; then
    if grep -Piq 'mac@SSH\s*=.*-etm' "$current_pol"; then
      print_fail "1.6.7" "Ensure system wide crypto policy disables EtM for ssh" " - EtM MAC appears in $current_pol"
    else
      print_pass "1.6.7" "Ensure system wide crypto policy disables EtM for ssh" " - EtM MAC not found in effective policy"
    fi
  else
    print_error "1.6.7" "Ensure system wide crypto policy disables EtM for ssh" " - cannot read $current_pol"
  fi
}

should_run_control "1.6.1" && audit_1_6_1
should_run_control "1.6.2" && audit_1_6_2
should_run_control "1.6.3" && audit_1_6_3
should_run_control "1.6.4" && audit_1_6_4
should_run_control "1.6.5" && audit_1_6_5
should_run_control "1.6.6" && audit_1_6_6
should_run_control "1.6.7" && audit_1_6_7

section_summary
