$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvFile = Join-Path $Root ".env.local"
$EnvExample = Join-Path $Root ".env.example"
$ComposeFile = Join-Path $Root "docker-compose.yml"

function Ensure-EnvFile {
  if (-not (Test-Path $EnvFile)) {
    if (Test-Path $EnvExample) {
      Write-Host "No .env.local found. Copying from .env.example..."
      Copy-Item $EnvExample $EnvFile
    } else {
      throw "Missing $EnvFile"
    }
  }
}

function Read-LocalEnv {
  Ensure-EnvFile
  $vars = @{}
  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) {
      return
    }
    $parts = $line.Split("=", 2)
    if ($parts.Length -eq 2) {
      $vars[$parts[0]] = $parts[1]
    }
  }
  return $vars
}

function Invoke-Compose {
  param([string[]] $ComposeArgs)
  Ensure-EnvFile
  & docker compose --project-name openclaw-agent-searchkit --env-file $EnvFile -f $ComposeFile @ComposeArgs
}

function Wait-ForSearxng {
  param([int] $Attempts = 30)

  $vars = Read-LocalEnv
  $port = $vars["SEARXNG_PORT"]
  if (-not $port) {
    $port = "8888"
  }

  $url = "http://127.0.0.1:$port/search?q=openclaw&format=json&language=en-US"
  for ($i = 0; $i -lt $Attempts; $i++) {
    try {
      $content = (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 20).Content
      if ($content -match '"results"' -or $content -match '"query"') {
        Write-Host "SearXNG JSON API ready at http://127.0.0.1:$port"
        return
      }
    } catch {
      Start-Sleep -Seconds 1
      continue
    }
    Start-Sleep -Seconds 1
  }

  throw "SearXNG JSON API not ready after $Attempts seconds: $url"
}

function Test-Services {
  $vars = Read-LocalEnv
  $port = $vars["SEARXNG_PORT"]
  if (-not $port) {
    $port = "8888"
  }
  $ntfyPort = $vars["NTFY_PORT"]
  if (-not $ntfyPort) {
    $ntfyPort = "18082"
  }

  Write-Host "==> searxng JSON API"
  $content = (Invoke-WebRequest "http://127.0.0.1:$port/search?q=openclaw&format=json&language=en-US" -UseBasicParsing -TimeoutSec 20).Content
  if (-not ($content -match '"results"' -or $content -match '"query"')) {
    Write-Host $content
    throw "SearXNG responded, but JSON API did not look valid."
  }

  Write-Host "==> ntfy health"
  Invoke-WebRequest "http://127.0.0.1:$ntfyPort/v1/health" -UseBasicParsing -TimeoutSec 20 | Out-Null

  Write-Host "OK: services are reachable."
}

$Command = if ($args.Count -gt 0) { $args[0] } else { "" }
$Rest = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }

switch ($Command) {
  "up" {
    Invoke-Compose @("up", "-d", "--remove-orphans")
    Wait-ForSearxng
  }
  "down" {
    Invoke-Compose @("down", "--remove-orphans")
  }
  "restart" {
    Invoke-Compose @("down", "--remove-orphans")
    Invoke-Compose @("up", "-d", "--remove-orphans")
    Wait-ForSearxng
  }
  { $_ -in @("ps", "status") } {
    Invoke-Compose @("ps")
  }
  "logs" {
    Invoke-Compose (@("logs", "-f") + $Rest)
  }
  "pull" {
    Invoke-Compose @("pull")
  }
  "test" {
    Test-Services
  }
  "wait" {
    Wait-ForSearxng
  }
  "urls" {
    $vars = Read-LocalEnv
    $port = if ($vars["SEARXNG_PORT"]) { $vars["SEARXNG_PORT"] } else { "8888" }
    $ntfyPort = if ($vars["NTFY_PORT"]) { $vars["NTFY_PORT"] } else { "18082" }
    Write-Host "SearXNG : http://127.0.0.1:$port"
    Write-Host "ntfy    : http://127.0.0.1:$ntfyPort"
  }
  default {
    Write-Host "Usage: .\manage.ps1 {up|down|restart|ps|status|logs|pull|test|wait|urls}"
    exit 1
  }
}

