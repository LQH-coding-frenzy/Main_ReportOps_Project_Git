#!/usr/bin/env bash
set -u

echo "== M1 remediation started =="

ensure_gpgcheck() {
  if grep -Pq '^\s*gpgcheck\s*=' /etc/dnf/dnf.conf 2>/dev/null; then
    sed -i 's/^\s*gpgcheck\s*=\s*.*/gpgcheck=1/' /etc/dnf/dnf.conf
  else
    printf '\n%s\n' 'gpgcheck=1' >> /etc/dnf/dnf.conf
  fi

  if [ -d /etc/yum.repos.d ]; then
    find /etc/yum.repos.d -name '*.repo' -exec sed -i 's/^\s*gpgcheck\s*=\s*.*/gpgcheck=1/' {} \;
  fi
}

ensure_tmp_mount_options() {
  local current
  current="$(findmnt -kn /tmp 2>/dev/null | head -n 1 || true)"

  if [ -z "$current" ]; then
    if ! grep -Pq '^\s*tmpfs\s+/tmp\s+tmpfs\s+' /etc/fstab 2>/dev/null; then
      printf '%s\n' 'tmpfs /tmp tmpfs defaults,rw,nosuid,nodev,noexec,relatime,size=2G 0 0' >> /etc/fstab
    fi
    systemctl unmask tmp.mount >/dev/null 2>&1 || true
    mount /tmp >/dev/null 2>&1 || true
  fi

  if grep -Pq '^\s*[^#\n\r]+\s+/tmp\s+' /etc/fstab 2>/dev/null; then
    sed -i '/\s\/tmp\s/ {
      /nodev/! s/\([^[:space:]]\+\s\+\/tmp\s\+[^[:space:]]\+\s\+[^[:space:]]*\)/\1,nodev/
      /nosuid/! s/\([^[:space:]]\+\s\+\/tmp\s\+[^[:space:]]\+\s\+[^[:space:]]*\)/\1,nosuid/
      /noexec/! s/\([^[:space:]]\+\s\+\/tmp\s\+[^[:space:]]\+\s\+[^[:space:]]*\)/\1,noexec/
    }' /etc/fstab
  fi

  mount -o remount,nodev,nosuid,noexec /tmp >/dev/null 2>&1 || true
}

ensure_sysctl_hardening() {
  local target='/etc/sysctl.d/60-kernel_sysctl.conf'

  touch "$target"
  grep -Pq '^\s*kernel\.randomize_va_space\s*=' "$target" && \
    sed -i 's/^\s*kernel\.randomize_va_space\s*=\s*.*/kernel.randomize_va_space = 2/' "$target" || \
    printf '%s\n' 'kernel.randomize_va_space = 2' >> "$target"

  grep -Pq '^\s*kernel\.yama\.ptrace_scope\s*=' "$target" && \
    sed -i 's/^\s*kernel\.yama\.ptrace_scope\s*=\s*.*/kernel.yama.ptrace_scope = 1/' "$target" || \
    printf '%s\n' 'kernel.yama.ptrace_scope = 1' >> "$target"

  sysctl -w kernel.randomize_va_space=2 >/dev/null
  sysctl -w kernel.yama.ptrace_scope=1 >/dev/null
}

ensure_chrony() {
  dnf install -y chrony >/dev/null 2>&1 || true
  systemctl unmask chronyd >/dev/null 2>&1 || true
  systemctl enable --now chronyd >/dev/null 2>&1 || true
}

ensure_gpgcheck
ensure_tmp_mount_options
ensure_sysctl_hardening
ensure_chrony

echo "== M1 remediation finished =="
exit 0
