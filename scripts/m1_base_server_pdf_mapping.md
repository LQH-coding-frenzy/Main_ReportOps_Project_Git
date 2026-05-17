# M1 PDF Mapping

This note maps the current `scripts/m1_base_server.sh` implementation to the benchmark wording in `CIS_AlmaLinux_OS_9_Benchmark_v2.0.0.pdf`.

## Scope

- Benchmark: `CIS AlmaLinux OS 9 Benchmark v2.0.0`
- Profile: `Level 1 - Server`
- Script: `scripts/m1_base_server.sh`

## Control Mapping

### 1.2.1.2 Ensure gpgcheck is globally activated

- PDF pages: `134-135`
- PDF audit commands:

```bash
grep -Pi -- '^\h*gpgcheck\h*=\h*(1|true|yes)\b' /etc/dnf/dnf.conf
grep -Pris -- '^\h*gpgcheck\h*=\h*(0|[2-9]|[1-9][0-9]+|false|no)\b' /etc/yum.repos.d/
```

- Script function: `check_gpgcheck()`
- Current script behavior:
  - runs the same global `grep -Pi` check against `/etc/dnf/dnf.conf`
  - runs the same repo precedence `grep -Pris` check against `/etc/yum.repos.d/`
  - passes only when global config is enabled and repo overrides do not disable `gpgcheck`

### 1.1.2.1.2 Ensure nodev option set on /tmp partition

- PDF page: `71`
- PDF audit command:

```bash
findmnt -kn /tmp | grep -v nodev
```

- Script function: `check_tmp_option(..., "nodev")`
- Current script behavior:
  - if `/tmp` is not a separate mount, returns `NOT_APPLICABLE`
  - otherwise runs the same `findmnt -kn /tmp | grep -v nodev` logic
  - passes when grep returns no output

### 1.1.2.1.3 Ensure nosuid option set on /tmp partition

- PDF page: `73`
- PDF audit command:

```bash
findmnt -kn /tmp | grep -v nosuid
```

- Script function: `check_tmp_option(..., "nosuid")`
- Current script behavior:
  - if `/tmp` is not a separate mount, returns `NOT_APPLICABLE`
  - otherwise runs the same `findmnt -kn /tmp | grep -v nosuid` logic
  - passes when grep returns no output

### 1.1.2.1.4 Ensure noexec option set on /tmp partition

- PDF pages: `75-76`
- PDF audit command:

```bash
findmnt -kn /tmp | grep -v noexec
```

- Script function: `check_tmp_option(..., "noexec")`
- Current script behavior:
  - if `/tmp` is not a separate mount, returns `NOT_APPLICABLE`
  - otherwise runs the same `findmnt -kn /tmp | grep -v noexec` logic
  - passes when grep returns no output

### 1.5.1 Ensure address space layout randomization is enabled

- PDF pages: `175-177`
- PDF audit model:
  - verify runtime value of `kernel.randomize_va_space=2`
  - verify persistent value is loaded from the winning sysctl config source
  - respect precedence, including `systemd-sysctl --cat-config`
  - account for UFW override behavior when relevant

- Script function: `check_kernel_parameter_pdf("1.5.1", ..., "kernel.randomize_va_space", "2")`
- Current script behavior:
  - mirrors the benchmark script structure
  - checks runtime via `sysctl`
  - checks durable config via `/usr/lib/systemd/systemd-sysctl --cat-config`
  - checks UFW override path if configured
  - fails if runtime or effective durable configuration does not resolve to `2`

### 1.5.2 Ensure ptrace_scope is restricted

- PDF pages: `179-181`
- PDF audit model:
  - verify runtime value of `kernel.yama.ptrace_scope=1`
  - verify persistent value is loaded from the winning sysctl config source
  - respect precedence, including `systemd-sysctl --cat-config`
  - account for UFW override behavior when relevant

- Script function: `check_kernel_parameter_pdf("1.5.2", ..., "kernel.yama.ptrace_scope", "1")`
- Current script behavior:
  - mirrors the benchmark script structure
  - checks runtime via `sysctl`
  - checks durable config via `/usr/lib/systemd/systemd-sysctl --cat-config`
  - checks UFW override path if configured
  - fails if runtime or effective durable configuration does not resolve to `1`

### 2.3.1 Ensure time synchronization is in use

- PDF pages: `346-347`
- PDF audit command:

```bash
rpm -q chrony
```

- Script function: `check_time_sync()`
- Current script behavior:
  - uses the same `rpm -q chrony` package presence check as the PDF
  - passes when `chrony` is installed
  - does not add stricter service-state logic into the audit path, to stay aligned with the benchmark wording

## Remediation Mapping

### 1.2.1.2

- PDF remediation page: `135`
- Current function: `remediate_gpgcheck()` in `remediation/m1_remediate.sh`
- Alignment:
  - sets `gpgcheck=1` in `/etc/dnf/dnf.conf`
  - sets repo file `gpgcheck` entries to `1`

### 1.1.2.1.2 / 1.1.2.1.3 / 1.1.2.1.4

- PDF remediation pages: `71`, `73`, `75`
- Current function: `remediate_tmp_option()` in `remediation/m1_remediate.sh`
- Alignment:
  - only applies directly if `/tmp` already exists as a separate partition
  - updates `/etc/fstab`
  - runs `mount -o remount /tmp`

### 1.5.1 / 1.5.2

- PDF remediation pages: `177`, `181`
- Current function: `remediate_sysctl_control()` in `remediation/m1_remediate.sh`
- Alignment:
  - writes the sysctl value to a persistent sysctl file
  - runs `sysctl -w key=value`
  - keeps precedence-safe target selection for real runtime convergence

### 2.3.1

- PDF remediation page: `347`
- Current function: `remediate_chrony()` in `remediation/m1_remediate.sh`
- Alignment:
  - runs `dnf install -y chrony`
  - verifies package installation using `rpm -q chrony`

## VM Ops-only Scripts

These two scripts are custom ReportOps operation scripts and are not direct CIS benchmark remediation scripts:

- `remediation/m1_not_applicable_fix.sh`
- `remediation/m1_reverse_remediate.sh`

They exist to support lab/demo flows in VM Ops and intentionally reuse the same control semantics so that the next audit result changes in a way that still maps back to the benchmarked control.
