# ====================================================
# WFMS - Windows Service Manager (PowerShell)
# ====================================================

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("start", "stop", "restart", "status", "install", "remove", "logs")]
    [string]$Action
)

$ServiceName = "WFMS"
$NodePath = "C:\Program Files\nodejs\node.exe"
$AppPath = "C:\Users\Otto Wilson\Desktop\wfms test\server.js"
$WorkDir = "C:\Users\Otto Wilson\Desktop\wfms test"
$LogDir = "$WorkDir\logs"

# Ensure we have admin privileges
if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "[ERROR] This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again." -ForegroundColor Yellow
    exit 1
}

switch ($Action) {
    "install" {
        Write-Host "[INFO] Installing WFMS Windows Service..." -ForegroundColor Cyan
        
        # Check if NSSM is installed
        $nssmPath = Get-Command nssm -ErrorAction SilentlyContinue
        if (-not $nssmPath) {
            Write-Host "[ERROR] NSSM is not installed or not in PATH" -ForegroundColor Red
            Write-Host "Download from: https://nssm.cc/download" -ForegroundColor Yellow
            exit 1
        }
        
        # Create logs directory
        if (-not (Test-Path $LogDir)) {
            New-Item -ItemType Directory -Path $LogDir | Out-Null
            Write-Host "[INFO] Created logs directory: $LogDir" -ForegroundColor Green
        }
        
        # Check if service already exists
        $existingService = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        if ($existingService) {
            Write-Host "[INFO] Service already exists. Removing..." -ForegroundColor Yellow
            nssm stop $ServiceName
            nssm remove $ServiceName confirm
        }
        
        # Create service
        Write-Host "[INFO] Creating service with NSSM..." -ForegroundColor Cyan
        nssm install $ServiceName "`"$NodePath`"" "`"$AppPath`""
        
        if ($LASTEXITCODE -eq 0) {
            # Configure service
            Write-Host "[INFO] Configuring service..." -ForegroundColor Cyan
            nssm set $ServiceName AppDirectory "`"$WorkDir`""
            nssm set $ServiceName Start SERVICE_AUTO_START
            nssm set $ServiceName AppExit Default Restart
            nssm set $ServiceName AppRestartDelay 5000
            nssm set $ServiceName AppStdout "`"$LogDir\stdout.log`""
            nssm set $ServiceName AppStderr "`"$LogDir\stderr.log`""
            
            Write-Host "[SUCCESS] Service installed successfully!" -ForegroundColor Green
            Write-Host "Starting service..." -ForegroundColor Cyan
            nssm start $ServiceName
            
            Write-Host "`n[INFO] Service is starting..." -ForegroundColor Cyan
            Write-Host "[INFO] Access application at: http://localhost:8000" -ForegroundColor Green
            Write-Host "[INFO] Logs: $LogDir" -ForegroundColor Green
        } else {
            Write-Host "[ERROR] Failed to create service" -ForegroundColor Red
            exit 1
        }
    }
    
    "start" {
        Write-Host "[INFO] Starting WFMS service..." -ForegroundColor Cyan
        nssm start $ServiceName
        Start-Sleep -Seconds 2
        & $PSScriptRoot\wfms-service.ps1 -Action status
    }
    
    "stop" {
        Write-Host "[INFO] Stopping WFMS service..." -ForegroundColor Cyan
        nssm stop $ServiceName
        Start-Sleep -Seconds 2
        Write-Host "[INFO] Service stopped" -ForegroundColor Green
    }
    
    "restart" {
        Write-Host "[INFO] Restarting WFMS service..." -ForegroundColor Cyan
        nssm restart $ServiceName
        Start-Sleep -Seconds 2
        & $PSScriptRoot\wfms-service.ps1 -Action status
    }
    
    "status" {
        Write-Host "[INFO] Checking service status..." -ForegroundColor Cyan
        $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
        
        if ($service) {
            Write-Host "Service Name: $($service.Name)" -ForegroundColor White
            Write-Host "Display Name: $($service.DisplayName)" -ForegroundColor White
            Write-Host "Status: $($service.Status)" -ForegroundColor $(if ($service.Status -eq 'Running') { 'Green' } else { 'Red' })
            Write-Host "Startup Type: $($service.StartType)" -ForegroundColor White
            
            # Check if application is responding
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8000" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($response.StatusCode -eq 200) {
                    Write-Host "Application: ✓ Running and responding on http://localhost:8000" -ForegroundColor Green
                }
            } catch {
                Write-Host "Application: ✗ Not responding on http://localhost:8000" -ForegroundColor Red
            }
        } else {
            Write-Host "[ERROR] Service not found: $ServiceName" -ForegroundColor Red
            Write-Host "Run: .\wfms-service.ps1 -Action install" -ForegroundColor Yellow
        }
    }
    
    "remove" {
        Write-Host "[WARNING] Removing WFMS service..." -ForegroundColor Yellow
        $confirm = Read-Host "Are you sure? (yes/no)"
        if ($confirm -eq "yes") {
            Write-Host "[INFO] Stopping service..." -ForegroundColor Cyan
            nssm stop $ServiceName
            Write-Host "[INFO] Removing service..." -ForegroundColor Cyan
            nssm remove $ServiceName confirm
            Write-Host "[SUCCESS] Service removed" -ForegroundColor Green
        } else {
            Write-Host "[INFO] Cancelled" -ForegroundColor Yellow
        }
    }
    
    "logs" {
        Write-Host "[INFO] WFMS Service Logs" -ForegroundColor Cyan
        Write-Host "Log Directory: $LogDir" -ForegroundColor White
        Write-Host ""
        
        if (Test-Path "$LogDir\stdout.log") {
            Write-Host "--- STDOUT ---" -ForegroundColor Yellow
            Get-Content "$LogDir\stdout.log" -Tail 20
        }
        
        if (Test-Path "$LogDir\stderr.log") {
            Write-Host "`n--- STDERR ---" -ForegroundColor Red
            Get-Content "$LogDir\stderr.log" -Tail 20
        }
        
        if (-not (Test-Path $LogDir)) {
            Write-Host "No logs found. Service may not have been started yet." -ForegroundColor Yellow
        }
    }
}
