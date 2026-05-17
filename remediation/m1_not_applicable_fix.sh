#!/usr/bin/env bash
set -u

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

ensure_tmp_mount_exists() {
  local current
  current="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"

  if [ -n "$current" ]; then
    return 0
  fi

  if ! grep -Pq '^\s*[^#\n\r]+\s+/tmp\s+' /etc/fstab 2>/dev/null; then
    printf '%s\n' 'tmpfs /tmp tmpfs defaults,rw,nosuid,nodev,noexec,relatime,size=2G 0 0' >> /etc/fstab
  fi

  systemctl unmask tmp.mount >/dev/null 2>&1 || true
  mount /tmp >/dev/null 2>&1 || true
}

ensure_tmp_option_config() {
  local option="$1"

  if grep -Pq '^\s*[^#\n\r]+\s+/tmp\s+' /etc/fstab 2>/dev/null; then
    sed -i "/\\s\\/tmp\\s/ {
      /${option}/! s/\([^[:space:]]\+\s\+\/tmp\s\+[^[:space:]]\+\s\+[^[:space:]]*\)/\1,${option}/
    }" /etc/fstab
  else
    printf '%s\n' 'tmpfs /tmp tmpfs defaults,rw,nosuid,nodev,noexec,relatime,size=2G 0 0' >> /etc/fstab
  fi
}

ensure_tmp_runtime_options() {
  mount -o remount,nodev,nosuid,noexec /tmp >/dev/null 2>&1 || true
}

fix_tmp_not_applicable() {
  local id="$1"
  local title="$2"
  local option="$3"
  local line

  ensure_tmp_mount_exists
  ensure_tmp_option_config "$option"
  ensure_tmp_runtime_options

  line="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"
  if [ -n "$line" ] && awk '{print $4}' <<< "$line" | tr ',' '\n' | grep -qx "$option"; then
    print_pass "$id" "$title" ' - control was converted from not applicable into a compliant /tmp mount check' " - findmnt: $line"
  else
    print_fail "$id" "$title" ' - /tmp is still not mounted with the expected option after the fix' " - findmnt: ${line:-/tmp is not mounted}"
  fi
}

mark_unsupported_control() {
  local id="$1"
  local title="$2"
  print_fail "$id" "$title" ' - this M1 control is not expected to be NOT_APPLICABLE, so no automatic NA fix is implemented for it'
}

echo '== M1 not applicable fix started =='

control_selected '1.1.2.1.2' && fix_tmp_not_applicable '1.1.2.1.2' 'Ensure nodev option set on /tmp partition' 'nodev'
control_selected '1.1.2.1.3' && fix_tmp_not_applicable '1.1.2.1.3' 'Ensure nosuid option set on /tmp partition' 'nosuid'
control_selected '1.1.2.1.4' && fix_tmp_not_applicable '1.1.2.1.4' 'Ensure noexec option set on /tmp partition' 'noexec'
control_selected '1.2.1.2' && mark_unsupported_control '1.2.1.2' 'Ensure gpgcheck is globally activated'
control_selected '1.5.1' && mark_unsupported_control '1.5.1' 'Ensure address space layout randomization is enabled'
control_selected '1.5.2' && mark_unsupported_control '1.5.2' 'Ensure ptrace_scope is restricted'
control_selected '2.3.1' && mark_unsupported_control '2.3.1' 'Ensure time synchronization is in use'

section_summary
echo '== M1 not applicable fix finished =='
exit 0
