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
}
