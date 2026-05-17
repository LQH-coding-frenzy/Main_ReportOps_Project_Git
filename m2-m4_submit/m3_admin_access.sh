#!/usr/bin/env bash
set -u

# ============================================
# CIS AlmaLinux 9 Benchmark v2.0.0
# Section M3: Admin Access Control
# Owner: Duy
# ============================================

PASS_COUNT=0
FAIL_COUNT=0
ERROR_COUNT=0
NA_COUNT=0

# Helper functions
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

print_na() {
  local id="$1"
  local title="$2"
  shift 2
  echo
  echo "### $id - $title"
  printf '%s\n' "" "- Audit Result:" " ** NOT_APPLICABLE **" "$@"
  NA_COUNT=$((NA_COUNT + 1))
}

# ============================================
# 5.1.1 - Ensure permissions on /etc/ssh/sshd_config are configured
# ============================================
check_5_1_1() {
  local id="5.1.1"
  local title="Ensure permissions on /etc/ssh/sshd_config are configured"
  
  if [ ! -f /etc/ssh/sshd_config ]; then
    print_error "$id" "$title" " - /etc/ssh/sshd_config not found"
    return
  fi
  
  local perm_mask='0177'
  local maxperm=$(printf '%o' $((0777 & ~$perm_mask)))
  local failures=""
  
  # Check main config file
  local stat_output=$(stat -Lc '%#a:%U:%G' /etc/ssh/sshd_config 2>/dev/null)
  IFS=: read -r l_mode l_user l_group <<< "$stat_output"
  
  if [ $((l_mode & perm_mask)) -gt 0 ]; then
    failures="${failures} - /etc/ssh/sshd_config mode is $l_mode, should be $maxperm or more restrictive\n"
  fi
  
  if [ "$l_user" != "root" ]; then
    failures="${failures} - /etc/ssh/sshd_config is owned by $l_user, should be root\n"
  fi
  
  if [ "$l_group" != "root" ]; then
    failures="${failures} - /etc/ssh/sshd_config is group-owned by $l_group, should be root\n"
  fi
  
  # Check files in sshd_config.d if exists
  if [ -d /etc/ssh/sshd_config.d ]; then
    while IFS= read -r -d $'\0' conf_file; do
      if [ -f "$conf_file" ]; then
        local conf_stat=$(stat -Lc '%#a:%U:%G' "$conf_file" 2>/dev/null)
        IFS=: read -r c_mode c_user c_group <<< "$conf_stat"
        
        if [ $((c_mode & perm_mask)) -gt 0 ]; then
          failures="${failures} - $conf_file mode is $c_mode, should be $maxperm or more restrictive\n"
        fi
        if [ "$c_user" != "root" ]; then
          failures="${failures} - $conf_file is owned by $c_user, should be root\n"
        fi
        if [ "$c_group" != "root" ]; then
          failures="${failures} - $conf_file is group-owned by $c_group, should be root\n"
        fi
      fi
    done < <(find /etc/ssh/sshd_config.d -type f -name "*.conf" -print0 2>/dev/null)
  fi
  
  if [ -n "$failures" ]; then
    print_fail "$id" "$title" "$(echo -e "$failures")"
  else
    print_pass "$id" "$title" " - /etc/ssh/sshd_config: mode ($l_mode), owner ($l_user), group ($l_group) configured correctly"
  fi
}

# ============================================
# 5.1.15 - Ensure sshd LogLevel is configured
# ============================================
check_5_1_15() {
  local id="5.1.15"
  local title="Ensure sshd LogLevel is configured"
  
  if ! command -v sshd &>/dev/null; then
    print_error "$id" "$title" " - sshd command not found"
    return
  fi
  
  local loglevel=$(sshd -T 2>/dev/null | grep -i "^loglevel" | awk '{print $2}')
  
  if [[ "$loglevel" =~ ^(VERBOSE|INFO)$ ]]; then
    print_pass "$id" "$title" " - LogLevel is set to: $loglevel"
  else
    print_fail "$id" "$title" " - LogLevel is '$loglevel', should be VERBOSE or INFO"
  fi
}

# ============================================
# 5.1.19 - Ensure sshd PermitEmptyPasswords is disabled
# ============================================
check_5_1_19() {
  local id="5.1.19"
  local title="Ensure sshd PermitEmptyPasswords is disabled"
  
  if ! command -v sshd &>/dev/null; then
    print_error "$id" "$title" " - sshd command not found"
    return
  fi
  
  local permit_empty=$(sshd -T 2>/dev/null | grep -i "^permitemptypasswords" | awk '{print $2}')
  
  if [ "$permit_empty" = "no" ]; then
    print_pass "$id" "$title" " - PermitEmptyPasswords is set to: no"
  else
    print_fail "$id" "$title" " - PermitEmptyPasswords is '$permit_empty', should be 'no'"
  fi
}

# ============================================
# 5.1.20 - Ensure sshd PermitRootLogin is disabled
# ============================================
check_5_1_20() {
  local id="5.1.20"
  local title="Ensure sshd PermitRootLogin is disabled"
  
  if ! command -v sshd &>/dev/null; then
    print_error "$id" "$title" " - sshd command not found"
    return
  fi
  
  local permit_root=$(sshd -T 2>/dev/null | grep -i "^permitrootlogin" | awk '{print $2}')
  
  if [ "$permit_root" = "no" ]; then
    print_pass "$id" "$title" " - PermitRootLogin is set to: no"
  else
    print_fail "$id" "$title" " - PermitRootLogin is '$permit_root', should be 'no'"
  fi
}

# ============================================
# 5.1.22 - Ensure sshd UsePAM is enabled
# ============================================
check_5_1_22() {
  local id="5.1.22"
  local title="Ensure sshd UsePAM is enabled"
  
  if ! command -v sshd &>/dev/null; then
    print_error "$id" "$title" " - sshd command not found"
    return
  fi
  
  local use_pam=$(sshd -T 2>/dev/null | grep -i "^usepam" | awk '{print $2}')
  
  if [ "$use_pam" = "yes" ]; then
    print_pass "$id" "$title" " - UsePAM is enabled"
  else
    print_fail "$id" "$title" " - UsePAM is '$use_pam', should be 'yes'"
  fi
}

# ============================================
# 5.2.2 - Ensure sudo commands use pty
# ============================================
check_5_2_2() {
  local id="5.2.2"
  local title="Ensure sudo commands use pty"
  
  local use_pty_set=$(grep -rPi '^\h*Defaults\h+([^#\n\r]+,\h*)?use_pty\b' /etc/sudoers /etc/sudoers.d/* 2>/dev/null)
  local use_pty_negated=$(grep -rPi '^\h*Defaults\h+([^#\n\r]+,\h*)?!use_pty\b' /etc/sudoers /etc/sudoers.d/* 2>/dev/null)
  
  if [ -n "$use_pty_set" ] && [ -z "$use_pty_negated" ]; then
    print_pass "$id" "$title" " - use_pty is configured" " - Found in: $(echo "$use_pty_set" | head -1)"
  else
    local reasons=""
    [ -z "$use_pty_set" ] && reasons="${reasons} - use_pty is not set in sudoers\n"
    [ -n "$use_pty_negated" ] && reasons="${reasons} - !use_pty found (negating the setting)\n"
    print_fail "$id" "$title" "$(echo -e "$reasons")"
  fi
}

# ============================================
# 5.2.6 - Ensure sudo authentication timeout is configured correctly
# ============================================
check_5_2_6() {
  local id="5.2.6"
  local title="Ensure sudo authentication timeout is configured correctly"
  
  local timeout_values=$(grep -roP "timestamp_timeout=\K[0-9]*" /etc/sudoers /etc/sudoers.d/* 2>/dev/null)
  
  if [ -z "$timeout_values" ]; then
    # No explicit timeout set, check default
    local default_timeout=$(sudo -V 2>/dev/null | grep -i "timestamp timeout" | grep -oP '\d+')
    if [ -n "$default_timeout" ] && [ "$default_timeout" -le 15 ]; then
      print_pass "$id" "$title" " - Using default timeout: ${default_timeout} minutes (≤15)"
    else
      print_fail "$id" "$title" " - No timeout configured, or default > 15 minutes"
    fi
  else
    local max_timeout=$(echo "$timeout_values" | sort -nr | head -1)
    if [ "$max_timeout" -le 15 ] && [ "$max_timeout" -ge 0 ]; then
      print_pass "$id" "$title" " - Timeout is set to $max_timeout minutes (≤15)"
    else
      print_fail "$id" "$title" " - Timeout is $max_timeout minutes, should be ≤15"
    fi
  fi
}

# ============================================
# Main execution
# ============================================
echo "========================================"
echo "CIS AlmaLinux 9 - M3: Admin Access Control"
echo "Audit started: $(date)"
echo "========================================"

check_5_1_1
check_5_1_15
check_5_1_19
check_5_1_20
check_5_1_22
check_5_2_2
check_5_2_6

echo
echo "========================================"
echo "Audit Summary"
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"
echo "ERROR: $ERROR_COUNT"
echo "NOT_APPLICABLE: $NA_COUNT"
echo "========================================"
echo "Audit completed: $(date)"

exit 0
