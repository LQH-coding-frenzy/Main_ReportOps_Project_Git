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

sysctl_candidate_files() {
  [ -f /etc/sysctl.conf ] && printf '%s\n' /etc/sysctl.conf
  find /etc/sysctl.d /run/sysctl.d /usr/local/lib/sysctl.d /usr/lib/sysctl.d -maxdepth 1 -type f -name '*.conf' 2>/dev/null | sort -u
}

grep_sysctl_assignments() {
  local key="$1"
  local expected_pattern="$2"

  sysctl_candidate_files | xargs -r grep -HP "^\s*${key//./\\.}\s*=\s*${expected_pattern}\s*$" 2>/dev/null || true
}

mount_option_present() {
  local options="$1"
  local expected="$2"
  printf '%s\n' "$options" | tr ',' '\n' | grep -qx "$expected"
}

first_active_time_sync_service() {
  local service

  for service in chronyd systemd-timesyncd ntpd; do
    if systemctl is-active "$service" >/dev/null 2>&1; then
      printf '%s\n' "$service"
      return 0
    fi
  done

  return 1
}

check_gpgcheck() {
  local id="1.2.1.2"
  local title="Ensure gpgcheck is globally activated"
  local main_line
  local repo_disabled
  local repo_enabled

  main_line="$(awk '
    BEGIN { IGNORECASE=1; in_main=0 }
    /^[[:space:]]*\[/ {
      in_main = ($0 ~ /^[[:space:]]*\[main\][[:space:]]*$/)
    }
    in_main && /^[[:space:]]*gpgcheck[[:space:]]*=/ {
      print
      exit
    }
  ' /etc/dnf/dnf.conf 2>/dev/null || true)"

  repo_disabled="$(grep -RsHP '^[[:space:]]*gpgcheck[[:space:]]*=[[:space:]]*(0|false|no)\b' /etc/yum.repos.d 2>/dev/null || true)"
  repo_enabled="$(grep -RsHP '^[[:space:]]*gpgcheck[[:space:]]*=[[:space:]]*(1|true|yes)\b' /etc/yum.repos.d 2>/dev/null || true)"

  if [ -z "$main_line" ]; then
    print_fail "$id" "$title" " - no gpgcheck assignment was found in the [main] section of /etc/dnf/dnf.conf"
    return
  fi

  if ! grep -Piq '^[[:space:]]*gpgcheck[[:space:]]*=[[:space:]]*(1|true|yes)\b' <<< "$main_line"; then
    print_fail "$id" "$title" " - [main] in /etc/dnf/dnf.conf does not set gpgcheck=1" " - found: $main_line"
    return
  fi

  if [ -n "$repo_disabled" ]; then
    print_fail "$id" "$title" " - one or more repository files explicitly disable gpgcheck" " - disabled entries:" "${repo_disabled}"
    return
  fi

  if [ -n "$repo_enabled" ]; then
    print_pass "$id" "$title" " - [main] in /etc/dnf/dnf.conf sets gpgcheck=1" " - repository files with explicit gpgcheck=1:" "${repo_enabled}"
  else
    print_pass "$id" "$title" " - [main] in /etc/dnf/dnf.conf sets gpgcheck=1" " - no repository file overrides gpgcheck to a non-compliant value"
  fi
}

check_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local runtime_line
  local runtime_opts
  local fstab_line
  local fstab_opts

  runtime_line="$(findmnt --kernel --target /tmp -no SOURCE,FSTYPE,OPTIONS 2>/dev/null | head -n 1 || true)"
  runtime_opts="$(findmnt --kernel --target /tmp -no OPTIONS 2>/dev/null | head -n 1 || true)"
  fstab_line="$(findmnt --fstab --target /tmp -no SOURCE,FSTYPE,OPTIONS 2>/dev/null | head -n 1 || true)"
  fstab_opts="$(findmnt --fstab --target /tmp -no OPTIONS 2>/dev/null | head -n 1 || true)"

  if [ -z "$runtime_line" ] && [ -z "$fstab_line" ]; then
    print_na "$id" "$title" " - /tmp is not a separate mount; option check is not applicable in this audit context"
    return
  fi

  if [ -z "$runtime_line" ]; then
    print_fail "$id" "$title" " - /tmp is declared but is not currently mounted as a separate filesystem"
    return
  fi

  if [ -z "$fstab_line" ]; then
    print_fail "$id" "$title" " - /tmp is mounted separately but no /etc/fstab entry was found" " - runtime findmnt: $runtime_line"
    return
  fi

  if mount_option_present "$runtime_opts" "$option" && mount_option_present "$fstab_opts" "$option"; then
    print_pass "$id" "$title" " - /tmp has $option set at runtime and in /etc/fstab" " - runtime findmnt: $runtime_line" " - fstab findmnt: $fstab_line"
  elif mount_option_present "$runtime_opts" "$option"; then
    print_fail "$id" "$title" " - /tmp has $option at runtime but the /etc/fstab entry is missing it" " - runtime findmnt: $runtime_line" " - fstab findmnt: $fstab_line"
  elif mount_option_present "$fstab_opts" "$option"; then
    print_fail "$id" "$title" " - /etc/fstab has $option but the live /tmp mount does not" " - runtime findmnt: $runtime_line" " - fstab findmnt: $fstab_line"
  else
    print_fail "$id" "$title" " - /tmp does not have $option set at runtime or in /etc/fstab" " - runtime findmnt: $runtime_line" " - fstab findmnt: $fstab_line"
  fi
}

check_sysctl_value() {
  local id="$1"
  local title="$2"
  local key="$3"
  local expected="$4"
  local runtime
  local correct_configs
  local wrong_configs

  runtime="$(sysctl -n "$key" 2>/dev/null || true)"
  correct_configs="$(grep_sysctl_assignments "$key" "$expected")"
  wrong_configs="$(sysctl_candidate_files | xargs -r grep -HP "^\s*${key//./\\.}\s*=\s*(?!${expected}\b).+$" 2>/dev/null || true)"

  if [ -z "$runtime" ]; then
    print_error "$id" "$title" " - sysctl did not return a value for $key"
  elif [ "$runtime" = "$expected" ] && [ -n "$correct_configs" ] && [ -z "$wrong_configs" ]; then
    print_pass "$id" "$title" " - $key is $runtime at runtime" " - persistent config entries:" "${correct_configs}"
  elif [ "$runtime" = "$expected" ] && [ -n "$wrong_configs" ]; then
    print_fail "$id" "$title" " - $key is correct at runtime but conflicting persistent settings exist" " - conflicting entries:" "${wrong_configs}"
  elif [ "$runtime" = "$expected" ]; then
    print_fail "$id" "$title" " - $key is correct at runtime but no matching persistent config was found"
  else
    print_fail "$id" "$title" " - $key is '$runtime', expected '$expected'"
  fi
}

check_time_sync() {
  local id="2.3.1"
  local title="Ensure time synchronization is in use"
  local active_service=""

  if ! command -v systemctl >/dev/null 2>&1; then
    print_error "$id" "$title" " - systemctl command not found"
    return
  fi

  if active_service="$(first_active_time_sync_service)"; then
    if [ "$active_service" = "chronyd" ] && rpm -q chrony >/dev/null 2>&1 && systemctl is-enabled chronyd >/dev/null 2>&1; then
      print_pass "$id" "$title" " - chrony package is installed" " - chronyd is enabled and active"
    else
      print_pass "$id" "$title" " - a time synchronization service is active" " - active service: $active_service"
    fi
  elif rpm -q chrony >/dev/null 2>&1; then
    print_fail "$id" "$title" " - chrony package is installed but no active time synchronization service was detected"
  else
    print_fail "$id" "$title" " - neither chrony nor another active time synchronization service was detected"
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
