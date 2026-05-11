module "lab_vm" {
  source = "../../modules/lab_vm"

  project_id         = var.project_id
  region             = var.region
  zone               = var.zone
  vm_name            = var.vm_name
  vm_id              = var.vm_id
  section_label      = var.section_label
  owner_name         = var.owner_name
  benchmark_name     = var.benchmark_name
  benchmark_version  = var.benchmark_version
  benchmark_profile  = var.benchmark_profile
  frontend_url       = var.frontend_url
  verification_token = var.verification_token
  ssh_keys           = var.ssh_keys
  machine_type       = var.machine_type
  enable_oslogin     = var.enable_oslogin
  audit_runner_ssh_public_key = var.audit_runner_ssh_public_key
}

# Shared firewall rules are now managed as persistent infrastructure via gcloud in the workflow 
# to ensure they are not deleted when a single VM is destroyed.
