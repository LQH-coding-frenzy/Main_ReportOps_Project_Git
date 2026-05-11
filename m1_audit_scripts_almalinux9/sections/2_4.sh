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


echo "## M1 §2.4 Job Schedulers Audit"

check_file_perm() {
  local control_id="$1"; local title="$2"; local path="$3"; local expected_mode="$4"; local type="$5"
  if [ "$type" = "dir" ] && [ ! -d "$path" ]; then
    print_fail "$control_id" "$title" " - $path directory not found"
    return
  fi
  if [ "$type" = "file" ] && [ ! -e "$path" ]; then
    print_fail "$control_id" "$title" " - $path file not found"
    return
  fi
  read -r mode user group < <(stat -Lc '%a %U %G' "$path" 2>/dev/null || echo "999 unknown unknown")
  fail=(); ok=()
  [ "$mode" = "$expected_mode" ] && ok+=(" - mode is $mode") || fail+=(" - mode is $mode, expected $expected_mode")
  [ "$user" = "root" ] && ok+=(" - owner is root") || fail+=(" - owner is $user, expected root")
  [ "$group" = "root" ] && ok+=(" - group is root") || fail+=(" - group is $group, expected root")
  if [ "${#fail[@]}" -eq 0 ]; then
    print_pass "$control_id" "$title" "${ok[@]}"
  else
    print_fail "$control_id" "$title" "${fail[@]}"
    [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
  fi
}

if systemctl is-enabled crond >/dev/null 2>&1 && systemctl is-active crond >/dev/null 2>&1; then
  print_pass "2.4.1.1" "Ensure cron daemon is enabled and active" " - crond is enabled and active"
else
  print_fail "2.4.1.1" "Ensure cron daemon is enabled and active" " - crond is not both enabled and active"
fi

check_file_perm "2.4.1.2" "Ensure permissions on /etc/crontab are configured" "/etc/crontab" "600" "file"
check_file_perm "2.4.1.3" "Ensure permissions on /etc/cron.hourly are configured" "/etc/cron.hourly" "700" "dir"
check_file_perm "2.4.1.4" "Ensure permissions on /etc/cron.daily are configured" "/etc/cron.daily" "700" "dir"
check_file_perm "2.4.1.5" "Ensure permissions on /etc/cron.weekly are configured" "/etc/cron.weekly" "700" "dir"
check_file_perm "2.4.1.6" "Ensure permissions on /etc/cron.monthly are configured" "/etc/cron.monthly" "700" "dir"
check_file_perm "2.4.1.7" "Ensure permissions on /etc/cron.d are configured" "/etc/cron.d" "700" "dir"

check_allow_file() {
  local control_id="$1"; local title="$2"; local allow="$3"; local deny="$4"
  fail=(); ok=()
  if [ -e "$allow" ]; then
    read -r mode user group < <(stat -Lc '%a %U %G' "$allow" 2>/dev/null || echo "999 unknown unknown")
    [ "$mode" = "640" ] && ok+=(" - $allow mode is 640") || fail+=(" - $allow mode is $mode, expected 640")
    [ "$user" = "root" ] && ok+=(" - $allow owner is root") || fail+=(" - $allow owner is $user, expected root")
    [ "$group" = "root" ] && ok+=(" - $allow group is root") || fail+=(" - $allow group is $group, expected root")
  else
    fail+=(" - $allow does not exist")
  fi
  [ ! -e "$deny" ] && ok+=(" - $deny does not exist") || fail+=(" - $deny exists and should be removed or reviewed")
  if [ "${#fail[@]}" -eq 0 ]; then
    print_pass "$control_id" "$title" "${ok[@]}"
  else
    print_fail "$control_id" "$title" "${fail[@]}"
    [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
  fi
}

check_allow_file "2.4.1.8" "Ensure crontab is restricted to authorized users" "/etc/cron.allow" "/etc/cron.deny"
check_allow_file "2.4.2.1" "Ensure at is restricted to authorized users" "/etc/at.allow" "/etc/at.deny"

section_summary
