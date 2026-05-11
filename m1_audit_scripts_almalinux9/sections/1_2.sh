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


echo "## M1 §1.2 Package Management Audit"

print_manual "1.2.1.1" "Ensure GPG keys are configured" \
  " - Manual review required: verify repository gpgkey URLs and installed GPG public keys match site policy." \
  " - Repository gpgkey entries:" \
  "$(grep -rH '^\s*gpgkey\s*=' /etc/yum.repos.d/* /etc/dnf/dnf.conf 2>/dev/null || true)" \
  " - Installed RPM GPG keys:" \
  "$(rpm -q gpg-pubkey 2>/dev/null || true)"

fail=(); ok=()
if grep -Piq '^\s*gpgcheck\s*=\s*(1|true|yes)\b' /etc/dnf/dnf.conf 2>/dev/null; then
  ok+=(" - global gpgcheck is enabled in /etc/dnf/dnf.conf")
else
  fail+=(" - global gpgcheck is not enabled in /etc/dnf/dnf.conf")
fi
if grep -Prisq '^\s*gpgcheck\s*=\s*(0|[2-9]|[1-9][0-9]+|false|no)\b' /etc/yum.repos.d/ 2>/dev/null; then
  fail+=(" - at least one repository file disables gpgcheck")
else
  ok+=(" - no repository file disables gpgcheck")
fi
if [ "${#fail[@]}" -eq 0 ]; then
  print_pass "1.2.1.2" "Ensure gpgcheck is globally activated" "${ok[@]}"
else
  print_fail "1.2.1.2" "Ensure gpgcheck is globally activated" "${fail[@]}"
  [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
fi

print_manual "1.2.1.4" "Ensure package manager repositories are configured" \
  " - Manual review required: verify configured repositories match site policy." \
  " - dnf repolist output:" \
  "$(dnf repolist 2>/dev/null || true)"

updates_output="$(dnf check-update 2>&1 || true)"
reboot_output="$(dnf needs-restarting -r 2>&1 || true)"
print_manual "1.2.2.1" "Ensure updates, patches, and additional security software are installed" \
  " - Manual review required: verify pending updates and reboot requirement according to site patch policy." \
  " - dnf check-update output:" \
  "$updates_output" \
  " - dnf needs-restarting -r output:" \
  "$reboot_output"

section_summary
