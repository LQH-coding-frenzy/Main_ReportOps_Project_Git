#!/usr/bin/env bash
set -u

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Automated Audit Script
# Part M2: Attack Surface Reduction
# Assignee: Bảo
# NOTE: Output format adapter for ReportOps CIS-style parser.
#       Original audit logic by Bảo is preserved verbatim — only output
#       format is adapted to the ### ID - TITLE / ** PASS ** / ** FAIL **
#       style required by the ReportOps cis_stdout parser.

PASS_COUNT=0
FAIL_COUNT=0
ERROR_COUNT=0
NA_COUNT=0

print_pass() {
  local id="$1"
  local title="$2"
  shift 2
  echo
  echo "### $id - $title"
  printf '%s\n' "" "- Audit Result:" " ** PASS **" "$@"
  PASS_COUNT=$((PASS_COUNT + 1))
}

print_fail() {
  local id="$1"
  local title="$2"
  shift 2
  echo
  echo "### $id - $title"
  printf '%s\n' "" "- Audit Result:" " ** FAIL **" " - Reason(s) for audit failure:" "$@"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

print_error() {
  local id="$1"
  local title="$2"
  shift 2
  echo
  echo "### $id - $title"
  printf '%s\n' "" "- Audit Result:" " ** ERROR **" "$@"
  ERROR_COUNT=$((ERROR_COUNT + 1))
}

section_summary() {
  echo
  echo "=============================="
  echo "Audit Summary"
  echo "PASS: $PASS_COUNT"
  echo "FAIL: $FAIL_COUNT"
  echo "ERROR: $ERROR_COUNT"
  echo "NOT_APPLICABLE: $NA_COUNT"
  echo "=============================="
}

should_run_control() {
  [ -z "${TARGET_CONTROL_ID:-}" ] || [ "$TARGET_CONTROL_ID" = "$1" ]
}

# ------------------------------------------------------------------------------
# 1.3.1.1 Ensure SELinux is installed (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_1_3_1_1() {
  local id="1.3.1.1"
  local title="Ensure SELinux is installed"

  if rpm -q libselinux >/dev/null 2>&1; then
    print_pass "$id" "$title" " - Package libselinux is installed."
  else
    print_fail "$id" "$title" " - Package libselinux is not installed."
  fi
}

# ------------------------------------------------------------------------------
# 1.3.1.4 Ensure the SELinux mode is not disabled (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_1_3_1_4() {
  local id="1.3.1.4"
  local title="Ensure the SELinux mode is not disabled"

  if command -v getenforce >/dev/null 2>&1; then
    local selinux_mode
    selinux_mode=$(getenforce 2>/dev/null)
    if [ "$selinux_mode" = "Disabled" ]; then
      print_fail "$id" "$title" " - SELinux mode is currently Disabled."
    else
      print_pass "$id" "$title" " - SELinux mode is not disabled (Current mode: $selinux_mode)."
    fi
  else
    print_fail "$id" "$title" " - Command getenforce not found."
  fi
}

# ------------------------------------------------------------------------------
# 1.3.1.7 Ensure the MCS Translation Service (mcstrans) is not installed (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_1_3_1_7() {
  local id="1.3.1.7"
  local title="Ensure mcstrans is not installed"

  if rpm -q mcstrans >/dev/null 2>&1; then
    print_fail "$id" "$title" " - Package mcstrans is currently installed."
  else
    print_pass "$id" "$title" " - Package mcstrans is not installed."
  fi
}

# ------------------------------------------------------------------------------
# 1.3.1.8 Ensure SETroubleshoot is not installed (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_1_3_1_8() {
  local id="1.3.1.8"
  local title="Ensure SETroubleshoot is not installed"

  if rpm -q setroubleshoot >/dev/null 2>&1; then
    print_fail "$id" "$title" " - Package setroubleshoot is currently installed."
  else
    print_pass "$id" "$title" " - Package setroubleshoot is not installed."
  fi
}

# ------------------------------------------------------------------------------
# 3.3.1 Ensure ip forwarding is disabled (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_3_3_1() {
  local id="3.3.1"
  local title="Ensure ip forwarding is disabled"

  local ipv4_forward
  ipv4_forward=$(sysctl -n net.ipv4.ip_forward 2>/dev/null)
  if [ "$ipv4_forward" = "0" ]; then
    print_pass "$id" "$title" " - net.ipv4.ip_forward is correctly set to 0."
  else
    print_fail "$id" "$title" " - net.ipv4.ip_forward is enabled ($ipv4_forward) or not set."
  fi
}

# ------------------------------------------------------------------------------
# 3.3.7 Ensure reverse path filtering is enabled (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_3_3_7() {
  local id="3.3.7"
  local title="Ensure reverse path filtering is enabled"

  local rp_filter_all
  local rp_filter_default
  rp_filter_all=$(sysctl -n net.ipv4.conf.all.rp_filter 2>/dev/null)
  rp_filter_default=$(sysctl -n net.ipv4.conf.default.rp_filter 2>/dev/null)

  if [ "$rp_filter_all" = "1" ] && [ "$rp_filter_default" = "1" ]; then
    print_pass "$id" "$title" " - rp_filter is set to 1 for both 'all' and 'default'."
  else
    print_fail "$id" "$title" " - rp_filter is not enabled correctly (all=$rp_filter_all, default=$rp_filter_default)."
  fi
}

# ------------------------------------------------------------------------------
# 4.1.1 Ensure nftables is installed (Automated)
# Logic by Bảo — format adapted for ReportOps parser
# ------------------------------------------------------------------------------
check_4_1_1() {
  local id="4.1.1"
  local title="Ensure nftables is installed"

  if rpm -q nftables >/dev/null 2>&1; then
    print_pass "$id" "$title" " - Package nftables is installed."
  else
    print_fail "$id" "$title" " - Package nftables is not installed."
  fi
}

echo "## M2 Attack Surface Audit"

should_run_control "1.3.1.1" && check_1_3_1_1
should_run_control "1.3.1.4" && check_1_3_1_4
should_run_control "1.3.1.7" && check_1_3_1_7
should_run_control "1.3.1.8" && check_1_3_1_8
should_run_control "3.3.1"   && check_3_3_1
should_run_control "3.3.7"   && check_3_3_7
should_run_control "4.1.1"   && check_4_1_1

section_summary
exit 0
