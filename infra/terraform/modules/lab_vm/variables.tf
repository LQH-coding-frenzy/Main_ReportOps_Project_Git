variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "asia-southeast1"
}

variable "zone" {
  description = "The GCP zone"
  type        = string
  default     = "asia-southeast1-c"
}

variable "vm_name" {
  description = "Name of the VM instance"
  type        = string
}

variable "machine_type" {
  description = "Machine type for the VM"
  type        = string
  default     = "e2-medium"
}

variable "disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 20
}

variable "network_name" {
  description = "The network to attach the VM to"
  type        = string
  default     = "default"
}

variable "subnetwork_name" {
  description = "The subnetwork to attach the VM to"
  type        = string
  default     = "default"
}

variable "labels" {
  description = "Labels to attach to the VM"
  type        = map(string)
  default     = {
    managed-by = "reportops"
    purpose    = "audit-lab"
  }
}

variable "vm_id" {
  description = "Database ID of the VM"
  type        = string
}

variable "section_label" {
  description = "Short section label shown on the welcome page"
  type        = string
  default     = "M1"
}

variable "owner_name" {
  description = "Name of the VM owner"
  type        = string
  default     = "Unknown"
}

variable "benchmark_name" {
  description = "Benchmark name shown on the welcome page"
  type        = string
  default     = "CIS AlmaLinux OS 9 Benchmark"
}

variable "benchmark_version" {
  description = "Benchmark version shown on the welcome page"
  type        = string
  default     = "2.0.0"
}

variable "benchmark_profile" {
  description = "Benchmark profile shown on the welcome page"
  type        = string
  default     = "Level 1 - Server"
}

variable "frontend_url" {
  description = "Frontend URL shown on the welcome page button"
  type        = string
  default     = "https://automatedprogram.app"
}

variable "verification_token" {
  description = "Verification token for the welcome page"
  type        = string
}

variable "ssh_keys" {
  description = "Public SSH keys to inject into the instance metadata (format: 'user:ssh-key')"
  type        = string
  default     = ""
}

variable "enable_oslogin" {
  description = "Enable OS Login for the instance"
  type        = bool
  default     = false
}

variable "audit_runner_ssh_public_key" {
  description = "Public SSH key for the audit runner (authorized for audituser)"
  type        = string
  default     = ""
}
