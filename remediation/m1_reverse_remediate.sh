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

rewrite_tmp_fstab_without_option() {
  local option="$1"
  local tmpfile

  if ! grep -Pq '^\s*[^#\n\r]+\s+/tmp\s+' /etc/fstab 2>/dev/null; then
    return 0
  fi

  tmpfile="$(mktemp)"
  awk -v option="$option" '
    BEGIN { OFS="\t" }
    /^[[:space:]]*#/ { print; next }
    $2 != "/tmp" { print; next }
    {
      count = split($4, parts, ",")
      out = ""
      for (i = 1; i <= count; i++) {
        if (parts[i] != option && parts[i] != "") {
          out = out ? out "," parts[i] : parts[i]
        }
      }
      $4 = out ? out : "rw,relatime"
      print
    }
  ' /etc/fstab > "$tmpfile" && cat "$tmpfile" > /etc/fstab
  rm -f "$tmpfile"
}

reverse_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local current_opts
  local new_opts
  local line

  current_opts="$(findmnt -no OPTIONS /tmp 2>/dev/null || true)"
  if [ -z "$current_opts" ]; then
    print_fail "$id" "$title" ' - /tmp is not mounted, so this control would become NOT_APPLICABLE instead of FAIL'
    return
  fi

  rewrite_tmp_fstab_without_option "$option"
  new_opts="$(printf '%s\n' "$current_opts" | tr ',' '\n' | grep -vx "$option" | paste -sd, -)"
  [ -n "$new_opts" ] || new_opts='rw,relatime'
  mount -o remount,"$new_opts" /tmp >/dev/null 2>&1 || true

  line="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"
  if [ -n "$line" ] && ! awk '{print $4}' <<< "$line" | tr ',' '\n' | grep -qx "$option"; then
    print_pass "$id" "$title" ' - control is intentionally set to fail on the next audit run' " - findmnt: $line"
  else
    print_fail "$id" "$title" ' - expected /tmp to stay mounted but without the selected option after reverse remediation' " - findmnt: ${line:-/tmp is not mounted}"
  fi
}

reverse_gpgcheck() {
  local id='1.2.1.2'
  local title='Ensure gpgcheck is globally activated'

  if grep -Pq '^\s*gpgcheck\s*=' /etc/dnf/dnf.conf 2>/dev/null; then
    sed -i 's/^\s*gpgcheck\s*=\s*.*/gpgcheck=0/' /etc/dnf/dnf.conf
  else
    printf '\n%s\n' 'gpgcheck=0' >> /etc/dnf/dnf.conf
  fi

  if grep -Piq '^\s*gpgcheck\s*=\s*(0|false|no)\b' /etc/dnf/dnf.conf 2>/dev/null; then
    print_pass "$id" "$title" ' - control is intentionally set to fail on the next audit run via global gpgcheck=0'
  else
    print_fail "$id" "$title" ' - failed to move gpgcheck into a non-compliant state'
  fi
}

reverse_sysctl_control() {
  local id="$1"
  local title="$2"
  local key="$3"
  local reversed="$4"
  local target='/etc/sysctl.d/60-kernel_sysctl.conf'
  local runtime

  touch "$target"
  if grep -Pq "^\s*${key//./\\.}\s*=" "$target"; then
    sed -i "s/^\s*${key//./\\.}\s*=\s*.*/${key} = ${reversed}/" "$target"
  else
    printf '%s = %s\n' "$key" "$reversed" >> "$target"
  fi

  sysctl -w "${key}=${reversed}" >/dev/null 2>&1 || true
  runtime="$(sysctl -n "$key" 2>/dev/null || true)"
  if [ "$runtime" = "$reversed" ]; then
    print_pass "$id" "$title" " - control is intentionally set to fail on the next audit run with ${key}=${reversed}"
  else
    print_fail "$id" "$title" " - failed to move ${key} into the requested non-compliant state"
  fi
}

reverse_chrony() {
  local id='2.3.1'
  local title='Ensure time synchronization is in use'

  systemctl disable --now chronyd >/dev/null 2>&1 || true

  if ! systemctl is-enabled chronyd >/dev/null 2>&1 || ! systemctl is-active chronyd >/dev/null 2>&1; then
    print_pass "$id" "$title" ' - chronyd is intentionally no longer both enabled and active'
  else
    print_fail "$id" "$title" ' - chronyd is still enabled and active after reverse remediation'
  fi
}

echo '== M1 reverse remediate started =='

control_selected '1.2.1.2' && reverse_gpgcheck
control_selected '1.1.2.1.2' && reverse_tmp_option '1.1.2.1.2' 'Ensure nodev option set on /tmp partition' 'nodev'
control_selected '1.1.2.1.3' && reverse_tmp_option '1.1.2.1.3' 'Ensure nosuid option set on /tmp partition' 'nosuid'
control_selected '1.1.2.1.4' && reverse_tmp_option '1.1.2.1.4' 'Ensure noexec option set on /tmp partition' 'noexec'
control_selected '1.5.1' && reverse_sysctl_control '1.5.1' 'Ensure address space layout randomization is enabled' 'kernel.randomize_va_space' '0'
control_selected '1.5.2' && reverse_sysctl_control '1.5.2' 'Ensure ptrace_scope is restricted' 'kernel.yama.ptrace_scope' '0'
control_selected '2.3.1' && reverse_chrony

section_summary
echo '== M1 reverse remediate finished =='
exit 0
