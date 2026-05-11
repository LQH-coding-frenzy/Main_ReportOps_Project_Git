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


echo "## M1 §1.4 Bootloader Audit"

user_cfg="$(find /boot -type f -name 'user.cfg' ! -empty 2>/dev/null | head -n 1 || true)"
if [ -n "$user_cfg" ] && grep -Pq '^\s*GRUB2_PASSWORD=grub\.pbkdf2\.sha512' "$user_cfg" 2>/dev/null; then
  print_pass "1.4.1" "Ensure bootloader password is set" " - bootloader password hash found in $user_cfg"
else
  print_fail "1.4.1" "Ensure bootloader password is set" " - GRUB2_PASSWORD hash was not found in /boot user.cfg files"
fi

fail=(); ok=()
while IFS= read -r -d '' f; do
  read -r file mode user group < <(stat -Lc '%n %a %U %G' "$f" 2>/dev/null || echo "$f 999 unknown unknown")
  max=600
  if [[ "$(dirname "$f")" =~ ^/boot/efi/EFI ]]; then max=700; fi
  # Compare octal permissions by checking any disallowed bits.
  if [ "$max" = "700" ]; then mask=077; else mask=177; fi
  if [ $((8#$mode & 8#$mask)) -eq 0 ]; then
    ok+=(" - $file mode $mode is $max or more restrictive")
  else
    fail+=(" - $file mode $mode should be $max or more restrictive")
  fi
  [ "$user" = "root" ] && ok+=(" - $file owner is root") || fail+=(" - $file owner is $user, should be root")
  [ "$group" = "root" ] && ok+=(" - $file group is root") || fail+=(" - $file group is $group, should be root")
done < <(find /boot -type f \( -name 'grub*' -o -name 'user.cfg' \) -print0 2>/dev/null)

if [ "${#fail[@]}" -eq 0 ]; then
  print_pass "1.4.2" "Ensure access to bootloader config is configured" "${ok[@]:- - no grub/user.cfg files found for evaluation}"
else
  print_fail "1.4.2" "Ensure access to bootloader config is configured" "${fail[@]}"
  [ "${#ok[@]}" -gt 0 ] && printf '%s\n' "- Correctly set:" "${ok[@]}"
fi

section_summary
