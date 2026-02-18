# Claudia Brain Visualizer Installer (Windows)
# Sets up the 3D memory visualization system

$ErrorActionPreference = "Continue"

# Colors via ANSI escape sequences (Windows Terminal / PowerShell 7+ support)
$ESC = [char]27
$RED = "$ESC[0;31m"
$GREEN = "$ESC[0;32m"
$YELLOW = "$ESC[1;33m"
$CYAN = "$ESC[0;36m"
$MAGENTA = "$ESC[0;35m"
$BOLD = "$ESC[1m"
$DIM = "$ESC[2m"
$NC = "$ESC[0m"

# Paths
$CLAUDIA_DIR = Join-Path $env:USERPROFILE ".claudia"
$VISUALIZER_DIR = Join-Path $CLAUDIA_DIR "visualizer"
$BIN_DIR = Join-Path $CLAUDIA_DIR "bin"

# Banner
Clear-Host
Write-Host ""
Write-Host ($CYAN + "####" + $NC + "  " + $CYAN + "##" + $NC + "      " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "####" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC)
Write-Host ($CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC)
Write-Host ($CYAN + "####" + $NC + "  " + $CYAN + "####" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "    " + $CYAN + "##" + $NC + "    " + $CYAN + "####" + $NC + "    " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC + "  " + $CYAN + "##" + $NC)
Write-Host ""
Write-Host ($DIM + "Brain Visualizer Installer (Windows)" + $NC)
Write-Host ($DIM + "See your memories in 3D" + $NC)
Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 1: Environment Check
# ============================================================
Write-Host ($BOLD + "Step 1/4: Environment Check" + $NC)
Write-Host ""

$NODE_OK = $false

try {
    $nodeVersion = & node --version 2>&1
    if ($nodeVersion -match "v(\d+)\.") {
        $nodeMajor = [int]$Matches[1]
        if ($nodeMajor -ge 18) {
            Write-Host ("  " + $GREEN + "[OK]" + $NC + " Node.js " + $nodeVersion)
            $NODE_OK = $true
        } else {
            Write-Host ("  " + $RED + "[X]" + $NC + " Node.js " + $nodeVersion + " (v18+ required)")
            Write-Host ("    " + $DIM + "Install from https://nodejs.org" + $NC)
            exit 1
        }
    }
} catch {
    Write-Host ("  " + $RED + "[X]" + $NC + " Node.js not found")
    Write-Host ("    " + $DIM + "Install from https://nodejs.org" + $NC)
    exit 1
}

try {
    $npmVersion = & npm --version 2>&1
    Write-Host ("  " + $GREEN + "[OK]" + $NC + " npm v" + $npmVersion)
} catch {
    Write-Host ("  " + $RED + "[X]" + $NC + " npm not found")
    Write-Host ("    " + $DIM + "npm should come with Node.js" + $NC)
    exit 1
}

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 2: Create Directories
# ============================================================
Write-Host ($BOLD + "Step 2/4: Creating Directories" + $NC)
Write-Host ""

New-Item -ItemType Directory -Force -Path $VISUALIZER_DIR | Out-Null
New-Item -ItemType Directory -Force -Path $BIN_DIR | Out-Null

Write-Host ("  " + $GREEN + "[OK]" + $NC + " Created " + $CLAUDIA_DIR)
Write-Host ("    " + $DIM + "    visualizer  - API + 3D frontend" + $NC)
Write-Host ("    " + $DIM + "    bin         - launcher" + $NC)

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 3: Copy Files + Install Dependencies
# ============================================================
Write-Host ($BOLD + "Step 3/4: Installing Visualizer" + $NC)
Write-Host ""

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$SOURCE_DIR = Split-Path -Parent $SCRIPT_DIR

Write-Host ("  " + $CYAN + "[..]" + $NC + " Copying visualizer...")

$serverJs = Join-Path $SOURCE_DIR "server.js"
if (Test-Path $serverJs) {
    # Copy all files except node_modules
    Get-ChildItem -Path $SOURCE_DIR -Exclude "node_modules" | ForEach-Object {
        if ($_.PSIsContainer) {
            Copy-Item -Recurse -Force $_.FullName (Join-Path $VISUALIZER_DIR $_.Name)
        } else {
            Copy-Item -Force $_.FullName $VISUALIZER_DIR
        }
    }
    Write-Host ("  " + $GREEN + "[OK]" + $NC + " Visualizer files copied")
} else {
    Write-Host ("  " + $RED + "[X]" + $NC + " Source visualizer not found at " + $SOURCE_DIR)
    exit 1
}

Write-Host ("  " + $CYAN + "[..]" + $NC + " Installing dependencies...")
Write-Host ("    " + $DIM + "This includes better-sqlite3 (native module) + Babylon.js" + $NC)
Push-Location $VISUALIZER_DIR
$ErrorActionPreference = "SilentlyContinue"
& npm install --silent 2>&1 | Out-Null
$ErrorActionPreference = "Continue"
Pop-Location
Write-Host ("  " + $GREEN + "[OK]" + $NC + " Dependencies ready")

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# ============================================================
# Step 4: Create Launcher Script
# ============================================================
Write-Host ($BOLD + "Step 4/4: Creating Launcher" + $NC)
Write-Host ""

$launcherPath = Join-Path $BIN_DIR "brain.ps1"

$launcherLines = @(
    '# Claudia Brain Visualizer Launcher'
    '# Starts the API server and 3D frontend'
    ''
    'param('
    '    [string]$ProjectDir = (Get-Location).Path'
    ')'
    ''
    '$CLAUDIA_DIR = Join-Path $env:USERPROFILE ".claudia"'
    '$VISUALIZER_DIR = Join-Path $CLAUDIA_DIR "visualizer"'
    ''
    '# Colors'
    '$ESC = [char]27'
    '$GREEN = "$ESC[0;32m"'
    '$CYAN = "$ESC[0;36m"'
    '$YELLOW = "$ESC[1;33m"'
    '$DIM = "$ESC[2m"'
    '$NC = "$ESC[0m"'
    ''
    'Write-Host ($CYAN + "Starting Brain Visualizer..." + $NC)'
    'Write-Host ($DIM + "Project: " + $ProjectDir + $NC)'
    'Write-Host ""'
    ''
    '# Check if API server is already running'
    '$apiRunning = $false'
    'try {'
    '    $null = Invoke-WebRequest -Uri "http://localhost:3849/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '    $apiRunning = $true'
    '    Write-Host ($GREEN + "[OK]" + $NC + " API server already running on port 3849")'
    '} catch {'
    '    Write-Host ($CYAN + "[..]" + $NC + " Starting API server...")'
    '    Push-Location $VISUALIZER_DIR'
    '    Start-Process -FilePath "node" -ArgumentList "server.js", "--project-dir", $ProjectDir -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\claudia-brain-api.log" -RedirectStandardError "$env:TEMP\claudia-brain-api-err.log"'
    '    Pop-Location'
    '    Start-Sleep -Seconds 2'
    ''
    '    try {'
    '        $null = Invoke-WebRequest -Uri "http://localhost:3849/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '        Write-Host ($GREEN + "[OK]" + $NC + " API server started on port 3849")'
    '    } catch {'
    '        Write-Host ($YELLOW + "[!]" + $NC + " API server failed to start")'
    '        Write-Host ($DIM + "Check $env:TEMP\claudia-brain-api.log for details" + $NC)'
    '    }'
    '}'
    ''
    '# Check if frontend is already running'
    '$frontendPort = $null'
    'try {'
    '    $null = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '    $frontendPort = "5173"'
    '    Write-Host ($GREEN + "[OK]" + $NC + " Frontend already running on port 5173")'
    '} catch {'
    '    try {'
    '        $null = Invoke-WebRequest -Uri "http://localhost:5174" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '        $frontendPort = "5174"'
    '        Write-Host ($GREEN + "[OK]" + $NC + " Frontend already running on port 5174")'
    '    } catch {'
    '        Write-Host ($CYAN + "[..]" + $NC + " Starting 3D frontend...")'
    '        Push-Location $VISUALIZER_DIR'
    '        Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\claudia-brain.log" -RedirectStandardError "$env:TEMP\claudia-brain-err.log"'
    '        Pop-Location'
    '        Start-Sleep -Seconds 3'
    ''
    '        try {'
    '            $null = Invoke-WebRequest -Uri "http://localhost:5173" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '            $frontendPort = "5173"'
    '            Write-Host ($GREEN + "[OK]" + $NC + " Frontend started on port 5173")'
    '        } catch {'
    '            try {'
    '                $null = Invoke-WebRequest -Uri "http://localhost:5174" -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop'
    '                $frontendPort = "5174"'
    '                Write-Host ($GREEN + "[OK]" + $NC + " Frontend started on port 5174")'
    '            } catch {'
    '                Write-Host ($YELLOW + "[!]" + $NC + " Frontend failed to start")'
    '                Write-Host ($DIM + "Check $env:TEMP\claudia-brain.log for details" + $NC)'
    '                exit 1'
    '            }'
    '        }'
    '    }'
    '}'
    ''
    '# Open in browser'
    'Write-Host ""'
    'Write-Host ($GREEN + "Opening http://localhost:" + $frontendPort + $NC)'
    'Start-Process "http://localhost:$frontendPort"'
)
$launcherLines -join "`r`n" | Out-File -FilePath $launcherPath -Encoding UTF8
Write-Host ("  " + $GREEN + "[OK]" + $NC + " Created launcher at " + $launcherPath)

# Also create a .cmd wrapper for easier CLI access
$cmdPath = Join-Path $BIN_DIR "brain.cmd"
$cmdContent = '@echo off' + "`r`n" + 'powershell.exe -ExecutionPolicy Bypass -File "%~dp0brain.ps1" %*'
Set-Content -Path $cmdPath -Value $cmdContent
Write-Host ("  " + $GREEN + "[OK]" + $NC + " Created CLI wrapper at " + $cmdPath)

Write-Host ""
Write-Host ($DIM + "------------------------------------------------" + $NC)
Write-Host ""

# Success banner
Write-Host $GREEN
Write-Host "  +-----------------------------------------------------------+"
Write-Host "  |                                                           |"
Write-Host "  |   Brain Visualizer installed successfully!                |"
Write-Host "  |                                                           |"
Write-Host "  +-----------------------------------------------------------+"
Write-Host $NC

# Summary
Write-Host ($BOLD + "What's installed:" + $NC)
Write-Host ""
Write-Host ("  " + $CYAN + "*" + $NC + " Visualizer (API + 3D)  " + $DIM + $VISUALIZER_DIR + $NC)
Write-Host ("  " + $CYAN + "*" + $NC + " Launcher script        " + $DIM + $launcherPath + $NC)
Write-Host ""

Write-Host ($BOLD + "How to use:" + $NC)
Write-Host ""
Write-Host ("  " + $DIM + "From Claude Code, run:" + $NC + "  " + $CYAN + "/brain" + $NC)
Write-Host ("  " + $DIM + "Or from terminal:" + $NC + "       " + $CYAN + $cmdPath + $NC)
Write-Host ""

# Claudia says goodbye
Write-Host ($MAGENTA + $DIM + [char]34 + "Want to see what your memory looks like?" + [char]34 + " -- Claudia" + $NC)
Write-Host ""
