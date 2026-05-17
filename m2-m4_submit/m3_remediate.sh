#!/usr/bin/env bash
#
# M3 Remediation Script
# CIS AlmaLinux OS 9 Benchmark v2.0.0
# 
# CẢNH BÁO: Script này sẽ thay đổi cấu hình hệ thống
# Chỉ chạy trong môi trường lab đã backup
# Đọc kỹ từng bước trước khi thực thi
#

set -e

echo "=============================="
echo "M3 Remediation Script"
echo "CIS AlmaLinux OS 9 Benchmark v2.0.0"
echo "=============================="
echo ""
echo "CẢNH BÁO: Script này sẽ thay đổi cấu hình SSH và sudo"
echo "Đảm bảo bạn:"
echo "  - Đã backup cấu hình"
echo "  - Có quyền truy cập console nếu SSH bị lỗi"
echo "  - Đang SSH bằng user có sudo, không phải root"
echo ""
read -p "Tiếp tục? (yes/no): " confirm

if [[ "$confirm" != "yes" ]]; then
    echo "Hủy remediation."
    exit 0
fi

echo ""
echo "=============================="
echo "Bắt đầu remediation..."
echo "=============================="
echo ""

# ------------------------------
# 5.1.1 - Fix SSH config permissions
# ------------------------------
echo "[5.1.1] Fixing permissions on SSH config files..."

# Backup
cp -p /etc/ssh/sshd_config /etc/ssh/sshd_config.backup.$(date +%F_%T)

# Fix main config
chmod u-x,og-rwx /etc/ssh/sshd_config
chown root:root /etc/ssh/sshd_config

# Fix all .conf files in sshd_config.d
while IFS= read -r -d $'\0' l_file; do
    if [ -e "$l_file" ]; then
        chmod u-x,og-rwx "$l_file"
        chown root:root "$l_file"
        echo "  Fixed: $l_file"
    fi
done < <(find /etc/ssh/sshd_config.d -type f -print0 2>/dev/null)

echo "  ✓ SSH config permissions fixed"
echo ""

# ------------------------------
# 5.1.15 - Set LogLevel (already PASS, skip)
# ------------------------------
echo "[5.1.15] LogLevel already configured correctly (PASS)"
echo ""

# ------------------------------
# 5.1.19 - PermitEmptyPasswords (already PASS, skip)
# ------------------------------
echo "[5.1.19] PermitEmptyPasswords already configured correctly (PASS)"
echo ""

# ------------------------------
# 5.1.20 - Disable PermitRootLogin
# ------------------------------
echo "[5.1.20] Disabling PermitRootLogin..."
echo ""
echo "CẢNH BÁO: Bước này sẽ vô hiệu hóa đăng nhập root qua SSH"
echo "Đảm bảo bạn có user thường với quyền sudo!"
echo ""

# Check if non-root user with sudo exists
if [[ $EUID -eq 0 ]]; then
    echo "CẢNH BÁO: Bạn đang chạy script bằng root!"
    echo "Trước khi disable root login, cần tạo user thường với sudo."
    echo ""
    read -p "Bỏ qua remediation cho PermitRootLogin? (yes/no): " skip_root
    
    if [[ "$skip_root" == "yes" ]]; then
        echo "  ⚠ SKIPPED - PermitRootLogin vẫn là 'yes'"
        echo "  Lý do: Đang SSH bằng root, cần tạo user backup trước"
        echo ""
    else
        # Set PermitRootLogin no
        if grep -q "^PermitRootLogin" /etc/ssh/sshd_config.d/01-permitrootlogin.conf 2>/dev/null; then
            sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config.d/01-permitrootlogin.conf
        elif grep -q "^PermitRootLogin" /etc/ssh/sshd_config; then
            sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
        else
            echo "PermitRootLogin no" >> /etc/ssh/sshd_config
        fi
        echo "  ✓ PermitRootLogin set to no"
        echo ""
    fi
else
    # Running as non-root user with sudo
    if sudo grep -q "^PermitRootLogin" /etc/ssh/sshd_config.d/01-permitrootlogin.conf 2>/dev/null; then
        sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config.d/01-permitrootlogin.conf
    elif sudo grep -q "^PermitRootLogin" /etc/ssh/sshd_config; then
        sudo sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
    else
        echo "PermitRootLogin no" | sudo tee -a /etc/ssh/sshd_config > /dev/null
    fi
    echo "  ✓ PermitRootLogin set to no"
    echo ""
fi

# ------------------------------
# 5.1.22 - UsePAM (already PASS, skip)
# ------------------------------
echo "[5.1.22] UsePAM already configured correctly (PASS)"
echo ""

# ------------------------------
# 5.2.2 - Enable sudo use_pty
# ------------------------------
echo "[5.2.2] Enabling sudo use_pty..."

if ! grep -rq "^Defaults.*use_pty" /etc/sudoers /etc/sudoers.d/* 2>/dev/null; then
    # Create hardening file
    echo "Defaults use_pty" | tee /etc/sudoers.d/hardening > /dev/null
    chmod 440 /etc/sudoers.d/hardening
    echo "  ✓ Created /etc/sudoers.d/hardening with use_pty"
else
    echo "  ✓ use_pty already configured"
fi
echo ""

# ------------------------------
# 5.2.6 - sudo timeout (already PASS, skip)
# ------------------------------
echo "[5.2.6] sudo timeout already configured correctly (PASS)"
echo ""

# ------------------------------
# Test SSH configuration
# ------------------------------
echo "=============================="
echo "Testing SSH configuration..."
echo "=============================="

if sshd -t; then
    echo "✓ SSH configuration syntax is valid"
    echo ""
    echo "=============================="
    echo "Remediation Summary"
    echo "=============================="
    echo "✓ 5.1.1  - SSH config permissions fixed"
    echo "✓ 5.1.15 - LogLevel already correct (PASS)"
    echo "✓ 5.1.19 - PermitEmptyPasswords already correct (PASS)"
    
    if [[ "$skip_root" == "yes" ]]; then
        echo "⚠ 5.1.20 - PermitRootLogin SKIPPED (cần user backup)"
    else
        echo "✓ 5.1.20 - PermitRootLogin disabled"
    fi
    
    echo "✓ 5.1.22 - UsePAM already correct (PASS)"
    echo "✓ 5.2.2  - sudo use_pty enabled"
    echo "✓ 5.2.6  - sudo timeout already correct (PASS)"
    echo "=============================="
    echo ""
    echo "IMPORTANT: Restart SSH service to apply changes"
    echo ""
    echo "  sudo systemctl restart sshd"
    echo ""
    echo "BEFORE restarting SSH:"
    echo "  1. Keep this SSH session open"
    echo "  2. Test SSH in a NEW terminal"
    echo "  3. Only close this session after confirming new SSH works"
    echo ""
else
    echo "✗ SSH configuration has syntax errors!"
    echo "Restoring backup..."
    cp /etc/ssh/sshd_config.backup.* /etc/ssh/sshd_config
    echo "Please review errors and try again"
    exit 1
fi

echo "=============================="
echo "Remediation completed!"
echo "=============================="
