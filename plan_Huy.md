# Kế hoạch rút gọn 100% Automated — CIS AlmaLinux OS 9 Benchmark v2.0.0 cho ReportOps

## 1. Bối cảnh và lý do cập nhật

Mỗi thành viên trong nhóm làm khoảng **5–8 tiêu chí nhỏ nhất** trong CIS Benchmark. Một tiêu chí nhỏ nhất là một mục cụ thể, ví dụ `5.1.1`, `5.1.20`, `1.1.2.1.4`, không phải cả một chương lớn.
---

## 2. Flow chung của bài nhóm

### 2.1 Chủ đề flow

```text
Tự động hóa kiểm tra các tiêu chí cải thiện bảo mật cốt lõi cho AlmaLinux 9 Server:
nền tảng hệ thống → giảm bề mặt tấn công → bảo vệ truy cập quản trị → tài khoản, log và audit.
```

### 2.2 Ý nghĩa flow

Bài nhóm không chọn tiêu chí ngẫu nhiên. Các tiêu chí được chọn tạo thành một luồng cải thiện bảo mật hợp lý cho AlmaLinux 9 server dùng trong môi trường sinh lab:

```text
1. Huy bảo đảm nền tảng server an toàn: package trust, /tmp, process hardening, time sync.
2. Bảo giảm bề mặt tấn công: SELinux, service/package không cần thiết, network hardening, firewall nền tảng.
3. Duy bảo vệ truy cập quản trị: SSH và sudo.
4. Phước bảo vệ tài khoản và khả năng truy vết: PAM, password policy, journald, auditd.
```

---

## 3. Tổng quan phân chia công việc 100% Automated

| Thành viên | Chủ đề | Số tiêu chí | Tính chất |
|---|---|---:|---|
| Huy | Nền tảng server an toàn | 7 | Automated |
| Bảo| Giảm bề mặt tấn công | 7 | Automated |
| Duy | Bảo vệ truy cập quản trị | 7 | Automated |
| Phước | Tài khoản, mật khẩu, logging và audit | 7 | Automated |
| **Tổng** |  | **28** | **100% Automated** |

---

# 5. Phân công chi tiết

# Huy — Nền tảng server an toàn

## 5.1 Vai trò của Huy

Huy phụ trách lớp nền tảng đầu tiên của server. Một AlmaLinux 9 server an toàn cần:

```text
- kiểm tra chữ ký package;
- hạn chế vùng /tmp bị lợi dụng;
- bật hardening tiến trình cơ bản;
- có đồng bộ thời gian để log/audit có ý nghĩa.
```

## 5.2 Danh sách tiêu chí Huy — 100% Automated

| STT | Control ID | Tên tiêu chí | Nhóm CIS | Phương thức audit tự động |
|---:|---|---|---|---|
| 1 | `1.2.1.2` | Ensure gpgcheck is globally activated | Package Management | Kiểm tra `gpgcheck=1` trong `/etc/dnf/dnf.conf` và repo files |
| 2 | `1.1.2.1.2` | Ensure nodev option set on `/tmp` partition | Filesystem | Dùng `findmnt` kiểm tra option `nodev` |
| 3 | `1.1.2.1.3` | Ensure nosuid option set on `/tmp` partition | Filesystem | Dùng `findmnt` kiểm tra option `nosuid` |
| 4 | `1.1.2.1.4` | Ensure noexec option set on `/tmp` partition | Filesystem | Dùng `findmnt` kiểm tra option `noexec` |
| 5 | `1.5.1` | Ensure address space layout randomization is enabled | Process Hardening | Kiểm tra `kernel.randomize_va_space=2` |
| 6 | `1.5.2` | Ensure ptrace_scope is restricted | Process Hardening | Kiểm tra `kernel.yama.ptrace_scope=1` |
| 7 | `2.3.1` | Ensure time synchronization is in use | Time Synchronization | Kiểm tra `chronyd` hoặc service đồng bộ thời gian đang active |

## 5.3 File Huy cần nộp

```text
scripts/m1_base_server.sh
manifests/manifest-m1.yaml
logs/before/m1_before.log
logs/after/m1_after.log
screenshots/m1/
```

## 5.4 Nội dung Huy cần viết trong báo cáo

```text
- Vì sao gpgcheck quan trọng với package trust.
- Vì sao /tmp là vùng cần hardening trên Linux server.
- Vì sao ASLR và ptrace_scope giúp giảm rủi ro khai thác tiến trình.
- Vì sao time sync cần cho logging và audit trail.
```

---

# Bảo — Giảm bề mặt tấn công

## 6.1 Vai trò của Bảo

Bảo phụ trách giảm attack surface của server. Một server không nên bật các thành phần không cần thiết, không nên route packet nếu không làm router, và cần có nền tảng firewall rõ ràng.

## 6.2 Danh sách tiêu chí Bảo — 100% Automated

| STT | Control ID | Tên tiêu chí | Nhóm CIS | Phương thức audit tự động |
|---:|---|---|---|---|
| 1 | `1.3.1.1` | Ensure SELinux is installed | SELinux | Kiểm tra package SELinux |
| 2 | `1.3.1.5` | Ensure the SELinux mode is enforcing | SELinux | Dùng `getenforce` hoặc `sestatus` |
| 3 | `1.3.1.7` | Ensure mcstrans is not installed | SELinux | Kiểm tra package `mcstrans` không được cài |
| 4 | `1.3.1.8` | Ensure SETroubleshoot is not installed | SELinux | Kiểm tra package `setroubleshoot` không được cài |
| 5 | `3.3.1` | Ensure ip forwarding is disabled | Network | Kiểm tra `net.ipv4.ip_forward=0` |
| 6 | `3.3.7` | Ensure reverse path filtering is enabled | Network | Kiểm tra `rp_filter` |
| 7 | `4.1.1` | Ensure nftables is installed | Firewall | Kiểm tra package `nftables` |

## 6.3 File Bảo cần nộp

```text
scripts/m2_attack_surface.sh
manifests/manifest-m2.yaml
logs/before/m2_before.log
logs/after/m2_after.log
screenshots/m2/
```

## 6.4 Nội dung Bảo cần viết trong báo cáo

```text
- SELinux là gì và vì sao cần cho server.
- Vì sao loại bỏ mcstrans/setroubleshoot giúp giảm bề mặt tấn công.
- Vì sao server thường không nên bật IP forwarding.
- Vai trò của reverse path filtering.
- Vì sao cần có nftables/firewall nền tảng.
```

---

# Duy — Bảo vệ truy cập quản trị

## 7.1 Vai trò của Duy

Duy phụ trách đường quản trị server. Trong thực tế, sinh viên/quản trị viên thường vào server qua SSH, sau đó dùng sudo. Do đó, SSH và sudo là hai phần cần kiểm soát chặt.

## 7.2 Danh sách tiêu chí Duy — 100% Automated

| STT | Control ID | Tên tiêu chí | Nhóm CIS | Phương thức audit tự động |
|---:|---|---|---|---|
| 1 | `5.1.1` | Ensure permissions on `/etc/ssh/sshd_config` are configured | SSH | Dùng `stat` kiểm tra owner/group/mode |
| 2 | `5.1.15` | Ensure sshd LogLevel is configured | SSH | Dùng `sshd -T` kiểm tra `loglevel` |
| 3 | `5.1.19` | Ensure sshd PermitEmptyPasswords is disabled | SSH | Dùng `sshd -T` kiểm tra `permitemptypasswords no` |
| 4 | `5.1.20` | Ensure sshd PermitRootLogin is disabled | SSH | Dùng `sshd -T` kiểm tra `permitrootlogin no` hoặc giá trị an toàn |
| 5 | `5.1.22` | Ensure sshd UsePAM is enabled | SSH | Dùng `sshd -T` kiểm tra `usepam yes` |
| 6 | `5.2.2` | Ensure sudo commands use pty | Sudo | Kiểm tra `Defaults use_pty` trong sudoers |
| 7 | `5.2.6` | Ensure sudo authentication timeout is configured correctly | Sudo | Kiểm tra `timestamp_timeout <= 15` |

## 7.3 File Duy cần nộp

```text
scripts/m3_admin_access.sh
manifests/manifest-m3.yaml
logs/before/m3_before.log
logs/after/m3_after.log
screenshots/m3/
```

## 7.4 Nội dung Duy cần viết trong báo cáo

```text
- Vì sao SSH là điểm vào quan trọng nhất của server.
- Vì sao không nên cho root SSH trực tiếp.
- Vì sao không cho phép empty password.
- Vì sao SSH logging cần đủ thông tin.
- Vì sao sudo cần pty và timeout hợp lý.
```

---

# Phước — Tài khoản, mật khẩu, logging và audit trail

## 8.1 Vai trò của Phước 

Phước phụ trách lớp nhận diện và truy vết. Sau khi server đã có nền tảng an toàn, giảm attack surface và bảo vệ đường quản trị, hệ thống cần chính sách mật khẩu, tài khoản đặc quyền, logging và audit để điều tra sự cố.

## 8.2 Danh sách tiêu chí Phước — 100% Automated

| STT | Control ID | Tên tiêu chí | Nhóm CIS | Phương thức audit tự động |
|---:|---|---|---|---|
| 1 | `5.3.2.2` | Ensure pam_faillock module is enabled | PAM | Kiểm tra PAM/authselect config |
| 2 | `5.3.2.3` | Ensure pam_pwquality module is enabled | PAM | Kiểm tra PAM/authselect config |
| 3 | `5.3.2.4` | Ensure pam_pwhistory module is enabled | PAM | Kiểm tra PAM/authselect config |
| 4 | `5.4.1.1` | Ensure password expiration is configured | User Accounts | Kiểm tra `/etc/login.defs` hoặc `chage` |
| 5 | `5.4.2.1` | Ensure root is the only UID 0 account | User Accounts | Kiểm tra `/etc/passwd` |
| 6 | `6.2.1.1` | Ensure journald service is enabled and active | Logging | Kiểm tra `systemctl is-enabled/is-active systemd-journald` |
| 7 | `6.3.1.4` | Ensure auditd service is enabled and active | Auditing | Kiểm tra `systemctl is-enabled/is-active auditd` |

## 8.3 File Phước cần nộp

```text
scripts/m4_identity_logging_audit.sh
manifests/manifest-m4.yaml
logs/before/m4_before.log
logs/after/m4_after.log
screenshots/m4/
```

## 8.4 Nội dung Phước cần viết trong báo cáo

```text
- PAM là gì và vì sao cần faillock/pwquality/pwhistory.
- Vì sao password expiration quan trọng.
- Vì sao chỉ root nên có UID 0.
- Journald khác auditd như thế nào.
- Vì sao audit trail quan trọng khi vận hành server.
```

---

## 9. Yêu cầu file `.sh` để nạp vào ReportOps Web App

Mỗi thành viên nộp **01 file `.sh` duy nhất** theo đúng tên nhóm (nãy ở trên tui nói rùi á):

```text
Huy: scripts/m1_base_server.sh
Bảo: scripts/m2_attack_surface.sh
Duy: scripts/m3_admin_access.sh
Phước: scripts/m4_identity_logging_audit.sh
```

---

## 10. Quy định bắt buộc cho script `.sh`

### 10.1 File naming

Tên file phải đúng:

```text
m1_base_server.sh
m2_attack_surface.sh
m3_admin_access.sh
m4_identity_logging_audit.sh
```

Không dùng:

```text
- khoảng trắng trong tên file;
- ký tự tiếng Việt;
- ký tự đặc biệt khác ngoài `_`, `-`, `.`.
```

---

### 10.2 Shebang

Mỗi file bắt đầu bằng:

```bash
#!/usr/bin/env bash
```

Không bắt buộc dùng `set -e`, vì nếu một tiêu chí FAIL thì script vẫn cần tiếp tục kiểm tra các tiêu chí còn lại.

---

### 10.3 Về file chính phải là Audit-only

File script chính phải là **audit-only**.

Không tự động remediation trong script audit chính.

Không chạy trực tiếp các lệnh sửa hệ thống như:

```text
sed -i
chmod
chown
chgrp
systemctl disable
systemctl stop
dnf install
dnf remove
dnf update
yum install
yum remove
rm -rf
mkfs
dd
reboot
shutdown
poweroff
userdel
usermod
passwd
modprobe -r
rmmod
```

Nộp remediation phải để ra file riêng

```text
remediation/m1_remediate.sh
remediation/m2_remediate.sh
remediation/m3_remediate.sh
remediation/m4_remediate.sh
```

---

### 10.4 Output stdout chuẩn CIS-style

ReportOps parser sẽ đọc stdout theo style sau.

Mỗi control phải có dòng tiêu đề:

```text
### <CONTROL_ID> - <CONTROL_TITLE>
```

Ví dụ:

```text
### 5.1.20 - Ensure sshd PermitRootLogin is disabled
```

Sau đó phải có:

```text
- Audit Result:
 ** PASS **
```

hoặc:

```text
- Audit Result:
 ** FAIL **
 - Reason(s) for audit failure:
 - <lý do fail>
```

hoặc:

```text
- Audit Result:
 ** ERROR **
 - <lỗi runtime>
```

---

### 10.5 Trạng thái hợp lệ

Vì scope mới là **100% Automated**, script cần có các trạng thái:

```text
PASS
FAIL
ERROR
NOT_APPLICABLE
```

Ngoài ra không dùng:

```text
REVIEW
MANUAL
```

---

### 10.6 Exit code

Quy định:

```text
exit 0 = script chạy xong, dù có control PASS hoặc FAIL
exit 1 = script lỗi nghiêm trọng, không thể audit
```

Không được `exit 1` chỉ vì một tiêu chí FAIL. Exit 1 chỉ được dùng khi không audit được

---

### 10.7 Không interactive

Không dùng:

```text
read -p
select
menu tương tác
pause
sudo yêu cầu nhập password
```

ReportOps runner sẽ chạy tự động, nên script phải tự hoàn tất.

---

### 10.8 Thời gian chạy

```text
Mỗi file script: < 60 giây
Mỗi control: < 10 giây
```

Không dùng vòng lặp vô hạn, không dùng command treo chờ input.

---

### 10.9 Không leak thông tin nhạy cảm

Không in ra:

```text
private key
password
token
secret
DATABASE_URL
GITHUB_CLIENT_SECRET
GOOGLE_APPLICATION_CREDENTIALS
```

---

## 11. Template script chuẩn cho các thành viên

```bash
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

# Ví dụ control mẫu
check_example() {
  local id="X.X.X"
  local title="Example automated control"

  if true; then
    print_pass "$id" "$title" " - Example evidence"
  else
    print_fail "$id" "$title" " - Example failure reason"
  fi
}

check_example
section_summary
exit 0
```

---

## 12. Manifest YAML cho ReportOps

Mỗi thành viên nộp manifest tương ứng:

```text
manifests/manifest-m1.yaml
manifests/manifest-m2.yaml
manifests/manifest-m3.yaml
manifests/manifest-m4.yaml
```

---

### 12.1 Manifest Huy

```yaml
pack_id: "m1-base-server"
owner_section: "M1"
title: "Nền tảng server an toàn"
script: "scripts/m1_base_server.sh"
benchmark:
  name: "CIS AlmaLinux OS 9 Benchmark"
  version: "2.0.0"
  profile: "Level 1 - Server"
controls:
  - id: "1.2.1.2"
    title: "Ensure gpgcheck is globally activated"
    section: "1.2"
    parser: "cis_stdout"
  - id: "1.1.2.1.2"
    title: "Ensure nodev option set on /tmp partition"
    section: "1.1"
    parser: "cis_stdout"
  - id: "1.1.2.1.3"
    title: "Ensure nosuid option set on /tmp partition"
    section: "1.1"
    parser: "cis_stdout"
  - id: "1.1.2.1.4"
    title: "Ensure noexec option set on /tmp partition"
    section: "1.1"
    parser: "cis_stdout"
  - id: "1.5.1"
    title: "Ensure address space layout randomization is enabled"
    section: "1.5"
    parser: "cis_stdout"
  - id: "1.5.2"
    title: "Ensure ptrace_scope is restricted"
    section: "1.5"
    parser: "cis_stdout"
  - id: "2.3.1"
    title: "Ensure time synchronization is in use"
    section: "2.3"
    parser: "cis_stdout"
```

---

### 12.2 Manifest Bảo

```yaml
pack_id: "m2-attack-surface"
owner_section: "M2"
title: "Giảm bề mặt tấn công"
script: "scripts/m2_attack_surface.sh"
benchmark:
  name: "CIS AlmaLinux OS 9 Benchmark"
  version: "2.0.0"
  profile: "Level 1 - Server"
controls:
  - id: "1.3.1.1"
    title: "Ensure SELinux is installed"
    section: "1.3"
    parser: "cis_stdout"
  - id: "1.3.1.5"
    title: "Ensure the SELinux mode is enforcing"
    section: "1.3"
    parser: "cis_stdout"
  - id: "1.3.1.7"
    title: "Ensure mcstrans is not installed"
    section: "1.3"
    parser: "cis_stdout"
  - id: "1.3.1.8"
    title: "Ensure SETroubleshoot is not installed"
    section: "1.3"
    parser: "cis_stdout"
  - id: "3.3.1"
    title: "Ensure ip forwarding is disabled"
    section: "3.3"
    parser: "cis_stdout"
  - id: "3.3.7"
    title: "Ensure reverse path filtering is enabled"
    section: "3.3"
    parser: "cis_stdout"
  - id: "4.1.1"
    title: "Ensure nftables is installed"
    section: "4.1"
    parser: "cis_stdout"
```

---

### 12.3 Manifest Duy

```yaml
pack_id: "m3-admin-access"
owner_section: "M3"
title: "Bảo vệ truy cập quản trị"
script: "scripts/m3_admin_access.sh"
benchmark:
  name: "CIS AlmaLinux OS 9 Benchmark"
  version: "2.0.0"
  profile: "Level 1 - Server"
controls:
  - id: "5.1.1"
    title: "Ensure permissions on /etc/ssh/sshd_config are configured"
    section: "5.1"
    parser: "cis_stdout"
  - id: "5.1.15"
    title: "Ensure sshd LogLevel is configured"
    section: "5.1"
    parser: "cis_stdout"
  - id: "5.1.19"
    title: "Ensure sshd PermitEmptyPasswords is disabled"
    section: "5.1"
    parser: "cis_stdout"
  - id: "5.1.20"
    title: "Ensure sshd PermitRootLogin is disabled"
    section: "5.1"
    parser: "cis_stdout"
  - id: "5.1.22"
    title: "Ensure sshd UsePAM is enabled"
    section: "5.1"
    parser: "cis_stdout"
  - id: "5.2.2"
    title: "Ensure sudo commands use pty"
    section: "5.2"
    parser: "cis_stdout"
  - id: "5.2.6"
    title: "Ensure sudo authentication timeout is configured correctly"
    section: "5.2"
    parser: "cis_stdout"
```

---

### 12.4 Manifest Phước

```yaml
pack_id: "m4-identity-logging-audit"
owner_section: "M4"
title: "Tài khoản, mật khẩu, logging và audit trail"
script: "scripts/m4_identity_logging_audit.sh"
benchmark:
  name: "CIS AlmaLinux OS 9 Benchmark"
  version: "2.0.0"
  profile: "Level 1 - Server"
controls:
  - id: "5.3.2.2"
    title: "Ensure pam_faillock module is enabled"
    section: "5.3"
    parser: "cis_stdout"
  - id: "5.3.2.3"
    title: "Ensure pam_pwquality module is enabled"
    section: "5.3"
    parser: "cis_stdout"
  - id: "5.3.2.4"
    title: "Ensure pam_pwhistory module is enabled"
    section: "5.3"
    parser: "cis_stdout"
  - id: "5.4.1.1"
    title: "Ensure password expiration is configured"
    section: "5.4"
    parser: "cis_stdout"
  - id: "5.4.2.1"
    title: "Ensure root is the only UID 0 account"
    section: "5.4"
    parser: "cis_stdout"
  - id: "6.2.1.1"
    title: "Ensure journald service is enabled and active"
    section: "6.2"
    parser: "cis_stdout"
  - id: "6.3.1.4"
    title: "Ensure auditd service is enabled and active"
    section: "6.3"
    parser: "cis_stdout"
```

---

## 13. Cấu trúc thư mục nộp bài của nhóm mình (nhóm trưởng quản lý, các thành viên xem qua cho biết)

```text
cis-almalinux9-server-hardening/
├── report/
│   └── final_report.docx
├── scripts/
│   ├── m1_base_server.sh
│   ├── m2_attack_surface.sh
│   ├── m3_admin_access.sh
│   └── m4_identity_logging_audit.sh
├── manifests/
│   ├── manifest-m1.yaml
│   ├── manifest-m2.yaml
│   ├── manifest-m3.yaml
│   └── manifest-m4.yaml
├── logs/
│   ├── before/
│   └── after/
├── screenshots/
│   ├── m1/
│   ├── m2/
│   ├── m3/
│   └── m4/
└── README.md
```

---

## 14. Checklist trước khi nạp vào ReportOps web app - cho AI kiểm tra lại trước khi nộp

```text
[ ] File đúng tên nhóm
[ ] Có shebang #!/usr/bin/env bash
[ ] Không có remediation trong script audit chính
[ ] Không có lệnh nguy hiểm/sửa hệ thống
[ ] Không yêu cầu input tương tác
[ ] Chạy xong với exit 0 nếu audit hoàn tất
[ ] Mỗi control có dòng ### CONTROL_ID - TITLE
[ ] Mỗi control có - Audit Result:
[ ] Trạng thái chính là PASS/FAIL/ERROR/NOT_APPLICABLE
[ ] Hạn chế REVIEW/MANUAL
[ ] Có summary cuối file
[ ] Chạy thử trên VM AlmaLinux 9 được
[ ] Log stdout lưu được bằng tee
```

Lệnh test nhanh:

```bash
chmod +x scripts/m1_base_server.sh
sudo ./scripts/m1_base_server.sh | tee logs/before/m1_test.log
```

---

## 15. Kế hoạch thực hiện chính

### Phần 1 — Chốt scope 100% Automated

```text
- Cả nhóm thống nhất 28 tiêu chí automated.
- Mỗi thành viên nhận 7 tiêu chí.
- Tạo folder scripts/, manifests/, logs/, screenshots/.
```

### Phần 2 — Viết script audit

```text
- Mỗi thành viên viết 01 file .sh.
- Output theo chuẩn CIS stdout.
- Không viết remediation trong file audit chính.
```

### Phần 3 — Test trên VM sạch

```text
- Chạy từng script trên VM AlmaLinux 9 sạch.
- Ghi nhận PASS/FAIL ban đầu.
- Sửa lỗi runtime trong script nếu có.
```

### Phần 4 — Tạo lỗi an toàn và chạy lại

```text
- Tạo một số trạng thái FAIL an toàn.
- Chạy audit lần 1.
- Khôi phục hoặc sửa thủ công.
- Chạy audit lần 2 để xem có sửa được không
```

### Phần 5 — Viết báo cáo và làm slide như nhóm đã thảo luận trong Messenger 

---

## 16. Kết luận

Flow bài nhóm:

```text
Nền tảng server an toàn
→ Giảm bề mặt tấn công
→ Bảo vệ truy cập quản trị
→ Tài khoản, mật khẩu, logging và audit trail
```

---

# 17. Mẫu dàn ý báo cáo cho cả nhóm

> Mục này bổ sung để các thành viên viết báo cáo thống nhất, ngắn gọn và dễ gộp vào ReportOps.  
> Các thành viên còn lại chỉ cần đi thẳng vào phần báo cáo chính theo tiêu chí được phân công.

---

## 17.1 Mục tiêu của dàn ý

Dàn ý này giúp nhóm thống nhất cách viết báo cáo theo hướng:

```text
Ngắn hơn
Không lan man toàn bộ CIS Benchmark
Không copy script dài vào báo cáo chính
Mỗi thành viên tập trung 7 tiêu chí automated
Tất cả nội dung có flow bảo mật rõ ràng
Dễ đưa kết quả vào ReportOps Web App
```

Báo cáo chính chỉ nên trình bày:

```text
- Lý do chọn tiêu chí
- Ý nghĩa bảo mật
- Cách audit ở mức ý tưởng
- Kết quả PASS/FAIL
- Minh chứng log/screenshot
- Nhận xét sau khi chạy
```

Không đưa script audit/remediation dài vào báo cáo chính. Script `.sh`, manifest, log và ảnh minh chứng được nộp riêng trong thư mục project.

---

# 18. Dàn ý phần của Huy

> Huy là nhóm trưởng nên cần viết phần mở đầu và phần giải thích hệ thống chung.  
> Phần này giúp thầy hiểu nhóm chọn scope như thế nào, vì sao chia M1–M4 như vậy, ReportOps Web App đóng vai trò gì, và các thành viên sẽ nộp script/log/screenshot theo cấu trúc nào.

---

## 18.1 Trang bìa và thông tin đề tài

Nội dung cần có:

```text
Tên môn học
Tên đề tài
Danh sách thành viên
Giảng viên hướng dẫn
Lớp/nhóm
Thời gian thực hiện
```

Tên đề tài gợi ý:

```text
Tự động hóa kiểm tra các tiêu chí hardening cốt lõi cho AlmaLinux 9 Server theo CIS Benchmark Level 1
```

Hoặc:

```text
Thiết kế quy trình tự động hóa audit bảo mật AlmaLinux 9 Server theo CIS Benchmark v2.0.0 bằng ReportOps
```

---

## 18.2 Chương 1 — Giới thiệu đề tài

### 18.2.1 Lý do chọn đề tài

Cần viết ngắn gọn theo ý:

```text
AlmaLinux 9 là hệ điều hành Linux phù hợp cho môi trường server/lab.
Khi dùng làm server, hệ thống cần được hardening để giảm rủi ro cấu hình sai.
CIS Benchmark cung cấp bộ khuyến nghị bảo mật có cấu trúc, có thể dùng làm cơ sở kiểm tra.
Nhóm chọn một tập tiêu chí nhỏ, có thể tự động audit bằng shell script, phù hợp thời lượng đồ án.
```

### 18.2.2 Mục tiêu đề tài

Gợi ý viết:

```text
- Nghiên cứu các tiêu chí CIS Benchmark Level 1 - Server phù hợp với AlmaLinux 9.
- Rút gọn scope thành 28 tiêu chí automated, chia đều cho 4 thành viên.
- Viết script audit cho từng nhóm tiêu chí.
- Chuẩn hóa output PASS/FAIL/ERROR để ReportOps Web App có thể đọc.
- Lưu log, screenshot và kết quả để phục vụ báo cáo.
```

### 18.2.3 Phạm vi đề tài

Cần nhấn mạnh:

```text
- Không triển khai toàn bộ CIS Benchmark.
- Không chọn tiêu chí Manual/Review làm scope chính.
- Chỉ chọn 28 tiêu chí có thể audit tự động.
- Không đưa script dài vào báo cáo chính.
- Không bắt buộc auto-remediation trong MVP.
```

### 18.2.4 Đối tượng sử dụng

Gợi ý:

```text
Sinh viên hoặc nhóm quản trị hệ thống cần kiểm tra nhanh cấu hình hardening cơ bản của AlmaLinux 9 Server trong môi trường học tập/lab.
```

---

## 18.3 Chương 2 — Cơ sở lý thuyết chung

### 18.3.1 AlmaLinux 9 Server

Cần giải thích:

```text
- AlmaLinux 9 là hệ điều hành Linux hướng enterprise/server.
- Server cần ổn định, an toàn và dễ quản trị.
- Các lỗi cấu hình thường gặp có thể đến từ package, SSH, sudo, firewall, SELinux, logging, tài khoản.
```

### 18.3.2 CIS Benchmark là gì

Cần giải thích:

```text
- CIS Benchmark là bộ khuyến nghị hardening cấu hình hệ thống.
- Mỗi khuyến nghị có mã định danh, mô tả, lý do bảo mật, audit và remediation.
- Nhóm sử dụng CIS AlmaLinux OS 9 Benchmark v2.0.0, profile Level 1 - Server.
```

### 18.3.3 Vì sao chọn Level 1 - Server

Gợi ý:

```text
Level 1 - Server phù hợp với môi trường lab vì tập trung vào các cấu hình bảo mật cơ bản, ít gây gián đoạn hơn Level 2 và phù hợp với server thay vì workstation.
```

### 18.3.4 Vì sao chỉ chọn tiêu chí Automated

Gợi ý:

```text
Các tiêu chí Automated cho phép nhóm viết script kiểm tra nhất quán, dễ chạy lại nhiều lần, dễ lấy log, dễ chụp minh chứng và dễ tích hợp vào ReportOps Web App.
```

---

## 18.4 Chương 3 — Flow lựa chọn tiêu chí của nhóm

### 18.4.1 Flow bảo mật tổng thể

Trình bày flow:

```text
Nền tảng server an toàn
→ Giảm bề mặt tấn công
→ Bảo vệ truy cập quản trị
→ Tài khoản, mật khẩu, logging và audit trail
```

### 18.4.2 Giải thích vai trò từng nhóm

Viết theo bảng hoặc đoạn ngắn:

```text
Huy: Nền tảng server an toàn — package trust, /tmp, process hardening, time sync.
Bảo: Giảm bề mặt tấn công — SELinux, network, firewall.
Duy: Bảo vệ truy cập quản trị — SSH và sudo.
Phước: Tài khoản và truy vết — PAM, password policy, journald, auditd.
```

### 18.4.3 Bảng tổng hợp 28 tiêu chí

Huy nên đưa lại bảng tổng quan:

```text
Tên thành viên | Chủ đề | Số tiêu chí | Tên file script | Tên manifest
```

Ví dụ:

| Thành viên | Chủ đề | Số tiêu chí | Script | Manifest |
|---|---|---:|---|---|
| Huy | Nền tảng server an toàn | 7 | `m1_base_server.sh` | `manifest-m1.yaml` |
| Bảo | Giảm bề mặt tấn công | 7 | `m2_attack_surface.sh` | `manifest-m2.yaml` |
| Duy | Bảo vệ truy cập quản trị | 7 | `m3_admin_access.sh` | `manifest-m3.yaml` |
| Phước | Tài khoản, logging, audit | 7 | `m4_identity_logging_audit.sh` | `manifest-m4.yaml` |

---

## 18.5 Chương 4 — Giới thiệu ReportOps Web App

> Đây là phần chỉ nhóm trưởng cần viết kỹ. Thành viên khác không cần lặp lại.

### 18.5.1 ReportOps là gì trong bài nhóm

Gợi ý viết:

```text
ReportOps là web app hỗ trợ nhóm quản lý script audit, chạy kiểm tra trên VM AlmaLinux 9, thu thập output, parse kết quả PASS/FAIL/ERROR, lưu log, screenshot và archive để phục vụ báo cáo.
```

### 18.5.2 Vai trò của ReportOps trong flow bài làm

Trình bày theo flow:

```text
Thành viên nộp script .sh
→ Trưởng nhóm kiểm tra format
→ Nạp script và manifest vào ReportOps
→ Chạy audit trên VM
→ ReportOps thu stdout/stderr
→ Parser đọc kết quả PASS/FAIL/ERROR
→ Lưu log và screenshot
→ Dùng kết quả để hoàn thiện báo cáo
```

### 18.5.3 Cấu trúc dữ liệu ReportOps cần đọc

Giải thích ngắn:

```text
- Script .sh: chứa logic audit từng control.
- Manifest YAML: mô tả script thuộc nhóm nào, gồm control_id, title, section, parser.
- Log: output stdout/stderr sau khi chạy.
- Screenshot: minh chứng giao diện/terminal/result.
- Summary: tổng hợp PASS/FAIL/ERROR của từng nhóm.
```

### 18.5.4 Chuẩn output để ReportOps parse

Đưa mẫu:

```text
### 5.1.20 - Ensure sshd PermitRootLogin is disabled

- Audit Result:
 ** PASS **
 - PermitRootLogin is disabled
```

Hoặc:

```text
### 5.1.20 - Ensure sshd PermitRootLogin is disabled

- Audit Result:
 ** FAIL **
 - Reason(s) for audit failure:
 - PermitRootLogin is set to yes
```

### 18.5.5 Cấu trúc thư mục nộp vào ReportOps

```text
cis-almalinux9-server-hardening/
├── scripts/
│   ├── m1_base_server.sh
│   ├── m2_attack_surface.sh
│   ├── m3_admin_access.sh
│   └── m4_identity_logging_audit.sh
├── manifests/
│   ├── manifest-m1.yaml
│   ├── manifest-m2.yaml
│   ├── manifest-m3.yaml
│   └── manifest-m4.yaml
├── logs/
│   ├── before/
│   └── after/
└── screenshots/
    ├── m1/
    ├── m2/
    ├── m3/
    └── m4/
```

### 18.5.6 Lợi ích của ReportOps

Gợi ý:

```text
ReportOps giúp nhóm chuẩn hóa cách chạy script, tránh mỗi thành viên ghi log một kiểu, đồng thời giúp nhóm trưởng dễ tổng hợp kết quả và minh chứng. Việc lưu stdout, screenshot và manifest giúp báo cáo có tính truy vết tốt hơn.
```

---

## 18.6 Chương 5 — Phương pháp thực nghiệm chung

### 18.6.1 Môi trường lab

Gợi ý:

```text
- Hệ điều hành: AlmaLinux 9
- Profile tham chiếu: CIS AlmaLinux OS 9 Benchmark v2.0.0 Level 1 - Server
- Máy ảo: 1 hoặc 2 VM
- Quyền chạy script: sudo nếu cần đọc cấu hình hệ thống
- Output: stdout theo CIS-style
```

### 18.6.2 Quy trình test chung

```text
1. Chạy script trên VM sạch để lấy trạng thái ban đầu.
2. Lưu log before.
3. Tạo một số lỗi cấu hình an toàn nếu cần demo FAIL.
4. Chạy lại script để xác nhận phát hiện lỗi.
5. Sửa cấu hình hoặc mô tả remediation.
6. Chạy lại script để lấy log after.
7. Chụp screenshot minh chứng.
8. Nạp log/screenshot vào ReportOps.
```

### 18.6.3 Cách đánh giá kết quả

```text
PASS: cấu hình đạt tiêu chí.
FAIL: cấu hình chưa đạt tiêu chí.
ERROR: script không chạy được hoặc thiếu dữ liệu nghiêm trọng.
NOT_APPLICABLE: tiêu chí không áp dụng cho môi trường cụ thể.
```

---

## 18.7 Chương 6 — Tổng hợp kết quả toàn nhóm

Huy cần tổng hợp bảng cuối:

| Thành viên | Tổng control | PASS | FAIL | ERROR | Ghi chú |
|---|---:|---:|---:|---:|---|
| Huy | 7 |  |  |  |  |
| Bảo | 7 |  |  |  |  |
| Duy | 7 |  |  |  |  |
| Phước | 7 |  |  |  |  |
| **Tổng** | **28** |  |  |  |  |

Gợi ý nhận xét:

```text
Kết quả cho thấy nhóm tiêu chí đã chọn có thể audit tự động bằng shell script. Các lỗi thường gặp tập trung vào cấu hình SSH, sudo, SELinux, time sync hoặc dịch vụ audit/logging. Việc chuẩn hóa output giúp ReportOps dễ tổng hợp kết quả.
```

---

## 18.8 Chương 7 — Kết luận chung

Huy viết phần kết luận chung:

```text
- Nhóm đã rút gọn CIS Benchmark thành 28 tiêu chí automated phù hợp môi trường server học tập.
- Mỗi thành viên phụ trách một lớp bảo mật trong flow tổng thể.
- Các script audit có output thống nhất để nạp vào ReportOps.
- ReportOps hỗ trợ quản lý script, log, screenshot và kết quả PASS/FAIL.
- Hạn chế: chưa bao phủ toàn bộ CIS Benchmark, chưa triển khai remediation đầy đủ, chưa kiểm thử trên nhiều môi trường production.
- Hướng phát triển: mở rộng thêm control, bổ sung remediation có xác nhận, xuất JSON/CSV, tự động tạo báo cáo hoàn chỉnh.
```

---

# 19. Dàn ý phần báo cáo cho từng thành viên

> Các thành viên Bảo, Duy, Phước chỉ cần viết theo dàn ý này.  
> Huy cũng dùng dàn ý này cho phần M1 của mình, nhưng Huy viết thêm các chương tổng quan ở trên.

---

## 19.1 Cấu trúc phần báo cáo cá nhân

Mỗi thành viên viết phần riêng theo cấu trúc:

```text
1. Giới thiệu nhóm tiêu chí được giao
2. Danh sách tiêu chí
3. Phân tích từng tiêu chí
4. Thiết kế script audit
5. Kết quả thực nghiệm
6. Nhận xét và hạn chế
```

---

## 19.2 Mẫu mục 1 — Giới thiệu nhóm tiêu chí

Template:

```text
Phần này tập trung vào nhóm tiêu chí [tên chủ đề]. Nhóm tiêu chí này có vai trò [mô tả vai trò trong flow chung]. Trong bối cảnh AlmaLinux 9 được sử dụng làm server, các tiêu chí này giúp [lợi ích bảo mật chính].
```

Ví dụ cho M3:

```text
Phần này tập trung vào nhóm tiêu chí bảo vệ truy cập quản trị. Trong bối cảnh AlmaLinux 9 được sử dụng làm server, SSH là điểm vào chính của quản trị viên, còn sudo là cơ chế leo quyền để thực hiện tác vụ đặc quyền. Vì vậy, việc kiểm soát SSH và sudo giúp giảm nguy cơ truy cập trái phép và lạm dụng đặc quyền.
```

---

## 19.3 Mẫu mục 2 — Danh sách tiêu chí

Mỗi thành viên tạo bảng:

| STT | Control ID | Tên tiêu chí | Mục đích kiểm tra |
|---:|---|---|---|
| 1 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 2 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 3 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 4 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 5 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 6 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |
| 7 | `x.x.x` | Tên tiêu chí | Mục đích ngắn |

---

## 19.4 Mẫu mục 3 — Phân tích từng tiêu chí

Mỗi tiêu chí viết ngắn theo form sau:

```text
### <Control ID> - <Tên tiêu chí>

Mục đích:
Tiêu chí này nhằm kiểm tra ...

Rủi ro nếu không đạt:
Nếu cấu hình này không đúng, hệ thống có thể ...

Cách audit tự động:
Script kiểm tra bằng cách ...

Kết quả mong đợi:
Hệ thống đạt khi ...

Ghi chú thực nghiệm:
Trong lab, tiêu chí này có thể tạo trạng thái FAIL bằng cách ... hoặc chỉ kiểm tra trạng thái hiện tại nếu việc tạo lỗi có rủi ro.
```

### Ví dụ mẫu

```text
### 5.1.20 - Ensure sshd PermitRootLogin is disabled

Mục đích:
Tiêu chí này kiểm tra việc đăng nhập SSH trực tiếp bằng tài khoản root có bị vô hiệu hóa hay không.

Rủi ro nếu không đạt:
Nếu root được phép đăng nhập SSH trực tiếp, kẻ tấn công có thể tập trung brute-force vào tài khoản có đặc quyền cao nhất.

Cách audit tự động:
Script dùng sshd -T để lấy cấu hình hiệu lực và kiểm tra giá trị permitrootlogin.

Kết quả mong đợi:
Hệ thống đạt khi permitrootlogin có giá trị no hoặc một giá trị an toàn tương đương theo chính sách.

Ghi chú thực nghiệm:
Có thể tạo trạng thái FAIL trong VM lab bằng cách cấu hình PermitRootLogin yes, sau đó chạy lại script audit để kiểm tra khả năng phát hiện lỗi.
```

---

## 19.5 Mẫu mục 4 — Thiết kế script audit

Không dán toàn bộ script dài. Chỉ mô tả:

```text
Script của phần này được viết bằng Bash, chạy theo chế độ audit-only, không tự động sửa cấu hình. Mỗi tiêu chí được triển khai thành một hàm kiểm tra riêng. Kết quả được in ra stdout theo chuẩn CIS-style để ReportOps có thể parse.
```

Nêu format output:

```text
### <CONTROL_ID> - <CONTROL_TITLE>

- Audit Result:
 ** PASS **
```

Hoặc:

```text
### <CONTROL_ID> - <CONTROL_TITLE>

- Audit Result:
 ** FAIL **
 - Reason(s) for audit failure:
 - <lý do>
```

Nêu tên file script:

```text
File script của phần này: scripts/<tên_file>.sh
```

---

## 19.6 Mẫu mục 5 — Kết quả thực nghiệm

Mỗi thành viên làm bảng:

| Control ID | Trạng thái trước | Trạng thái sau | Minh chứng |
|---|---|---|---|
| `x.x.x` | PASS/FAIL | PASS/FAIL | log/screenshot |
| `x.x.x` | PASS/FAIL | PASS/FAIL | log/screenshot |

Sau bảng, viết nhận xét:

```text
Kết quả cho thấy script có thể tự động phát hiện các cấu hình chưa đạt. Các tiêu chí PASS chứng minh hệ thống đã thỏa điều kiện kiểm tra, trong khi các tiêu chí FAIL cho biết cấu hình cần được điều chỉnh hoặc giải thích thêm trong phần remediation.
```

---

## 19.7 Mẫu mục 6 — Nhận xét và hạn chế

Template:

```text
Nhóm tiêu chí này có ưu điểm là có thể audit tự động, dễ lấy log và dễ tích hợp vào ReportOps. Tuy nhiên, kết quả audit phụ thuộc vào trạng thái thực tế của VM và một số cấu hình có thể khác nhau tùy môi trường. Trong phạm vi đồ án, phần này chỉ tập trung audit, chưa triển khai remediation tự động đầy đủ.
```

---

# 20. Dàn ý cụ thể cho từng thành viên

---

## 20.1 Huy — M1: Nền tảng server an toàn

Huy viết thêm phần tổng quan ở mục 18, sau đó viết phần M1 theo dàn ý cá nhân.

### Mở đầu phần M1

```text
Phần M1 tập trung vào lớp nền tảng của AlmaLinux 9 Server. Các tiêu chí được chọn kiểm tra độ tin cậy của package, khả năng hạn chế lạm dụng vùng /tmp, hardening tiến trình và đồng bộ thời gian hệ thống. Đây là các cấu hình nền quan trọng trước khi triển khai các lớp bảo mật cao hơn như SSH, firewall hoặc auditd.
```

### Bảng tiêu chí M1

| STT | Control ID | Tên tiêu chí | Mục đích kiểm tra |
|---:|---|---|---|
| 1 | `1.2.1.2` | Ensure gpgcheck is globally activated | Kiểm tra xác thực chữ ký package |
| 2 | `1.1.2.1.2` | Ensure nodev option set on `/tmp` partition | Ngăn tạo device đặc biệt trong `/tmp` |
| 3 | `1.1.2.1.3` | Ensure nosuid option set on `/tmp` partition | Ngăn setuid trong `/tmp` |
| 4 | `1.1.2.1.4` | Ensure noexec option set on `/tmp` partition | Ngăn chạy file thực thi từ `/tmp` |
| 5 | `1.5.1` | Ensure ASLR is enabled | Giảm rủi ro khai thác bộ nhớ |
| 6 | `1.5.2` | Ensure ptrace_scope is restricted | Hạn chế tiến trình đọc/điều khiển tiến trình khác |
| 7 | `2.3.1` | Ensure time synchronization is in use | Đảm bảo log/audit có thời gian chính xác |

### File cần nhắc trong báo cáo

```text
Script: scripts/m1_base_server.sh
Manifest: manifests/manifest-m1.yaml
Log: logs/before/m1_before.log, logs/after/m1_after.log
Screenshot: screenshots/m1/
```

---

## 20.2 Bảo — M2: Giảm bề mặt tấn công

### Mở đầu phần M2

```text
Phần M2 tập trung vào việc giảm bề mặt tấn công của AlmaLinux 9 Server. Các tiêu chí được chọn xoay quanh SELinux, loại bỏ gói không cần thiết, cấu hình network kernel và nền tảng firewall. Đây là lớp bảo vệ giúp hạn chế khả năng khai thác khi server có dịch vụ bị tấn công.
```

### Bảng tiêu chí M2

| STT | Control ID | Tên tiêu chí | Mục đích kiểm tra |
|---:|---|---|---|
| 1 | `1.3.1.1` | Ensure SELinux is installed | Đảm bảo hệ thống có SELinux |
| 2 | `1.3.1.5` | Ensure SELinux mode is enforcing | Đảm bảo SELinux thực thi chính sách |
| 3 | `1.3.1.7` | Ensure mcstrans is not installed | Loại bỏ gói không cần thiết |
| 4 | `1.3.1.8` | Ensure SETroubleshoot is not installed | Loại bỏ gói hỗ trợ debug không cần trên server |
| 5 | `3.3.1` | Ensure ip forwarding is disabled | Ngăn server hoạt động như router ngoài ý muốn |
| 6 | `3.3.7` | Ensure reverse path filtering is enabled | Giảm rủi ro IP spoofing |
| 7 | `4.1.1` | Ensure nftables is installed | Đảm bảo có nền tảng firewall |

### File cần nhắc trong báo cáo

```text
Script: scripts/m2_attack_surface.sh
Manifest: manifests/manifest-m2.yaml
Log: logs/before/m2_before.log, logs/after/m2_after.log
Screenshot: screenshots/m2/
```

---

## 20.3 Duy — M3: Bảo vệ truy cập quản trị

### Mở đầu phần M3

```text
Phần M3 tập trung vào bảo vệ đường truy cập quản trị của AlmaLinux 9 Server. Trong thực tế, SSH là phương thức đăng nhập quản trị phổ biến, còn sudo là cơ chế leo quyền để thực hiện thao tác đặc quyền. Do đó, việc kiểm soát SSH và sudo giúp giảm nguy cơ đăng nhập trái phép và lạm dụng quyền quản trị.
```

### Bảng tiêu chí M3

| STT | Control ID | Tên tiêu chí | Mục đích kiểm tra |
|---:|---|---|---|
| 1 | `5.1.1` | Ensure permissions on `/etc/ssh/sshd_config` are configured | Bảo vệ file cấu hình SSH |
| 2 | `5.1.15` | Ensure sshd LogLevel is configured | Đảm bảo SSH ghi log phù hợp |
| 3 | `5.1.19` | Ensure PermitEmptyPasswords is disabled | Chặn đăng nhập mật khẩu rỗng |
| 4 | `5.1.20` | Ensure PermitRootLogin is disabled | Chặn root SSH trực tiếp |
| 5 | `5.1.22` | Ensure UsePAM is enabled | Bảo đảm SSH dùng PAM |
| 6 | `5.2.2` | Ensure sudo commands use pty | Tăng khả năng kiểm soát phiên sudo |
| 7 | `5.2.6` | Ensure sudo authentication timeout is configured correctly | Hạn chế thời gian phiên sudo còn hiệu lực |

### File cần nhắc trong báo cáo

```text
Script: scripts/m3_admin_access.sh
Manifest: manifests/manifest-m3.yaml
Log: logs/before/m3_before.log, logs/after/m3_after.log
Screenshot: screenshots/m3/
```

---

## 20.4 Phước — M4: Tài khoản, mật khẩu, logging và audit trail

### Mở đầu phần M4

```text
Phần M4 tập trung vào lớp nhận diện người dùng và khả năng truy vết của AlmaLinux 9 Server. Các tiêu chí được chọn liên quan đến PAM, chính sách mật khẩu, tài khoản root, journald và auditd. Đây là lớp bảo mật giúp kiểm soát đăng nhập, giảm rủi ro tài khoản yếu và hỗ trợ điều tra sự cố.
```

### Bảng tiêu chí M4

| STT | Control ID | Tên tiêu chí | Mục đích kiểm tra |
|---:|---|---|---|
| 1 | `5.3.2.2` | Ensure pam_faillock module is enabled | Hạn chế brute-force đăng nhập |
| 2 | `5.3.2.3` | Ensure pam_pwquality module is enabled | Kiểm tra độ mạnh mật khẩu |
| 3 | `5.3.2.4` | Ensure pam_pwhistory module is enabled | Ngăn tái sử dụng mật khẩu cũ |
| 4 | `5.4.1.1` | Ensure password expiration is configured | Kiểm soát vòng đời mật khẩu |
| 5 | `5.4.2.1` | Ensure root is the only UID 0 account | Ngăn tài khoản đặc quyền giả mạo root |
| 6 | `6.2.1.1` | Ensure journald service is enabled and active | Đảm bảo logging nền tảng hoạt động |
| 7 | `6.3.1.4` | Ensure auditd service is enabled and active | Đảm bảo audit trail hoạt động |

### File cần nhắc trong báo cáo

```text
Script: scripts/m4_identity_logging_audit.sh
Manifest: manifests/manifest-m4.yaml
Log: logs/before/m4_before.log, logs/after/m4_after.log
Screenshot: screenshots/m4/
```

---

# 21. Checklist báo cáo cuối cùng

Trước khi gộp báo cáo, nhóm trưởng kiểm tra:

```text
[ ] Có phần giới thiệu đề tài
[ ] Có giải thích CIS Benchmark và Level 1 - Server
[ ] Có giải thích flow chọn tiêu chí
[ ] Có giới thiệu ReportOps Web App
[ ] Có bảng phân công 28 tiêu chí
[ ] Mỗi thành viên có phần giới thiệu nhóm tiêu chí
[ ] Mỗi tiêu chí có mục đích, rủi ro, audit idea, expected result
[ ] Không dán script dài vào báo cáo chính
[ ] Có bảng kết quả PASS/FAIL
[ ] Có log/screenshot minh chứng
[ ] Có phần kết luận chung
[ ] Script và manifest được nộp riêng
```

---

# 22. Nguyên tắc viết để báo cáo không bị quá dài

```text
- Mỗi tiêu chí chỉ viết 1/3 đến 1/2 trang.
- Không copy nguyên văn CIS Benchmark.
- Không dán code dài.
- Không mô tả remediation quá sâu nếu chưa làm.
- Tập trung: mục đích, rủi ro, cách audit, kết quả.
- Dùng bảng để tóm tắt kết quả.
- Log/screenshot đưa vào phụ lục hoặc phần minh chứng.
```

