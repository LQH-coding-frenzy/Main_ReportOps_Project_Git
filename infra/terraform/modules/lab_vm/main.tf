# AlmaLinux 9 image lookup
data "google_compute_image" "almalinux" {
  family  = "almalinux-9"
  project = "almalinux-cloud"
}

locals {
  audit_runner_ssh_entry = var.audit_runner_ssh_public_key != "" ? "audituser:${var.audit_runner_ssh_public_key}" : ""
  combined_ssh_keys      = trimspace(join("\n", compact([var.ssh_keys, local.audit_runner_ssh_entry])))
}

# The Lab VM Instance
resource "google_compute_instance" "lab_vm" {
  name         = var.vm_name
  machine_type = var.machine_type
  zone         = var.zone
  project      = var.project_id

  boot_disk {
    initialize_params {
      image = data.google_compute_image.almalinux.self_link
      size  = var.disk_size_gb
      type  = "pd-balanced"
    }
  }

  network_interface {
    network    = var.network_name
    subnetwork = var.subnetwork_name

    # Ephemeral public IP
    access_config {
      network_tier = "PREMIUM"
    }
  }

  labels = var.labels

  tags = ["reportops-lab", "http-server", var.vm_name]

  metadata = merge(
    {
      enable-oslogin = var.enable_oslogin ? "TRUE" : "FALSE"
    },
    local.combined_ssh_keys != "" ? { "ssh-keys" = local.combined_ssh_keys } : {}
  )

  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    exec > >(tee /var/log/startup-script.log | logger -t startup-script -s 2>/dev/console) 2>&1
    
    echo "Starting ReportOps Lab initialization..."
    
    # 1. Ensure audituser exists and has correct shell
    if ! id "audituser" &>/dev/null; then
      echo "Creating audituser..."
      useradd -m -s /bin/bash audituser || true
    fi

    # 2. FORCE update SSH keys and permissions (Always run)
    echo "Updating SSH keys for audituser..."
    mkdir -p /home/audituser/.ssh
    if [ -n "${var.audit_runner_ssh_public_key}" ]; then
      printf '%s\n' "${var.audit_runner_ssh_public_key}" > /home/audituser/.ssh/authorized_keys
    else
      echo "WARNING: AUDIT runner SSH public key is empty. Preserving existing authorized_keys if present."
      touch /home/audituser/.ssh/authorized_keys
    fi
    chown -R audituser:audituser /home/audituser/.ssh
    chmod 700 /home/audituser/.ssh
    chmod 600 /home/audituser/.ssh/authorized_keys
    
    # 3. CRITICAL: Always fix SELinux labels
    if command -v restorecon &>/dev/null; then
      restorecon -Rv /home/audituser/.ssh || true
    fi

    # 4. Broaden SSH compatibility and Disable SELinux (Persistent & Immediate)
    update-crypto-policies --set DEFAULT:SHA1 || true
    setenforce 0 || true
    sed -i 's/^SELINUX=enforcing/SELINUX=permissive/' /etc/selinux/config || true
    
    # 5. Ensure sudo permissions
    echo "audituser ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/audituser
    chmod 0440 /etc/sudoers.d/audituser

    # 6. Configure SSH for stable non-interactive access.
    cat > /etc/ssh/sshd_config.d/99-reportops.conf <<'SSHD'
UseDNS no
GSSAPIAuthentication no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
ClientAliveInterval 120
ClientAliveCountMax 2
MaxStartups 50:30:100
SSHD

    systemctl enable sshd
    systemctl restart sshd

    # 7. Disable guest firewall early so public HTTP works as soon as nginx is ready.
    systemctl stop firewalld || true
    systemctl disable firewalld || true

    # 8. Disable background package timers on small lab VMs to avoid lock contention and SSH stalls.
    systemctl disable --now dnf-makecache.timer dnf-automatic.timer || true

    # 9. Install only the minimum packages needed for the welcome page first.
    # Avoid slow third-party repos during first boot.
    echo "Installing minimum packages for welcome page..."
    dnf --disablerepo='google-cloud*' install -y nginx curl || true
    
    # 10. Configure Welcome Page early so HTTP is available even if later packages fail
    echo "Configuring Nginx with live observability..."
    mkdir -p /usr/share/nginx/html

    # Set up a /stats endpoint served by a simple bash script via fcgiwrap
    dnf --disablerepo='google-cloud*' install -y fcgi fcgiwrap || true
    mkdir -p /var/www/cgi-bin

    cat > /var/www/cgi-bin/stats.sh << 'STATS_EOF'
#!/bin/bash
echo "Content-Type: application/json"
echo "Access-Control-Allow-Origin: *"
echo ""

CPU_COUNT=$(nproc 2>/dev/null || echo 0)
CPU_MODEL=$(grep -m1 'model name' /proc/cpuinfo 2>/dev/null | cut -d: -f2- | sed 's/^ *//' || echo "Unknown")
LOAD=$(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}')
LOAD1=$(echo $LOAD | awk '{print $1}')
LOAD5=$(echo $LOAD | awk '{print $2}')
LOAD15=$(echo $LOAD | awk '{print $3}')

MEM=$(awk '/MemTotal:/ {t=int($2/1024)} /MemAvailable:/ {a=int($2/1024)} END {print t, a}' /proc/meminfo 2>/dev/null)
MEM_TOTAL=$(echo $MEM | awk '{print $1}')
MEM_AVAIL=$(echo $MEM | awk '{print $2}')
MEM_USED=$((MEM_TOTAL - MEM_AVAIL))
MEM_PCT=$(( MEM_TOTAL > 0 ? MEM_USED * 100 / MEM_TOTAL : 0 ))

DISK=$(df -BM / 2>/dev/null | awk 'NR==2 {gsub(/M/,"",$2); gsub(/M/,"",$3); gsub(/%/,"",$5); print $2, $3, $5}')
DISK_TOTAL=$(echo $DISK | awk '{print $1}')
DISK_USED=$(echo $DISK | awk '{print $2}')
DISK_PCT=$(echo $DISK | awk '{print $3}')

UPTIME=$(uptime -p 2>/dev/null || echo "unknown")
NGINX=$(systemctl is-active nginx 2>/dev/null || echo "unknown")
SSHD=$(systemctl is-active sshd 2>/dev/null || echo "unknown")

CPU_PCT=$(( CPU_COUNT > 0 ? $(echo "$LOAD1 $CPU_COUNT" | awk '{printf "%d", ($1/$2)*100}') : 0 ))

echo "{\"cpuCount\":$CPU_COUNT,\"cpuModel\":\"$CPU_MODEL\",\"load1\":$LOAD1,\"load5\":$LOAD5,\"load15\":$LOAD15,\"cpuPressurePercent\":$CPU_PCT,\"memoryTotalMb\":$MEM_TOTAL,\"memoryUsedMb\":$MEM_USED,\"memoryUsagePercent\":$MEM_PCT,\"rootDiskTotalMb\":$DISK_TOTAL,\"rootDiskUsedMb\":$DISK_USED,\"rootDiskUsagePercent\":$DISK_PCT,\"uptimeHuman\":\"$UPTIME\",\"nginxStatus\":\"$NGINX\",\"sshdStatus\":\"$SSHD\"}"
STATS_EOF

    chmod +x /var/www/cgi-bin/stats.sh

    # Configure nginx with CGI support
    cat > /etc/nginx/conf.d/reportops.conf << 'NGINX_CONF'
server {
    listen 80 default_server;
    root /usr/share/nginx/html;
    index index.html;

    location /stats {
        include fastcgi_params;
        fastcgi_pass unix:/var/run/fcgiwrap.socket;
        fastcgi_param SCRIPT_FILENAME /var/www/cgi-bin/stats.sh;
    }
}
NGINX_CONF

    # Enable and start fcgiwrap
    systemctl enable --now fcgiwrap 2>/dev/null || true

    cat > /usr/share/nginx/html/index.html << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ReportOps Lab VM — ${var.vm_name}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #3b82f6;
            --primary-glow: rgba(59,130,246,0.25);
            --bg: #0a0f1e;
            --surface: #111827;
            --card: #1a2236;
            --border: #1e2d45;
            --text: #f1f5f9;
            --muted: #64748b;
            --success: #22c55e;
            --warning: #f59e0b;
            --danger: #ef4444;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Inter', system-ui, sans-serif;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }
        .page { max-width: 700px; width: 100%; }
        .card {
            background: var(--card);
            border: 1px solid var(--border);
            border-radius: 16px;
            padding: 28px;
            margin-bottom: 16px;
            position: relative;
            overflow: hidden;
        }
        .card-top-bar {
            position: absolute; top: 0; left: 0; right: 0; height: 3px;
            background: linear-gradient(90deg, var(--primary), #8b5cf6, #06b6d4);
        }
        .header { text-align: center; margin-bottom: 8px; }
        .vm-badge {
            display: inline-flex; align-items: center; gap: 8px;
            background: rgba(59,130,246,0.1);
            border: 1px solid rgba(59,130,246,0.25);
            padding: 6px 16px; border-radius: 99px;
            font-size: 0.75rem; font-weight: 700; letter-spacing: 0.1em;
            color: var(--primary); text-transform: uppercase; margin-bottom: 16px;
        }
        .pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--success); box-shadow: 0 0 8px var(--success); animation: pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.2); } }
        h1 { font-size: 2rem; font-weight: 700; margin-bottom: 4px; background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .subtitle { color: var(--muted); font-size: 0.875rem; margin-bottom: 24px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .info-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(0,0,0,0.2); border-radius: 8px; }
        .info-label { font-size: 0.7rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .info-value { font-size: 0.85rem; font-weight: 600; color: var(--text); }
        .token { font-family: 'JetBrains Mono', monospace; color: var(--primary); font-size: 0.7rem; }
        .section-badge { background: linear-gradient(135deg, var(--primary), #8b5cf6); color: white; padding: 2px 10px; border-radius: 99px; font-weight: 700; font-size: 0.8rem; }
        .obs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .obs-title { font-size: 0.95rem; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        .refresh-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--success); }
        .refresh-dot.refreshing { animation: spin 1s linear infinite; background: var(--warning); }
        @keyframes spin { to { transform: rotate(360deg); } }
        .last-update { font-size: 0.7rem; color: var(--muted); }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 16px; }
        .metric { background: rgba(0,0,0,0.2); border-radius: 10px; padding: 12px; }
        .metric-label { font-size: 0.65rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
        .metric-value { font-size: 1.2rem; font-weight: 700; }
        .metric-sub { font-size: 0.65rem; color: var(--muted); margin-top: 2px; }
        .bar-track { background: rgba(255,255,255,0.05); border-radius: 99px; height: 4px; margin-top: 6px; overflow: hidden; }
        .bar-fill { height: 100%; border-radius: 99px; transition: width 0.8s ease, background 0.3s; }
        .services { display: flex; gap: 10px; flex-wrap: wrap; }
        .svc-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 99px; font-size: 0.75rem; font-weight: 600; border: 1px solid; }
        .svc-active { background: rgba(34,197,94,0.1); border-color: rgba(34,197,94,0.3); color: var(--success); }
        .svc-inactive { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: var(--danger); }
        .svc-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .error-msg { color: var(--muted); font-size: 0.85rem; text-align: center; padding: 20px; }
        .btn {
            display: block; background: var(--primary); color: white;
            text-decoration: none; padding: 14px; border-radius: 10px;
            font-weight: 600; text-align: center; font-size: 0.9rem;
            transition: all 0.2s; border: none; cursor: pointer; width: 100%;
        }
        .btn:hover { background: #2563eb; transform: translateY(-1px); box-shadow: 0 8px 20px var(--primary-glow); }
        .footer { text-align: center; margin-top: 12px; font-size: 0.7rem; color: var(--muted); }
        #loading { text-align: center; padding: 20px; color: var(--muted); font-size: 0.85rem; }
    </style>
</head>
<body>
<div class="page">
    <div class="card">
        <div class="card-top-bar"></div>
        <div class="header">
            <div class="vm-badge"><span class="pulse"></span>Active &amp; Protected</div>
            <h1>${var.vm_name}</h1>
            <p class="subtitle">ReportOps Lab VM — CIS Benchmark Auditing Platform</p>
        </div>
        <div class="info-grid">
            <div class="info-row"><span class="info-label">VM ID</span><span class="info-value">${var.vm_id}</span></div>
            <div class="info-row"><span class="info-label">Section</span><span class="info-value"><span class="section-badge">${var.section_label}</span></span></div>
            <div class="info-row"><span class="info-label">Owner</span><span class="info-value">${var.owner_name}</span></div>
            <div class="info-row"><span class="info-label">Profile</span><span class="info-value">${var.benchmark_profile}</span></div>
            <div class="info-row" style="grid-column: span 2"><span class="info-label">Benchmark</span><span class="info-value">${var.benchmark_name} v${var.benchmark_version}</span></div>
            <div class="info-row" style="grid-column: span 2"><span class="info-label">Token</span><span class="info-value token">${var.verification_token}</span></div>
        </div>
    </div>

    <div class="card" id="obs-card">
        <div class="card-top-bar" style="background: linear-gradient(90deg, #22c55e, #06b6d4);"></div>
        <div class="obs-header">
            <div class="obs-title">
                <span id="refresh-dot" class="refresh-dot"></span>
                📈 Live Observability
            </div>
            <span id="last-update" class="last-update">Loading...</span>
        </div>
        <div id="obs-content">
            <div id="loading">Collecting metrics...</div>
        </div>
    </div>

    <a href="${var.frontend_url}/dashboard" class="btn">← Back to Dashboard</a>
    <div class="footer">Managed by ReportOps · ${var.benchmark_name}</div>
</div>

<script>
function barColor(pct) {
    if (pct < 60) return '#22c55e';
    if (pct < 85) return '#f59e0b';
    return '#ef4444';
}

function renderObs(d) {
    const cpuPct = Math.min(100, d.cpuPressurePercent || 0);
    const memPct = d.memoryUsagePercent || 0;
    const diskPct = d.rootDiskUsagePercent || 0;

    return `
    <div class="metrics-grid">
        <div class="metric">
            <div class="metric-label">CPU Pressure</div>
            <div class="metric-value" style="color:$${barColor(cpuPct)}">$${cpuPct}%</div>
            <div class="metric-sub">Load: $${(d.load1||0).toFixed(2)} / $${(d.load5||0).toFixed(2)} / $${(d.load15||0).toFixed(2)}</div>
            <div class="bar-track"><div class="bar-fill" style="width:$${cpuPct}%;background:$${barColor(cpuPct)}"></div></div>
        </div>
        <div class="metric">
            <div class="metric-label">Memory</div>
            <div class="metric-value" style="color:$${barColor(memPct)}">$${memPct}%</div>
            <div class="metric-sub">$${d.memoryUsedMb||0} / $${d.memoryTotalMb||0} MB</div>
            <div class="bar-track"><div class="bar-fill" style="width:$${memPct}%;background:$${barColor(memPct)}"></div></div>
        </div>
        <div class="metric">
            <div class="metric-label">Root Disk</div>
            <div class="metric-value" style="color:$${barColor(diskPct)}">$${diskPct}%</div>
            <div class="metric-sub">$${d.rootDiskUsedMb||0} / $${d.rootDiskTotalMb||0} MB</div>
            <div class="bar-track"><div class="bar-fill" style="width:$${diskPct}%;background:$${barColor(diskPct)}"></div></div>
        </div>
        <div class="metric">
            <div class="metric-label">Uptime</div>
            <div class="metric-value" style="font-size:0.9rem;color:#60a5fa">$${d.uptimeHuman||'—'}</div>
            <div class="metric-sub">$${d.cpuCount||0} vCPU · $${d.cpuModel||'—'}</div>
        </div>
    </div>
    <div class="services">
        <div class="svc-badge $${d.nginxStatus==='active'?'svc-active':'svc-inactive'}">
            <span class="svc-dot"></span>nginx: $${d.nginxStatus||'unknown'}
        </div>
        <div class="svc-badge $${d.sshdStatus==='active'?'svc-active':'svc-inactive'}">
            <span class="svc-dot"></span>sshd: $${d.sshdStatus||'unknown'}
        </div>
    </div>`;
}

let firstLoad = true;

async function fetchStats() {
    const dot = document.getElementById('refresh-dot');
    const lastUpdate = document.getElementById('last-update');
    const content = document.getElementById('obs-content');

    if (dot) dot.classList.add('refreshing');

    try {
        const r = await fetch('/stats', { cache: 'no-cache' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (content) content.innerHTML = renderObs(d);
        if (lastUpdate) lastUpdate.textContent = 'Updated: ' + new Date().toLocaleTimeString();
        firstLoad = false;
    } catch (e) {
        if (firstLoad && content) {
            content.innerHTML = '<div class="error-msg">⚡ Stats endpoint loading... retry in 10s</div>';
        }
    } finally {
        if (dot) dot.classList.remove('refreshing');
    }
}

fetchStats();
setInterval(fetchStats, 5000);
</script>
</body>
</html>
HTML


    restorecon -Rv /usr/share/nginx/html || true
    setsebool -P httpd_can_network_connect 1 || true
    systemctl enable --now nginx || true

    for attempt in $(seq 1 24); do
      if curl -fsS http://127.0.0.1 >/dev/null 2>&1; then
        echo "Welcome page is reachable on localhost."
        break
      fi
      echo "Waiting for nginx welcome page... attempt $attempt/24"
      sleep 5
    done

    for attempt in $(seq 1 24); do
      if timeout 5 bash -lc 'exec 3<>/dev/tcp/127.0.0.1/22; IFS= read -r line <&3; echo "$line" | grep -q "^SSH-"' >/dev/null 2>&1; then
        echo "SSH banner is reachable on localhost."
        break
      fi
      echo "Waiting for sshd banner... attempt $attempt/24"
      sleep 5
    done

    # 11. Install audit packages best-effort after HTTP is already available.
    echo "Installing audit packages..."
    dnf --disablerepo='google-cloud*' install -y jq policycoreutils-python-utils openscap-scanner scap-security-guide || true

    echo "Initialization complete!"
  EOF

  allow_stopping_for_update = true
}

# (Firewall rules moved to environment root)

# Optional firewall rule to allow HTTPS (443)
resource "google_compute_firewall" "allow_https" {
  name    = "reportops-allow-https-${var.vm_name}"
  network = var.network_name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["443"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server", "reportops-lab"]
}

# Optional firewall rule to allow ICMP (useful for debugging reachability)
resource "google_compute_firewall" "allow_icmp" {
  name    = "reportops-allow-icmp-${var.vm_name}"
  network = var.network_name
  project = var.project_id

  allow {
    protocol = "icmp"
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["reportops-lab"]
}
