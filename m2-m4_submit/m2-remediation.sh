#!/usr/bin/env bash

echo "=========================================================================="
echo " Bắt đầu thực hiện cấu hình an toàn (Remediation) theo chuẩn CIS..."
echo "=========================================================================="

# Đảm bảo script được chạy bằng quyền root
if [ "$EUID" -ne 0 ]; then
  echo "Lỗi: Vui lòng chạy script này bằng quyền root (ví dụ: sudo ./remediation.sh)"
  exit 1
fi

echo -e "\n[1/6] 1.3.1.1 Đang cài đặt SELinux..."
dnf install -y libselinux

echo -e "\n[2/6] 1.3.1.4 Đang cấu hình SELinux sang chế độ Enforcing..."
sed -i 's/^SELINUX=.*/SELINUX=enforcing/' /etc/selinux/config
setenforce 1 2>/dev/null || echo "Lưu ý: Có thể cần khởi động lại máy để SELinux hoạt động nếu trước đó nó bị tắt hoàn toàn."

echo -e "\n[3/6] 1.3.1.7 & 1.3.1.8 Đang gỡ bỏ các dịch vụ không an toàn (mcstrans, setroubleshoot)..."
dnf remove -y mcstrans setroubleshoot

echo -e "\n[4/6] 3.3.1 & 3.3.7 Đang cấu hình an toàn mạng (Tắt IP Forwarding & Bật RP Filter)..."
# Ghi cấu hình vào file để áp dụng vĩnh viễn (persistent configuration)
cat <<EOF > /etc/sysctl.d/60-netipv4_sysctl.conf
net.ipv4.ip_forward = 0
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
EOF

# Áp dụng ngay vào kernel (runtime configuration)
sysctl -w net.ipv4.ip_forward=0
sysctl -w net.ipv4.conf.all.rp_filter=1
sysctl -w net.ipv4.conf.default.rp_filter=1

# Tải lại toàn bộ cấu hình sysctl để đảm bảo đồng bộ
sysctl --system

echo -e "\n[5/6] 4.1.1 Đang cài đặt tường lửa nftables..."
dnf install -y nftables
systemctl enable --now nftables

echo -e "\n=========================================================================="
echo " Đã hoàn tất toàn bộ các bước Remediation!"
echo "=========================================================================="