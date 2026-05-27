# OpenRoute — arranque local de los 3 servicios.
#
# Verifica prerrequisitos, lanza el microservicio FastAPI en una ventana nueva
# y deja Next.js en la ventana actual. Ollama se asume corriendo como servicio
# de Windows (es lo normal tras instalarlo); si no responde, el script aborta.
#
# Uso:
#   .\start.ps1
#
# Para parar: cerrar AMBAS ventanas (Ctrl+C en cada una).

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $root

function Test-Service {
    param([string]$Name, [string]$Url)
    try {
        $null = Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing
        Write-Host "[OK]    $Name responde en $Url" -ForegroundColor Green
        return $true
    } catch {
        return $false
    }
}

Write-Host "`n=== OpenRoute — arranque local ===" -ForegroundColor Cyan

# 1. Ollama (servicio Windows, no lo arrancamos nosotros).
if (-not (Test-Service "Ollama" "http://localhost:11434/api/tags")) {
    Write-Host "[ERROR] Ollama no responde en :11434." -ForegroundColor Red
    Write-Host "        Abre el menú Inicio, busca 'Ollama' y arráncalo, o ejecuta 'ollama serve' en otra ventana." -ForegroundColor Yellow
    exit 1
}

# 2. Entorno Python.
if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "[ERROR] Falta .venv. Créalo con:" -ForegroundColor Red
    Write-Host "        python -m venv .venv; .\.venv\Scripts\activate; pip install -r requirements.txt" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK]    .venv encontrado" -ForegroundColor Green

# 3. node_modules del frontend.
if (-not (Test-Path "web\node_modules")) {
    Write-Host "[ERROR] Falta web\node_modules. Ejecuta:" -ForegroundColor Red
    Write-Host "        cd web; npm install; npx prisma migrate dev; npm run db:seed; cd .." -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK]    web\node_modules encontrado" -ForegroundColor Green

# 4. SQLite seedeada.
if (-not (Test-Path "web\prisma\dev.db")) {
    Write-Host "[WARN]  web\prisma\dev.db no existe. Si es la primera vez:" -ForegroundColor Yellow
    Write-Host "        cd web; npx prisma migrate dev; npm run db:seed; cd .." -ForegroundColor Yellow
}

# 5. FastAPI en ventana nueva. Activa el venv ahí para que uvicorn herede dependencias.
Write-Host "`n[*]     Lanzando FastAPI en :8000 (ventana nueva)..." -ForegroundColor Cyan
$apiCommand = "Set-Location '$root'; & '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCommand

# 6. Next.js en la ventana actual (foreground). Ctrl+C lo para.
Write-Host "[*]     Lanzando Next.js en :3000 (esta ventana). Ctrl+C para parar.`n" -ForegroundColor Cyan
Set-Location "$root\web"
npm run dev
