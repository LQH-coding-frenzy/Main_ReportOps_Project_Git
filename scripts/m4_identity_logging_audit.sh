#!/usr/bin/env bash
set -u

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Automated Audit Script
# Part M4: Identity, Logging and Audit Trail
# Assignee: Phước
# NOTE: Output format adapter for ReportOps CIS-style parser.
#       Original audit logic by Phước is preserved verbatim — only output
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

# =========================================================
# 5.3.2.2 - Ensure pam_faillock is enabled
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_5_3_2_2() {
  local id="5.3.2.2"
  local title="Ensure pam_faillock module is enabled"

  if grep -Pqs -- 'pam_faillock\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    print_pass "$id" "$title" " - pam_faillock is configured in PAM stack."
  else
    print_fail "$id" "$title" " - pam_faillock is not configured in /etc/pam.d/system-auth or /etc/pam.d/password-auth."
  fi
}

# =========================================================
# 5.3.2.3 - Ensure pam_pwquality is enabled
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_5_3_2_3() {
  local id="5.3.2.3"
  local title="Ensure pam_pwquality module is enabled"

  if grep -Pqs -- 'pam_pwquality\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    print_pass "$id" "$title" " - pam_pwquality is configured in PAM stack."
  else
    print_fail "$id" "$title" " - pam_pwquality is not configured in /etc/pam.d/system-auth or /etc/pam.d/password-auth."
  fi
}

# =========================================================
# 5.3.2.4 - Ensure pam_pwhistory is enabled
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_5_3_2_4() {
  local id="5.3.2.4"
  local title="Ensure pam_pwhistory module is enabled"

  if grep -Pqs -- 'pam_pwhistory\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    print_pass "$id" "$title" " - pam_pwhistory is configured in PAM stack."
  else
    print_fail "$id" "$title" " - pam_pwhistory is not configured in /etc/pam.d/system-auth or /etc/pam.d/password-auth."
  fi
}

# =========================================================
# 5.4.1.1 - Ensure password expiration is configured
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_5_4_1_1() {
  local id="5.4.1.1"
  local title="Ensure password expiration is configured"

  local max_days
  local warn_age
  max_days=$(grep -E '^\s*PASS_MAX_DAYS' /etc/login.defs | awk '{print $2}')
  warn_age=$(grep -E '^\s*PASS_WARN_AGE' /etc/login.defs | awk '{print $2}')

  if [[ -n "$max_days" && "$max_days" -le 365 ]] && \
     [[ -n "$warn_age" && "$warn_age" -ge 7 ]]; then
    print_pass "$id" "$title" \
      " - PASS_MAX_DAYS=$max_days (<=365)" \
      " - PASS_WARN_AGE=$warn_age (>=7)"
  else
    print_fail "$id" "$title" \
      " - PASS_MAX_DAYS='${max_days:-not set}' (required: <=365)" \
      " - PASS_WARN_AGE='${warn_age:-not set}' (required: >=7)"
  fi
}

# =========================================================
# 5.4.2.1 - Ensure root is the only UID 0 account
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_5_4_2_1() {
  local id="5.4.2.1"
  local title="Ensure root is the only UID 0 account"

  local uid0_accounts
  uid0_accounts=$(awk -F: '($3 == 0) { print $1 }' /etc/passwd)
  local uid0_count
  uid0_count=$(echo "$uid0_accounts" | wc -l)

  if [[ "$uid0_count" -eq 1 ]]; then
    print_pass "$id" "$title" " - root is the only UID 0 account."
  else
    print_fail "$id" "$title" " - Multiple UID 0 accounts detected: $uid0_accounts"
  fi
}

# =========================================================
# 6.2.1.1 - Ensure journald service is enabled and active
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_6_2_1_1() {
  local id="6.2.1.1"
  local title="Ensure journald service is enabled and active"

  local journald_enabled
  local journald_active
  journald_enabled=$(systemctl is-enabled systemd-journald 2>/dev/null)
  journald_active=$(systemctl is-active systemd-journald 2>/dev/null)

  if [[ "$journald_enabled" == "static" || "$journald_enabled" == "enabled" ]] && \
     [[ "$journald_active" == "active" ]]; then
    print_pass "$id" "$title" \
      " - systemd-journald is enabled (state: $journald_enabled) and active."
  else
    print_fail "$id" "$title" \
      " - systemd-journald enabled='$journald_enabled', active='$journald_active'."
  fi
}

# =========================================================
# 6.2.3.2 - Ensure rsyslog service is enabled and active
# Logic by Phước — format adapted for ReportOps parser
# =========================================================
check_6_2_3_2() {
  local id="6.2.3.2"
  local title="Ensure rsyslog service is enabled and active"

  local rsyslog_enabled
  local rsyslog_active
  rsyslog_enabled=$(systemctl is-enabled rsyslog 2>/dev/null)
  rsyslog_active=$(systemctl is-active rsyslog 2>/dev/null)

  if [[ "$rsyslog_enabled" == "enabled" ]] && \
     [[ "$rsyslog_active" == "active" ]]; then
    print_pass "$id" "$title" " - rsyslog is enabled and active."
  else
    print_fail "$id" "$title" \
      " - rsyslog enabled='$rsyslog_enabled', active='$rsyslog_active'."
  fi
}

echo "## M4 Identity, Logging and Audit Trail"

should_run_control "5.3.2.2" && check_5_3_2_2
should_run_control "5.3.2.3" && check_5_3_2_3
should_run_control "5.3.2.4" && check_5_3_2_4
should_run_control "5.4.1.1" && check_5_4_1_1
should_run_control "5.4.2.1" && check_5_4_2_1
should_run_control "6.2.1.1" && check_6_2_1_1
should_run_control "6.2.3.2" && check_6_2_3_2

section_summary
exit 0
