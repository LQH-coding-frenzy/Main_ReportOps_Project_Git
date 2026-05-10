# AI-First ReportOps + GCP Lab + M1 Auto-Audit — Master Plan

> **Merged final version** từ 2 tài liệu:
>
> 1. `ai_first_reportops_plan_yes_no.md`
> 2. `reportops_m1_cis_stdout_parser_screenshot_plan.md`
>
> Tài liệu này là bản **kế hoạch hợp nhất cuối cùng** để đưa vào AI coding agent triển khai.  
> Triết lý chính: **AI làm tối đa**, người dùng chỉ cần **trả lời Yes/No, login CLI, xác nhận quyền/chi phí/rủi ro**.

---

## 0. Executive Summary

Hệ thống cần xây dựng là một web app gồm 4 khối:

```text
ReportOps
├── Viết báo cáo theo section M1–M4
├── Lưu evidence/report artifacts
└── Xuất final report/release

LabOps
├── Tạo/quản lý VM AlmaLinux 9 trên GCP
├── VM có public IP để demo
├── VM có welcome page chứng minh thuộc web app
└── Reset VM bằng Terraform recreate

Auto-Audit
├── Cloud Run Job audit-runner
├── OpenSCAP baseline CIS AlmaLinux OS 9 Level 1 Server
├── Uploaded .sh scripts theo từng section
└── Parser normalize kết quả

Archive/Evidence
├── Raw stdout/stderr
├── Normalized JSON
├── HTML evidence
├── Screenshots/PDF
└── Evidence bundle để lấy đưa vào báo cáo
```

---

## 1. Scope ưu tiên hiện tại

### 1.1 Chỉ triển khai M1 trước

```text
M1 — Filesystem, Package, Boot, Process Hardening, Crypto, Time Sync, Scheduler
```

### 1.2 CIS sections thuộc M1

```text
§1.1 Filesystem
§1.2 Package Management
§1.4 Bootloader
§1.5 Additional Process Hardening
§1.6 System-wide Crypto Policy
§2.3 Time Synchronization
§2.4 Job Schedulers
```

### 1.3 Benchmark

```text
CIS AlmaLinux OS 9 Benchmark v2.0.0
Profile: Level 1 - Server
Mode: Audit-only
No auto-remediation in MVP
```

---

## 2. Quyết định kiến trúc đã chốt

### 2.1 AI-first

Thay vì chia “việc làm tay” và “việc AI làm”, kế hoạch này chia thành:

```text
Human approval / decision / login
AI automation
Generated code + infrastructure
```

Người dùng chỉ cần:

```text
1. Trả lời Yes/No
2. Login CLI một lần
3. Cấp biến cấu hình cần thiết
4. Review kết quả cuối
```

AI sẽ tự động hóa phần còn lại.

---

### 2.2 Evidence model

Kết quả script `.sh` sẽ đi theo mô hình:

```text
CIS stdout print = raw evidence + screenshot
Parser = normalize PASS/FAIL/MANUAL/ERROR/UNKNOWN
JSON nội bộ = dashboard + archive + report
```

Điều này nghĩa là:

```text
- Không bắt script output JSON
- Script có thể in stdout theo format CIS gốc
- Stdout gốc được giữ nguyên làm evidence
- Parser nội bộ đọc stdout và tạo JSON chuẩn
- JSON chuẩn dùng cho dashboard, scoring, archive, report
- Screenshot dùng để trình bày trong báo cáo
```

---

### 2.3 VM LabOps

```text
- VM audit target là VM do web app tạo trên GCP
- VM có public IP để demo
- VM có welcome page trên port 80
- Backend quản lý VM bằng Terraform
- Reset VM = recreate bằng Terraform
- Audit result/log/archive không bị mất khi reset VM
```

---

### 2.4 Runner architecture

```text
terraform-runner = Cloud Run Job dùng để apply/destroy Terraform

audit-runner = Cloud Run Job dùng để:
- chạy OpenSCAP
- chạy uploaded shell scripts
- capture stdout/stderr
- parse result
- render evidence HTML
- chụp screenshot/PDF
- upload archive
```

---

## 3. Human approval checklist — trả lời Yes/No

> Đây là phần người dùng cần xác nhận.  
> AI agent phải đọc các câu trả lời này từ `project.answers.yaml` trước khi thực thi bootstrap hoặc deploy.

---

### 3.1 Hạ tầng & chi phí

```yaml
infrastructure:
  use_dedicated_gcp_project: yes
  accept_possible_cloud_cost: yes
  require_cost_saving_defaults: yes
  ai_enable_required_gcp_apis: yes
  use_terraform_as_source_of_truth: yes
  reset_vm_by_terraform_recreate: yes
  vm_has_public_ip: yes
  vm_has_public_welcome_page_port_80: yes
  ai_create_tfstate_bucket: yes
  ai_create_archive_bucket: yes
```

Notes:

```text
- Cost saving defaults nên dùng e2-micro/e2-small.
- Nên có TTL/auto-stop để tránh quên VM chạy lâu.
- Archive bucket cần versioning hoặc retention tối thiểu.
```

---

### 3.2 Bảo mật & truy cập

```yaml
security:
  ssh_only_from_runner: no
  demo_open_ssh_interface: yes
  ssh_button_in_web_app: yes
  use_audit_runner_ssh_key_in_secret_manager: yes
  no_auto_remediation_in_mvp: yes
  audit_logs_for_all_actions: yes
```

#### Safety correction bắt buộc

Người dùng từng muốn uploaded `.sh` chạy “quyền đầy đủ nhất”. Tuy nhiên để giữ đúng mục tiêu **auto-audit** và tránh phá VM/dữ liệu, kế hoạch cuối cùng chốt như sau:

```yaml
script_execution_policy:
  audit_only_mode: yes
  allow_sudo_for_read_only_audit_commands: yes
  block_destructive_commands: yes
  full_unrestricted_root_execution: no
```

Giải thích:

```text
- Script audit có thể cần sudo để đọc cấu hình hệ thống.
- Nhưng script upload không được tự sửa hệ thống.
- Không auto-remediation trong MVP.
- Nếu cần remediation sau này, làm module riêng, có approval riêng.
```

#### SSH demo mode

Vì người dùng muốn nút SSH giống GCP, plan hỗ trợ:

```text
- Nút “Open SSH” trong /lab/[vmId]
- Có thể mở web SSH/deeplink/GCP console link
- Nếu phải mở firewall SSH rộng, phải có TTL tự đóng
- Mọi lần mở SSH phải ghi audit log
```

---

### 3.3 CI/CD & tài khoản

```yaml
cicd:
  deploy_web_on_vercel: yes
  use_github_actions: yes
  ai_create_or_update_github_actions: yes
  use_workload_identity_federation: yes
  ai_configure_wif_after_auth: yes
  avoid_service_account_json_key: yes
```

---

### 3.4 Script & evidence workflow

```yaml
workflow:
  accept_cis_stdout_instead_of_json_only: yes
  control_id_from_filename_or_manifest: yes
  ai_generate_manifest: yes
  normalize_stdout_to_json: yes
  keep_raw_stdout_stderr: yes
  generate_terminal_html_evidence: yes
  generate_dashboard_html_evidence: yes
  screenshot_with_playwright: yes
  save_and_index_screenshots: yes
  auto_attach_screenshots_to_reportops: no
```

Notes:

```text
- Screenshot sẽ được lưu và index đầy đủ.
- Web app cho phép tải ảnh/evidence bundle.
- Người dùng tự chọn ảnh để đưa vào báo cáo.
- ReportOps chỉ lưu link/index, không tự nhúng ảnh nếu auto_attach = no.
```

---

### 3.5 M1 scope

```yaml
m1_scope:
  implement_m1_first_only: yes
  openscap_baseline_enabled: yes
  uploaded_m1_scripts_enabled: yes
  allow_modes_openscap_only_m1_only_or_both: yes
  archive_openscap_raw_files: yes
  archive_m1_script_evidence: yes
```

---

## 4. One-time user actions

AI có thể làm gần hết, nhưng người dùng vẫn cần login/authorize một lần.

```bash
gcloud auth login
gcloud auth application-default login
gh auth login
vercel login
```

Sau khi login xong, AI agent có thể chạy:

```text
- gcloud CLI
- Terraform
- GitHub CLI
- Vercel CLI
- Docker build/deploy
- Cloud Run Job deploy
```

---

## 5. `project.answers.yaml` template cuối cùng

AI agent phải đọc file này làm source of truth.

```yaml
project:
  gcp_project_id: "YOUR_GCP_PROJECT_ID"
  region: "asia-southeast1"
  zone: "asia-southeast1-c"
  app_name: "reportops"
  environment: "dev"

infrastructure:
  use_dedicated_gcp_project: yes
  accept_possible_cloud_cost: yes
  require_cost_saving_defaults: yes
  ai_enable_required_gcp_apis: yes
  use_terraform_as_source_of_truth: yes
  reset_vm_by_terraform_recreate: yes
  vm_has_public_ip: yes
  vm_has_public_welcome_page_port_80: yes
  ai_create_tfstate_bucket: yes
  ai_create_archive_bucket: yes

vm_defaults:
  machine_type: "e2-micro"
  disk_size_gb: 20
  os_family: "almalinux-9"
  public_http_port: 80
  ssh_port: 22
  auto_stop_hours: 4
  reset_mode: "recreate"

security:
  ssh_only_from_runner: no
  demo_open_ssh_interface: yes
  ssh_button_in_web_app: yes
  ssh_firewall_ttl_minutes: 60
  use_audit_runner_ssh_key_in_secret_manager: yes
  no_auto_remediation_in_mvp: yes
  audit_logs_for_all_actions: yes

script_execution_policy:
  audit_only_mode: yes
  allow_sudo_for_read_only_audit_commands: yes
  block_destructive_commands: yes
  full_unrestricted_root_execution: no

cicd:
  deploy_web_on_vercel: yes
  use_github_actions: yes
  ai_create_or_update_github_actions: yes
  use_workload_identity_federation: yes
  ai_configure_wif_after_auth: yes
  avoid_service_account_json_key: yes

workflow:
  accept_cis_stdout_instead_of_json_only: yes
  control_id_from_filename_or_manifest: yes
  ai_generate_manifest: yes
  normalize_stdout_to_json: yes
  keep_raw_stdout_stderr: yes
  generate_terminal_html_evidence: yes
  generate_dashboard_html_evidence: yes
  screenshot_with_playwright: yes
  save_and_index_screenshots: yes
  auto_attach_screenshots_to_reportops: no

m1_scope:
  implement_m1_first_only: yes
  openscap_baseline_enabled: yes
  uploaded_m1_scripts_enabled: yes
  allow_modes_openscap_only_m1_only_or_both: yes
  archive_openscap_raw_files: yes
  archive_m1_script_evidence: yes
```

---

## 6. AI automation responsibilities

Sau khi có `project.answers.yaml` và CLI auth, AI agent thực hiện:

```text
1. Bootstrap GCP foundation
2. Bootstrap GitHub Actions + WIF
3. Scaffold monorepo web app
4. Implement Terraform VM lifecycle
5. Deploy terraform-runner Cloud Run Job
6. Deploy audit-runner Cloud Run Job
7. Implement OpenSCAP baseline for M1
8. Implement uploaded .sh script workflow
9. Implement CIS stdout parser
10. Implement raw evidence archive
11. Implement normalized JSON archive
12. Implement terminal/dashboard evidence HTML
13. Implement Playwright screenshot/PDF capture
14. Implement /archive and /audit UI
15. Implement screenshot index for ReportOps
16. Do not implement auto-remediation
17. Do not implement M2/M3/M4 yet
```

---

## 7. Technical architecture

```text
apps/web
├── /reports
├── /lab
├── /audit
├── /archive
├── /admin
└── /api

services
├── terraform-runner
└── audit-runner

infra
└── terraform
    ├── modules/lab_vm
    ├── environments/dev
    └── runners

audit-packs
└── m1
    ├── manifest.yaml
    ├── controls
    ├── lib
    └── tests
```

---

## 8. Phase plan

---

### Phase 0 — Approval + login

AI dừng cho tới khi:

```text
- project.answers.yaml tồn tại
- gcloud auth sẵn sàng
- gh auth sẵn sàng
- vercel auth sẵn sàng nếu dùng Vercel
```

AI phải in rõ:

```text
Approval-required actions
Safe automation actions
Generated code changes
```

---

### Phase 1 — GCP foundation bootstrap

AI tạo:

```text
- Required APIs
- Terraform state bucket
- Archive bucket
- Artifact Registry Docker repository
- Service accounts
- IAM bindings
- Secret Manager placeholders
```

Required APIs:

```text
compute.googleapis.com
run.googleapis.com
artifactregistry.googleapis.com
secretmanager.googleapis.com
iamcredentials.googleapis.com
cloudbuild.googleapis.com
logging.googleapis.com
storage.googleapis.com
```

Service accounts:

```text
reportops-provisioner-sa
reportops-audit-runner-sa
reportops-cloudrun-executor-sa
reportops-github-deployer-sa
```

---

### Phase 2 — Web platform scaffold

AI scaffold:

```text
Next.js App Router
TypeScript
Prisma or Drizzle
Tailwind/shadcn UI
GitHub OAuth
RBAC
Postgres schema
```

Routes:

```text
/reports
/lab
/lab/new
/lab/[vmId]
/audit
/audit/new
/audit/jobs/[jobId]
/archive
/archive/audits/[archiveId]
/admin
/admin/audit-packs/m1
```

---

### Phase 3 — Terraform VM lifecycle

AI viết module:

```text
infra/terraform/modules/lab_vm
```

Module tạo:

```text
- Compute Engine VM AlmaLinux 9
- Public IP
- Firewall HTTP 80
- SSH demo rule with TTL management support
- Startup script
- Welcome page
- audituser
- OpenSCAP packages
```

Startup script cài:

```bash
dnf install -y nginx openscap-scanner openscap-utils scap-security-guide jq
systemctl enable --now nginx
```

Welcome page hiển thị:

```text
ReportOps Lab VM
VM ID
Owner
Benchmark
Section: M1
Verification Token
Created by ReportOps Web App
```

---

### Phase 4 — Cloud Run Jobs

AI deploy:

```text
terraform-runner
├── terraform init/plan/apply/destroy
├── state key theo vm_id
└── update DB status

audit-runner
├── OpenSCAP scan
├── Uploaded scripts execution
├── stdout/stderr capture
├── parser
├── evidence rendering
├── screenshot capture
└── archive upload
```

---

### Phase 5 — M1 OpenSCAP baseline

AI implement:

```text
- Detect OpenSCAP profile ID
- Run OpenSCAP Level 1 Server scan
- Save raw XML/HTML/ARF
- Normalize result
- Filter to M1 sections
```

Archive:

```text
archives/audits/<audit_job_id>/m1/openscap/
├── results.xml
├── results-arf.xml
├── report.html
└── openscap-m1-filtered.json
```

---

### Phase 6 — Uploaded shell scripts pipeline

Script output accepted:

```text
cis_stdout
json optional
```

Script filename examples:

```text
1.1.1.1.sh
1.1.1.1-cramfs-kernel-module.sh
1.2.1.2-gpgcheck-globally-activated.sh
```

Manifest:

```yaml
pack_id: "m1-filesystem-package-boot-process-crypto-time-scheduler"
owner_section: "M1"
title: "Filesystem, Package, Boot, Process Hardening, Crypto, Time Sync, Scheduler"
benchmark:
  name: "CIS AlmaLinux OS 9 Benchmark"
  version: "2.0.0"
  profile: "Level 1 - Server"
sections:
  - "1.1"
  - "1.2"
  - "1.4"
  - "1.5"
  - "1.6"
  - "2.3"
  - "2.4"
runtime:
  type: "shell"
  shell: "bash"
  mode: "audit-only"
  output_mode: "cis_stdout"
controls:
  - id: "1.2.1.2"
    title: "Ensure gpgcheck is globally activated"
    section: "1.2"
    assessment_type: "Automated"
    script: "controls/package-management/1.2.1.2.sh"
    parser: "cis_stdout"
    risk: "medium"
    enabled: true
```

---

### Phase 7 — Script validator

AI implement:

```text
services/audit-runner/src/validators/scriptValidator.ts
```

Validation rules:

```text
1. file extension .sh
2. UTF-8 text
3. size <= 200KB default
4. bash shebang exists
5. control_id in M1 scope
6. no path traversal
7. no destructive command in audit-only mode
8. contains CIS audit result pattern or is Manual
```

Blocked commands in MVP:

```text
rm -rf
mkfs
dd if=
dd of=
shutdown
reboot
poweroff
dnf remove
dnf update
dnf install
yum remove
yum update
yum install
modprobe -r
rmmod
systemctl stop
systemctl disable
sed -i
tee -a /etc
chmod
chown
passwd
userdel
usermod
```

Validator output:

```json
{
  "valid": true,
  "warnings": [],
  "errors": []
}
```

---

### Phase 8 — CIS stdout parser

AI implement:

```text
services/audit-runner/src/parsers/cisStdoutParser.ts
```

Input:

```ts
type CisStdoutParserInput = {
  controlId: string
  title: string
  section: string
  ownerSection: "M1"
  assessmentType: "Automated" | "Manual"
  stdout: string
  stderr: string
  exitCode: number
  startedAt: string
  finishedAt: string
}
```

Output:

```ts
type NormalizedAuditResult = {
  controlId: string
  title: string
  section: string
  ownerSection: "M1"
  status: "PASS" | "FAIL" | "MANUAL" | "NOT_APPLICABLE" | "ERROR" | "UNKNOWN"
  assessmentType: "Automated" | "Manual"
  info: string[]
  failReasons: string[]
  correctlySet: string[]
  evidence: string[]
  rawStdoutRef?: string
  rawStderrRef?: string
  rawStdout: string
  rawStderr: string
  exitCode: number
  parser: "cis_stdout"
  parserWarnings: string[]
  startedAt: string
  finishedAt: string
}
```

Parser logic:

```text
if exitCode != 0:
  status = ERROR
else if stdout contains "** PASS **" or "*** PASS ***":
  status = PASS
else if stdout contains "** FAIL **" or "*** FAIL ***":
  status = FAIL
else if assessmentType == Manual:
  status = MANUAL
else if stdout contains "REVIEW" or "Review the generated output":
  status = MANUAL
else:
  status = UNKNOWN
```

Extract arrays:

```text
info = lines under "-- INFO --"
failReasons = lines under "Reason(s) for audit failure"
correctlySet = lines under "Correctly set"
evidence = info + failReasons + correctlySet depending on status
```

---

### Phase 9 — Script execution runner

AI implement:

```text
services/audit-runner/src/executors/shellScriptExecutor.ts
```

Behavior:

```text
1. Load script from registry
2. Copy script to VM via SSH/SCP
3. Run with timeout
4. Capture stdout/stderr/exit_code
5. Delete temp script
6. Save raw stdout/stderr
7. Parse result
8. Save normalized JSON
```

Runtime path:

```text
/tmp/reportops-audit/<audit_job_id>/<control_id>.sh
```

Timeout:

```text
Default: 20 seconds
Max: 60 seconds
```

---

### Phase 10 — Archive structure

Final archive structure:

```text
archives/audits/<audit_job_id>/m1/
├── openscap/
│   ├── results.xml
│   ├── results-arf.xml
│   ├── report.html
│   └── openscap-m1-filtered.json
│
├── raw/
│   ├── m1-script-stdout.log
│   ├── m1-script-stderr.log
│   └── scripts/
│       ├── <control_id>.stdout.log
│       └── <control_id>.stderr.log
│
├── parsed/
│   ├── m1-pack-results.json
│   └── m1-summary.json
│
├── evidence-html/
│   ├── m1-terminal.html
│   └── m1-dashboard.html
│
├── screenshots/
│   ├── vm-welcome.png
│   ├── m1-terminal-output.png
│   ├── m1-dashboard.png
│   └── m1-dashboard.pdf
│
└── evidence-bundle.zip
```

---

### Phase 11 — Evidence HTML

Terminal evidence HTML:

```text
archives/audits/<audit_job_id>/m1/evidence-html/m1-terminal.html
```

Must include:

```text
Benchmark
Scope
VM name
Public IP
Audit job ID
Timestamp
Each control ID/title
Command line
Raw stdout
Raw stderr if any
Parser status
```

Dashboard evidence HTML:

```text
archives/audits/<audit_job_id>/m1/evidence-html/m1-dashboard.html
```

Must include:

```text
M1 Audit Summary
Benchmark
Scope
Score
PASS/FAIL/MANUAL/ERROR counts
Failed controls table
Manual controls table
Archive references
```

Redact secrets:

```text
-----BEGIN OPENSSH PRIVATE KEY-----
DATABASE_URL=
GITHUB_CLIENT_SECRET=
GOOGLE_APPLICATION_CREDENTIALS=
Authorization: Bearer
private_key
access_token
refresh_token
```

---

### Phase 12 — Screenshot capture

AI implement:

```text
services/audit-runner/src/evidence/screenshotCapture.ts
```

Capture:

```text
1. VM welcome page
2. terminal evidence HTML
3. dashboard evidence HTML or /audit/jobs/[jobId]/evidence-view
4. dashboard PDF
```

Output:

```text
vm-welcome.png
m1-terminal-output.png
m1-dashboard.png
m1-dashboard.pdf
```

If screenshot fails:

```text
- Do not fail audit job
- Mark evidence_capture_status = FAILED
- Store error in runner log
```

---

### Phase 13 — Database schema additions

AI add/update tables:

```text
audit_uploaded_scripts
script_validation_results
audit_script_runs
audit_evidence_artifacts
```

`audit_uploaded_scripts`:

```text
id
pack_id
owner_section
control_id
title
section
assessment_type
parser_mode
script_storage_path
script_sha256
enabled
created_by
created_at
updated_at
```

`script_validation_results`:

```text
id
script_id
valid
warnings_json
errors_json
created_at
```

`audit_script_runs`:

```text
id
audit_job_id
script_id
control_id
status
exit_code
stdout_ref
stderr_ref
normalized_result_json
started_at
finished_at
duration_ms
```

`audit_evidence_artifacts`:

```text
id
audit_job_id
vm_id
owner_section
artifact_type
artifact_name
storage_path
mime_type
size_bytes
checksum
created_at
```

Artifact types:

```text
RAW_STDOUT
RAW_STDERR
NORMALIZED_JSON
SUMMARY_JSON
TERMINAL_HTML
DASHBOARD_HTML
WELCOME_SCREENSHOT
TERMINAL_SCREENSHOT
DASHBOARD_SCREENSHOT
DASHBOARD_PDF
EVIDENCE_BUNDLE
OPENSCAP_XML
OPENSCAP_ARF
OPENSCAP_HTML
```

---

### Phase 14 — UI updates

`/admin/audit-packs/m1`:

```text
Upload script
Validate script
Activate/deactivate script
View parser mode
View validation errors
```

`/audit/new`:

```text
OpenSCAP only
M1 uploaded scripts only
OpenSCAP + M1 uploaded scripts
```

`/audit/jobs/[jobId]`:

```text
M1 result card
PASS/FAIL/MANUAL/ERROR counts
Score
Failed controls
Manual review controls
Raw stdout viewer
Screenshot gallery
Evidence generation status
```

`/archive/audits/[archiveId]`:

```text
Raw logs
OpenSCAP artifacts
Normalized JSON
Evidence HTML
Screenshots
PDF
Evidence bundle
Download buttons
Index metadata
```

`/reports`:

```text
Show indexed screenshots and archive references
User chooses which screenshots to insert into report
No auto-attach if auto_attach_screenshots_to_reportops = no
```

---

## 9. Risk scoring

Use normalized JSON, not screenshot.

```text
score = PASS / (PASS + FAIL + ERROR) * 100
manual controls tracked separately
unknown controls listed separately
```

Risk suggestion:

```text
Critical = critical control fails or many high-risk controls fail
High = multiple high/medium failures
Medium = few failures, no critical
Low = no failures or only manual review pending
```

---

## 10. Definition of Done

Feature complete khi:

```text
1. AI reads project.answers.yaml
2. GCP foundation bootstrapped
3. Web app scaffold exists
4. Terraform can create VM
5. VM has public IP + welcome page
6. terraform-runner Cloud Run Job works
7. audit-runner Cloud Run Job works
8. OpenSCAP baseline can run for M1
9. User can upload CIS-style .sh script for M1
10. Script validator runs
11. Script executes on VM
12. Raw stdout/stderr archived
13. Parser normalizes PASS/FAIL/MANUAL/ERROR
14. Dashboard shows normalized JSON result
15. Terminal evidence HTML generated
16. Dashboard evidence HTML generated
17. Playwright captures welcome/terminal/dashboard/PDF
18. /archive shows all artifacts
19. /reports can browse/index screenshots
20. No auto-remediation implemented
21. M2/M3/M4 not implemented yet
```

---

## 11. Final prompt for AI coding agent

```text
Read project.answers.yaml and treat it as the source of truth for approvals and environment decisions.

Implement the AI-first ReportOps + GCP Lab + Auto-Audit platform.

Current priority is M1 only.
M1 scope is:
- §1.1 Filesystem
- §1.2 Package Management
- §1.4 Bootloader
- §1.5 Additional Process Hardening
- §1.6 System-wide Crypto Policy
- §2.3 Time Synchronization
- §2.4 Job Schedulers
from CIS AlmaLinux OS 9 Benchmark v2.0.0 Level 1 - Server.

Use this evidence model:
- CIS stdout print = raw evidence + screenshot
- Parser = normalize PASS/FAIL/MANUAL/ERROR/UNKNOWN
- JSON internal result = dashboard + archive + report

Do not require uploaded shell scripts to output JSON.
Accept CIS-style stdout and preserve raw stdout exactly.
Get control_id from filename or manifest, not from stdout.

Follow project.answers.yaml exactly.
If an answer is No, generate a safe alternative path and stop before restricted/destructive action.

Important safety rules:
- Do not implement auto-remediation in MVP.
- Do not allow unrestricted root shell script execution.
- Allow sudo only for read-only audit operations if necessary.
- Block destructive commands in uploaded scripts.
- Store all actions in audit logs.

Automate as much as possible:
1. Bootstrap GCP foundation
2. Create Terraform state bucket and archive bucket
3. Create Artifact Registry repository
4. Create service accounts and IAM bindings
5. Configure WIF for GitHub Actions if approved
6. Scaffold monorepo web app
7. Implement Terraform-based VM lifecycle
8. Deploy terraform-runner Cloud Run Job
9. Deploy audit-runner Cloud Run Job
10. Integrate OpenSCAP baseline for M1 Level 1 Server
11. Implement uploaded M1 shell script workflow
12. Implement script validator
13. Implement CIS stdout parser
14. Implement raw evidence archive
15. Implement normalized JSON archive
16. Implement terminal evidence HTML
17. Implement dashboard evidence HTML and /audit/jobs/[jobId]/evidence-view
18. Implement Playwright screenshot capture for VM welcome page, terminal evidence, dashboard evidence, and dashboard PDF
19. Implement /archive and /audit UI updates
20. Implement ReportOps screenshot index and artifact browsing
21. Do not auto-attach screenshots to ReportOps unless project.answers.yaml says yes
22. Do not implement M2/M3/M4 yet

Always separate output into:
- approval-required actions
- safe automation actions
- generated code changes
- commands to run
- verification checklist
```

---

## 12. User runbook tối giản

Người dùng chỉ cần:

```bash
gcloud auth login
gcloud auth application-default login
gh auth login
vercel login
```

Sau đó tạo `project.answers.yaml`, rồi đưa prompt ở mục 11 cho AI agent.

---

## 13. Final note

Bản plan này đã hợp nhất:

```text
- AI-first Yes/No approval model
- GCP LabOps + Terraform + Cloud Run Jobs
- M1 CIS stdout parser workflow
- Raw evidence + screenshot automation
- Archive + dashboard + ReportOps indexing
```

MVP nên giữ nguyên nguyên tắc:

```text
Audit-only first.
Evidence first.
M1 first.
Scale to M2/M3/M4 later.
```
