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

    echo "==> Updating packages and installing prerequisites"
    dnf install -y epel-release
    dnf install -y nginx firewalld openscap-scanner openscap-utils scap-security-guide jq

    echo "==> Creating audituser"
    useradd -m -s /bin/bash audituser || true
    echo "audituser ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/audituser
    chmod 0440 /etc/sudoers.d/audituser

    echo "==> Generating Welcome Page"
    cat << 'HTML' > /usr/share/nginx/html/index.html
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>ReportOps Lab VM</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background-color: #0f172a; color: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
            .container { background-color: #1e293b; padding: 2rem 3rem; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5); border: 1px solid #334155; max-width: 500px; width: 100%; }
            h1 { margin-top: 0; color: #60a5fa; font-size: 1.5rem; text-align: center; border-bottom: 1px solid #334155; padding-bottom: 1rem; margin-bottom: 1.5rem; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 0.75rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.5rem; }
            .info-label { color: #94a3b8; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.05em; }
            .info-value { font-weight: 600; color: #e2e8f0; }
            .footer { margin-top: 2rem; text-align: center; font-size: 0.75rem; color: #64748b; }
            .token { font-family: monospace; background: rgba(59,130,246,0.1); color: #60a5fa; padding: 0.2rem 0.5rem; border-radius: 4px; border: 1px solid rgba(59,130,246,0.2); }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>ReportOps Lab VM</h1>
            <div class="info-row"><span class="info-label">VM ID</span><span class="info-value">#${var.vm_id}</span></div>
            <div class="info-row"><span class="info-label">Name</span><span class="info-value">${var.vm_name}</span></div>
            <div class="info-row"><span class="info-label">Owner</span><span class="info-value">${var.owner_name}</span></div>
            <div class="info-row"><span class="info-label">Benchmark</span><span class="info-value">CIS AlmaLinux 9 v2.0.0</span></div>
            <div class="info-row"><span class="info-label">Section</span><span class="info-value">M1</span></div>
            <div class="info-row"><span class="info-label">Verification Token</span><span class="info-value token">${var.verification_token}</span></div>
            <div class="footer">Created by ReportOps Web App</div>
        </div>
    </body>
    </html>
    HTML

    echo "==> Enabling and starting Nginx"
    systemctl enable --now firewalld
    firewall-cmd --permanent --add-service=http
    firewall-cmd --reload
    systemctl enable --now nginx

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
