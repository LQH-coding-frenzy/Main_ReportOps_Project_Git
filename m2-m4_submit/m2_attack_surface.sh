#!/usr/bin/env bash

# CIS AlmaLinux OS 9 Benchmark v2.0.0 - Automated Audit Script
# Part M2: Attack Surface Reduction
# Assignee: Bảo

# Hàm in kết quả theo chuẩn ReportOps CIS-style
print_result() {
    local id="$1"
    local title="$2"
    local status="$3"
    local message="$4"
    
    echo "- [$id] $title"
    echo "[$status] - $message"
    echo ""
}

echo "=========================================================================="
echo " Starting M2 Audit: Attack Surface Reduction (CIS AlmaLinux 9 Benchmark) "
echo "=========================================================================="
echo ""

# ------------------------------------------------------------------------------
# 1.3.1.1 Ensure SELinux is installed (Automated)
# ------------------------------------------------------------------------------
if rpm -q libselinux >/dev/null 2>&1; then
    print_result "1.3.1.1" "Ensure SELinux is installed" "PASS" "Package libselinux is installed."
else
    print_result "1.3.1.1" "Ensure SELinux is installed" "FAIL" "Package libselinux is not installed."
fi

# ------------------------------------------------------------------------------
# 1.3.1.4 Ensure the SELinux mode is not disabled (Automated)
# ------------------------------------------------------------------------------
if command -v getenforce >/dev/null 2>&1; then
    selinux_mode=$(getenforce 2>/dev/null)
    if [ "$selinux_mode" = "Disabled" ]; then
        print_result "1.3.1.4" "Ensure the SELinux mode is not disabled" "FAIL" "SELinux mode is currently Disabled."
    else
        print_result "1.3.1.4" "Ensure the SELinux mode is not disabled" "PASS" "SELinux mode is not disabled (Current mode: $selinux_mode)."
    fi
else
    print_result "1.3.1.4" "Ensure the SELinux mode is not disabled" "FAIL" "Command getenforce not found."
fi

# ------------------------------------------------------------------------------
# 1.3.1.7 Ensure the MCS Translation Service (mcstrans) is not installed (Automated)
# ------------------------------------------------------------------------------
if rpm -q mcstrans >/dev/null 2>&1; then
    print_result "1.3.1.7" "Ensure mcstrans is not installed" "FAIL" "Package mcstrans is currently installed."
else
    print_result "1.3.1.7" "Ensure mcstrans is not installed" "PASS" "Package mcstrans is not installed."
fi

# ------------------------------------------------------------------------------
# 1.3.1.8 Ensure SETroubleshoot is not installed (Automated)
# ------------------------------------------------------------------------------
if rpm -q setroubleshoot >/dev/null 2>&1; then
    print_result "1.3.1.8" "Ensure SETroubleshoot is not installed" "FAIL" "Package setroubleshoot is currently installed."
else
    print_result "1.3.1.8" "Ensure SETroubleshoot is not installed" "PASS" "Package setroubleshoot is not installed."
fi

# ------------------------------------------------------------------------------
# 3.3.1 Ensure ip forwarding is disabled (Automated)
# ------------------------------------------------------------------------------
ipv4_forward=$(sysctl -n net.ipv4.ip_forward 2>/dev/null)
if [ "$ipv4_forward" = "0" ]; then
    print_result "3.3.1" "Ensure ip forwarding is disabled" "PASS" "net.ipv4.ip_forward is correctly set to 0."
else
    print_result "3.3.1" "Ensure ip forwarding is disabled" "FAIL" "net.ipv4.ip_forward is enabled ($ipv4_forward) or not set."
fi

# ------------------------------------------------------------------------------
# 3.3.7 Ensure reverse path filtering is enabled (Automated)
# ------------------------------------------------------------------------------
rp_filter_all=$(sysctl -n net.ipv4.conf.all.rp_filter 2>/dev/null)
rp_filter_default=$(sysctl -n net.ipv4.conf.default.rp_filter 2>/dev/null)

if [ "$rp_filter_all" = "1" ] && [ "$rp_filter_default" = "1" ]; then
    print_result "3.3.7" "Ensure reverse path filtering is enabled" "PASS" "rp_filter is set to 1 for both 'all' and 'default'."
else
    print_result "3.3.7" "Ensure reverse path filtering is enabled" "FAIL" "rp_filter is not enabled correctly (all=$rp_filter_all, default=$rp_filter_default)."
fi

# ------------------------------------------------------------------------------
# 4.1.1 Ensure nftables is installed (Automated)
# ------------------------------------------------------------------------------
if rpm -q nftables >/dev/null 2>&1; then
    print_result "4.1.1" "Ensure nftables is installed" "PASS" "Package nftables is installed."
else
    print_result "4.1.1" "Ensure nftables is installed" "FAIL" "Package nftables is not installed."
fi

echo "=========================================================================="
echo " M2 Audit Completed."
echo "=========================================================================="
exit 0