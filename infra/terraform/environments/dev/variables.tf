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

# The runner will pass these as -var="vm_name=..." etc.
variable "vm_name" {
  description = "Name of the VM instance"
  type        = string
}

variable "vm_id" {
  description = "Database ID of the VM"
  type        = string
}

variable "owner_name" {
  description = "Name of the VM owner"
  type        = string
  default     = "Admin"
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

variable "machine_type" {
  description = "Machine type for the VM"
  type        = string
  default     = "e2-small"
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
