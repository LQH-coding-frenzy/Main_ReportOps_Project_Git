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

sysctl_candidate_files() {
  [ -f /etc/sysctl.conf ] && printf '%s\n' /etc/sysctl.conf
  find /etc/sysctl.d /run/sysctl.d /usr/local/lib/sysctl.d /usr/lib/sysctl.d -maxdepth 1 -type f -name '*.conf' 2>/dev/null | sort -u
}

comment_out_conflicting_sysctl_assignments() {
  local key="$1"
  local target="$2"
  local file

  while IFS= read -r file; do
    [ -n "$file" ] || continue
    [ "$file" = "$target" ] && continue
    sed -i "/^[[:space:]]*${key//./\\.}[[:space:]]*=/ s/^/# ReportOps disabled duplicate setting: /" "$file"
  done < <(sysctl_candidate_files)
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

verify_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local line

  line="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"
  if [ -n "$line" ] && awk '{print $4}' <<< "$line" | tr ',' '\n' | grep -qx "$option"; then
    print_pass "$id" "$title" " - remediation applied successfully" " - findmnt: $line"
  else
    print_fail "$id" "$title" " - expected /tmp to include ${option} after remediation" " - findmnt: ${line:-/tmp is not mounted}"
  fi
}

remediate_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"

  ensure_tmp_mount_exists
  ensure_tmp_option_config "$option"
  ensure_tmp_runtime_options
  verify_tmp_option "$id" "$title" "$option"
}

remediate_gpgcheck() {
  local id='1.2.1.2'
  local title='Ensure gpgcheck is globally activated'
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

  if [ -d /etc/yum.repos.d ]; then
    find /etc/yum.repos.d -name '*.repo' -exec sed -i 's/^\s*gpgcheck\s*=\s*.*/gpgcheck=1/' {} \;
  fi

  if grep -Piq '^\s*gpgcheck\s*=\s*(1|true|yes)\b' /etc/dnf/dnf.conf 2>/dev/null \
    && ! grep -Prisq '^\s*gpgcheck\s*=\s*(0|[2-9]|[1-9][0-9]+|false|no)\b' /etc/yum.repos.d/ 2>/dev/null; then
    print_pass "$id" "$title" ' - gpgcheck is enabled globally and repo overrides no longer disable it'
  else
    print_fail "$id" "$title" ' - gpgcheck remediation did not converge to the expected state'
  fi
}

remediate_sysctl_control() {
  local id="$1"
  local title="$2"
  local key="$3"
  local expected="$4"
  local target='/etc/sysctl.d/60-kernel_sysctl.conf'
  local runtime
  local config

  comment_out_conflicting_sysctl_assignments "$key" "$target"
  touch "$target"
  if grep -Pq "^\s*${key//./\\.}\s*=" "$target"; then
    sed -i "s/^\s*${key//./\\.}\s*=\s*.*/${key} = ${expected}/" "$target"
  else
    printf '%s = %s\n' "$key" "$expected" >> "$target"
  fi

  sysctl -w "${key}=${expected}" >/dev/null 2>&1 || true

  runtime="$(sysctl -n "$key" 2>/dev/null || true)"
  config="$(grep -RhsP "^\s*${key//./\\.}\s*=\s*${expected}\b" /etc/sysctl.conf /etc/sysctl.d/*.conf /usr/lib/sysctl.d/*.conf /run/sysctl.d/*.conf 2>/dev/null | head -n 1 || true)"
  if [ "$runtime" = "$expected" ] && [ -n "$config" ]; then
    print_pass "$id" "$title" " - ${key} is ${runtime} at runtime" " - persistent config found: $config"
  else
    print_fail "$id" "$title" " - expected ${key}=${expected}, got runtime='${runtime:-unset}'"
  fi
}

remediate_chrony() {
  local id='2.3.1'
  local title='Ensure time synchronization is in use'

  dnf install -y chrony >/dev/null 2>&1 || true
  systemctl unmask chronyd >/dev/null 2>&1 || true
  systemctl enable --now chronyd >/dev/null 2>&1 || true

  if systemctl is-enabled chronyd >/dev/null 2>&1 && systemctl is-active chronyd >/dev/null 2>&1; then
    print_pass "$id" "$title" ' - chronyd is enabled and active after remediation'
  else
    print_fail "$id" "$title" ' - chronyd is still not both enabled and active after remediation'
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
