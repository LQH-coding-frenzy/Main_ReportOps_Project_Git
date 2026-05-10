output "public_ip" {
  description = "The public IP address of the instance"
  value       = module.lab_vm.public_ip
}

output "instance_name" {
  description = "The name of the created instance"
  value       = module.lab_vm.instance_name
}

output "instance_id" {
  description = "The GCP instance ID"
  value       = module.lab_vm.instance_id
}

output "zone" {
  description = "The zone the instance was deployed in"
  value       = module.lab_vm.zone
}

output "internal_ip" {
  description = "The internal IP address of the instance"
  value       = module.lab_vm.internal_ip
}
