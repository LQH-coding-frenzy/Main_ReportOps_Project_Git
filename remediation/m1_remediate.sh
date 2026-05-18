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

sysctl_target_file() {
  local ufw_file
  ufw_file="$([ -f /etc/default/ufw ] && awk -F= '/^\s*IPT_SYSCTL=/ {print $2}' /etc/default/ufw)"

  if [ -n "$ufw_file" ] && [ -e "$ufw_file" ]; then
    printf '%s\n' "$ufw_file"
  else
    printf '%s\n' /etc/sysctl.d/99-reportops-kernel_sysctl.conf
  fi
}

ensure_main_gpgcheck() {
  local temp_file

  temp_file="$(mktemp)"
  awk '
    BEGIN { IGNORECASE=1; in_main=0; done=0 }
    /^[[:space:]]*\[/ {
      if (in_main && !done) {
        print "gpgcheck=1"
        done=1
      }
      in_main = ($0 ~ /^[[:space:]]*\[main\][[:space:]]*$/)
      print
      next
    }
    in_main && /^[[:space:]]*gpgcheck[[:space:]]*=/ {
      if (!done) {
        print "gpgcheck=1"
        done=1
      }
      next
    }
    { print }
    END {
      if (in_main && !done) {
        print "gpgcheck=1"
      } else if (!done) {
        print "[main]"
        print "gpgcheck=1"
      }
    }
  ' /etc/dnf/dnf.conf > "$temp_file" && cat "$temp_file" > /etc/dnf/dnf.conf
  rm -f "$temp_file"
}

ensure_mount_option_in_fstab() {
  local mount_point="$1"
  local option="$2"
  local tmpfile

  if ! grep -Pq "^\s*[^#\n\r]+\s+${mount_point//\//\/}\s+" /etc/fstab 2>/dev/null; then
    return 1
  fi

  tmpfile="$(mktemp)"
  awk -v mount_point="$mount_point" -v option="$option" '
    BEGIN { OFS="\t" }
    /^[[:space:]]*#/ { print; next }
    $2 != mount_point { print; next }
    {
      count = split($4, parts, ",")
      found = 0
      out = ""
      for (i = 1; i <= count; i++) {
        if (parts[i] == option) {
          found = 1
        }
        if (parts[i] != "") {
          out = out ? out "," parts[i] : parts[i]
        }
      }
      if (!found) {
        out = out ? out "," option : option
      }
      $4 = out
      print
    }
  ' /etc/fstab > "$tmpfile" && cat "$tmpfile" > /etc/fstab
  rm -f "$tmpfile"

  return 0
}

set_sysctl_value() {
  local key="$1"
  local value="$2"
  local target

  target="$(sysctl_target_file)"
  mkdir -p "$(dirname "$target")"
  touch "$target"

  if grep -Pq "^\s*${key//./\\.}\s*=" "$target"; then
    sed -i "s/^\s*${key//./\\.}\s*=\s*.*/${key} = ${value}/" "$target"
  else
    printf '%s = %s\n' "$key" "$value" >> "$target"
  fi

  sysctl -w "${key}=${value}" >/dev/null 2>&1 || true
  printf '%s\n' "$target"
}

remediate_gpgcheck() {
  local id='1.2.1.2'
  local title='Ensure gpgcheck is globally activated'
  local global_output
  local repo_output

  ensure_main_gpgcheck

  if [ -d /etc/yum.repos.d ]; then
    find /etc/yum.repos.d/ -name '*.repo' -exec sed -i 's/^gpgcheck\s*=\s*.*/gpgcheck=1/' {} \;
  fi

  global_output="$(grep -Pi -- '^\h*gpgcheck\h*=\h*(1|true|yes)\b' /etc/dnf/dnf.conf 2>/dev/null || true)"
  repo_output="$(grep -Pris -- '^\h*gpgcheck\h*=\h*(0|[2-9]|[1-9][0-9]+|false|no)\b' /etc/yum.repos.d/ 2>/dev/null || true)"

  if [ -n "$global_output" ] && [ -z "$repo_output" ]; then
    print_pass "$id" "$title" ' - gpgcheck is enabled globally and no repo override disables it.'
  else
    print_fail "$id" "$title" ' - remediation did not converge to the expected gpgcheck state.'
  fi
}

remediate_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local line

  if [ -z "$(findmnt -kn /tmp 2>/dev/null || true)" ]; then
    print_fail "$id" "$title" ' - PDF remediation for this control applies only when /tmp is already a separate partition'
    return
  fi

  if ! ensure_mount_option_in_fstab /tmp "$option"; then
    print_fail "$id" "$title" ' - no /etc/fstab entry was found for /tmp, so the benchmark remediation cannot be applied directly'
    return
  fi

  mount -o remount /tmp >/dev/null 2>&1 || true
  line="$(findmnt -kn /tmp 2>/dev/null || true)"
  if [ -n "$line" ] && printf '%s\n' "$line" | grep -qw -- "$option"; then
    print_pass "$id" "$title" \
      " - /tmp is mounted with $option." \
      " - Current mount: $line"
  else
    print_fail "$id" "$title" \
      " - /tmp is missing $option after remediation." \
      " - Current mount: ${line:-/tmp is not mounted}"
  fi
}

remediate_sysctl_control() {
  local id="$1"
  local title="$2"
  local key="$3"
  local expected="$4"
  local target
  local runtime

  target="$(set_sysctl_value "$key" "$expected")"
  runtime="$(sysctl -n "$key" 2>/dev/null || true)"

  if [ "$runtime" = "$expected" ]; then
    print_pass "$id" "$title" \
      " - $key is set to $runtime." \
      " - Persistent value written to $target."
  elif [ -n "$runtime" ]; then
    print_fail "$id" "$title" \
      " - $key is set to $runtime (expected $expected)."
  else
    print_fail "$id" "$title" \
      " - Unable to read $key after remediation."
  fi
}

remediate_chrony() {
  local id='2.3.1'
  local title='Ensure time synchronization is in use'

  dnf install -y chrony >/dev/null 2>&1 || true

  if rpm -q chrony >/dev/null 2>&1; then
    print_pass "$id" "$title" ' - Package chrony is installed.'
  else
    print_fail "$id" "$title" ' - Package chrony is not installed after remediation.'
  fi
}

echo '== M1 remediation started =='

control_selected '1.2.1.2' && remediate_gpgcheck
control_selected '1.1.2.1.2' && remediate_tmp_option '1.1.2.1.2' 'Ensure nodev option set on /tmp partition' 'nodev'
control_selected '1.1.2.1.3' && remediate_tmp_option '1.1.2.1.3' 'Ensure nosuid option set on /tmp partition' 'nosuid'
control_selected '1.1.2.1.4' && remediate_tmp_option '1.1.2.1.4' 'Ensure noexec option set on /tmp partition' 'noexec'
control_selected '1.5.1' && remediate_sysctl_control '1.5.1' 'Ensure address space layout randomization is enabled' 'kernel.randomize_va_space' '2'
control_selected '1.5.2' && remediate_sysctl_control '1.5.2' 'Ensure ptrace_scope is restricted' 'kernel.yama.ptrace_scope' '1'
control_selected '2.3.1' && remediate_chrony

section_summary
echo '== M1 remediation finished =='
exit 0
