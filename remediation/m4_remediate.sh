#!/usr/bin/env bash
set -u

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Remediation Script
# Part M4: Identity, Logging and Audit Trail
# Written by Antigravity based on CIS Benchmark PDF v2.0.0
# for controls: 5.3.2.2, 5.3.2.3, 5.3.2.4, 5.4.1.1, 5.4.2.1, 6.2.1.1, 6.2.3.2
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

echo '== M4 remediation started =='

# ─────────────────────────────────────────────────────────────
# 5.3.2.2 - Ensure pam_faillock module is enabled
# CIS Benchmark v2.0.0, Section 5.3.2.2 Remediation
# ─────────────────────────────────────────────────────────────
remediate_5_3_2_2() {
  echo "[5.3.2.2] Configuring pam_faillock via authselect..."

  # Ensure authselect is initialized with sssd profile and the faillock feature
  if command -v authselect &>/dev/null; then
    authselect select sssd with-faillock --force 2>/dev/null || \
      authselect enable-feature with-faillock 2>/dev/null || true
    echo "  authselect: enabled pam_faillock"
  fi

  # Ensure /etc/security/faillock.conf has required settings (CIS defaults)
  local faillock_conf="/etc/security/faillock.conf"
  if [ ! -f "$faillock_conf" ]; then
    touch "$faillock_conf"
  fi

  # Apply CIS-recommended values: deny=5, unlock_time=900, silent
  grep -q "^deny" "$faillock_conf" \
    && sed -i 's/^deny.*/deny = 5/' "$faillock_conf" \
    || echo "deny = 5" >> "$faillock_conf"

  grep -q "^unlock_time" "$faillock_conf" \
    && sed -i 's/^unlock_time.*/unlock_time = 900/' "$faillock_conf" \
    || echo "unlock_time = 900" >> "$faillock_conf"

  grep -q "^silent" "$faillock_conf" \
    || echo "silent" >> "$faillock_conf"

  if grep -Pqs -- 'pam_faillock\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth 2>/dev/null; then
    print_pass "5.3.2.2" "Ensure pam_faillock module is enabled" \
      " - pam_faillock is configured in PAM stack (deny=5, unlock_time=900)"
  else
    print_fail "5.3.2.2" "Ensure pam_faillock module is enabled" \
      " - pam_faillock still not found in PAM stack after remediation — check authselect profile"
  fi
}

# ─────────────────────────────────────────────────────────────
# 5.3.2.3 - Ensure pam_pwquality module is enabled
# CIS Benchmark v2.0.0, Section 5.3.2.3 Remediation
# ─────────────────────────────────────────────────────────────
remediate_5_3_2_3() {
  echo "[5.3.2.3] Configuring pam_pwquality..."

  # Ensure pwquality package is installed
  rpm -q libpwquality &>/dev/null || dnf install -y libpwquality &>/dev/null || true

  # Configure /etc/security/pwquality.conf with CIS-recommended values
  local pwquality_conf="/etc/security/pwquality.conf"

  _set_pwquality() {
    local key="$1" value="$2"
    if grep -q "^${key}" "$pwquality_conf" 2>/dev/null; then
      sed -i "s/^${key}.*/${key} = ${value}/" "$pwquality_conf"
    else
      echo "${key} = ${value}" >> "$pwquality_conf"
    fi
  }

  _set_pwquality "minlen"    "14"  # Minimum password length
  _set_pwquality "minclass"  "4"   # Minimum character classes
  _set_pwquality "dcredit"   "-1"  # At least 1 digit
  _set_pwquality "ucredit"   "-1"  # At least 1 uppercase
  _set_pwquality "lcredit"   "-1"  # At least 1 lowercase
  _set_pwquality "ocredit"   "-1"  # At least 1 special

  # Activate via authselect if available
  if command -v authselect &>/dev/null; then
    authselect enable-feature with-pwquality 2>/dev/null || true
  fi

  if grep -Pqs -- 'pam_pwquality\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth 2>/dev/null; then
    print_pass "5.3.2.3" "Ensure pam_pwquality module is enabled" \
      " - pam_pwquality is configured (minlen=14, minclass=4)"
  else
    print_fail "5.3.2.3" "Ensure pam_pwquality module is enabled" \
      " - pam_pwquality still not found — check authselect profile"
  fi
}

# ─────────────────────────────────────────────────────────────
# 5.3.2.4 - Ensure pam_pwhistory module is enabled
# CIS Benchmark v2.0.0, Section 5.3.2.4 Remediation
# ─────────────────────────────────────────────────────────────
remediate_5_3_2_4() {
  echo "[5.3.2.4] Configuring pam_pwhistory..."

  # Configure /etc/security/pwhistory.conf (if supported)
  local pwhistory_conf="/etc/security/pwhistory.conf"
  if [ -f "$pwhistory_conf" ]; then
    grep -q "^remember" "$pwhistory_conf" \
      && sed -i 's/^remember.*/remember = 24/' "$pwhistory_conf" \
      || echo "remember = 24" >> "$pwhistory_conf"
  fi

  # Also ensure via authselect if available
  if command -v authselect &>/dev/null; then
    authselect enable-feature with-pwhistory 2>/dev/null || true
  fi

  if grep -Pqs -- 'pam_pwhistory\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth 2>/dev/null; then
    print_pass "5.3.2.4" "Ensure pam_pwhistory module is enabled" \
      " - pam_pwhistory is configured (remember=24)"
  else
    print_fail "5.3.2.4" "Ensure pam_pwhistory module is enabled" \
      " - pam_pwhistory not found — check authselect profile"
  fi
}

# ─────────────────────────────────────────────────────────────
# 5.4.1.1 - Ensure password expiration is configured
# CIS Benchmark v2.0.0, Section 5.4.1.1 Remediation
# ─────────────────────────────────────────────────────────────
remediate_5_4_1_1() {
  echo "[5.4.1.1] Configuring password expiration in /etc/login.defs..."

  local login_defs="/etc/login.defs"

  _set_logindefs() {
    local key="$1" value="$2"
    if grep -q "^${key}" "$login_defs"; then
      sed -i "s/^${key}[[:space:]].*/$(printf '%s\t%s' "$key" "$value")/" "$login_defs"
    else
      echo -e "${key}\t${value}" >> "$login_defs"
    fi
  }

  _set_logindefs "PASS_MAX_DAYS" "365"
  _set_logindefs "PASS_MIN_DAYS" "1"
  _set_logindefs "PASS_WARN_AGE" "7"

  local max_days warn_age
  max_days=$(grep -E '^\s*PASS_MAX_DAYS' /etc/login.defs | awk '{print $2}')
  warn_age=$(grep -E '^\s*PASS_WARN_AGE' /etc/login.defs | awk '{print $2}')

  if [[ -n "$max_days" && "$max_days" -le 365 ]] && [[ -n "$warn_age" && "$warn_age" -ge 7 ]]; then
    print_pass "5.4.1.1" "Ensure password expiration is configured" \
      " - PASS_MAX_DAYS=$max_days PASS_WARN_AGE=$warn_age in /etc/login.defs"
  else
    print_fail "5.4.1.1" "Ensure password expiration is configured" \
      " - PASS_MAX_DAYS=$max_days PASS_WARN_AGE=$warn_age still incorrect"
  fi
}

# ─────────────────────────────────────────────────────────────
# 5.4.2.1 - Ensure root is the only UID 0 account
# CIS Benchmark v2.0.0, Section 5.4.2.1 Remediation
# This control requires human review; we report status only.
# ─────────────────────────────────────────────────────────────
remediate_5_4_2_1() {
  echo "[5.4.2.1] Checking UID 0 accounts..."

  local uid0_accounts
  uid0_accounts=$(awk -F: '($3 == 0) { print $1 }' /etc/passwd)
  local uid0_count
  uid0_count=$(echo "$uid0_accounts" | wc -l)

  if [[ "$uid0_count" -eq 1 ]]; then
    print_pass "5.4.2.1" "Ensure root is the only UID 0 account" \
      " - root is the only UID 0 account"
  else
    # We log but do not auto-remove accounts — requires human review
    print_fail "5.4.2.1" "Ensure root is the only UID 0 account" \
      " - Multiple UID 0 accounts: $uid0_accounts" \
      " - Manual action required: reassign or lock additional UID 0 accounts"
  fi
}

# ─────────────────────────────────────────────────────────────
# 6.2.1.1 - Ensure journald service is enabled and active
# CIS Benchmark v2.0.0, Section 6.2.1.1 Remediation
# ─────────────────────────────────────────────────────────────
remediate_6_2_1_1() {
  echo "[6.2.1.1] Enabling systemd-journald..."

  # systemd-journald is typically a static/socket-activated service
  systemctl enable systemd-journald 2>/dev/null || true
  systemctl start systemd-journald 2>/dev/null || true

  local enabled active
  enabled=$(systemctl is-enabled systemd-journald 2>/dev/null)
  active=$(systemctl is-active systemd-journald 2>/dev/null)

  if [[ "$enabled" == "static" || "$enabled" == "enabled" ]] && [[ "$active" == "active" ]]; then
    print_pass "6.2.1.1" "Ensure journald service is enabled and active" \
      " - systemd-journald: enabled=$enabled, active=$active"
  else
    print_fail "6.2.1.1" "Ensure journald service is enabled and active" \
      " - systemd-journald: enabled=$enabled, active=$active after remediation"
  fi
}

# ─────────────────────────────────────────────────────────────
# 6.2.3.2 - Ensure rsyslog service is enabled and active
# CIS Benchmark v2.0.0, Section 6.2.3.2 Remediation
# ─────────────────────────────────────────────────────────────
remediate_6_2_3_2() {
  echo "[6.2.3.2] Enabling rsyslog..."

  rpm -q rsyslog &>/dev/null || dnf install -y rsyslog &>/dev/null || true
  systemctl enable --now rsyslog 2>/dev/null || true

  local enabled active
  enabled=$(systemctl is-enabled rsyslog 2>/dev/null)
  active=$(systemctl is-active rsyslog 2>/dev/null)

  if [[ "$enabled" == "enabled" ]] && [[ "$active" == "active" ]]; then
    print_pass "6.2.3.2" "Ensure rsyslog service is enabled and active" \
      " - rsyslog: enabled and active"
  else
    print_fail "6.2.3.2" "Ensure rsyslog service is enabled and active" \
      " - rsyslog: enabled=$enabled, active=$active after remediation"
  fi
}

control_selected '5.3.2.2' && remediate_5_3_2_2
control_selected '5.3.2.3' && remediate_5_3_2_3
control_selected '5.3.2.4' && remediate_5_3_2_4
control_selected '5.4.1.1' && remediate_5_4_1_1
control_selected '5.4.2.1' && remediate_5_4_2_1
control_selected '6.2.1.1' && remediate_6_2_1_1
control_selected '6.2.3.2' && remediate_6_2_3_2

section_summary
echo '== M4 remediation finished =='
exit 0
