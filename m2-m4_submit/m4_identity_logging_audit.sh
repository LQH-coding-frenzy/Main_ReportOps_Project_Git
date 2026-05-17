#!/usr/bin/env bash

# =========================================================
# M4 - Identity, Logging and Audit Trail
# CIS AlmaLinux 9
# =========================================================

PASS_COUNT=0
FAIL_COUNT=0

pass() {
    echo "[PASS] $1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
    echo "[FAIL] $1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}
section() {
    echo
    echo "================================================="
    echo "### $1"
    echo "================================================="
}
# =========================================================
# 5.3.2.2 - pam_faillock
# =========================================================
section "5.3.2.2 - Ensure pam_faillock is enabled"

if grep -Pqs -- 'pam_faillock\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    pass "pam_faillock is configured"
else
    fail "pam_faillock is not configured"
fi

# =========================================================
# 5.3.2.3 - pam_pwquality
# =========================================================
section "5.3.2.3 - Ensure pam_pwquality is enabled"

if grep -Pqs -- 'pam_pwquality\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    pass "pam_pwquality is configured"
else
    fail "pam_pwquality is not configured"
fi

# =========================================================
# 5.3.2.4 - pam_pwhistory
# =========================================================
section "5.3.2.4 - Ensure pam_pwhistory is enabled"

if grep -Pqs -- 'pam_pwhistory\.so' /etc/pam.d/system-auth /etc/pam.d/password-auth; then
    pass "pam_pwhistory is configured"
else
    fail "pam_pwhistory is not configured"
fi

# =========================================================
# 5.4.1.1 - Password Expiration
# =========================================================
section "5.4.1.1 - Ensure password expiration is configured"

max_days=$(grep -E '^\s*PASS_MAX_DAYS' /etc/login.defs | awk '{print $2}')
warn_age=$(grep -E '^\s*PASS_WARN_AGE' /etc/login.defs | awk '{print $2}')

if [[ -n "$max_days" && "$max_days" -le 365 ]] && \
   [[ -n "$warn_age" && "$warn_age" -ge 7 ]]; then
    pass "Password expiration policy is configured"
else
    fail "Password expiration policy is not configured correctly"
fi

# =========================================================
# 5.4.2.1 - Root UID 0 Only
# =========================================================
section "5.4.2.1 - Ensure root is the only UID 0 account"

uid0_count=$(awk -F: '($3 == 0) { print $1 }' /etc/passwd | wc -l)

if [[ "$uid0_count" -eq 1 ]]; then
    pass "root is the only UID 0 account"
else
    fail "Multiple UID 0 accounts detected"
fi

# =========================================================
# 6.2.1.1 - Journald
# =========================================================
section "6.2.1.1 - Ensure journald service is enabled and active"

journald_enabled=$(systemctl is-enabled systemd-journald 2>/dev/null)
journald_active=$(systemctl is-active systemd-journald 2>/dev/null)

if [[ "$journald_enabled" == "static" || "$journald_enabled" == "enabled" ]] && \
   [[ "$journald_active" == "active" ]]; then
    pass "systemd-journald is enabled and active"
else
    fail "systemd-journald is not enabled and active"
fi

# =========================================================
# 6.2.3.2 - Rsyslog
# =========================================================
section "6.2.3.2 - Ensure rsyslog service is enabled and active"

rsyslog_enabled=$(systemctl is-enabled rsyslog 2>/dev/null)
rsyslog_active=$(systemctl is-active rsyslog 2>/dev/null)

if [[ "$rsyslog_enabled" == "enabled" ]] && \
   [[ "$rsyslog_active" == "active" ]]; then
    pass "rsyslog is enabled and active"
else
    fail "rsyslog is not enabled and active"
fi

# =========================================================
# SUMMARY
# =========================================================
echo
echo "================ SUMMARY ================"
echo "PASS: $PASS_COUNT"
echo "FAIL: $FAIL_COUNT"

exit 0
