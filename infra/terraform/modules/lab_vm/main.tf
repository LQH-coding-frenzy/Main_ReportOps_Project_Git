# AlmaLinux 9 image lookup
data "google_compute_image" "almalinux" {
  family  = "almalinux-9"
  project = "almalinux-cloud"
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

  tags = ["reportops-lab", "http-server"]

  metadata = {
    ssh-keys = var.ssh_keys
  }

  # Startup script to install required packages, add audituser, and serve welcome page
  metadata_startup_script = <<-EOF
    #!/bin/bash
    set -e
    exec > /var/log/startup-script.log 2>&1

    echo "==> Updating packages and installing prerequisites"
    dnf install -y epel-release
    dnf install -y nginx openscap-scanner openscap-utils scap-security-guide jq policycoreutils-python-utils

    echo "==> Creating audituser"
    useradd -m -s /bin/bash audituser || true
    echo "audituser ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/audituser
    chmod 0440 /etc/sudoers.d/audituser
    mkdir -p /home/audituser/.ssh
    chmod 700 /home/audituser/.ssh
    echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHiTd+cTkUPKbQpfNbktsXcPfmxI4+qAsaSNqqEZOpSn jach9@JustADude" > /home/audituser/.ssh/authorized_keys
    chmod 600 /home/audituser/.ssh/authorized_keys
    chown -R audituser:audituser /home/audituser/.ssh

    cat << 'HTML' > /usr/share/nginx/html/index.html
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ReportOps Lab VM - Active</title>
        <style>
            :root { --primary: #3b82f6; --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --muted: #94a3b8; }
            body { font-family: 'Inter', system-ui, -apple-system, sans-serif; background-color: var(--bg); color: var(--text); display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; }
            .container { background-color: var(--card); padding: 40px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid #334155; max-width: 500px; width: 100%; text-align: center; position: relative; overflow: hidden; }
            .container::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #3b82f6, #8b5cf6); }
            h1 { margin-top: 0; color: #60a5fa; font-size: 1.75rem; margin-bottom: 8px; }
            .status-badge { display: inline-flex; align-items: center; background: rgba(34, 197, 94, 0.1); color: #22c55e; padding: 4px 12px; border-radius: 99px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 24px; border: 1px solid rgba(34, 197, 94, 0.2); }
            .status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; margin-right: 8px; box-shadow: 0 0 8px #22c55e; }
            .info-card { background: rgba(15, 23, 42, 0.5); border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: left; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 8px; }
            .info-row:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
            .info-label { color: var(--muted); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; }
            .info-value { font-weight: 600; color: #e2e8f0; font-size: 0.9rem; }
            .token { font-family: 'JetBrains Mono', monospace; background: rgba(59,130,246,0.1); color: #60a5fa; padding: 2px 6px; border-radius: 4px; }
            .btn { display: inline-block; background: var(--primary); color: white; text-decoration: none; padding: 12px 24px; border-radius: 10px; font-weight: 600; transition: all 0.2s; border: none; cursor: pointer; width: 100%; box-sizing: border-box; }
            .btn:hover { background: #2563eb; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
            .footer { margin-top: 24px; font-size: 0.75rem; color: var(--muted); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="status-badge"><span class="status-dot"></span>Active & Protected</div>
            <h1>${var.vm_name}</h1>
            <p style="color: var(--muted); margin-bottom: 24px; font-size: 0.9rem;">This virtual machine is managed by ReportOps platform for CIS Benchmark auditing.</p>
            
            <div class="info-card">
                <div class="info-row"><span class="info-label">Owner</span><span class="info-value">${var.owner_name}</span></div>
                <div class="info-row"><span class="info-label">Section</span><span class="info-value">M1 - Filesystem & Hardening</span></div>
                <div class="info-row"><span class="info-label">Benchmark</span><span class="info-value">AlmaLinux 9 v2.0.0</span></div>
                <div class="info-row"><span class="info-label">Token</span><span class="info-value token">${var.verification_token}</span></div>
            </div>

            <a href="https://automatedprogram.app/dashboard" class="btn">Back to Dashboard</a>
            
            <div class="footer">Managed by AutomatedProgram.app</div>
        </div>
    </body>
    </html>
    HTML

    echo "==> Configuring Nginx and SELinux"
    # Ensure SELinux context is correct for web files
    restorecon -Rv /usr/share/nginx/html || true
    # Allow nginx to connect to network if needed (optional)
    setsebool -P httpd_can_network_connect 1 || true

    echo "==> Enabling and starting Nginx"
    systemctl enable --now nginx

    # Disable firewalld if active - we rely on GCP VPC firewall rules
    if systemctl is-active --quiet firewalld; then
      echo "==> Disabling firewalld"
      systemctl stop firewalld
      systemctl disable firewalld
    fi

    echo "==> Setup complete"
  EOF

  allow_stopping_for_update = true
}

# Firewall rule to allow HTTP
resource "google_compute_firewall" "allow_http" {
  name    = "reportops-allow-http-${var.vm_name}"
  network = var.network_name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["http-server", "reportops-lab"]
}

# Firewall rule to allow SSH
resource "google_compute_firewall" "allow_ssh" {
  name    = "reportops-allow-ssh-${var.vm_name}"
  network = var.network_name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  # In production, this should be restricted to the runner IP
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["reportops-lab"]
}
