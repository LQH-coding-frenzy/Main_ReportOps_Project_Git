#!/usr/bin/env bash
# ReportOps M1 CIS AlmaLinux OS 9 Audit Script
# Mode: audit-only. This script does not remediate or intentionally change system configuration.
# Output style: CIS-like stdout, suitable for raw evidence + parser normalization.

set -u

pass_count=0
fail_count=0
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
  echo "NOT_APPLICABLE: $na_count"
  echo "ERROR: $error_count"
  echo "=============================="
}

have_cmd() { command -v "$1" >/dev/null 2>&1; }
should_run_control() { [ -z "${TARGET_CONTROL_ID:-}" ] || [ "$TARGET_CONTROL_ID" = "$1" ]; }


echo "## M1 §1.1 Filesystem Audit"

check_kernel_module_unavailable() {
  local control_id="$1"
  local title="$2"
  local mod_name="$3"
  local mod_type="$4"
  local fail=()
  local ok=()
  local info=()

  if ! have_cmd modprobe; then
    print_error "$control_id" "$title" " - modprobe command not found"
    return
  fi

  local mod_path
  mod_path="$(readlink -f /lib/modules/**/kernel/$mod_type 2>/dev/null | sort -u || true)"
  local exists="no"
  local base
  for base in $mod_path; do
    if [ -d "$base/${mod_name/-/\/}" ] && [ -n "$(ls -A "$base/${mod_name/-/\/}" 2>/dev/null)" ]; then
      exists="yes"
      info+=(" - module: \"$mod_name\" exists in: $base")
    fi
  done

  if [ "$exists" = "no" ]; then
    ok+=(" - kernel module: \"$mod_name\" is not available in installed kernel module directories")
    print_pass "$control_id" "$title" "${ok[@]}"
    return
  fi

  local showconfig
  showconfig="$(modprobe --showconfig 2>/dev/null | grep -P "\\b(install|blacklist)\\h+${mod_name//-/_}\\b" || true)"

  if lsmod | grep -q "^${mod_name//-/_}\b"; then
    fail+=(" - kernel module: \"$mod_name\" is loaded")
  else
    ok+=(" - kernel module: \"$mod_name\" is not loaded")
  fi

  if grep -Pq "\\binstall\\h+${mod_name//-/_}\\h+/bin/(true|false)\\b" <<< "$showconfig"; then
    ok+=(" - kernel module: \"$mod_name\" is not loadable")
  else
    fail+=(" - kernel module: \"$mod_name\" is loadable")
  fi

  if grep -Pq "\\bblacklist\\h+${mod_name//-/_}\\b" <<< "$showconfig"; then
    ok+=(" - kernel module: \"$mod_name\" is deny listed")
  else
    fail+=(" - kernel module: \"$mod_name\" is not deny listed")
  fi

  if [ "${#info[@]}" -gt 0 ]; then
    echo
    echo " -- INFO --"
    printf '%s\n' "${info[@]}"
  fi

  if [ "${#fail[@]}" -eq 0 ]; then
    print_pass "$control_id" "$title" "${ok[@]}"
  else
    print_fail "$control_id" "$title" "${fail[@]}"
    [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
  fi
}

check_mount_exists() {
  local control_id="$1"; local title="$2"; local mountpoint="$3"
  if findmnt -kn "$mountpoint" >/dev/null 2>&1; then
    print_pass "$control_id" "$title" " - $mountpoint is mounted: $(findmnt -kn "$mountpoint" | head -n 1)"
  else
    print_fail "$control_id" "$title" " - $mountpoint is not mounted as a separate filesystem"
  fi
}

check_mount_option_if_mounted() {
  local control_id="$1"; local title="$2"; local mountpoint="$3"; local opt="$4"
  local line
  line="$(findmnt -kn "$mountpoint" 2>/dev/null | head -n 1 || true)"
  if [ -z "$line" ]; then
    print_na "$control_id" "$title" " - $mountpoint is not a separate mount; option check is not applicable in this audit context"
    return
  fi
  if awk '{print $4}' <<< "$line" | tr ',' '\n' | grep -qx "$opt"; then
    print_pass "$control_id" "$title" " - $mountpoint has $opt set" " - findmnt: $line"
  else
    print_fail "$control_id" "$title" " - $mountpoint does not have $opt set" " - findmnt: $line"
  fi
}

should_run_control "1.1.1.1" && check_kernel_module_unavailable "1.1.1.1" "Ensure cramfs kernel module is not available" "cramfs" "fs"
should_run_control "1.1.1.2" && check_kernel_module_unavailable "1.1.1.2" "Ensure freevxfs kernel module is not available" "freevxfs" "fs"
should_run_control "1.1.1.3" && check_kernel_module_unavailable "1.1.1.3" "Ensure hfs kernel module is not available" "hfs" "fs"
should_run_control "1.1.1.4" && check_kernel_module_unavailable "1.1.1.4" "Ensure hfsplus kernel module is not available" "hfsplus" "fs"
should_run_control "1.1.1.5" && check_kernel_module_unavailable "1.1.1.5" "Ensure jffs2 kernel module is not available" "jffs2" "fs"
should_run_control "1.1.1.8" && check_kernel_module_unavailable "1.1.1.8" "Ensure usb-storage kernel module is not available" "usb-storage" "drivers"

should_run_control "1.1.2.1.1" && check_mount_exists "1.1.2.1.1" "Ensure /tmp is a separate partition" "/tmp"
should_run_control "1.1.2.1.2" && check_mount_option_if_mounted "1.1.2.1.2" "Ensure nodev option set on /tmp partition" "/tmp" "nodev"
should_run_control "1.1.2.1.3" && check_mount_option_if_mounted "1.1.2.1.3" "Ensure nosuid option set on /tmp partition" "/tmp" "nosuid"
should_run_control "1.1.2.1.4" && check_mount_option_if_mounted "1.1.2.1.4" "Ensure noexec option set on /tmp partition" "/tmp" "noexec"

should_run_control "1.1.2.2.1" && check_mount_exists "1.1.2.2.1" "Ensure /dev/shm is a separate partition" "/dev/shm"
should_run_control "1.1.2.2.2" && check_mount_option_if_mounted "1.1.2.2.2" "Ensure nodev option set on /dev/shm partition" "/dev/shm" "nodev"
should_run_control "1.1.2.2.3" && check_mount_option_if_mounted "1.1.2.2.3" "Ensure nosuid option set on /dev/shm partition" "/dev/shm" "nosuid"
should_run_control "1.1.2.2.4" && check_mount_option_if_mounted "1.1.2.2.4" "Ensure noexec option set on /dev/shm partition" "/dev/shm" "noexec"

should_run_control "1.1.2.3.2" && check_mount_option_if_mounted "1.1.2.3.2" "Ensure nodev option set on /home partition" "/home" "nodev"
should_run_control "1.1.2.3.3" && check_mount_option_if_mounted "1.1.2.3.3" "Ensure nosuid option set on /home partition" "/home" "nosuid"
should_run_control "1.1.2.4.2" && check_mount_option_if_mounted "1.1.2.4.2" "Ensure nodev option set on /var partition" "/var" "nodev"
should_run_control "1.1.2.4.3" && check_mount_option_if_mounted "1.1.2.4.3" "Ensure nosuid option set on /var partition" "/var" "nosuid"
should_run_control "1.1.2.5.2" && check_mount_option_if_mounted "1.1.2.5.2" "Ensure nodev option set on /var/tmp partition" "/var/tmp" "nodev"
should_run_control "1.1.2.5.3" && check_mount_option_if_mounted "1.1.2.5.3" "Ensure nosuid option set on /var/tmp partition" "/var/tmp" "nosuid"
should_run_control "1.1.2.5.4" && check_mount_option_if_mounted "1.1.2.5.4" "Ensure noexec option set on /var/tmp partition" "/var/tmp" "noexec"
should_run_control "1.1.2.6.2" && check_mount_option_if_mounted "1.1.2.6.2" "Ensure nodev option set on /var/log partition" "/var/log" "nodev"
should_run_control "1.1.2.6.3" && check_mount_option_if_mounted "1.1.2.6.3" "Ensure nosuid option set on /var/log partition" "/var/log" "nosuid"
should_run_control "1.1.2.6.4" && check_mount_option_if_mounted "1.1.2.6.4" "Ensure noexec option set on /var/log partition" "/var/log" "noexec"
should_run_control "1.1.2.7.2" && check_mount_option_if_mounted "1.1.2.7.2" "Ensure nodev option set on /var/log/audit partition" "/var/log/audit" "nodev"
should_run_control "1.1.2.7.3" && check_mount_option_if_mounted "1.1.2.7.3" "Ensure nosuid option set on /var/log/audit partition" "/var/log/audit" "nosuid"
should_run_control "1.1.2.7.4" && check_mount_option_if_mounted "1.1.2.7.4" "Ensure noexec option set on /var/log/audit partition" "/var/log/audit" "noexec"

section_summary
