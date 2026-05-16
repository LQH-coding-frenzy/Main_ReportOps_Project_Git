export type FrontendSectionControl = {
  id: string;
  title: string;
  objective: string;
};

export type FrontendSectionDefinition = {
  code: 'M1' | 'M2' | 'M3' | 'M4';
  title: string;
  shortTitle: string;
  description: string;
  flowRole: string;
  cisChapters: string[];
  controls: FrontendSectionControl[];
  scriptPath: string;
  manifestPath: string;
  remediationPath: string;
  beforeLogPath: string;
  afterLogPath: string;
  screenshotDir: string;
  reportFocus: string[];
};

export const FRONTEND_SECTION_DEFINITIONS: FrontendSectionDefinition[] = [
  {
    code: 'M1',
    title: 'Nền tảng server an toàn',
    shortTitle: 'Base Server',
    description: 'Package trust, hardening /tmp, process hardening và đồng bộ thời gian cho lớp nền của server.',
    flowRole: 'Huy bảo đảm nền tảng server an toàn: package trust, /tmp, process hardening, time sync.',
    cisChapters: ['1.1', '1.2', '1.5', '2.3'],
    controls: [
      { id: '1.2.1.2', title: 'Ensure gpgcheck is globally activated', objective: 'Kiểm tra xác thực chữ ký package' },
      { id: '1.1.2.1.2', title: 'Ensure nodev option set on /tmp partition', objective: 'Ngăn tạo device đặc biệt trong /tmp' },
      { id: '1.1.2.1.3', title: 'Ensure nosuid option set on /tmp partition', objective: 'Ngăn setuid trong /tmp' },
      { id: '1.1.2.1.4', title: 'Ensure noexec option set on /tmp partition', objective: 'Ngăn chạy file thực thi từ /tmp' },
      { id: '1.5.1', title: 'Ensure address space layout randomization is enabled', objective: 'Giảm rủi ro khai thác bộ nhớ' },
      { id: '1.5.2', title: 'Ensure ptrace_scope is restricted', objective: 'Hạn chế tiến trình đọc hoặc điều khiển tiến trình khác' },
      { id: '2.3.1', title: 'Ensure time synchronization is in use', objective: 'Đảm bảo log và audit có thời gian chính xác' },
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
    shortTitle: 'Attack Surface',
    description: 'SELinux, network hardening và firewall nền tảng để giảm attack surface của server.',
    flowRole: 'Bảo giảm bề mặt tấn công: SELinux, service/package không cần thiết, network hardening, firewall nền tảng.',
    cisChapters: ['1.3', '3.3', '4.1'],
    controls: [
      { id: '1.3.1.1', title: 'Ensure SELinux is installed', objective: 'Đảm bảo hệ thống có SELinux' },
      { id: '1.3.1.4', title: 'Ensure the SELinux mode is not disabled', objective: 'Đảm bảo SELinux không bị tắt' },
      { id: '1.3.1.7', title: 'Ensure mcstrans is not installed', objective: 'Loại bỏ gói không cần thiết' },
      { id: '1.3.1.8', title: 'Ensure SETroubleshoot is not installed', objective: 'Loại bỏ gói hỗ trợ debug không cần trên server' },
      { id: '3.3.1', title: 'Ensure ip forwarding is disabled', objective: 'Ngăn server hoạt động như router ngoài ý muốn' },
      { id: '3.3.7', title: 'Ensure reverse path filtering is enabled', objective: 'Giảm rủi ro IP spoofing' },
      { id: '4.1.1', title: 'Ensure nftables is installed', objective: 'Đảm bảo có nền tảng firewall' },
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
    shortTitle: 'Admin Access',
    description: 'SSH và sudo controls bảo vệ đường truy cập quản trị vào hệ thống.',
    flowRole: 'Duy bảo vệ truy cập quản trị: SSH và sudo.',
    cisChapters: ['5.1', '5.2'],
    controls: [
      { id: '5.1.1', title: 'Ensure permissions on /etc/ssh/sshd_config are configured', objective: 'Bảo vệ file cấu hình SSH' },
      { id: '5.1.15', title: 'Ensure sshd LogLevel is configured', objective: 'Đảm bảo SSH ghi log phù hợp' },
      { id: '5.1.19', title: 'Ensure sshd PermitEmptyPasswords is disabled', objective: 'Chặn đăng nhập mật khẩu rỗng' },
      { id: '5.1.20', title: 'Ensure sshd PermitRootLogin is disabled', objective: 'Chặn root SSH trực tiếp' },
      { id: '5.1.22', title: 'Ensure sshd UsePAM is enabled', objective: 'Bảo đảm SSH dùng PAM' },
      { id: '5.2.2', title: 'Ensure sudo commands use pty', objective: 'Tăng khả năng kiểm soát phiên sudo' },
      { id: '5.2.6', title: 'Ensure sudo authentication timeout is configured correctly', objective: 'Hạn chế thời gian phiên sudo còn hiệu lực' },
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
    shortTitle: 'Identity & Logging',
    description: 'PAM, password policy, journald và rsyslog để tăng nhận diện và khả năng truy vết.',
    flowRole: 'Phước bảo vệ tài khoản và khả năng truy vết: PAM, password policy, journald, rsyslog.',
    cisChapters: ['5.3', '5.4', '6.2'],
    controls: [
      { id: '5.3.2.2', title: 'Ensure pam_faillock module is enabled', objective: 'Hạn chế brute-force đăng nhập' },
      { id: '5.3.2.3', title: 'Ensure pam_pwquality module is enabled', objective: 'Kiểm tra độ mạnh mật khẩu' },
      { id: '5.3.2.4', title: 'Ensure pam_pwhistory module is enabled', objective: 'Ngăn tái sử dụng mật khẩu cũ' },
      { id: '5.4.1.1', title: 'Ensure password expiration is configured', objective: 'Kiểm soát vòng đời mật khẩu' },
      { id: '5.4.2.1', title: 'Ensure root is the only UID 0 account', objective: 'Ngăn tài khoản đặc quyền giả mạo root' },
      { id: '6.2.1.1', title: 'Ensure journald service is enabled and active', objective: 'Đảm bảo logging nền tảng hoạt động' },
      { id: '6.2.3.2', title: 'Ensure rsyslog service is enabled and active', objective: 'Đảm bảo rsyslog hoạt động để thu thập log hệ thống' },
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

export const FRONTEND_SECTION_DEFINITION_MAP = Object.fromEntries(
  FRONTEND_SECTION_DEFINITIONS.map((definition) => [definition.code, definition])
) as Record<FrontendSectionDefinition['code'], FrontendSectionDefinition>;
