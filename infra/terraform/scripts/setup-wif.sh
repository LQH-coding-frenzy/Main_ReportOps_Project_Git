#!/bin/bash
# ==============================================================================
# ReportOps - Workload Identity Federation Setup
# This script configures GCP to trust GitHub Actions without needing long-lived
# service account JSON keys.
# 
# PREREQUISITES:
# 1. Install Google Cloud CLI (gcloud)
# 2. Run `gcloud auth login`
# 3. Have Owner permissions on the GCP Project
# ==============================================================================

set -e

echo "=== ReportOps Workload Identity Federation Setup ==="

# Prompt for Project ID
read -p "Enter your GCP Project ID: " PROJECT_ID
read -p "Enter your GitHub Repo (e.g., LQH-coding-frenzy/Main_ReportOps_Project_Git): " GITHUB_REPO

gcloud config set project $PROJECT_ID

# Enable required APIs
echo "[1/6] Enabling IAM Credentials API..."
gcloud services enable iamcredentials.googleapis.com cloudresourcemanager.googleapis.com

# Create Service Account for Terraform
SA_NAME="reportops-terraform-sa"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "[2/6] Creating Service Account ($SA_NAME)..."
gcloud iam service-accounts create $SA_NAME \
  --display-name="ReportOps Terraform Service Account" || echo "SA might already exist."

# Grant roles to the Service Account
echo "[3/6] Granting Editor and Compute Admin roles to Service Account..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/editor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/compute.admin"

# Create Workload Identity Pool
POOL_NAME="github-actions-pool"
echo "[4/6] Creating Workload Identity Pool ($POOL_NAME)..."
gcloud iam workload-identity-pools create $POOL_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --display-name="GitHub Actions Pool" || echo "Pool might already exist."

# Create Workload Identity Provider
PROVIDER_NAME="github-provider"
echo "[5/6] Creating Workload Identity Provider ($PROVIDER_NAME)..."
gcloud iam workload-identity-pools providers create-oidc $PROVIDER_NAME \
  --project=$PROJECT_ID \
  --location="global" \
  --workload-identity-pool=$POOL_NAME \
  --display-name="GitHub provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com" || echo "Provider might already exist."

# Allow GitHub Repo to impersonate the Service Account
echo "[6/6] Binding GitHub repo to Service Account..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")

gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL \
  --project=$PROJECT_ID \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/attribute.repository/${GITHUB_REPO}"

# Output the required GitHub Secrets
echo "======================================================"
echo "✅ SETUP COMPLETE! "
echo "Please add the following secrets to your GitHub Repository:"
echo ""
echo "1. GCP_PROJECT_ID"
echo "   Value: $PROJECT_ID"
echo ""
echo "2. GCP_TERRAFORM_SA_EMAIL"
echo "   Value: $SA_EMAIL"
echo ""
echo "3. GCP_WORKLOAD_IDENTITY_PROVIDER"
echo "   Value: projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_NAME}/providers/${PROVIDER_NAME}"
echo "======================================================"
