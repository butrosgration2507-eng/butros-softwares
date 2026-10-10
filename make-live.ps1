<#
  BUTROS SOFTWARES - guided "make it live" helper (Windows PowerShell 5.1+)

  Put this file in the project folder (next to package.json), then run:
      powershell -ExecutionPolicy Bypass -File .\make-live.ps1

  What it automates : checks tools, installs, builds, tests, makes your secret key,
                      commits to Git, pushes to GitHub, opens the Render page,
                      creates your production admin account.
  What it CANNOT do : create accounts, click "Apply" on Render, or create Google
                      credentials. It tells you exactly what to click.
  It is safe to run again; it never overwrites an existing secret key.
#>
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Say([string]$m, [string]$c = 'Cyan') { Write-Host ""; Write-Host "== $m" -ForegroundColor $c }
function Info([string]$m) { Write-Host "   $m" }
function Fail([string]$m) { Write-Host ""; Write-Host "ERROR: $m" -ForegroundColor Red; exit 1 }
function Ask([string]$q) { $a = Read-Host "$q [Y/n]"; return ($a -eq '' -or $a -match '^[Yy]') }
function Need([string]$cmd, [string]$hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) { Fail "$cmd was not found. $hint" }
}
function Run([string]$exe, [string[]]$Arguments) {
  & $exe @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "Command failed: $exe $($Arguments -join ' ')" }
}

# ---------------------------------------------------------------- 0. sanity
if (-not (Test-Path 'package.json') -or -not (Test-Path 'render.yaml')) {
  Fail 'Run this script from the project folder (the one containing package.json and render.yaml).'
}

# ---------------------------------------------------------------- 1. tools
Say '1/7  Checking tools'
Need 'node' 'Install Node.js 22 LTS from https://nodejs.org, then reopen PowerShell.'
Need 'npm'  'Reinstall Node.js from https://nodejs.org.'
Need 'git'  'Install Git from https://git-scm.com, then reopen PowerShell.'
$nodeMajor = [int]((node -v).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 20) { Fail "Node $nodeMajor is too old. Install Node.js 22 LTS from https://nodejs.org." }
Info "Node $(node -v), npm $(npm -v), $(git --version)"

# ---------------------------------------------------------------- 2. build + test
Say '2/7  Installing, building and testing (takes a few minutes the first time)'
if (Test-Path 'package-lock.json') { Run 'npm' @('ci', '--include=dev') } else { Run 'npm' @('install') }
Run 'npm' @('run', 'build')
Run 'npm' @('test')
Info 'Build and all tests passed.'

# ---------------------------------------------------------------- 3. secret key
Say '3/7  Encryption key for Google tokens'
$secretFile = Join-Path $PSScriptRoot '.deploy-secrets.txt'
if (Test-Path $secretFile) {
  $key = ((Get-Content $secretFile | Where-Object { $_ -like 'TOKEN_ENCRYPTION_KEY=*' } | Select-Object -First 1) -replace '^TOKEN_ENCRYPTION_KEY=', '').Trim()
  Info 'Re-using the key saved in .deploy-secrets.txt (never regenerate it once Google accounts are connected).'
} else {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $key = [Convert]::ToBase64String($bytes)
  Set-Content -Path $secretFile -Value "TOKEN_ENCRYPTION_KEY=$key" -Encoding ASCII
  Info 'Created a new key and saved it in .deploy-secrets.txt (this file is Git-ignored).'
}
if (-not $key) { Fail 'Could not read the encryption key.' }
Info 'BACK THIS FILE UP somewhere private (password manager). If you lose the key, you must reconnect every Google account.'
foreach ($ignore in @('.deploy-secrets.txt', '.env', 'node_modules/', '.data/', 'backups/')) {
  if (-not (Test-Path '.gitignore') -or -not (Select-String -Path '.gitignore' -SimpleMatch -Pattern $ignore -Quiet)) { Add-Content -Path '.gitignore' -Value $ignore }
}

# ---------------------------------------------------------------- 4. git
Say '4/7  Saving the project with Git'
if (-not (Test-Path '.git')) { Run 'git' @('init') }
Run 'git' @('branch', '-M', 'main')
if (-not (git config user.name)) { $n = Read-Host '   Your name for Git commits'; Run 'git' @('config', 'user.name', $n) }
if (-not (git config user.email)) { $e = Read-Host '   Your email for Git commits'; Run 'git' @('config', 'user.email', $e) }
Run 'git' @('add', '-A')
foreach ($bad in @('.env', '.deploy-secrets.txt')) {
  if (git ls-files $bad) { Fail "$bad is tracked by Git. Run: git rm --cached $bad   then run this script again." }
}
if (git status --porcelain) { Run 'git' @('commit', '-m', 'BUTROS SOFTWARES') } else { Info 'Nothing new to commit.' }

# ---------------------------------------------------------------- 5. github
Say '5/7  Pushing to GitHub'
$remote = (cmd /c 'git remote get-url origin 2>nul')
if ($LASTEXITCODE -ne 0) { $remote = $null }
if (-not $remote) {
  $name = Read-Host '   Name for the new GitHub repository [butros-softwares]'
  if (-not $name) { $name = 'butros-softwares' }
  $ghOk = $false
  if (Get-Command gh -ErrorAction SilentlyContinue) {
    cmd /c 'gh auth status >nul 2>nul'
    if ($LASTEXITCODE -eq 0) { $ghOk = $true } else { Info 'GitHub CLI is installed but not signed in. Run "gh auth login" if you want automatic creation.' }
  }
  if ($ghOk -and (Ask "   Create a PRIVATE repository '$name' on your GitHub account and push?")) {
    Run 'gh' @('repo', 'create', $name, '--private', '--source', '.', '--remote', 'origin', '--push')
  } else {
    Info 'Manual way: open https://github.com/new , create an EMPTY repository (no README), then paste its address.'
    Start-Process 'https://github.com/new'
    $url = Read-Host '   Repository address (https://github.com/YOU/NAME.git)'
    if ($url -notmatch '^https://github\.com/.+') { Fail 'That does not look like a GitHub address.' }
    Run 'git' @('remote', 'add', 'origin', $url)
    Run 'git' @('push', '-u', 'origin', 'main')
  }
} else {
  Info "Remote already set: $remote"
  Run 'git' @('push', '-u', 'origin', 'main')
}
$repoUrl = ((git remote get-url origin) -replace '\.git$', '')
Info "Code is on GitHub: $repoUrl"

# ---------------------------------------------------------------- 6. render
Say '6/7  Deploy on Render (you click; I tell you what to type)'
try { Set-Clipboard -Value $key; Info 'Your TOKEN_ENCRYPTION_KEY is now on the clipboard.' } catch { }
Write-Host @"

   A) DATABASE (do this first, free): https://neon.com -> create a project -> copy the
      connection string that starts with  postgresql://  (keep ?sslmode=require).
      (Render's own free database expires after about 30 days - verify at render.com/docs/free.)

   B) Render page opens next. Sign in, choose your repository, and when it asks for values:
        APP_URL                = https://butros-softwares.onrender.com   (no trailing slash;
                                 if Render shows a different address later, edit APP_URL)
        DATABASE_URL           = the Neon connection string
        TOKEN_ENCRYPTION_KEY   = $key
        GOOGLE_CLIENT_ID       = (leave empty for now; add later in Render -> Environment)
        GOOGLE_CLIENT_SECRET   = (leave empty for now)
        CONTACT_EMAIL          = your public contact email (optional)
        GOOGLE_SITE_VERIFICATION = (leave empty for now)
      Then click Apply and wait until the service says "Live".
"@
if (Ask '   Open Neon and the Render blueprint page now?') {
  Start-Process 'https://console.neon.tech'
  Start-Process "https://dashboard.render.com/blueprint/new?repo=$repoUrl"
}
[void](Read-Host '   Press Enter when Render shows your service as Live')

# ---------------------------------------------------------------- 7. admin + google
Say '7/7  Create your production administrator'
if (Ask '   Create the admin account on the production database now?') {
  $sec = Read-Host '   Paste the Neon DATABASE_URL (input hidden)' -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  if ($plain -notmatch '^postgres(ql)?://') { Fail 'DATABASE_URL must start with postgresql://' }
  $env:DATABASE_URL = $plain
  try { Run 'npm' @('run', 'create-admin') } finally { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue; $plain = $null }
}

$app = (Read-Host '   Your live site address, e.g. https://butros-softwares.onrender.com').TrimEnd('/')
if ($app -match '^https://') {
  $redirect = "$app/api/admin/drive/callback"
  try { Set-Clipboard -Value $redirect } catch { }
  Write-Host @"

   GOOGLE (once): https://console.cloud.google.com
     1. Enable "Google Drive API".
     2. OAuth consent screen: External; add scope .../auth/drive.file ; add each of your
        4-6 Google emails under "Test users".
     3. Credentials -> Create OAuth client ID -> Web application.
        Authorized redirect URI (copied to your clipboard):
            $redirect
     4. Copy Client ID and Client secret into Render -> Environment
        (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). Render redeploys by itself.
     5. Open $app/admin -> Storage Manager -> Connect Google account (repeat for each account).
"@
  if (Ask '   Open the Google credentials page and your site now?') {
    Start-Process 'https://console.cloud.google.com/apis/credentials'
    Start-Process "$app/admin"
  }
}

Say 'Done' 'Green'
Info 'Check: your site loads, /api/health says ok, /admin signs in.'
Info 'Then follow README section 10 (Google Search Console) so Google can find the site.'
