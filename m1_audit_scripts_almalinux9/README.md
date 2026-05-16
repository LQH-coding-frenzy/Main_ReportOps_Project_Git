# M1 AlmaLinux 9 CIS Level 1 Server Audit Scripts

This archive contains the older section-based audit-only shell scripts for the original M1 reference scope:

- `1_1.sh` — Filesystem
- `1_2.sh` — Package Management
- `1_4.sh` — Bootloader
- `1_5.sh` — Process Hardening
- `1_6.sh` — System-wide Crypto Policy
- `2_3.sh` — Time Synchronization
- `2_4.sh` — Job Schedulers

## Important

This directory is now **archival reference material**.
The current canonical ReportOps runtime uses:

- `scripts/m1_base_server.sh`
- `manifests/manifest-m1.yaml`
- `remediation/m1_remediate.sh`

Those files reflect the current narrowed 7-control M1 scope used by the web app and the live audit pack registry.

These scripts are **audit-only**. They do not intentionally remediate or change system configuration.
They output CIS-like stdout patterns such as:

```text
- Audit Result:
 ** PASS **
```

or:

```text
- Audit Result:
 ** FAIL **
 - Reason(s) for audit failure:
 ...
```

This makes the output suitable for your ReportOps parser:

```text
CIS stdout print = raw evidence + screenshot
Parser = normalize PASS/FAIL/MANUAL/ERROR
JSON internal result = dashboard + archive + report
```

## Run all sections

```bash
chmod +x sections/*.sh m1_run_all.sh
sudo ./m1_run_all.sh | tee m1_audit_output.log
```

## Run a single section

```bash
sudo ./sections/1_1.sh
sudo ./sections/1_2.sh
sudo ./sections/1_4.sh
sudo ./sections/1_5.sh
sudo ./sections/1_6.sh
sudo ./sections/2_3.sh
sudo ./sections/2_4.sh
```

## Note on CIS content

This package contains original audit scripts derived from the M1 audit scope. It is not a verbatim reproduction of the CIS Benchmark's copyrighted script text.
