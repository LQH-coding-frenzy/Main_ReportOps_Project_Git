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

  if [ -z "$global_output" ] && [ -z "$repo_output" ]; then
    print_fail "$id" "$title" \
      " - grep -Pi -- '^\\h*gpgcheck\\h*=\\h*(1|true|yes)\\b' /etc/dnf/dnf.conf returned no output"
    return
  fi

  if [ -z "$global_output" ]; then
    print_fail "$id" "$title" \
      " - global configuration for gpgcheck is not enabled in /etc/dnf/dnf.conf"
    return
  fi

  if [ -n "$repo_output" ]; then
    print_fail "$id" "$title" \
      " - configuration in /etc/yum.repos.d/ takes precedence and contains failing gpgcheck entries" \
      " - grep -Pris -- '^\\h*gpgcheck\\h*=\\h*(0|[2-9]|[1-9][0-9]+|false|no)\\b' /etc/yum.repos.d/ returned:" \
      "$repo_output"
    return
  fi

  print_pass "$id" "$title" \
    " - grep -Pi -- '^\\h*gpgcheck\\h*=\\h*(1|true|yes)\\b' /etc/dnf/dnf.conf returned:" \
    "$global_output" \
    " - grep -Pris -- '^\\h*gpgcheck\\h*=\\h*(0|[2-9]|[1-9][0-9]+|false|no)\\b' /etc/yum.repos.d/ returned no output"
}

check_tmp_option() {
  local id="$1"
  local title="$2"
  local option="$3"
  local findmnt_output
  local audit_output

  findmnt_output="$(findmnt -kn /tmp 2>/dev/null || true)"
  if [ -z "$findmnt_output" ]; then
    print_na "$id" "$title" \
      " - a separate partition for /tmp does not exist, so this option check is not applicable by itself"
    return
  fi

  audit_output="$(findmnt -kn /tmp 2>/dev/null | grep -v -- "$option" || true)"
  if [ -z "$audit_output" ]; then
    print_pass "$id" "$title" \
      " - findmnt -kn /tmp | grep -v $option returned no output"
  else
    print_fail "$id" "$title" \
      " - findmnt -kn /tmp | grep -v $option returned:" \
      "$audit_output"
  fi
}

check_kernel_parameter_pdf() {
  local id="$1"
  local title="$2"
  local l_output=""
  local l_output2=""
  local l_ipv6_disabled=""
  local l_ufwscf="$([ -f /etc/default/ufw ] && awk -F= '/^\s*IPT_SYSCTL=/ {print $2}' /etc/default/ufw)"
  local l_kpname
  local l_kpvalue
  local -a a_parlist=("$3=$4")

  f_ipv6_chk() {
    l_ipv6_disabled=""
    ! grep -Pqs -- '^\h*0\b' /sys/module/ipv6/parameters/disable && l_ipv6_disabled="yes"
    if sysctl net.ipv6.conf.all.disable_ipv6 2>/dev/null | grep -Pqs -- '^\h*net\.ipv6\.conf\.all\.disable_ipv6\h*=\h*1\b' && \
      sysctl net.ipv6.conf.default.disable_ipv6 2>/dev/null | grep -Pqs -- '^\h*net\.ipv6\.conf\.default\.disable_ipv6\h*=\h*1\b'; then
      l_ipv6_disabled="yes"
    fi
    [ -z "$l_ipv6_disabled" ] && l_ipv6_disabled="no"
  }

  kernel_parameter_chk() {
    local l_krp
    local l_file=""
    local l_out=""
    local l_kpar=""
    local l_fkpname=""
    local l_fkpvalue=""

    l_krp="$(sysctl "$l_kpname" 2>/dev/null | awk -F= '{print $2}' | xargs)"
    if [ "$l_krp" = "$l_kpvalue" ]; then
      l_output="$l_output\n - \"$l_kpname\" is correctly set to \"$l_krp\" in the running configuration"
    else
      l_output2="$l_output2\n - \"$l_kpname\" is incorrectly set to \"$l_krp\" in the running configuration and should have a value of: \"$l_kpvalue\""
    fi

    unset A_out
    declare -A A_out
    while read -r l_out; do
      if [ -n "$l_out" ]; then
        if [[ $l_out =~ ^[[:space:]]*# ]]; then
          l_file="${l_out//# /}"
        else
          l_kpar="$(awk -F= '{print $1}' <<< "$l_out" | xargs)"
          [ "$l_kpar" = "$l_kpname" ] && A_out+=( ["$l_kpar"]="$l_file" )
        fi
      fi
    done < <(/usr/lib/systemd/systemd-sysctl --cat-config 2>/dev/null | grep -Po '^\h*([^#\n\r]+|#\h*\/[^#\n\r\h]+\.conf\b)')

    if [ -n "$l_ufwscf" ]; then
      l_kpar="$(grep -Po "^\h*$l_kpname\b" "$l_ufwscf" 2>/dev/null | xargs)"
      l_kpar="${l_kpar//\//.}"
      [ "$l_kpar" = "$l_kpname" ] && A_out+=( ["$l_kpar"]="$l_ufwscf" )
    fi

    if (( ${#A_out[@]} > 0 )); then
      while IFS="=" read -r l_fkpname l_fkpvalue; do
        l_fkpname="${l_fkpname// /}"
        l_fkpvalue="${l_fkpvalue// /}"
        if [ "$l_fkpvalue" = "$l_kpvalue" ]; then
          l_output="$l_output\n - \"$l_kpname\" is correctly set to \"$l_fkpvalue\" in \"$(printf '%s' "${A_out[@]}")\"\n"
        else
          l_output2="$l_output2\n - \"$l_kpname\" is incorrectly set to \"$l_fkpvalue\" in \"$(printf '%s' "${A_out[@]}")\" and should have a value of: \"$l_kpvalue\"\n"
        fi
      done < <(grep -Po -- "^\h*$l_kpname\h*=\h*\H+" "${A_out[@]}" 2>/dev/null)
    else
      l_output2="$l_output2\n - \"$l_kpname\" is not set in an included file\n ** Note: \"$l_kpname\" may be set in a file that's ignored by load procedure **\n"
    fi
  }

  while IFS="=" read -r l_kpname l_kpvalue; do
    l_kpname="${l_kpname// /}"
    l_kpvalue="${l_kpvalue// /}"
    if grep -q '^net.ipv6\.' <<< "$l_kpname"; then
      [ -z "$l_ipv6_disabled" ] && f_ipv6_chk
      if [ "$l_ipv6_disabled" = "yes" ]; then
        l_output="$l_output\n - IPv6 is disabled on the system, \"$l_kpname\" is not applicable"
      else
        kernel_parameter_chk
      fi
    else
      kernel_parameter_chk
    fi
  done < <(printf '%s\n' "${a_parlist[@]}")

  if [ -z "$l_output2" ]; then
    print_pass "$id" "$title" "$l_output"
  else
    print_fail "$id" "$title" "$l_output2"
    [ -n "$l_output" ] && printf '%s\n' "- Correctly set:" "$l_output"
  fi
}

check_time_sync() {
  local id="2.3.1"
  local title="Ensure time synchronization is in use"
  local rpm_output

  if ! command -v rpm >/dev/null 2>&1; then
    print_error "$id" "$title" " - rpm command not found"
    return
  fi

  rpm_output="$(rpm -q chrony 2>/dev/null || true)"
  if [ -n "$rpm_output" ] && ! grep -qi 'not installed' <<< "$rpm_output"; then
    print_pass "$id" "$title" \
      " - rpm -q chrony returned:" \
      "$rpm_output"
  else
    print_fail "$id" "$title" \
      " - rpm -q chrony did not show the chrony package as installed"
  fi
}

echo "## M1 Base Server Audit"

should_run_control "1.2.1.2" && check_gpgcheck
should_run_control "1.1.2.1.2" && check_tmp_option "1.1.2.1.2" "Ensure nodev option set on /tmp partition" "nodev"
should_run_control "1.1.2.1.3" && check_tmp_option "1.1.2.1.3" "Ensure nosuid option set on /tmp partition" "nosuid"
should_run_control "1.1.2.1.4" && check_tmp_option "1.1.2.1.4" "Ensure noexec option set on /tmp partition" "noexec"
should_run_control "1.5.1" && check_kernel_parameter_pdf "1.5.1" "Ensure address space layout randomization is enabled" "kernel.randomize_va_space" "2"
should_run_control "1.5.2" && check_kernel_parameter_pdf "1.5.2" "Ensure ptrace_scope is restricted" "kernel.yama.ptrace_scope" "1"
should_run_control "2.3.1" && check_time_sync

section_summary
exit 0
