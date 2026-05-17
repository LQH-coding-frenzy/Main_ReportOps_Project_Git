#!/usr/bin/env bash
set -u

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Remediation Script
# Part M2: Attack Surface Reduction
# Original remediation logic by Bảo (m2-m4_submit/m2-remediation.sh)
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

echo '== M2 remediation started =='

# 1.3.1.1 — Ensure SELinux is installed
remediate_1_3_1_1() {
  echo "[1.3.1.1] Installing SELinux (libselinux)..."
  dnf install -y libselinux >/dev/null 2>&1 || true
  if rpm -q libselinux >/dev/null 2>&1; then
    print_pass "1.3.1.1" "Ensure SELinux is installed" " - libselinux package is installed"
  else
    print_fail "1.3.1.1" "Ensure SELinux is installed" " - libselinux still not installed after remediation"
  fi
}

# 1.3.1.4 — Ensure SELinux mode is not disabled
remediate_1_3_1_4() {
  echo "[1.3.1.4] Configuring SELinux to enforcing mode..."
  sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config
  setenforce 1 2>/dev/null || echo "  NOTE: setenforce may require reboot to take effect if SELinux was fully disabled."
  local mode
  mode=$(getenforce 2>/dev/null || echo "unknown")
  if [ "$mode" != "Disabled" ]; then
    print_pass "1.3.1.4" "Ensure the SELinux mode is not disabled" " - SELinux mode is: $mode"
  else
    print_fail "1.3.1.4" "Ensure the SELinux mode is not disabled" " - SELinux is still disabled (reboot may be required)"
  fi
}

# 1.3.1.7 & 1.3.1.8 — Remove mcstrans and setroubleshoot
remediate_1_3_1_7() {
  echo "[1.3.1.7] Removing mcstrans..."
  dnf remove -y mcstrans >/dev/null 2>&1 || true
  if ! rpm -q mcstrans >/dev/null 2>&1; then
    print_pass "1.3.1.7" "Ensure mcstrans is not installed" " - mcstrans has been removed"
  else
    print_fail "1.3.1.7" "Ensure mcstrans is not installed" " - mcstrans still present after removal attempt"
  fi
}

remediate_1_3_1_8() {
  echo "[1.3.1.8] Removing setroubleshoot..."
  dnf remove -y setroubleshoot >/dev/null 2>&1 || true
  if ! rpm -q setroubleshoot >/dev/null 2>&1; then
    print_pass "1.3.1.8" "Ensure SETroubleshoot is not installed" " - setroubleshoot has been removed"
  else
    print_fail "1.3.1.8" "Ensure SETroubleshoot is not installed" " - setroubleshoot still present after removal attempt"
  fi
}

# 3.3.1 & 3.3.7 — Network sysctl hardening
remediate_3_3_1() {
  echo "[3.3.1] Disabling IP forwarding..."
  local target="/etc/sysctl.d/60-reportops-m2-netipv4.conf"
  if grep -q 'net.ipv4.ip_forward' "$target" 2>/dev/null; then
    sed -i 's/^net.ipv4.ip_forward.*/net.ipv4.ip_forward = 0/' "$target"
  else
    printf 'net.ipv4.ip_forward = 0\n' >> "$target"
  fi
  sysctl -w net.ipv4.ip_forward=0 >/dev/null 2>&1 || true
  local val
  val=$(sysctl -n net.ipv4.ip_forward 2>/dev/null)
  if [ "$val" = "0" ]; then
    print_pass "3.3.1" "Ensure ip forwarding is disabled" " - net.ipv4.ip_forward=0 applied"
  else
    print_fail "3.3.1" "Ensure ip forwarding is disabled" " - net.ipv4.ip_forward=$val after remediation"
  fi
}

remediate_3_3_7() {
  echo "[3.3.7] Enabling reverse path filtering..."
  local target="/etc/sysctl.d/60-reportops-m2-netipv4.conf"
  grep -q 'net.ipv4.conf.all.rp_filter' "$target" 2>/dev/null \
    && sed -i 's/^net.ipv4.conf.all.rp_filter.*/net.ipv4.conf.all.rp_filter = 1/' "$target" \
    || printf 'net.ipv4.conf.all.rp_filter = 1\n' >> "$target"
  grep -q 'net.ipv4.conf.default.rp_filter' "$target" 2>/dev/null \
    && sed -i 's/^net.ipv4.conf.default.rp_filter.*/net.ipv4.conf.default.rp_filter = 1/' "$target" \
    || printf 'net.ipv4.conf.default.rp_filter = 1\n' >> "$target"
  sysctl -w net.ipv4.conf.all.rp_filter=1 >/dev/null 2>&1 || true
  sysctl -w net.ipv4.conf.default.rp_filter=1 >/dev/null 2>&1 || true
  local all default
  all=$(sysctl -n net.ipv4.conf.all.rp_filter 2>/dev/null)
  default=$(sysctl -n net.ipv4.conf.default.rp_filter 2>/dev/null)
  if [ "$all" = "1" ] && [ "$default" = "1" ]; then
    print_pass "3.3.7" "Ensure reverse path filtering is enabled" " - rp_filter=1 applied for all and default"
  else
    print_fail "3.3.7" "Ensure reverse path filtering is enabled" " - rp_filter all=$all default=$default after remediation"
  fi
}

# 4.1.1 — Install nftables
remediate_4_1_1() {
  echo "[4.1.1] Installing nftables..."
  dnf install -y nftables >/dev/null 2>&1 || true
  systemctl enable --now nftables >/dev/null 2>&1 || true
  if rpm -q nftables >/dev/null 2>&1; then
    print_pass "4.1.1" "Ensure nftables is installed" " - nftables package is installed and enabled"
  else
    print_fail "4.1.1" "Ensure nftables is installed" " - nftables still not installed after remediation"
  fi
}

control_selected '1.3.1.1' && remediate_1_3_1_1
control_selected '1.3.1.4' && remediate_1_3_1_4
control_selected '1.3.1.7' && remediate_1_3_1_7
control_selected '1.3.1.8' && remediate_1_3_1_8
control_selected '3.3.1'   && remediate_3_3_1
control_selected '3.3.7'   && remediate_3_3_7
control_selected '4.1.1'   && remediate_4_1_1

section_summary
echo '== M2 remediation finished =='
exit 0
