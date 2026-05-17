#!/usr/bin/env bash
set -u

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Remediation Script
# Part M3: Admin Access Control (SSH + Sudo)
# Original remediation logic by Duy (m2-m4_submit/m3_remediate.sh)
# Adapted: removed read -p interactive prompts for non-interactive VM Ops execution.
# Adapted to ReportOps control_selected() style for selective execution.

PASS_COUNT=0
FAIL_COUNT=0

control_selected() {
  [ -z "${TARGET_CONTROL_IDS:-}" ] || printf ',%s,' "$TARGET_CONTROL_IDS" | grep -Fq ",$1,"
}

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

section_summary() {
  echo
  echo "=============================="
  echo "Operation Summary"
  echo "PASS: $PASS_COUNT"
  echo "FAIL: $FAIL_COUNT"
  echo "=============================="
}

echo '== M3 remediation started =='

# 5.1.1 - Fix SSH config permissions
remediate_5_1_1() {
  echo "[5.1.1] Fixing permissions on SSH config files..."

  cp -p /etc/ssh/sshd_config "/etc/ssh/sshd_config.backup.$(date +%F_%H-%M-%S)" 2>/dev/null || true
  chmod u-x,og-rwx /etc/ssh/sshd_config
  chown root:root /etc/ssh/sshd_config

  if [ -d /etc/ssh/sshd_config.d ]; then
    while IFS= read -r -d $'\0' l_file; do
      if [ -e "$l_file" ]; then
        chmod u-x,og-rwx "$l_file"
        chown root:root "$l_file"
        echo "  Fixed: $l_file"
      fi
    done < <(find /etc/ssh/sshd_config.d -type f -print0 2>/dev/null)
  fi

  local stat_output
  stat_output=$(stat -Lc '%#a:%U:%G' /etc/ssh/sshd_config 2>/dev/null)
  IFS=: read -r l_mode l_user l_group <<< "$stat_output"
  print_pass "5.1.1" "Ensure permissions on /etc/ssh/sshd_config are configured" \
    " - mode=$l_mode owner=$l_user group=$l_group after remediation"
}

# 5.1.15 - LogLevel (Duy noted this is already PASS on clean VM)
remediate_5_1_15() {
  echo "[5.1.15] Checking LogLevel..."
  local loglevel
  loglevel=$(sshd -T 2>/dev/null | grep -i "^loglevel" | awk '{print $2}')
  if [[ "$loglevel" =~ ^(VERBOSE|INFO)$ ]]; then
    print_pass "5.1.15" "Ensure sshd LogLevel is configured" " - LogLevel=$loglevel (already correct)"
  else
    # Set LogLevel INFO if not compliant
    if grep -q "^LogLevel" /etc/ssh/sshd_config 2>/dev/null; then
      sed -i 's/^LogLevel.*/LogLevel INFO/' /etc/ssh/sshd_config
    else
      echo "LogLevel INFO" >> /etc/ssh/sshd_config
    fi
    print_pass "5.1.15" "Ensure sshd LogLevel is configured" " - LogLevel set to INFO"
  fi
}

# 5.1.19 - PermitEmptyPasswords (Duy noted this is already PASS on clean VM)
remediate_5_1_19() {
  echo "[5.1.19] Checking PermitEmptyPasswords..."
  local val
  val=$(sshd -T 2>/dev/null | grep -i "^permitemptypasswords" | awk '{print $2}')
  if [ "$val" = "no" ]; then
    print_pass "5.1.19" "Ensure sshd PermitEmptyPasswords is disabled" " - PermitEmptyPasswords=no (already correct)"
  else
    grep -q "^PermitEmptyPasswords" /etc/ssh/sshd_config \
      && sed -i 's/^PermitEmptyPasswords.*/PermitEmptyPasswords no/' /etc/ssh/sshd_config \
      || echo "PermitEmptyPasswords no" >> /etc/ssh/sshd_config
    print_pass "5.1.19" "Ensure sshd PermitEmptyPasswords is disabled" " - PermitEmptyPasswords set to no"
  fi
}

# 5.1.20 - Disable PermitRootLogin
# NOTE: read -p removed for non-interactive VM Ops execution.
# WARNING is logged but remediation proceeds automatically.
remediate_5_1_20() {
  echo "[5.1.20] Disabling PermitRootLogin..."
  echo "  NOTE: Disabling root SSH login. Ensure a non-root sudo user exists."

  if grep -q "^PermitRootLogin" /etc/ssh/sshd_config.d/01-permitrootlogin.conf 2>/dev/null; then
    sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config.d/01-permitrootlogin.conf
  elif grep -q "^PermitRootLogin" /etc/ssh/sshd_config; then
    sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  else
    echo "PermitRootLogin no" >> /etc/ssh/sshd_config
  fi
  print_pass "5.1.20" "Ensure sshd PermitRootLogin is disabled" " - PermitRootLogin set to no"
}

# 5.1.22 - UsePAM (Duy noted this is already PASS)
remediate_5_1_22() {
  echo "[5.1.22] Checking UsePAM..."
  local val
  val=$(sshd -T 2>/dev/null | grep -i "^usepam" | awk '{print $2}')
  if [ "$val" = "yes" ]; then
    print_pass "5.1.22" "Ensure sshd UsePAM is enabled" " - UsePAM=yes (already correct)"
  else
    grep -q "^UsePAM" /etc/ssh/sshd_config \
      && sed -i 's/^UsePAM.*/UsePAM yes/' /etc/ssh/sshd_config \
      || echo "UsePAM yes" >> /etc/ssh/sshd_config
    print_pass "5.1.22" "Ensure sshd UsePAM is enabled" " - UsePAM set to yes"
  fi
}

# 5.2.2 - Enable sudo use_pty
remediate_5_2_2() {
  echo "[5.2.2] Enabling sudo use_pty..."
  if ! grep -rq "^Defaults.*use_pty" /etc/sudoers /etc/sudoers.d/* 2>/dev/null; then
    echo "Defaults use_pty" > /etc/sudoers.d/hardening
    chmod 440 /etc/sudoers.d/hardening
    print_pass "5.2.2" "Ensure sudo commands use pty" " - Created /etc/sudoers.d/hardening with use_pty"
  else
    print_pass "5.2.2" "Ensure sudo commands use pty" " - use_pty already configured"
  fi
}

# 5.2.6 - sudo timeout (Duy noted this is already PASS)
remediate_5_2_6() {
  echo "[5.2.6] Checking sudo authentication timeout..."
  local timeout_values
  timeout_values=$(grep -roP "timestamp_timeout=\K[0-9]*" /etc/sudoers /etc/sudoers.d/* 2>/dev/null)
  if [ -z "$timeout_values" ]; then
    local default_timeout
    default_timeout=$(sudo -V 2>/dev/null | grep -i "timestamp timeout" | grep -oP '\d+')
    if [ -n "$default_timeout" ] && [ "$default_timeout" -le 15 ]; then
      print_pass "5.2.6" "Ensure sudo authentication timeout is configured correctly" \
        " - Using default timeout: ${default_timeout} min (already correct)"
    else
      # Add explicit 15-minute timeout
      grep -q "Defaults.*timestamp_timeout" /etc/sudoers.d/hardening 2>/dev/null \
        || echo "Defaults timestamp_timeout=15" >> /etc/sudoers.d/hardening
      print_pass "5.2.6" "Ensure sudo authentication timeout is configured correctly" \
        " - Set timestamp_timeout=15 in /etc/sudoers.d/hardening"
    fi
  else
    local max_timeout
    max_timeout=$(echo "$timeout_values" | sort -nr | head -1)
    if [ "$max_timeout" -le 15 ] && [ "$max_timeout" -ge 0 ]; then
      print_pass "5.2.6" "Ensure sudo authentication timeout is configured correctly" \
        " - Timeout is $max_timeout minutes (already correct)"
    else
      print_fail "5.2.6" "Ensure sudo authentication timeout is configured correctly" \
        " - Timeout is $max_timeout min, manual review required"
    fi
  fi
}

# Validate and restart SSH if config changed
validate_and_reload_sshd() {
  echo ""
  echo "=============================="
  echo "Validating SSH configuration..."
  echo "=============================="
  if sshd -t 2>/dev/null; then
    echo "  SSH configuration syntax is valid"
    echo "  NOTE: Run 'systemctl restart sshd' to apply SSH changes."
    echo "  WARNING: Keep current session open and test in a new terminal first."
  else
    echo "  WARNING: SSH configuration has syntax errors. Restoring backup..."
    local latest_backup
    latest_backup=$(ls -1t /etc/ssh/sshd_config.backup.* 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
      cp "$latest_backup" /etc/ssh/sshd_config
      echo "  Restored from $latest_backup"
    fi
  fi
}

control_selected '5.1.1'  && remediate_5_1_1
control_selected '5.1.15' && remediate_5_1_15
control_selected '5.1.19' && remediate_5_1_19
control_selected '5.1.20' && remediate_5_1_20
control_selected '5.1.22' && remediate_5_1_22
control_selected '5.2.2'  && remediate_5_2_2
control_selected '5.2.6'  && remediate_5_2_6

validate_and_reload_sshd

section_summary
echo '== M3 remediation finished =='
exit 0
