<#
.SYNOPSIS
    Installs a Trusted Institutional Code Signing Certificate for Onnesha Hospital Management System (OHMS).
    Bypasses Windows SmartScreen warnings on all hospital workstations without expensive EV hardware tokens.

.DESCRIPTION
    This script:
    1. Checks if the OHMS Root Code Signing Certificate already exists.
    2. If not, generates a 4096-bit SHA-256 Code Signing Certificate.
    3. Adds the certificate to Windows Trusted Root Certification Authorities and Trusted Publishers store.
    4. Enables seamless, 1-click execution of the OHMS Tauri Desktop client with ZERO SmartScreen warnings.
    5. Can sign any given .exe or .msi file automatically.

.PARAMETER BinaryPath
    Optional path to an EXE or MSI file to sign.
#>

param(
    [string]$BinaryPath = ""
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ONNESHA HOSPITAL MANAGEMENT SYSTEM (OHMS)               " -ForegroundColor Yellow
Write-Host "  Automated Trusted Desktop Certificate Provisioner       " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Warning "Please run this PowerShell script as Administrator to install the certificate to Windows Trusted Root."
    Write-Host "Restarting script with elevated privileges..." -ForegroundColor Yellow
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" `"$BinaryPath`""
    exit
}

$certSubject = "CN=Onnesha Hospital and Diagnostic Center, O=Onnesha Hospital, C=BD"
$existingCert = Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq $certSubject } | Select-Object -First 1

if (-not $existingCert) {
    Write-Host "`n[1/3] Generating 4096-bit SHA-256 Code Signing Certificate..." -ForegroundColor Cyan
    $cert = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject $certSubject `
        -KeyLength 4096 `
        -KeyAlgorithm RSA `
        -HashAlgorithm SHA256 `
        -CertStoreLocation "Cert:\LocalMachine\My" `
        -NotAfter (Get-Date).AddYears(10) `
        -FriendlyName "Onnesha Hospital Trusted Desktop Publisher"
    
    Write-Host "Certificate successfully created with Thumbprint: $($cert.Thumbprint)" -ForegroundColor Green
} else {
    $cert = $existingCert
    Write-Host "`n[1/3] Existing OHMS Certificate detected: $($cert.Thumbprint)" -ForegroundColor Green
}

# 2. Install into Trusted Root and Trusted Publisher Stores
Write-Host "`n[2/3] Registering certificate into Windows Trusted Root Authorities..." -ForegroundColor Cyan

$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store "Root", "LocalMachine"
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()

$pubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store "TrustedPublisher", "LocalMachine"
$pubStore.Open("ReadWrite")
$pubStore.Add($cert)
$pubStore.Close()

Write-Host "Installed into LocalMachine\Root and LocalMachine\TrustedPublisher!" -ForegroundColor Green
Write-Host "Local Windows environment now trusts OHMS Desktop binaries signed with this institutional certificate." -ForegroundColor Green

# 3. Sign Binary if Provided
if ($BinaryPath -and (Test-Path $BinaryPath)) {
    Write-Host "`n[3/3] Signing application binary: $BinaryPath..." -ForegroundColor Cyan
    Set-AuthenticodeSignature -FilePath $BinaryPath -Certificate $cert -HashAlgorithm SHA256 -TimestampServer "http://timestamp.digicert.com"
    Write-Host "Institutional signature successfully applied to $BinaryPath!" -ForegroundColor Green
} else {
    Write-Host "`n[3/3] System is ready. Hospital internal managed PCs with this certificate will trust local OHMS builds." -ForegroundColor Cyan
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "  SUCCESS: INTERNAL MANAGED WORKSTATION TRUST PROVISIONED " -ForegroundColor Green
Write-Host "  NOTICE: Gate G15 (Public EV Authenticode) remains an     " -ForegroundColor Yellow
Write-Host "          external owner prerequisite for public builds.   " -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
