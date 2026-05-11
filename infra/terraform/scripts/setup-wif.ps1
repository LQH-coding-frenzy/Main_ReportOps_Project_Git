

$ProjectID = "cis-benchmark-uit"
$GithubRepo = "LQH-coding-frenzy/Main_ReportOps_Project_Git"
$SaName = "reportops-terraform-sa"
$SaEmail = "$SaName@$ProjectID.iam.gserviceaccount.com"
$PoolName = "github-actions-pool"
$ProviderName = "github-provider"

Write-Host "=== Setting up Workload Identity Federation for $ProjectID ==="

Write-Host "[1/6] Enabling IAM Credentials API..."
gcloud services enable iamcredentials.googleapis.com cloudresourcemanager.googleapis.com compute.googleapis.com

Write-Host "[2/6] Creating Service Account ($SaName)..."
$saExists = gcloud iam service-accounts describe $SaEmail --project=$ProjectID 2>&1
if ($saExists -match "NOT_FOUND") {
    gcloud iam service-accounts create $SaName --display-name="ReportOps Terraform Service Account" --project=$ProjectID
} else {
    Write-Host "Service account already exists."
}

Write-Host "[3/6] Granting Editor and Compute Admin roles..."
gcloud projects add-iam-policy-binding $ProjectID --member="serviceAccount:$SaEmail" --role="roles/editor" | Out-Null
gcloud projects add-iam-policy-binding $ProjectID --member="serviceAccount:$SaEmail" --role="roles/compute.admin" | Out-Null

Write-Host "[4/6] Creating Workload Identity Pool ($PoolName)..."
$poolExists = gcloud iam workload-identity-pools describe $PoolName --location="global" --project=$ProjectID 2>&1
if ($poolExists -match "NOT_FOUND") {
    gcloud iam workload-identity-pools create $PoolName --project=$ProjectID --location="global" --display-name="GitHub Actions Pool"
} else {
    Write-Host "Pool already exists."
}

Write-Host "[5/6] Creating Workload Identity Provider ($ProviderName)..."
$providerExists = gcloud iam workload-identity-pools providers describe $ProviderName --workload-identity-pool=$PoolName --location="global" --project=$ProjectID 2>&1
if ($providerExists -match "NOT_FOUND") {
    gcloud iam workload-identity-pools providers create-oidc $ProviderName `
        --project=$ProjectID `
        --location="global" `
        --workload-identity-pool=$PoolName `
        --display-name="GitHub provider" `
        --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" `
        --attribute-condition="assertion.repository == '$GithubRepo'" `
        --issuer-uri="https://token.actions.githubusercontent.com"
} else {
    Write-Host "Provider already exists."
}

Write-Host "[6/6] Binding GitHub repo to Service Account..."
$ProjectNumber = gcloud projects describe $ProjectID --format="value(projectNumber)"
$PrincipalSet = "principalSet://iam.googleapis.com/projects/$ProjectNumber/locations/global/workloadIdentityPools/$PoolName/attribute.repository/$GithubRepo"

gcloud iam service-accounts add-iam-policy-binding $SaEmail `
    --project=$ProjectID `
    --role="roles/iam.workloadIdentityUser" `
    --member=$PrincipalSet | Out-Null

$WifProvider = "projects/$ProjectNumber/locations/global/workloadIdentityPools/$PoolName/providers/$ProviderName"

Write-Host "======================================================"
Write-Host "SETUP COMPLETE!"
Write-Host ""
Write-Host "Here are the values to add to your GitHub Repository Secrets:"
Write-Host "GCP_PROJECT_ID : $ProjectID"
Write-Host "GCP_TERRAFORM_SA_EMAIL : $SaEmail"
Write-Host "GCP_WORKLOAD_IDENTITY_PROVIDER : $WifProvider"
Write-Host "======================================================"
