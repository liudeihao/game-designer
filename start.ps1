#Requires -Version 5.1
<#
.SYNOPSIS
  One-click start for Game Designer (FastAPI backend + Vite frontend).

.DESCRIPTION
  First run creates the Python venv and installs dependencies.
  Later runs skip install unless packages are missing.
  Ctrl+C or closing this window stops both servers.
#>
[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$VenvDir = Join-Path $BackendDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$BackendPort = 8000
$FrontendPort = 5173
$procs = @()

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "    $Message" -ForegroundColor Green
}

function Test-PortOpen {
    param([int]$Port)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $async = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        $ok = $async.AsyncWaitHandle.WaitOne(200, $false)
        if (-not $ok) { return $false }
        $client.EndConnect($async)
        return $true
    } catch {
        return $false
    } finally {
        $client.Dispose()
    }
}

function Stop-Tree {
    param([int]$ProcessId)
    if ($ProcessId -le 0) { return }
    & taskkill.exe /PID $ProcessId /T /F 2>$null | Out-Null
}

function Wait-Http {
    param([string]$Url, [int]$TimeoutSec = 40)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) {
                return $true
            }
        } catch {
            Start-Sleep -Milliseconds 400
        }
    }
    return $false
}

function Resolve-Python {
    $candidates = @(
        @{ Exe = "py"; Args = @("-3.12") },
        @{ Exe = "py"; Args = @("-3.11") },
        @{ Exe = "py"; Args = @("-3") },
        @{ Exe = "python"; Args = @() },
        @{ Exe = "python3"; Args = @() }
    )
    foreach ($c in $candidates) {
        if (-not (Get-Command $c.Exe -ErrorAction SilentlyContinue)) { continue }
        $argList = @($c.Args) + @("-c", "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)")
        & $c.Exe @argList 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            return $c
        }
    }
    throw "未找到 Python 3.11+。请先安装 Python：https://www.python.org/downloads/"
}

function Ensure-Backend {
    if (-not (Test-Path -LiteralPath $BackendDir)) {
        throw "找不到 backend 目录：$BackendDir"
    }

    $py = Resolve-Python
    Write-Step "检查 Python 后端"

    if (-not (Test-Path -LiteralPath $VenvPython)) {
        Write-Host "    创建虚拟环境 .venv ..."
        $venvArgs = @($py.Args) + @("-m", "venv", $VenvDir)
        & $py.Exe @venvArgs
        if ($LASTEXITCODE -ne 0) { throw "创建虚拟环境失败" }
    }

    $needInstall = -not $SkipInstall
    if ($needInstall) {
        & $VenvPython -c "import fastapi, uvicorn, langgraph" 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $needInstall = $false }
    }

    if ($needInstall) {
        Write-Host "    安装后端依赖（首次会稍慢）..."
        & $VenvPython -m pip install -U pip
        if ($LASTEXITCODE -ne 0) { throw "升级 pip 失败" }
        Push-Location $BackendDir
        try {
            & $VenvPython -m pip install -e ".[dev]"
            if ($LASTEXITCODE -ne 0) { throw "安装后端依赖失败" }
        } finally {
            Pop-Location
        }
    }

    Write-Ok "后端就绪：$VenvPython"
}

function Ensure-Frontend {
    if (-not (Test-Path -LiteralPath $FrontendDir)) {
        throw "找不到 frontend 目录：$FrontendDir"
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw "未找到 Node.js。请先安装：https://nodejs.org/"
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "未找到 npm。请确认 Node.js 安装完整。"
    }

    Write-Step "检查前端"
    $nodeModules = Join-Path $FrontendDir "node_modules"
    if (-not $SkipInstall -and -not (Test-Path -LiteralPath $nodeModules)) {
        Write-Host "    安装前端依赖（首次会稍慢）..."
        Push-Location $FrontendDir
        try {
            & npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install 失败" }
        } finally {
            Pop-Location
        }
    }
    Write-Ok "前端就绪"
}

function Start-ServerWindow {
    param(
        [string]$WorkingDirectory,
        [string]$Command
    )
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($Command))
    return Start-Process -FilePath "powershell.exe" -WorkingDirectory $WorkingDirectory -PassThru -ArgumentList @(
        "-NoProfile",
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-EncodedCommand", $encoded
    )
}

try {
    $Host.UI.RawUI.WindowTitle = "Game Designer Launcher"
    Write-Host "Game Designer 一键启动" -ForegroundColor White
    Write-Host "工作目录：$Root"

    Ensure-Backend
    Ensure-Frontend

    $backendRunning = Test-PortOpen $BackendPort
    $frontendRunning = Test-PortOpen $FrontendPort

    if ($backendRunning) {
        Write-Step "后端已在 :$BackendPort 运行，跳过启动"
    } else {
        Write-Step "启动后端  http://127.0.0.1:$BackendPort"
        $backendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'Game Designer Backend'
Set-Location -LiteralPath '$BackendDir'
Write-Host 'Backend  http://127.0.0.1:$BackendPort' -ForegroundColor Green
& '$VenvPython' -m app.main
"@
        $procs += Start-ServerWindow -WorkingDirectory $BackendDir -Command $backendCmd
    }

    if ($frontendRunning) {
        Write-Step "前端已在 :$FrontendPort 运行，跳过启动"
    } else {
        Write-Step "启动前端  http://127.0.0.1:$FrontendPort"
        $frontendCmd = @"
`$Host.UI.RawUI.WindowTitle = 'Game Designer Frontend'
Set-Location -LiteralPath '$FrontendDir'
Write-Host 'Frontend  http://127.0.0.1:$FrontendPort' -ForegroundColor Green
npm run dev
"@
        $procs += Start-ServerWindow -WorkingDirectory $FrontendDir -Command $frontendCmd
    }

    Write-Step "等待服务就绪"
    $backendOk = Wait-Http "http://127.0.0.1:$BackendPort/docs"
    $frontendOk = Wait-Http "http://127.0.0.1:$FrontendPort/"

    if ($backendOk) { Write-Ok "后端已就绪" } else { Write-Host "    后端暂未响应，窗口里可能还有报错" -ForegroundColor Yellow }
    if ($frontendOk) { Write-Ok "前端已就绪" } else { Write-Host "    前端暂未响应，窗口里可能还有报错" -ForegroundColor Yellow }

    if (-not $NoBrowser -and $frontendOk) {
        Start-Process "http://127.0.0.1:$FrontendPort"
    }

    Write-Host ""
    Write-Host "工作台:  http://127.0.0.1:$FrontendPort" -ForegroundColor Green
    Write-Host "API 文档: http://127.0.0.1:$BackendPort/docs" -ForegroundColor Green
    Write-Host ""
    Write-Host "按 Ctrl+C 或关闭本窗口将停止本次拉起的服务。" -ForegroundColor DarkGray
    Write-Host "模型需在工作台「设置」中配置。" -ForegroundColor DarkGray

    if ($procs.Count -eq 0) {
        Write-Host "`n没有新启动的进程，退出。"
        exit 0
    }

    while ($true) {
        $alive = @($procs | Where-Object { $_ -and -not $_.HasExited })
        if ($alive.Count -eq 0) { break }
        Start-Sleep -Seconds 1
    }
} finally {
    foreach ($p in $procs) {
        if ($p -and -not $p.HasExited) {
            Stop-Tree -ProcessId $p.Id
        }
    }
}
