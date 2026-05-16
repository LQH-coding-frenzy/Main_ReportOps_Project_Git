export type SectionControlDefinition = {
  id: string;
  title: string;
  section: string;
};

export type SectionDefinition = {
  code: 'M1' | 'M2' | 'M3' | 'M4';
  title: string;
  description: string;
  cisChapters: string[];
  controls: SectionControlDefinition[];
  scriptPath: string;
  manifestPath: string;
  remediationPath: string;
  beforeLogPath: string;
  afterLogPath: string;
  screenshotDir: string;
  reportFocus: string[];
};

export const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    code: 'M1',
    title: 'Nền tảng server an toàn',
    description:
      'Package trust, hardening /tmp, process hardening, and time synchronization for the AlmaLinux 9 base server layer.',
    cisChapters: ['1.1', '1.2', '1.5', '2.3'],
    controls: [
      { id: '1.2.1.2', title: 'Ensure gpgcheck is globally activated', section: '1.2' },
      { id: '1.1.2.1.2', title: 'Ensure nodev option set on /tmp partition', section: '1.1' },
      { id: '1.1.2.1.3', title: 'Ensure nosuid option set on /tmp partition', section: '1.1' },
      { id: '1.1.2.1.4', title: 'Ensure noexec option set on /tmp partition', section: '1.1' },
      { id: '1.5.1', title: 'Ensure address space layout randomization is enabled', section: '1.5' },
      { id: '1.5.2', title: 'Ensure ptrace_scope is restricted', section: '1.5' },
      { id: '2.3.1', title: 'Ensure time synchronization is in use', section: '2.3' },
    ],
    scriptPath: 'scripts/m1_base_server.sh',
    manifestPath: 'manifests/manifest-m1.yaml',
    remediationPath: 'remediation/m1_remediate.sh',
    beforeLogPath: 'logs/before/m1_before.log',
    afterLogPath: 'logs/after/m1_after.log',
    screenshotDir: 'screenshots/m1/',
    reportFocus: [
      'Vì sao gpgcheck quan trọng với package trust.',
      'Vì sao /tmp là vùng cần hardening trên Linux server.',
      'Vì sao ASLR và ptrace_scope giúp giảm rủi ro khai thác tiến trình.',
      'Vì sao time sync cần cho logging và audit trail.',
    ],
  },
  {
    code: 'M2',
    title: 'Giảm bề mặt tấn công',
    description:
      'SELinux baseline, package reduction, network hardening, and firewall foundation to reduce attack surface.',
    cisChapters: ['1.3', '3.3', '4.1'],
    controls: [
      { id: '1.3.1.1', title: 'Ensure SELinux is installed', section: '1.3' },
      { id: '1.3.1.4', title: 'Ensure the SELinux mode is not disabled', section: '1.3' },
      { id: '1.3.1.7', title: 'Ensure mcstrans is not installed', section: '1.3' },
      { id: '1.3.1.8', title: 'Ensure SETroubleshoot is not installed', section: '1.3' },
      { id: '3.3.1', title: 'Ensure ip forwarding is disabled', section: '3.3' },
      { id: '3.3.7', title: 'Ensure reverse path filtering is enabled', section: '3.3' },
      { id: '4.1.1', title: 'Ensure nftables is installed', section: '4.1' },
    ],
    scriptPath: 'scripts/m2_attack_surface.sh',
    manifestPath: 'manifests/manifest-m2.yaml',
    remediationPath: 'remediation/m2_remediate.sh',
    beforeLogPath: 'logs/before/m2_before.log',
    afterLogPath: 'logs/after/m2_after.log',
    screenshotDir: 'screenshots/m2/',
    reportFocus: [
      'SELinux là gì và vì sao cần cho server.',
      'Vì sao loại bỏ mcstrans/setroubleshoot giúp giảm bề mặt tấn công.',
      'Vì sao server thường không nên bật IP forwarding.',
      'Vai trò của reverse path filtering.',
      'Vì sao cần có nftables/firewall nền tảng.',
    ],
  },
  {
    code: 'M3',
    title: 'Bảo vệ truy cập quản trị',
    description:
      'SSH and sudo controls protecting the primary administrative access path into the AlmaLinux 9 server.',
    cisChapters: ['5.1', '5.2'],
    controls: [
      { id: '5.1.1', title: 'Ensure permissions on /etc/ssh/sshd_config are configured', section: '5.1' },
      { id: '5.1.15', title: 'Ensure sshd LogLevel is configured', section: '5.1' },
      { id: '5.1.19', title: 'Ensure sshd PermitEmptyPasswords is disabled', section: '5.1' },
      { id: '5.1.20', title: 'Ensure sshd PermitRootLogin is disabled', section: '5.1' },
      { id: '5.1.22', title: 'Ensure sshd UsePAM is enabled', section: '5.1' },
      { id: '5.2.2', title: 'Ensure sudo commands use pty', section: '5.2' },
      { id: '5.2.6', title: 'Ensure sudo authentication timeout is configured correctly', section: '5.2' },
    ],
    scriptPath: 'scripts/m3_admin_access.sh',
    manifestPath: 'manifests/manifest-m3.yaml',
    remediationPath: 'remediation/m3_remediate.sh',
    beforeLogPath: 'logs/before/m3_before.log',
    afterLogPath: 'logs/after/m3_after.log',
    screenshotDir: 'screenshots/m3/',
    reportFocus: [
      'Vì sao SSH là điểm vào quan trọng nhất của server.',
      'Vì sao không nên cho root SSH trực tiếp.',
      'Vì sao không cho phép empty password.',
      'Vì sao SSH logging cần đủ thông tin.',
      'Vì sao sudo cần pty và timeout hợp lý.',
    ],
  },
  {
    code: 'M4',
    title: 'Tài khoản, mật khẩu, logging và audit trail',
    description:
      'PAM, password expiration, UID 0 review, journald, and rsyslog controls for identity and traceability.',
    cisChapters: ['5.3', '5.4', '6.2'],
    controls: [
      { id: '5.3.2.2', title: 'Ensure pam_faillock module is enabled', section: '5.3' },
      { id: '5.3.2.3', title: 'Ensure pam_pwquality module is enabled', section: '5.3' },
      { id: '5.3.2.4', title: 'Ensure pam_pwhistory module is enabled', section: '5.3' },
      { id: '5.4.1.1', title: 'Ensure password expiration is configured', section: '5.4' },
      { id: '5.4.2.1', title: 'Ensure root is the only UID 0 account', section: '5.4' },
      { id: '6.2.1.1', title: 'Ensure journald service is enabled and active', section: '6.2' },
      { id: '6.2.3.2', title: 'Ensure rsyslog service is enabled and active', section: '6.2' },
    ],
    scriptPath: 'scripts/m4_identity_logging_audit.sh',
    manifestPath: 'manifests/manifest-m4.yaml',
    remediationPath: 'remediation/m4_remediate.sh',
    beforeLogPath: 'logs/before/m4_before.log',
    afterLogPath: 'logs/after/m4_after.log',
    screenshotDir: 'screenshots/m4/',
    reportFocus: [
      'PAM là gì và vì sao cần faillock/pwquality/pwhistory.',
      'Vì sao password expiration quan trọng.',
      'Vì sao chỉ root nên có UID 0.',
      'Journald và rsyslog phối hợp ghi log như thế nào.',
      'Vì sao audit trail quan trọng khi vận hành server.',
    ],
  },
];

export const SECTION_DEFINITION_MAP = Object.fromEntries(
  SECTION_DEFINITIONS.map((definition) => [definition.code, definition])
) as Record<SectionDefinition['code'], SectionDefinition>;
