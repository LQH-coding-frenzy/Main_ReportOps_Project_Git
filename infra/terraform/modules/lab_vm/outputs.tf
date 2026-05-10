output "instance_name" {
  description = "The name of the created instance"
  value       = google_compute_instance.lab_vm.name
}

output "instance_id" {
  description = "The GCP instance ID"
  value       = google_compute_instance.lab_vm.id
}

output "public_ip" {
  description = "The public IP address of the instance"
  value       = google_compute_instance.lab_vm.network_interface[0].access_config[0].nat_ip
}

output "internal_ip" {
  description = "The internal IP address of the instance"
  value       = google_compute_instance.lab_vm.network_interface[0].network_ip
}

output "zone" {
  description = "The zone the instance was deployed in"
  value       = google_compute_instance.lab_vm.zone
}
