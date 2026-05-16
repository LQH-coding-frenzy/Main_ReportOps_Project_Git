#!/usr/bin/env bash
set -u

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

print_na() {
  local id="$1"
  local title="$2"
  shift 2
  echo
  echo "### $id - $title"
  printf '%s\n' "" "- Audit Result:" " ** NOT_APPLICABLE **" "$@"
  NA_COUNT=$((NA_COUNT + 1))
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

check_gpgcheck() {
  local id="1.2.1.2"
  local title="Ensure gpgcheck is globally activated"
  local ok=()
  local fail=()

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
    print_pass "$id" "$title" "${ok[@]}"
  else
    print_fail "$id" "$title" "${fail[@]}"
    [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
  fi
}

check_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local line

  line="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"
  if [ -z "$line" ]; then
    print_na "$id" "$title" " - /tmp is not a separate mount; option check is not applicable in this audit context"
    return
  fi

  if awk '{print $4}' <<< "$line" | tr ',' '\n' | grep -qx "$option"; then
    print_pass "$id" "$title" " - /tmp has $option set" " - findmnt: $line"
  else
    print_fail "$id" "$title" " - /tmp does not have $option set" " - findmnt: $line"
  fi
}

check_sysctl_value() {
  local id="$1"
  local title="$2"
  local key="$3"
  local expected="$4"
  local runtime
  local config

  runtime="$(sysctl -n "$key" 2>/dev/null || true)"
  config="$(grep -RhsP "^\s*${key//./\.}\s*=\s*${expected}\b" /etc/sysctl.conf /etc/sysctl.d/*.conf /usr/lib/sysctl.d/*.conf /run/sysctl.d/*.conf 2>/dev/null | tail -n 1 || true)"

  if [ "$runtime" = "$expected" ] && [ -n "$config" ]; then
    print_pass "$id" "$title" " - $key is $runtime in running configuration" " - persistent config found: $config"
  elif [ "$runtime" = "$expected" ]; then
    print_fail "$id" "$title" " - $key is correct at runtime but no matching persistent config was found"
  else
    print_fail "$id" "$title" " - $key is '$runtime', expected '$expected'"
  fi
}

check_time_sync() {
  local id="2.3.1"
  local title="Ensure time synchronization is in use"

  if ! command -v systemctl >/dev/null 2>&1; then
    print_error "$id" "$title" " - systemctl command not found"
    return
  fi

  if systemctl is-enabled chronyd >/dev/null 2>&1 && systemctl is-active chronyd >/dev/null 2>&1; then
    print_pass "$id" "$title" " - chronyd is enabled and active"
  else
    print_fail "$id" "$title" " - chronyd is not both enabled and active"
  fi
}

echo "## M1 Base Server Audit"

should_run_control "1.2.1.2" && check_gpgcheck
should_run_control "1.1.2.1.2" && check_tmp_option "1.1.2.1.2" "Ensure nodev option set on /tmp partition" "nodev"
should_run_control "1.1.2.1.3" && check_tmp_option "1.1.2.1.3" "Ensure nosuid option set on /tmp partition" "nosuid"
should_run_control "1.1.2.1.4" && check_tmp_option "1.1.2.1.4" "Ensure noexec option set on /tmp partition" "noexec"
should_run_control "1.5.1" && check_sysctl_value "1.5.1" "Ensure address space layout randomization is enabled" "kernel.randomize_va_space" "2"
should_run_control "1.5.2" && check_sysctl_value "1.5.2" "Ensure ptrace_scope is restricted" "kernel.yama.ptrace_scope" "1"
should_run_control "2.3.1" && check_time_sync

section_summary
exit 0
