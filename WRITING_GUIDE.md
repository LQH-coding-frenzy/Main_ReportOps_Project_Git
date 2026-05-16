# ReportOps Writing Guide

Guide này là chuẩn thống nhất cho nhóm khi viết báo cáo và chuẩn bị file nộp cho workflow M1-M4 mới trong `plan_complete.md`.

## 1. Mục tiêu

- Giữ cấu trúc report ngắn gọn, dễ merge trong ReportOps.
- Bám đúng 28 control automated đã chốt.
- Tách rõ audit script và remediation script.
- Chuẩn hóa manifest, log, screenshot và stdout để web app parse ổn định.

## 2. Flow nhóm

```text
Nền tảng server an toàn
-> Giảm bề mặt tấn công
-> Bảo vệ truy cập quản trị
-> Tài khoản, mật khẩu, logging và audit trail
```

## 3. Quy tắc viết trong document

- Dùng `Heading 1` cho section chính của control hoặc phần lớn trong báo cáo.
- Không dùng `Heading 1` cho đề mục con.
- Lệnh, config, path nên đặt trong code block hoặc monospace.
- Không copy HTML/CSS rác từ web hoặc PDF vào editor.
- Không dán script dài vào thân báo cáo chính.
- Ưu tiên bảng để tóm tắt kết quả PASS/FAIL và minh chứng.

## 4. Dàn ý phần báo cáo cá nhân

Mỗi thành viên viết phần riêng theo cấu trúc:

```text
1. Giới thiệu nhóm tiêu chí được giao
2. Danh sách tiêu chí
3. Phân tích từng tiêu chí
4. Thiết kế script audit
5. Kết quả thực nghiệm
6. Nhận xét và hạn chế
```

Mỗi control nên viết ngắn theo form:

```text
### <Control ID> - <Tên tiêu chí>

Mục đích:
...

Rủi ro nếu không đạt:
...

Cách audit tự động:
...

Kết quả mong đợi:
...

Ghi chú thực nghiệm:
...
```

## 5. Phân công mới của nhóm

### M1 - Lại Quang Huy

- `1.2.1.2` Ensure gpgcheck is globally activated
- `1.1.2.1.2` Ensure nodev option set on `/tmp` partition
- `1.1.2.1.3` Ensure nosuid option set on `/tmp` partition
- `1.1.2.1.4` Ensure noexec option set on `/tmp` partition
- `1.5.1` Ensure address space layout randomization is enabled
- `1.5.2` Ensure ptrace_scope is restricted
- `2.3.1` Ensure time synchronization is in use

Phần viết nên tập trung vào:

- package trust với `gpgcheck`
- hardening `/tmp`
- ASLR và `ptrace_scope`
- ý nghĩa time sync với log và audit trail

### M2 - Bao Nguyên

- `1.3.1.1` Ensure SELinux is installed
- `1.3.1.4` Ensure the SELinux mode is not disabled
- `1.3.1.7` Ensure mcstrans is not installed
- `1.3.1.8` Ensure SETroubleshoot is not installed
- `3.3.1` Ensure ip forwarding is disabled
- `3.3.7` Ensure reverse path filtering is enabled
- `4.1.1` Ensure nftables is installed

Phần viết nên tập trung vào:

- vai trò của SELinux cho server
- vì sao bỏ `mcstrans` và `setroubleshoot`
- vì sao không bật IP forwarding nếu server không làm router
- reverse path filtering và nền tảng firewall `nftables`

### M3 - Trương Duy

- `5.1.1` Ensure permissions on `/etc/ssh/sshd_config` are configured
- `5.1.15` Ensure sshd LogLevel is configured
- `5.1.19` Ensure sshd PermitEmptyPasswords is disabled
- `5.1.20` Ensure sshd PermitRootLogin is disabled
- `5.1.22` Ensure sshd UsePAM is enabled
- `5.2.2` Ensure sudo commands use pty
- `5.2.6` Ensure sudo authentication timeout is configured correctly

Phần viết nên tập trung vào:

- SSH là điểm vào quản trị quan trọng nhất
- vì sao không cho root SSH trực tiếp
- vì sao cấm empty password
- vì sao cần log SSH tốt và sudo timeout hợp lý

### M4 - Lâm Hoàng Phước

- `5.3.2.2` Ensure pam_faillock module is enabled
- `5.3.2.3` Ensure pam_pwquality module is enabled
- `5.3.2.4` Ensure pam_pwhistory module is enabled
- `5.4.1.1` Ensure password expiration is configured
- `5.4.2.1` Ensure root is the only UID 0 account
- `6.2.1.1` Ensure journald service is enabled and active
- `6.2.3.2` Ensure rsyslog service is enabled and active

Phần viết nên tập trung vào:

- PAM và các module `faillock`, `pwquality`, `pwhistory`
- password expiration
- vì sao chỉ root nên có UID 0
- journald và rsyslog phối hợp ghi log như thế nào

## 6. File nộp bắt buộc

```text
scripts/m1_base_server.sh
scripts/m2_attack_surface.sh
scripts/m3_admin_access.sh
scripts/m4_identity_logging_audit.sh

manifests/manifest-m1.yaml
manifests/manifest-m2.yaml
manifests/manifest-m3.yaml
manifests/manifest-m4.yaml

remediation/m1_remediate.sh
remediation/m2_remediate.sh
remediation/m3_remediate.sh
remediation/m4_remediate.sh

logs/before/
logs/after/
screenshots/m1/
screenshots/m2/
screenshots/m3/
screenshots/m4/
```

## 7. Quy định script audit

- Tên file đúng như trên, không đổi.
- Có shebang `#!/usr/bin/env bash`.
- Script chính là audit-only.
- Không remediation trong file audit.
- Không dùng lệnh phá hệ thống trong file audit như `sed -i`, `chmod`, `chown`, `dnf install`, `dnf remove`, `systemctl stop`, `rm -rf`, `reboot`.
- Không dùng input tương tác như `read -p`.
- Exit `0` khi audit chạy xong dù control có PASS hay FAIL.
- Exit `1` chỉ khi lỗi nghiêm trọng khiến không thể audit.

## 8. Chuẩn stdout cho ReportOps parser

Mỗi control phải có dạng:

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
 - <ly do>
```

Hoặc:

```text
### <CONTROL_ID> - <CONTROL_TITLE>

- Audit Result:
 ** ERROR **
 - <loi runtime>
```

Trạng thái hợp lệ:

```text
PASS
FAIL
ERROR
NOT_APPLICABLE
```

## 9. Manifest YAML

Mỗi manifest phải mô tả đúng:

- `pack_id`
- `owner_section`
- `title`
- `script`
- benchmark name/version/profile
- danh sách `controls` với `id`, `title`, `section`, `parser`

Parser hiện dùng là `cis_stdout`.

## 10. Checklist trước khi nộp

- [ ] Đúng file name theo M1-M4
- [ ] Có shebang bash
- [ ] Audit script không chứa remediation
- [ ] Output đúng chuẩn `### CONTROL_ID - TITLE`
- [ ] Có `- Audit Result:` cho từng control
- [ ] Chỉ dùng `PASS/FAIL/ERROR/NOT_APPLICABLE`
- [ ] Có summary cuối file
- [ ] Có manifest tương ứng
- [ ] Có before/after logs
- [ ] Có screenshot minh chứng

## 11. Ghi nhớ khi dùng ReportOps

- `/guide` trong web app sẽ focus vào đúng phần được giao.
- `/dashboard` hiển thị M1-M4 theo control set mới.
- `/admin/sections` là nơi leader/admin phân công section và roles.
- `/admin/audit-packs` hiện có M1 runtime thật; M2-M4 đang là placeholder metadata/runtime.
- Remediation được tách riêng và hiện chỉ M1 có runtime remediation thật trong app.
