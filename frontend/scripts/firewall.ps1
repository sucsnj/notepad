# Cria uma regra no Firewall do Windows permitindo acesso de entrada na porta do app,
# para que outros dispositivos (LAN ou Tailscale) consigam acessar por IP/hostname.
#
# Execute como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts/firewall.ps1
#
# Remover a regra depois, se quiser:
#   Remove-NetFirewallRule -DisplayName "Bloco de Notas (TCP *)" -ErrorAction SilentlyContinue

$ErrorActionPreference = "Stop"

$envFile = Join-Path $PSScriptRoot "..\.env"
$port = 3000
if (Test-Path $envFile) {
  foreach ($line in Get-Content $envFile) {
    $trimmed = $line.Trim()
    if ($trimmed -match "^PORT=(.*)$") {
      $port = $Matches[1].Trim("'").Trim('"')
      break
    }
  }
}

$ruleName = "Bloco de Notas (TCP $port)"

if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Execute o PowerShell como Administrador para criar a regra de firewall."
  exit 1
}

if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Write-Output "Regra ja existe: $ruleName"
} else {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $port -Action Allow -Profile Any | Out-Null
  Write-Output "Regra criada: acesso de entrada liberado em TCP $port."
}