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
  local global_output
  local repo_output

  global_output="$(grep -Pi -- '^\h*gpgcheck\h*=\h*(1|true|yes)\b' /etc/dnf/dnf.conf 2>/dev/null || true)"
  repo_output="$(grep -Pris -- '^\h*gpgcheck\h*=\h*(0|[2-9]|[1-9][0-9]+|false|no)\b' /etc/yum.repos.d/ 2>/dev/null || true)"

  if [ -z "$global_output" ]; then
    print_fail "$id" "$title" \
      " - gpgcheck is not enabled in /etc/dnf/dnf.conf."
    return
  fi

  if [ -n "$repo_output" ]; then
    print_fail "$id" "$title" \
      " - /etc/yum.repos.d/ contains gpgcheck entries that disable package signature checks." \
      "$repo_output"
    return
  fi

  print_pass "$id" "$title" \
    " - gpgcheck is enabled globally and no repo override disables it."
}

check_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local mount_output

  mount_output="$(findmnt -kn /tmp 2>/dev/null || true)"
  if [ -z "$mount_output" ]; then
    print_na "$id" "$title" \
      " - /tmp is not mounted as a separate partition."
    return
  fi

  if printf '%s\n' "$mount_output" | grep -qw -- "$option"; then
    print_pass "$id" "$title" \
      " - /tmp is mounted with $option."
  else
    print_fail "$id" "$title" \
      " - /tmp is missing $option." \
      " - Current mount: $mount_output"
  fi
}

check_sysctl_value() {
  local id="$1"
  local title="$2"
  local key="$3"
  local expected="$4"
  local current_value

  current_value="$(sysctl -n "$key" 2>/dev/null || true)"
  if [ "$current_value" = "$expected" ]; then
    print_pass "$id" "$title" \
      " - $key is set to $current_value."
  elif [ -n "$current_value" ]; then
    print_fail "$id" "$title" \
      " - $key is set to $current_value (expected $expected)."
  else
    print_fail "$id" "$title" \
      " - Unable to read $key."
  fi
}

check_time_sync() {
  local id="2.3.1"
  local title="Ensure time synchronization is in use"

  if rpm -q chrony >/dev/null 2>&1; then
    print_pass "$id" "$title" \
      " - Package chrony is installed."
  else
    print_fail "$id" "$title" \
      " - Package chrony is not installed."
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
