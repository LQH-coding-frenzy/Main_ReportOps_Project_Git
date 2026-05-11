module "lab_vm" {
  source = "../../modules/lab_vm"

  project_id         = var.project_id
  region             = var.region
  zone               = var.zone
  vm_name            = var.vm_name
  vm_id              = var.vm_id
  owner_name         = var.owner_name
  verification_token = var.verification_token
  ssh_keys           = var.ssh_keys
  machine_type       = var.machine_type
  enable_oslogin     = var.enable_oslogin
  audit_runner_ssh_public_key = var.audit_runner_ssh_public_key
}

# Shared Firewall Rules (Created once per environment)
resource "google_compute_firewall" "shared_allow_http" {
  name    = "reportops-lab-allow-http"
  network = "default"
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["80"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["reportops-lab"]
}

resource "google_compute_firewall" "shared_allow_ssh" {
  name    = "reportops-lab-allow-ssh"
  network = "default"
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["22"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["reportops-lab"]
}
