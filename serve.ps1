$ErrorActionPreference = "Stop"

$root = [System.IO.Path]::GetFullPath($PSScriptRoot)
if (-not $root.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
  $root += [System.IO.Path]::DirectorySeparatorChar
}

$port = 5500
$prefix = "http://127.0.0.1:$port/"
$staticRoot = [System.IO.Path]::GetFullPath((Join-Path $root "dist"))
if (-not $staticRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
  $staticRoot += [System.IO.Path]::DirectorySeparatorChar
}

# Keep secrets and mutable data off OneDrive/project folder (sync locks + cloud leak risk).
$projectDataDir = Join-Path $root "data"
$projectEnvFile = Join-Path $root ".env"
$localDataRoot = Join-Path $env:LOCALAPPDATA "YanaClinic"
$envFile = Join-Path $localDataRoot ".env"
$dataDir = Join-Path $localDataRoot "data"

function Read-DotEnvEarly {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

function Test-EnvHasSecrets {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  $map = Read-DotEnvEarly $Path
  foreach ($key in @("OPENAI_API_KEY", "ADMIN_PASSWORD", "TELEGRAM_BOT_TOKEN", "JARVIS_INTERNAL_TOKEN")) {
    if ($map.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace([string]$map[$key])) {
      return $true
    }
  }
  return $false
}

function Write-ProjectEnvPointer {
  param([string]$Path, [string]$ActiveEnvPath)
  $text = @(
    "# Secrets live outside OneDrive. Do not put API keys or passwords in this file.",
    "# Active env file:",
    "# $ActiveEnvPath",
    "#",
    "# Edit that file, then restart serve.ps1.",
    "# Template: .env.example"
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText($Path, $text + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
}

if (-not (Test-Path -LiteralPath $localDataRoot)) {
  New-Item -ItemType Directory -Path $localDataRoot -Force | Out-Null
}

# One-time migration: project\.env (OneDrive) → %LOCALAPPDATA%\YanaClinic\.env
if ((Test-Path -LiteralPath $projectEnvFile) -and (Test-EnvHasSecrets $projectEnvFile)) {
  if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $projectEnvFile -Destination $envFile -Force
    Write-Output "Migrated secrets to $envFile"
  } else {
    Write-Output "Local secrets already exist at $envFile (keeping local copy)."
  }
  Write-ProjectEnvPointer -Path $projectEnvFile -ActiveEnvPath $envFile
  Write-Output "Removed secrets from project .env (OneDrive-safe pointer left)."
}

if ($env:JARVIS_ENV_FILE -and $env:JARVIS_ENV_FILE.Trim()) {
  $envFile = [System.IO.Path]::GetFullPath($env:JARVIS_ENV_FILE.Trim())
}

$envMapEarly = Read-DotEnvEarly $envFile
if (-not $envMapEarly.Count -and (Test-Path -LiteralPath $projectEnvFile) -and (Test-EnvHasSecrets $projectEnvFile)) {
  # Dev fallback before first successful migration.
  $envMapEarly = Read-DotEnvEarly $projectEnvFile
}
if ($envMapEarly["DATA_DIR"] -and $envMapEarly["DATA_DIR"].Trim()) {
  $dataDir = [System.IO.Path]::GetFullPath($envMapEarly["DATA_DIR"].Trim())
}

if (-not (Test-Path -LiteralPath $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
}
if (-not (Test-Path -LiteralPath $projectDataDir)) {
  New-Item -ItemType Directory -Path $projectDataDir -Force | Out-Null
}

# Mutable shop data: copy once if local copy is missing.
foreach ($name in @(
  "orders.json",
  "products.json",
  "products.seed.json",
  "telegram_chat_id.txt"
)) {
  $dest = Join-Path $dataDir $name
  $src = Join-Path $projectDataDir $name
  if (-not (Test-Path -LiteralPath $dest) -and (Test-Path -LiteralPath $src)) {
    Copy-Item -LiteralPath $src -Destination $dest -Force
  }
}

# AI/context files are authored in the project — keep local copies fresh.
foreach ($name in @("clinic.json", "jarvis-system.txt")) {
  $dest = Join-Path $dataDir $name
  $src = Join-Path $projectDataDir $name
  if (-not (Test-Path -LiteralPath $src)) { continue }
  $shouldCopy = -not (Test-Path -LiteralPath $dest)
  if (-not $shouldCopy) {
    try {
      $srcInfo = Get-Item -LiteralPath $src
      $destInfo = Get-Item -LiteralPath $dest
      if ($srcInfo.LastWriteTimeUtc -gt $destInfo.LastWriteTimeUtc) { $shouldCopy = $true }
    } catch {
      $shouldCopy = $true
    }
  }
  if ($shouldCopy) {
    Copy-Item -LiteralPath $src -Destination $dest -Force
  }
}

try {
  $pointerText = @(
    "Active secrets file (.env):",
    $envFile,
    "",
    "Active data directory:",
    $dataDir,
    "",
    "SQLite database:",
    (Join-Path $dataDir "yana.sqlite"),
    "",
    "Override with JARVIS_ENV_FILE / DATA_DIR if needed."
  ) -join [Environment]::NewLine
  [System.IO.File]::WriteAllText(
    (Join-Path $projectDataDir "DATA_LOCATION.txt"),
    $pointerText,
    [Text.UTF8Encoding]::new($false)
  )
} catch {}

$productsFile = Join-Path $dataDir "products.json"
$ordersFile = Join-Path $dataDir "orders.json"
$productsSeedFile = Join-Path $dataDir "products.seed.json"
if (-not (Test-Path -LiteralPath $productsSeedFile)) {
  $seedInProject = Join-Path $projectDataDir "products.seed.json"
  if (Test-Path -LiteralPath $seedInProject) {
    $productsSeedFile = $seedInProject
  }
}

$dataLock = New-Object object
$chatPool = $null
$chatJobs = New-Object System.Collections.ArrayList

function Read-DotEnv {
  param([string]$Path)
  $map = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $map }
  Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $eq = $line.IndexOf("=")
    if ($eq -lt 1) { return }
    $key = $line.Substring(0, $eq).Trim()
    $value = $line.Substring($eq + 1).Trim()
    if (
      ($value.StartsWith('"') -and $value.EndsWith('"')) -or
      ($value.StartsWith("'") -and $value.EndsWith("'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $map[$key] = $value
  }
  return $map
}

$envMap = Read-DotEnv $envFile
if (-not $envMap.Count) {
  throw "Secrets file missing or empty: $envFile`nCopy .env.example there and fill ADMIN_PASSWORD / OPENAI_API_KEY."
}
$adminPassword = if ($envMap["ADMIN_PASSWORD"]) { $envMap["ADMIN_PASSWORD"].Trim() } else { "" }
if (-not $adminPassword) {
  throw "ADMIN_PASSWORD is missing in $envFile — set a strong password (10+ chars) before starting."
}
if ($adminPassword -ceq "yana2026" -or $adminPassword.Length -lt 10) {
  throw "ADMIN_PASSWORD is too weak in $envFile. Set a unique password (10+ chars) — do not use yana2026."
}
$telegramBotToken = if ($envMap["TELEGRAM_BOT_TOKEN"]) { $envMap["TELEGRAM_BOT_TOKEN"].Trim() } else { "" }
$telegramChatId = if ($envMap["TELEGRAM_CHAT_ID"]) { $envMap["TELEGRAM_CHAT_ID"].Trim() } else { "" }
$telegramUser = if ($envMap["TELEGRAM_USER"]) { $envMap["TELEGRAM_USER"].Trim().TrimStart("@") } else { "yana_ivi" }
$telegramChatCacheFile = Join-Path $dataDir "telegram_chat_id.txt"
$telegramOutboxFile = Join-Path $dataDir "telegram_outbox.jsonl"
$telegramNotifiedFile = Join-Path $dataDir "telegram_notified.json"
$script:telegramOutboxLastAt = [datetime]::MinValue
$openaiApiKey = if ($envMap["OPENAI_API_KEY"]) { $envMap["OPENAI_API_KEY"].Trim() } else { "" }
$aiDir = Join-Path $root "ai"
$aiPort = 5600
$aiPidFile = Join-Path $dataDir "ai-core.pid"
$aiProc = $null
$aiInternalToken = if ($envMap["JARVIS_INTERNAL_TOKEN"]) { $envMap["JARVIS_INTERNAL_TOKEN"].Trim() } else { "" }
if (-not $aiInternalToken) {
  $rng = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($rng)
  $aiInternalToken = ([BitConverter]::ToString($rng) -replace "-", "").ToLowerInvariant()
}
$dbDir = Join-Path $root "db"
$dbPort = 5601
$dbPidFile = Join-Path $dataDir "db-core.pid"
$dbFile = Join-Path $dataDir "yana.sqlite"
$dbProc = $null
$pdfDir = Join-Path $root "pdf"
$pdfPort = 5602
$pdfPidFile = Join-Path $dataDir "pdf-core.pid"
$pdfProc = $null
$chatHitsByIp = @{}
$chatHitsGlobal = New-Object System.Collections.Generic.Queue[datetime]
$chatRatePerIp = 12
$chatRateGlobal = 60
$loginHitsByIp = @{}
$loginRatePerIp = 8
$orderHits = New-Object System.Collections.Generic.Queue[datetime]
$bookingProcedureNames = @(
  "Мезотерапия",
  "Биоревитализация",
  "Чистка лица",
  "Микротоки",
  "Неинвазивная мезотерапия",
  "Уходовая процедура",
  "Консультация"
)
$bookingTimeSlots = @("10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00")

$sessions = @{}
$sessionTtlHours = 12

$mime = @{
  ".html"  = "text/html; charset=utf-8"
  ".css"   = "text/css; charset=utf-8"
  ".js"    = "application/javascript; charset=utf-8"
  ".json"  = "application/json; charset=utf-8"
  ".png"   = "image/png"
  ".jpg"   = "image/jpeg"
  ".jpeg"  = "image/jpeg"
  ".svg"   = "image/svg+xml"
  ".webp"  = "image/webp"
  ".ico"   = "image/x-icon"
  ".woff"  = "font/woff"
  ".woff2" = "font/woff2"
  ".txt"   = "text/plain; charset=utf-8"
  ".map"   = "application/json; charset=utf-8"
}

$blockedNames = @(
  ".env",
  "serve.ps1",
  "help.txt"
)

$blockedExtensions = @(
  ".ps1",
  ".env",
  ".bak",
  ".sql"
)

function Ensure-Array {
  param($Value)
  if ($null -eq $Value) { return @() }
  $arr = @($Value)
  # Unwrap accidental nested arrays like [[order]] from PowerShell comma quirks.
  while (
    $arr.Count -eq 1 -and
    $null -ne $arr[0] -and
    ($arr[0] -is [System.Array] -or $arr[0] -is [System.Collections.IList]) -and
    -not ($arr[0] -is [string]) -and
    -not ($arr[0] -is [System.Collections.IDictionary])
  ) {
    $arr = @($arr[0])
  }
  return $arr
}

function Get-TelegramChatId {
  if ($script:telegramChatId) { return $script:telegramChatId }
  if (Test-Path -LiteralPath $telegramChatCacheFile) {
    $cached = (Get-Content -LiteralPath $telegramChatCacheFile -Raw -Encoding UTF8).Trim()
    if ($cached) {
      $script:telegramChatId = $cached
      return $cached
    }
  }
  if (-not $telegramBotToken) { return $null }

  try {
    $uri = "https://api.telegram.org/bot$telegramBotToken/getUpdates?limit=50"
    $response = Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 8
    if (-not $response.ok) { return $null }

    $preferred = $null
    $fallback = $null
    foreach ($update in @($response.result)) {
      $message = $update.message
      if (-not $message) { $message = $update.edited_message }
      if (-not $message) { continue }
      $chat = $message.chat
      $from = $message.from
      if (-not $chat) { continue }
      $username = ""
      if ($from -and $from.username) { $username = [string]$from.username }
      elseif ($chat.username) { $username = [string]$chat.username }
      $username = $username.TrimStart("@").ToLowerInvariant()
      $id = [string]$chat.id
      if (-not $id) { continue }
      if ($username -eq $telegramUser.ToLowerInvariant()) {
        $preferred = $id
        break
      }
      if (-not $fallback) { $fallback = $id }
    }

    $resolved = if ($preferred) { $preferred } else { $fallback }
    if ($resolved) {
      $script:telegramChatId = $resolved
      [System.IO.File]::WriteAllText($telegramChatCacheFile, $resolved, [Text.UTF8Encoding]::new($false))
      return $resolved
    }
  } catch {
    Write-Output ("Telegram chat resolve failed: {0}" -f $_.Exception.Message)
  }
  return $null
}

function Utf8Text {
  param([byte[]]$Bytes)
  return [Text.Encoding]::UTF8.GetString($Bytes)
}

function Format-TelegramOrderText {
  param($Order)
  $lines = New-Object System.Collections.Generic.List[string]
  $isBooking = ([string]$Order.kind -eq "booking") -or ([string]$Order.channel -eq "booking")

  # Cyrillic labels via UTF-8 bytes so the .ps1 stays ASCII-safe for Windows PowerShell.
  $labelClient = Utf8Text @(0xD0,0x9A,0xD0,0xBB,0xD0,0xB8,0xD0,0xB5,0xD0,0xBD,0xD1,0x82,0x3A,0x20)
  $labelPhone = Utf8Text @(0xD0,0xA2,0xD0,0xB5,0xD0,0xBB,0xD0,0xB5,0xD1,0x84,0xD0,0xBE,0xD0,0xBD,0x3A,0x20)
  $labelProcedure = Utf8Text @(0xD0,0x9F,0xD1,0x80,0xD0,0xBE,0xD1,0x86,0xD0,0xB5,0xD0,0xB4,0xD1,0x83,0xD1,0x80,0xD0,0xB0,0x3A,0x20)
  $labelDate = Utf8Text @(0xD0,0x94,0xD0,0xB0,0xD1,0x82,0xD0,0xB0,0x3A,0x20)
  $labelTime = Utf8Text @(0xD0,0x92,0xD1,0x80,0xD0,0xB5,0xD0,0xBC,0xD1,0x8F,0x3A,0x20)
  $labelNote = Utf8Text @(0xD0,0x9A,0xD0,0xBE,0xD0,0xBC,0xD0,0xBC,0xD0,0xB5,0xD0,0xBD,0xD1,0x82,0xD0,0xB0,0xD1,0x80,0xD0,0xB8,0xD0,0xB9,0x3A,0x20)
  $labelChannel = Utf8Text @(0xD0,0x9A,0xD0,0xB0,0xD0,0xBD,0xD0,0xB0,0xD0,0xBB,0x3A,0x20)
  $labelTotal = Utf8Text @(0xD0,0x98,0xD1,0x82,0xD0,0xBE,0xD0,0xB3,0xD0,0xBE,0x3A,0x20)
  $titleBooking = Utf8Text @(0xD0,0x9D,0xD0,0xBE,0xD0,0xB2,0xD0,0xB0,0xD1,0x8F,0x20,0xD0,0xB7,0xD0,0xB0,0xD0,0xBF,0xD0,0xB8,0xD1,0x81,0xD1,0x8C,0x20,0xD0,0xBD,0xD0,0xB0,0x20,0xD1,0x81,0xD0,0xB0,0xD0,0xB9,0xD1,0x82,0xD0,0xB5)
  $titleOrder = Utf8Text @(0xD0,0x9D,0xD0,0xBE,0xD0,0xB2,0xD1,0x8B,0xD0,0xB9,0x20,0xD0,0xB7,0xD0,0xB0,0xD0,0xBA,0xD0,0xB0,0xD0,0xB7,0x20,0xD0,0xBD,0xD0,0xB0,0x20,0xD1,0x81,0xD0,0xB0,0xD0,0xB9,0xD1,0x82,0xD0,0xB5)

  if ($isBooking) {
    $lines.Add($titleBooking)
    $lines.Add("")
    $lines.Add(("ID: {0}" -f $Order.id))
    $lines.Add(($labelClient + [string]$Order.customer.name))
    $lines.Add(($labelPhone + [string]$Order.customer.phoneDisplay))
    $procName = ""
    if ($Order.booking) { $procName = [string]$Order.booking.procedure }
    if (-not $procName) {
      $firstItem = @(Ensure-Array $Order.items) | Select-Object -First 1
      if ($firstItem) { $procName = [string]$firstItem.name }
    }
    if ($procName) { $lines.Add(($labelProcedure + $procName)) }
    if ($Order.booking -and $Order.booking.date) { $lines.Add(($labelDate + [string]$Order.booking.date)) }
    if ($Order.booking -and $Order.booking.time) { $lines.Add(($labelTime + [string]$Order.booking.time)) }
    if ($Order.booking -and $Order.booking.note) { $lines.Add(($labelNote + [string]$Order.booking.note)) }
    $lines.Add("")
    $lines.Add(("@{0}" -f $telegramUser))
    return ($lines -join "`n")
  }

  $lines.Add($titleOrder)
  $lines.Add("")
  $lines.Add(("ID: {0}" -f $Order.id))
  $lines.Add(($labelClient + [string]$Order.customer.name))
  $lines.Add(($labelPhone + [string]$Order.customer.phoneDisplay))
  $lines.Add(($labelChannel + [string]$Order.channel))
  $lines.Add("")
  foreach ($item in @(Ensure-Array $Order.items)) {
    $lines.Add(("- {0} x{1} = {2} RUB" -f $item.name, $item.quantity, $item.lineTotal))
  }
  $lines.Add("")
  $lines.Add(($labelTotal + ("{0} RUB" -f $Order.total)))
  $lines.Add("")
  $lines.Add(("@{0}" -f $telegramUser))
  return ($lines -join "`n")
}

function Send-TelegramOrderNotify {
  param($Order)
  if (-not $telegramBotToken) {
    Write-Output "Telegram notify skipped: TELEGRAM_BOT_TOKEN is empty"
    return $false
  }

  $chatId = Get-TelegramChatId
  if (-not $chatId) {
    Write-Output ("Telegram notify skipped: chat id for @{0} not found. Open the bot from that account and press Start." -f $telegramUser)
    return $false
  }

  $text = Format-TelegramOrderText $Order
  $payload = @{
    chat_id = $chatId
    text = $text
    disable_web_page_preview = $true
  } | ConvertTo-Json -Compress

  try {
    $uri = "https://api.telegram.org/bot$telegramBotToken/sendMessage"
    $response = Invoke-RestMethod -Method Post -Uri $uri -Body $payload -ContentType "application/json; charset=utf-8" -TimeoutSec 10
    if ($response.ok) {
      Write-Output ("Telegram notify sent to @{0}" -f $telegramUser)
      return $true
    }
    Write-Output "Telegram notify failed: API returned ok=false"
  } catch {
    Write-Output ("Telegram notify failed: {0}" -f $_.Exception.Message)
  }
  return $false
}

function ConvertTo-JsonArray {
  param($Items)
  $list = @(Ensure-Array $Items)
  if ($list.Count -eq 0) { return "[]" }
  if ($list.Count -eq 1) {
    return "[" + (ConvertTo-Json -InputObject $list[0] -Depth 40 -Compress) + "]"
  }
  return (ConvertTo-Json -InputObject $list -Depth 40 -Compress)
}

function Set-SecurityHeaders {
  param($Response)
  try { $Response.Headers["X-Content-Type-Options"] = "nosniff" } catch {}
  try { $Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin" } catch {}
  try { $Response.Headers["X-Frame-Options"] = "SAMEORIGIN" } catch {}
  try {
    $Response.Headers["Content-Security-Policy"] =
      "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'wasm-unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; connect-src 'self' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://tessdata.projectnaptha.com; worker-src 'self' blob: https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; font-src 'self' data: https://fonts.gstatic.com; frame-src 'self' https://yandex.ru https://*.yandex.ru; frame-ancestors 'self'; base-uri 'self'; form-action 'self'"
  } catch {}
}

function Write-JsonResponse {
  param(
    $Response,
    [int]$StatusCode,
    $Object
  )
  $json = ($Object | ConvertTo-Json -Depth 40 -Compress)
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers["Cache-Control"] = "no-store"
  Set-SecurityHeaders $Response
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Write-RawJsonResponse {
  param(
    $Response,
    [int]$StatusCode,
    [string]$Json
  )
  $bytes = [Text.Encoding]::UTF8.GetBytes($Json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.Headers["Cache-Control"] = "no-store"
  Set-SecurityHeaders $Response
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Write-TextResponse {
  param(
    $Response,
    [int]$StatusCode,
    [string]$Text,
    [string]$ContentType = "text/plain; charset=utf-8"
  )
  $bytes = [Text.Encoding]::UTF8.GetBytes($Text)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = $ContentType
  Set-SecurityHeaders $Response
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.Close()
}

function Read-RequestBody {
  param(
    $Request,
    [long]$MaxBytes = 0
  )
  if (-not $Request.HasEntityBody) { return "" }
  if ($MaxBytes -gt 0 -and $Request.ContentLength64 -gt $MaxBytes) {
    throw [System.IO.InvalidDataException]::new("Payload too large")
  }
  $stream = $Request.InputStream
  $ms = New-Object System.IO.MemoryStream
  try {
    $buffer = New-Object byte[] 8192
    $total = [long]0
    while ($true) {
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) { break }
      $total += $read
      if ($MaxBytes -gt 0 -and $total -gt $MaxBytes) {
        throw [System.IO.InvalidDataException]::new("Payload too large")
      }
      $ms.Write($buffer, 0, $read)
    }
    return [Text.Encoding]::UTF8.GetString($ms.ToArray())
  } finally {
    $ms.Dispose()
  }
}

function Read-JsonBody {
  param(
    $Request,
    [long]$MaxBytes = 262144
  )
  $raw = Read-RequestBody $Request $MaxBytes
  if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
  return ($raw | ConvertFrom-Json)
}

function Normalize-PhoneDigits {
  param([string]$Phone)
  $digits = ([string]$Phone) -replace '\D', ''
  if ($digits.Length -eq 11 -and ($digits.StartsWith("7") -or $digits.StartsWith("8"))) {
    return ("7" + $digits.Substring(1))
  }
  if ($digits.Length -eq 10) {
    return ("7" + $digits)
  }
  return $digits
}

function Format-PhoneDisplayRu {
  param([string]$Phone)
  $digits = Normalize-PhoneDigits $Phone
  if ($digits.Length -ne 11 -or -not $digits.StartsWith("7")) { return $digits }
  $rest = $digits.Substring(1)
  return ("+7 ({0}) {1}-{2}-{3}" -f $rest.Substring(0, 3), $rest.Substring(3, 3), $rest.Substring(6, 2), $rest.Substring(8, 2))
}

function Test-BookingDateValid {
  param(
    [string]$IsoDate,
    [string]$IsoTime = ""
  )
  if ($IsoDate -notmatch '^\d{4}-\d{2}-\d{2}$') { return $false }
  try {
    $selected = [datetime]::ParseExact($IsoDate, "yyyy-MM-dd", [Globalization.CultureInfo]::InvariantCulture)
  } catch {
    return $false
  }
  $today = (Get-Date).Date
  if ($selected.Date -lt $today) { return $false }
  # Cap far-future spam bookings.
  if ($selected.Date -gt $today.AddDays(180)) { return $false }
  if ($IsoTime -match '^(\d{2}):(\d{2})$' -and $selected.Date -eq $today) {
    try {
      $slot = $selected.Date.AddHours([int]$Matches[1]).AddMinutes([int]$Matches[2])
      if ($slot -lt (Get-Date)) { return $false }
    } catch {
      return $false
    }
  }
  return $true
}

function Get-BearerToken {
  param($Request)
  $auth = $Request.Headers["Authorization"]
  if (-not $auth) { return $null }
  if ($auth -match '^\s*Bearer\s+(.+)\s*$') { return $Matches[1].Trim() }
  return $null
}

function Clear-ExpiredSessions {
  $now = Get-Date
  $expired = @($sessions.Keys | Where-Object {
    $sessions[$_].Expires -lt $now
  })
  foreach ($key in $expired) {
    $sessions.Remove($key)
  }
}

function Test-AdminAuth {
  param($Request)
  Clear-ExpiredSessions
  $token = Get-BearerToken $Request
  if (-not $token) { return $false }
  return $sessions.ContainsKey($token)
}

function New-AdminSession {
  $token = [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
  $sessions[$token] = @{
    Expires = (Get-Date).AddHours($sessionTtlHours)
  }
  return $token
}

function Read-JsonFile {
  param(
    [string]$Path,
    $Fallback,
    [switch]$AllowMissing
  )
  if (-not (Test-Path -LiteralPath $Path)) {
    if ($AllowMissing) { return $Fallback }
    throw "Missing data file: $Path"
  }

  $raw = $null
  $lastError = $null
  for ($attempt = 1; $attempt -le 6; $attempt++) {
    try {
      $raw = [System.IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
      $lastError = $null
      break
    } catch {
      $lastError = $_
      Start-Sleep -Milliseconds (40 * $attempt)
    }
  }
  if ($null -ne $lastError) {
    throw "Cannot read data file: $Path ($($lastError.Exception.Message))"
  }
  if ([string]::IsNullOrWhiteSpace($raw)) {
    # Empty on disk is suspicious (truncation) — never treat as [].
    throw "Empty data file: $Path"
  }
  try {
    return (Ensure-Array ($raw | ConvertFrom-Json))
  } catch {
    throw "Corrupted data file: $Path"
  }
}

function Write-JsonFile {
  param([string]$Path, $Object)
  $dir = [System.IO.Path]::GetDirectoryName($Path)
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
  $tmp = "$Path.tmp"
  $bak = "$Path.bak"
  $json = ConvertTo-JsonArray $Object
  [System.IO.File]::WriteAllText($tmp, $json, [Text.UTF8Encoding]::new($false))
  if (Test-Path -LiteralPath $Path) {
    try {
      Copy-Item -LiteralPath $Path -Destination $bak -Force -ErrorAction Stop
    } catch {}
  }
  Move-Item -LiteralPath $tmp -Destination $Path -Force
}

function Enter-DataLock {
  [System.Threading.Monitor]::Enter($script:dataLock)
}

function Exit-DataLock {
  [System.Threading.Monitor]::Exit($script:dataLock)
}

function Test-CorruptedProducts {
  param($Products)
  $list = @(Ensure-Array $Products)
  if ($list.Count -eq 0) { return $true }
  foreach ($item in $list) {
    $name = [string]$item.name
    if ([string]::IsNullOrWhiteSpace($name)) { return $true }
    # Broken Cyrillic often becomes sequences of '?'
    if ($name -match '\?{3,}') { return $true }
  }
  return $false
}

function Test-EmptyOrMissingJsonFile {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return $true }
  try {
    $raw = [System.IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
    return [string]::IsNullOrWhiteSpace($raw)
  } catch {
    return $false
  }
}

function Ensure-DataFiles {
  $needsProducts = Test-EmptyOrMissingJsonFile $productsFile
  if (-not $needsProducts) {
    try {
      $existing = Read-JsonFile $productsFile @() -AllowMissing
      if (Test-CorruptedProducts $existing) { $needsProducts = $true }
    } catch {
      # Keep existing file if temporarily unreadable; do not overwrite.
      Write-Output ("Warning: products.json not readable yet: {0}" -f $_.Exception.Message)
      $needsProducts = $false
    }
  }

  if ($needsProducts) {
    if (Test-Path -LiteralPath $productsSeedFile) {
      Copy-Item -LiteralPath $productsSeedFile -Destination $productsFile -Force
    } else {
      Write-JsonFile $productsFile @()
    }
  }
  # Recreate only when missing/truncated empty (never wipe non-empty corrupt without .bak).
  if (Test-EmptyOrMissingJsonFile $ordersFile) {
    $ordersBak = "$ordersFile.bak"
    if ((Test-Path -LiteralPath $ordersBak) -and -not (Test-EmptyOrMissingJsonFile $ordersBak)) {
      Write-Output "Restoring empty orders.json from .bak"
      Copy-Item -LiteralPath $ordersBak -Destination $ordersFile -Force
    } else {
      Write-JsonFile $ordersFile @()
    }
  }
}

function Normalize-Product {
  param($Item)
  if (-not $Item) { return $null }
  $type = [string]$Item.type
  if ($type -ne "service") { $type = "product" }
  $price = 0
  try { $price = [math]::Round([double]$Item.price) } catch { $price = 0 }
  if ($price -le 0) { return $null }
  $name = ([string]$Item.name).Trim()
  if (-not $name) { return $null }
  $id = ([string]$Item.id).Trim()
  if (-not $id) { $id = "p$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" }
  $image = ([string]$Item.image).Trim()
  if (-not $image) { return $null }
  $stock = $null
  if ($type -eq "product") {
    $hasStockProp = $false
    try { $hasStockProp = $Item.PSObject.Properties.Name -contains "stock" } catch { $hasStockProp = $false }
    if (-not $hasStockProp) {
      $stock = 10
    } else {
      try { $stock = [math]::Max(0, [math]::Min(99999, [int][math]::Round([double]$Item.stock))) } catch { $stock = 0 }
    }
  }
  return [ordered]@{
    id = $id
    type = $type
    name = $name
    description = ([string]$Item.description).Trim()
    price = [int]$price
    image = $image
    stock = $stock
  }
}

function Read-JsonFileOrBackup {
  param([string]$Path, $Fallback)
  try {
    return (Read-JsonFile $Path $Fallback -AllowMissing)
  } catch {
    $bak = "$Path.bak"
    if (Test-Path -LiteralPath $bak) {
      Write-Output ("Restoring data from backup: {0}" -f $bak)
      Copy-Item -LiteralPath $bak -Destination $Path -Force
      return (Read-JsonFile $Path $Fallback -AllowMissing)
    }
    throw
  }
}

# Avoid HttpWebRequest KeepAlive pool exhaustion against the local DB (FinWait2 / false "not ready").
try { [System.Net.ServicePointManager]::DefaultConnectionLimit = 64 } catch {}
try { [System.Net.ServicePointManager]::Expect100Continue = $false } catch {}

function Invoke-DbProxy {
  param(
    [string]$Path,
    [string]$Method = "GET",
    [string]$Body,
    [int]$TimeoutMs = 15000
  )
  $uri = "http://127.0.0.1:$dbPort$Path"
  $request = [System.Net.HttpWebRequest]::Create($uri)
  $request.Method = $Method
  $request.Timeout = $TimeoutMs
  $request.ReadWriteTimeout = $TimeoutMs
  $request.KeepAlive = $false
  $request.Proxy = $null
  if ($Method -ne "GET" -and $Method -ne "DELETE") {
    $request.ContentType = "application/json; charset=utf-8"
    $bytes = [Text.Encoding]::UTF8.GetBytes($(if ($null -eq $Body) { "" } else { $Body }))
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try {
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $stream.Close()
    }
  } else {
    $request.ContentLength = 0
  }
  $response = $null
  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw }
  }
  try {
    $code = [int]$response.StatusCode
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
    try {
      $text = $reader.ReadToEnd()
    } finally {
      $reader.Close()
    }
    return @{ StatusCode = $code; Content = $text }
  } finally {
    if ($response) { $response.Close() }
  }
}

function Test-DbReady {
  try {
    $result = Invoke-DbProxy -Path "/health" -Method "GET" -TimeoutMs 2000
    if ($result.StatusCode -ne 200) { return $false }
    $data = ConvertFrom-DbJson $result.Content
    if ($data -and $null -ne $data.ok -and -not [bool]$data.ok) { return $false }
    if ($data -and [bool]$data.dirty) { return $false }
    return $true
  } catch {
    return $false
  }
}

$script:dbRestartLastAt = [datetime]::MinValue

function Ensure-DbUp {
  $alive = $script:dbProc -and -not $script:dbProc.HasExited
  if ($alive -and (Test-DbReady)) { return $true }
  # Avoid restart thrash when disk is persistently broken.
  if (((Get-Date) - $script:dbRestartLastAt).TotalSeconds -lt 8) {
    return (Test-DbReady)
  }
  $script:dbRestartLastAt = Get-Date
  if (-not $alive) {
    Write-Output "SQLite DB process missing, restarting..."
  } else {
    Write-Output "SQLite DB unhealthy, restarting..."
  }
  try { Start-DbCore } catch {
    Write-Output ("SQLite DB restart failed: {0}" -f $_.Exception.Message)
  }
  return (Test-DbReady)
}

function Get-TelegramNotifiedMap {
  if (-not (Test-Path -LiteralPath $telegramNotifiedFile)) {
    return @{}
  }
  try {
    $raw = Get-Content -LiteralPath $telegramNotifiedFile -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    $obj = $raw | ConvertFrom-Json
    $map = @{}
    if ($obj) {
      foreach ($prop in $obj.PSObject.Properties) {
        $map[[string]$prop.Name] = [bool]$prop.Value
      }
    }
    return $map
  } catch {
    Write-Output ("Telegram notified map read failed: {0}" -f $_.Exception.Message)
    return @{}
  }
}

function Set-TelegramNotified {
  param(
    [string]$OrderId,
    [bool]$Ok
  )
  if ([string]::IsNullOrWhiteSpace($OrderId)) { return }
  $map = Get-TelegramNotifiedMap
  $map[$OrderId] = $Ok
  try {
    # Ordered dictionary → always a JSON object (even for a single key) on Windows PowerShell 5.1.
    $ordered = [ordered]@{}
    foreach ($key in @($map.Keys)) {
      $ordered[[string]$key] = [bool]$map[$key]
    }
    # Cap growth: keep the newest ~500 ids.
    if ($ordered.Count -gt 500) {
      $trim = [ordered]@{}
      foreach ($key in (@($ordered.Keys) | Select-Object -Last 500)) {
        $trim[[string]$key] = [bool]$ordered[$key]
      }
      $ordered = $trim
    }
    ($ordered | ConvertTo-Json -Compress) | Set-Content -LiteralPath $telegramNotifiedFile -Encoding UTF8
  } catch {
    Write-Output ("Telegram notified map write failed: {0}" -f $_.Exception.Message)
  }
}

function Get-TelegramNotified {
  param([string]$OrderId)
  if ([string]::IsNullOrWhiteSpace($OrderId)) { return $null }
  $map = Get-TelegramNotifiedMap
  if ($map.ContainsKey($OrderId)) { return [bool]$map[$OrderId] }
  return $null
}

function Add-TelegramOutbox {
  param($Order)
  if (-not $Order -or -not $Order.id) { return }
  try {
    $line = ($Order | ConvertTo-Json -Depth 40 -Compress)
    Add-Content -LiteralPath $telegramOutboxFile -Value $line -Encoding UTF8
    Write-Output ("Telegram outbox queued order={0}" -f $Order.id)
  } catch {
    Write-Output ("Telegram outbox append failed: {0}" -f $_.Exception.Message)
  }
}

function Complete-TelegramOutbox {
  if (-not (Test-Path -LiteralPath $telegramOutboxFile)) { return }
  if (((Get-Date) - $script:telegramOutboxLastAt).TotalSeconds -lt 20) { return }
  $script:telegramOutboxLastAt = Get-Date
  if (-not $telegramBotToken) { return }

  $lines = @()
  try {
    $lines = @(Get-Content -LiteralPath $telegramOutboxFile -Encoding UTF8 -ErrorAction Stop)
  } catch {
    Write-Output ("Telegram outbox read failed: {0}" -f $_.Exception.Message)
    return
  }
  if (-not $lines.Count) { return }

  $remaining = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $order = $null
    try { $order = $line | ConvertFrom-Json } catch { $order = $null }
    if (-not $order -or -not $order.id) { continue }
    $already = Get-TelegramNotified ([string]$order.id)
    if ($already -eq $true) { continue }
    $sent = $false
    try { $sent = [bool](Send-TelegramOrderNotify $order) } catch { $sent = $false }
    if ($sent) {
      Set-TelegramNotified -OrderId ([string]$order.id) -Ok $true
    } else {
      $remaining.Add($line)
    }
  }
  try {
    if ($remaining.Count -eq 0) {
      Remove-Item -LiteralPath $telegramOutboxFile -Force -ErrorAction SilentlyContinue
    } else {
      Set-Content -LiteralPath $telegramOutboxFile -Value ($remaining -join "`n") -Encoding UTF8
    }
  } catch {
    Write-Output ("Telegram outbox rewrite failed: {0}" -f $_.Exception.Message)
  }
}

function ConvertFrom-DbJson {
  param([string]$Content)
  if ([string]::IsNullOrWhiteSpace($Content)) { return $null }
  return ($Content | ConvertFrom-Json)
}

$script:productsListCache = $null
$script:productsListCacheAt = [datetime]::MinValue
$script:productsCacheTtlSec = 2

function Clear-ProductsListCache {
  $script:productsListCache = $null
  $script:productsListCacheAt = [datetime]::MinValue
}

function Get-ProductsList {
  param([switch]$Force)
  if (-not $Force) {
    if (
      $null -ne $script:productsListCache -and
      ((Get-Date) - $script:productsListCacheAt).TotalSeconds -lt $script:productsCacheTtlSec
    ) {
      return @($script:productsListCache)
    }
  }
  if (-not (Ensure-DbUp)) { throw "SQLite DB is not ready" }
  $proxy = Invoke-DbProxy -Path "/products" -Method "GET"
  if ($proxy.StatusCode -ne 200) { throw "Failed to load products" }
  $data = ConvertFrom-DbJson $proxy.Content
  $list = @()
  foreach ($item in @(Ensure-Array $data.products)) {
    $normalized = Normalize-Product $item
    if ($normalized) { $list += ,$normalized }
  }
  $script:productsListCache = $list
  $script:productsListCacheAt = Get-Date
  return $list
}

function Save-ProductsList {
  param(
    $Products,
    [switch]$OverwriteStock,
    $StockOverrides = @(),
    [switch]$AllowEmpty
  )
  $payloadObj = [ordered]@{
    products = @(Ensure-Array $Products)
    preserveStock = (-not $OverwriteStock.IsPresent)
    allowEmpty = [bool]$AllowEmpty.IsPresent
    stockOverrides = @(Ensure-Array $StockOverrides)
  }
  $payload = $payloadObj | ConvertTo-Json -Depth 40 -Compress
  $proxy = Invoke-DbProxy -Path "/products" -Method "PUT" -Body $payload -TimeoutMs 30000
  if ($proxy.StatusCode -ne 200) {
    $err = ConvertFrom-DbJson $proxy.Content
    throw ($(if ($err.error) { [string]$err.error } else { "Failed to save products" }))
  }
  Clear-ProductsListCache
  $data = ConvertFrom-DbJson $proxy.Content
  $list = @()
  foreach ($item in @(Ensure-Array $data.products)) {
    $normalized = Normalize-Product $item
    if ($normalized) { $list += ,$normalized }
  }
  $script:productsListCache = $list
  $script:productsListCacheAt = Get-Date
  return $list
}

function Get-OrdersList {
  param(
    [int]$Limit = 500,
    [int]$Offset = 0
  )
  if (-not (Ensure-DbUp)) { throw "SQLite DB is not ready" }
  $qs = "?limit=$Limit&offset=$Offset"
  $proxy = Invoke-DbProxy -Path ("/orders" + $qs) -Method "GET"
  if ($proxy.StatusCode -ne 200) { throw "Failed to load orders" }
  $data = ConvertFrom-DbJson $proxy.Content
  $total = 0
  try { if ($null -ne $data.total) { $total = [int]$data.total } } catch { $total = @(Ensure-Array $data.orders).Count }
  return @{
    Orders = @(Ensure-Array $data.orders)
    Total = $total
    Limit = $Limit
    Offset = $Offset
  }
}

function Save-OrderRecord {
  param($Order)
  $payload = @{ order = $Order } | ConvertTo-Json -Depth 40 -Compress
  $proxy = Invoke-DbProxy -Path "/orders" -Method "POST" -Body $payload -TimeoutMs 15000
  $data = ConvertFrom-DbJson $proxy.Content
  return @{
    StatusCode = [int]$proxy.StatusCode
    Data = $data
  }
}

function Update-OrderRecord {
  param([string]$Id, [string]$Status)
  $payload = @{ id = $Id; status = $Status } | ConvertTo-Json -Compress
  $proxy = Invoke-DbProxy -Path "/orders" -Method "PATCH" -Body $payload
  $data = ConvertFrom-DbJson $proxy.Content
  return @{
    StatusCode = [int]$proxy.StatusCode
    Data = $data
  }
}

function Remove-OrderRecord {
  param([string]$Id)
  $proxy = Invoke-DbProxy -Path ("/orders?id=" + [Uri]::EscapeDataString($Id)) -Method "DELETE"
  $data = ConvertFrom-DbJson $proxy.Content
  return @{
    StatusCode = [int]$proxy.StatusCode
    Data = $data
  }
}

function Get-ClientIp {
  param($Request)
  # Only trust X-Forwarded-For when the immediate peer is loopback (local reverse proxy).
  try {
    $remote = if ($Request.RemoteEndPoint -and $Request.RemoteEndPoint.Address) {
      [string]$Request.RemoteEndPoint.Address
    } else {
      ""
    }
    $isLoopback = $remote -eq "127.0.0.1" -or $remote -eq "::1"
    if ($isLoopback) {
      $xff = [string]$Request.Headers["X-Forwarded-For"]
      if ($xff) {
        $first = ($xff -split ",")[0].Trim()
        if ($first -match '^[0-9a-fA-F.:]+$') { return $first }
      }
    }
    if ($remote) { return $remote }
  } catch {}
  return "unknown"
}

function Test-ChatRate {
  param([string]$ClientIp = "unknown")
  $now = Get-Date
  while ($chatHitsGlobal.Count -gt 0 -and $chatHitsGlobal.Peek().AddMinutes(1) -lt $now) {
    [void]$chatHitsGlobal.Dequeue()
  }
  if ($chatHitsGlobal.Count -ge $chatRateGlobal) { return $false }

  $staleKeys = @($chatHitsByIp.Keys | Where-Object {
    $q = $chatHitsByIp[$_]
    $q.Count -eq 0 -or ($q.Count -gt 0 -and $q.Peek().AddMinutes(2) -lt $now)
  })
  foreach ($key in $staleKeys) {
    if ($chatHitsByIp.ContainsKey($key)) {
      $q = $chatHitsByIp[$key]
      while ($q.Count -gt 0 -and $q.Peek().AddMinutes(1) -lt $now) { [void]$q.Dequeue() }
      if ($q.Count -eq 0) { $chatHitsByIp.Remove($key) }
    }
  }

  if (-not $chatHitsByIp.ContainsKey($ClientIp)) {
    $chatHitsByIp[$ClientIp] = New-Object System.Collections.Generic.Queue[datetime]
  }
  $bucket = $chatHitsByIp[$ClientIp]
  while ($bucket.Count -gt 0 -and $bucket.Peek().AddMinutes(1) -lt $now) {
    [void]$bucket.Dequeue()
  }
  if ($bucket.Count -ge $chatRatePerIp) { return $false }

  $bucket.Enqueue($now)
  $chatHitsGlobal.Enqueue($now)
  return $true
}

function Test-LoginRate {
  param([string]$ClientIp = "unknown")
  $now = Get-Date
  if (-not $loginHitsByIp.ContainsKey($ClientIp)) {
    $loginHitsByIp[$ClientIp] = New-Object System.Collections.Generic.Queue[datetime]
  }
  $bucket = $loginHitsByIp[$ClientIp]
  while ($bucket.Count -gt 0 -and $bucket.Peek().AddMinutes(1) -lt $now) {
    [void]$bucket.Dequeue()
  }
  if ($bucket.Count -ge $loginRatePerIp) { return $false }
  $bucket.Enqueue($now)
  return $true
}

function Test-OrderRate {
  $now = Get-Date
  while ($orderHits.Count -gt 0 -and $orderHits.Peek().AddMinutes(1) -lt $now) {
    [void]$orderHits.Dequeue()
  }
  # Anonymous public endpoint — keep abuse window tight.
  if ($orderHits.Count -ge 12) { return $false }
  $orderHits.Enqueue($now)
  return $true
}

function New-SecureOrderId {
  param([string]$Kind = "order")
  $prefix = if ($Kind -eq "booking") { "book" } else { "ord" }
  $bytes = New-Object byte[] 16
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  $hex = ([BitConverter]::ToString($bytes) -replace '-', '').ToLowerInvariant()
  return "${prefix}_${hex}"
}

function Test-ClientOrderId {
  param(
    [string]$Id,
    [string]$Kind = "order"
  )
  if ($Kind -eq "booking") {
    return ($Id -match '^book_[a-fA-F0-9]{20,64}$')
  }
  return ($Id -match '^ord_[a-fA-F0-9]{20,64}$')
}

function Invoke-AiProxy {
  param(
    [string]$Path,
    [string]$Method = "GET",
    [string]$Body,
    [int]$TimeoutMs = 65000
  )
  $uri = "http://127.0.0.1:$aiPort$Path"
  $request = [System.Net.HttpWebRequest]::Create($uri)
  $request.Method = $Method
  $request.Timeout = $TimeoutMs
  $request.ReadWriteTimeout = $TimeoutMs
  $request.KeepAlive = $false
  $request.Proxy = $null
  if ($aiInternalToken) {
    $request.Headers["X-Jarvis-Internal"] = $aiInternalToken
  }
  if ($Method -eq "POST") {
    $request.ContentType = "application/json; charset=utf-8"
    $bytes = [Text.Encoding]::UTF8.GetBytes($(if ($null -eq $Body) { "" } else { $Body }))
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try {
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $stream.Close()
    }
  }
  $response = $null
  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw }
  }
  try {
    $code = [int]$response.StatusCode
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
    try {
      $text = $reader.ReadToEnd()
    } finally {
      $reader.Close()
    }
    return @{ StatusCode = $code; Content = $text }
  } finally {
    $response.Close()
  }
}

function Test-AiReady {
  try {
    $result = Invoke-AiProxy -Path "/health" -Method "GET" -TimeoutMs 2000
    if ($result.StatusCode -ne 200) { return $false }
    # Require configured OpenAI key inside the core, not just a listening process.
    if ([string]::IsNullOrWhiteSpace($result.Content)) { return $false }
    if ($result.Content -notmatch '"ai"\s*:\s*true') { return $false }
    return $true
  } catch {
    return $false
  }
}

function Stop-AiPid {
  param([int]$ProcessId)
  if ($ProcessId -le 0) { return }
  try {
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc -and ($proc.ProcessName -eq "node" -or $proc.ProcessName -eq "nodejs")) {
      Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}

function Stop-AiCore {
  if ($script:aiProc -and -not $script:aiProc.HasExited) {
    try { $script:aiProc.Kill() } catch {}
    try { $script:aiProc.Dispose() } catch {}
  }
  $script:aiProc = $null
  if (Test-Path -LiteralPath $aiPidFile) {
    $oldId = 0
    try { $oldId = [int]((Get-Content -LiteralPath $aiPidFile -Raw -ErrorAction Stop).Trim()) } catch { $oldId = 0 }
    Stop-AiPid $oldId
    Remove-Item -LiteralPath $aiPidFile -Force -ErrorAction SilentlyContinue
  }
}

function Stop-PdfCore {
  if ($script:pdfProc -and -not $script:pdfProc.HasExited) {
    try { $script:pdfProc.Kill() } catch {}
    try { $script:pdfProc.Dispose() } catch {}
  }
  $script:pdfProc = $null
  if (Test-Path -LiteralPath $pdfPidFile) {
    $oldId = 0
    try { $oldId = [int]((Get-Content -LiteralPath $pdfPidFile -Raw -ErrorAction Stop).Trim()) } catch { $oldId = 0 }
    Stop-AiPid $oldId
    Remove-Item -LiteralPath $pdfPidFile -Force -ErrorAction SilentlyContinue
  }
}

function Stop-DbCore {
  # Ask DB to flush mirrors/.bak before Kill (Windows Kill skips SIGTERM handlers).
  if (Test-DbReady) {
    try { Invoke-DbProxy -Path "/flush" -Method "POST" -Body "{}" -TimeoutMs 5000 | Out-Null } catch {}
  }
  if ($script:dbProc -and -not $script:dbProc.HasExited) {
    try { $script:dbProc.Kill() } catch {}
    try { $script:dbProc.Dispose() } catch {}
  }
  $script:dbProc = $null
  if (Test-Path -LiteralPath $dbPidFile) {
    $oldId = 0
    try { $oldId = [int]((Get-Content -LiteralPath $dbPidFile -Raw -ErrorAction Stop).Trim()) } catch { $oldId = 0 }
    Stop-AiPid $oldId
    Remove-Item -LiteralPath $dbPidFile -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-DbDependencies {
  $nodeModules = Join-Path $dbDir "node_modules\sql.js"
  if (Test-Path -LiteralPath $nodeModules) { return $true }
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $nodeCmd -or -not $npmCmd) {
    Write-Output "SQLite DB skipped: Node.js/npm not found."
    return $false
  }
  Write-Output "Installing SQLite DB dependencies..."
  Push-Location $dbDir
  try {
    & npm.cmd install --omit=dev --no-fund --no-audit 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { return $false }
  } finally {
    Pop-Location
  }
  return (Test-Path -LiteralPath $nodeModules)
}

function Start-DbCore {
  if (Test-DbReady) {
    Write-Output "SQLite DB already running on http://127.0.0.1:$dbPort/"
    Write-Output "SQLite file: $dbFile"
    return
  }

  if ($script:dbProc -and -not $script:dbProc.HasExited -and (Test-DbReady)) {
    return
  }

  Stop-DbCore

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Output "SQLite DB skipped: Node.js not found."
    return
  }
  $server = Join-Path $dbDir "server.js"
  if (-not (Test-Path -LiteralPath $server)) {
    Write-Output "SQLite DB skipped: db/server.js missing."
    return
  }
  if (-not (Ensure-DbDependencies)) {
    Write-Output "SQLite DB skipped: dependencies missing."
    return
  }

  # Same ProcessStartInfo pattern as AI core (reliable env on Windows PowerShell 5.1).
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeCmd.Source
  $psi.Arguments = "server.js"
  $psi.WorkingDirectory = $dbDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables["JARVIS_DB_PORT"] = "$dbPort"
  $psi.EnvironmentVariables["JARVIS_DB_FILE"] = "$dbFile"
  $psi.EnvironmentVariables["JARVIS_DATA_DIR"] = "$dataDir"

  $script:dbProc = New-Object System.Diagnostics.Process
  $script:dbProc.StartInfo = $psi
  [void]$script:dbProc.Start()
  [System.IO.File]::WriteAllText($dbPidFile, [string]$script:dbProc.Id)

  for ($i = 0; $i -lt 40; $i++) {
    if ($script:dbProc.HasExited) {
      Write-Output ("SQLite DB exited with code {0}." -f $script:dbProc.ExitCode)
      foreach ($logPath in @((Join-Path $dataDir "db-core.err.log"), (Join-Path $dataDir "db-core.out.log"))) {
        if (Test-Path -LiteralPath $logPath) {
          $tail = Get-Content -LiteralPath $logPath -ErrorAction SilentlyContinue | Select-Object -Last 8
          if ($tail) { Write-Output ("DB log ({0}):" -f $logPath); $tail | ForEach-Object { Write-Output $_ } }
        }
      }
      return
    }
    if (Test-DbReady) {
      Write-Output "SQLite DB on http://127.0.0.1:$dbPort/"
      Write-Output "SQLite file: $dbFile"
      return
    }
    Start-Sleep -Milliseconds 200
  }
  Write-Output "SQLite DB did not become ready on port $dbPort."
}

function Start-AiCore {
  if ($script:aiProc -and -not $script:aiProc.HasExited -and (Test-AiReady)) {
    return
  }

  Stop-AiCore

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Output "AI core skipped: Node.js not found."
    return
  }
  $server = Join-Path $aiDir "server.js"
  if (-not (Test-Path -LiteralPath $server)) {
    Write-Output "AI core skipped: ai/server.js missing."
    return
  }

  $rootPath = $root.TrimEnd('\')
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeCmd.Source
  $psi.Arguments = "server.js"
  $psi.WorkingDirectory = $aiDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables["JARVIS_AI_PORT"] = "$aiPort"
  $psi.EnvironmentVariables["JARVIS_ROOT"] = $rootPath
  $psi.EnvironmentVariables["JARVIS_DATA_DIR"] = $dataDir
  $psi.EnvironmentVariables["JARVIS_ENV_FILE"] = "$envFile"
  $psi.EnvironmentVariables["JARVIS_INTERNAL_TOKEN"] = $aiInternalToken
  $psi.EnvironmentVariables["JARVIS_AI_DEADLINE_MS"] = "60000"
  $psi.EnvironmentVariables["JARVIS_AI_CONCURRENCY"] = "4"

  $script:aiProc = New-Object System.Diagnostics.Process
  $script:aiProc.StartInfo = $psi
  [void]$script:aiProc.Start()
  [System.IO.File]::WriteAllText($aiPidFile, [string]$script:aiProc.Id)

  for ($i = 0; $i -lt 25; $i++) {
    if ($script:aiProc.HasExited) {
      Write-Output ("AI core exited with code {0}." -f $script:aiProc.ExitCode)
      return
    }
    if (Test-AiReady) {
      Write-Output "AI core on http://127.0.0.1:$aiPort/"
      return
    }
    Start-Sleep -Milliseconds 200
  }
  Write-Output "AI core did not become ready on port $aiPort."
}

function Invoke-PdfProxy {
  param(
    [string]$Path,
    [string]$Method = "GET",
    [int]$TimeoutMs = 120000,
    [string]$Authorization = ""
  )
  $uri = "http://127.0.0.1:$pdfPort$Path"
  $request = [System.Net.HttpWebRequest]::Create($uri)
  $request.Method = $Method
  $request.Timeout = $TimeoutMs
  $request.ReadWriteTimeout = $TimeoutMs
  $request.KeepAlive = $false
  $request.Proxy = $null
  $request.ContentLength = 0
  if ($Authorization) {
    $request.Headers["Authorization"] = $Authorization
  }
  $response = $null
  try {
    $response = $request.GetResponse()
  } catch [System.Net.WebException] {
    $response = $_.Exception.Response
    if (-not $response) { throw }
  }
  try {
    $code = [int]$response.StatusCode
    $contentType = [string]$response.ContentType
    $disposition = [string]$response.Headers["Content-Disposition"]
    $ms = New-Object System.IO.MemoryStream
    try {
      $stream = $response.GetResponseStream()
      try {
        $buffer = New-Object byte[] 8192
        while ($true) {
          $read = $stream.Read($buffer, 0, $buffer.Length)
          if ($read -le 0) { break }
          $ms.Write($buffer, 0, $read)
        }
      } finally {
        $stream.Close()
      }
      return @{
        StatusCode = $code
        ContentType = $contentType
        ContentDisposition = $disposition
        Bytes = $ms.ToArray()
      }
    } finally {
      $ms.Dispose()
    }
  } finally {
    if ($response) { $response.Close() }
  }
}

function Test-PdfReady {
  try {
    $result = Invoke-PdfProxy -Path "/health" -Method "GET" -TimeoutMs 2000
    return ($result.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Ensure-PdfDependencies {
  $expressModule = Join-Path $pdfDir "node_modules\express"
  $pdfmakeModule = Join-Path $pdfDir "node_modules\pdfmake"
  $puppeteerModule = Join-Path $pdfDir "node_modules\puppeteer"
  if (
    (Test-Path -LiteralPath $expressModule) -and
    (Test-Path -LiteralPath $pdfmakeModule) -and
    (Test-Path -LiteralPath $puppeteerModule)
  ) { return $true }
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  $npmCmd = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $nodeCmd -or -not $npmCmd) {
    Write-Output "PDF service skipped: Node.js/npm not found."
    return $false
  }
  Write-Output "Installing PDF service dependencies (includes Chromium for catalog)..."
  Push-Location $pdfDir
  try {
    & npm.cmd install --omit=dev --no-fund --no-audit 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { return $false }
  } finally {
    Pop-Location
  }
  return (
    (Test-Path -LiteralPath $expressModule) -and
    (Test-Path -LiteralPath $pdfmakeModule) -and
    (Test-Path -LiteralPath $puppeteerModule)
  )
}

function Start-PdfCore {
  if (Test-PdfReady) {
    Write-Output "PDF service already running on http://127.0.0.1:$pdfPort/"
    return
  }

  if ($script:pdfProc -and -not $script:pdfProc.HasExited -and (Test-PdfReady)) {
    return
  }

  Stop-PdfCore

  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCmd) {
    Write-Output "PDF service skipped: Node.js not found."
    return
  }
  $server = Join-Path $pdfDir "server.js"
  if (-not (Test-Path -LiteralPath $server)) {
    Write-Output "PDF service skipped: pdf/server.js missing."
    return
  }
  if (-not (Ensure-PdfDependencies)) {
    Write-Output "PDF service skipped: dependencies missing."
    return
  }

  $rootPath = $root.TrimEnd('\')
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $nodeCmd.Source
  $psi.Arguments = "server.js"
  $psi.WorkingDirectory = $pdfDir
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.EnvironmentVariables["JARVIS_PDF_PORT"] = "$pdfPort"
  $psi.EnvironmentVariables["JARVIS_DB_PORT"] = "$dbPort"
  $psi.EnvironmentVariables["JARVIS_ROOT"] = $rootPath
  $psi.EnvironmentVariables["JARVIS_DATA_DIR"] = $dataDir

  $script:pdfProc = New-Object System.Diagnostics.Process
  $script:pdfProc.StartInfo = $psi
  [void]$script:pdfProc.Start()
  [System.IO.File]::WriteAllText($pdfPidFile, [string]$script:pdfProc.Id)

  for ($i = 0; $i -lt 40; $i++) {
    if ($script:pdfProc.HasExited) {
      Write-Output ("PDF service exited with code {0}." -f $script:pdfProc.ExitCode)
      return
    }
    if (Test-PdfReady) {
      Write-Output "PDF service on http://127.0.0.1:$pdfPort/"
      return
    }
    Start-Sleep -Milliseconds 200
  }
  Write-Output "PDF service did not become ready on port $pdfPort."
}

function Is-BlockedPath {
  param([string]$FullPath)
  $name = [System.IO.Path]::GetFileName($FullPath)
  $ext = [System.IO.Path]::GetExtension($FullPath).ToLowerInvariant()
  if ($blockedNames -contains $name.ToLowerInvariant()) { return $true }
  if ($blockedExtensions -contains $ext) { return $true }
  if ($name.StartsWith(".")) { return $true }
  if ($FullPath.Length -le $staticRoot.Length) { return $true }
  return $false
}

Ensure-DataFiles

function Complete-ChatJobs {
  param([switch]$Wait, [int]$WaitMs = 2000)
  if ($null -eq $script:chatJobs -or $script:chatJobs.Count -eq 0) { return }
  if ($Wait -and $script:chatJobs.Count -gt 0) {
    $deadline = [DateTime]::UtcNow.AddMilliseconds($WaitMs)
    while ([DateTime]::UtcNow -lt $deadline) {
      $pending = @($script:chatJobs | Where-Object { -not $_.Handle.IsCompleted })
      if ($pending.Count -eq 0) { break }
      Start-Sleep -Milliseconds 100
    }
  }
  $remaining = New-Object System.Collections.ArrayList
  foreach ($job in @($script:chatJobs)) {
    if (-not $job.Handle.IsCompleted) {
      [void]$remaining.Add($job)
      continue
    }
    try {
      $job.PowerShell.EndInvoke($job.Handle)
    } catch {
      Write-Output ("Chat worker error: {0}" -f $_.Exception.Message)
    } finally {
      try { $job.PowerShell.Dispose() } catch {}
    }
  }
  $script:chatJobs = $remaining
}

$chatWorkerScript = {
  param($Response, $RawBody, $AiPort, $InternalToken)
  function Write-ChatJson {
    param($Res, [int]$Code, $Object)
    $json = ($Object | ConvertTo-Json -Depth 20 -Compress)
    $bytes = [Text.Encoding]::UTF8.GetBytes($json)
    $Res.StatusCode = $Code
    $Res.ContentType = "application/json; charset=utf-8"
    $Res.Headers["Cache-Control"] = "no-store"
    try { $Res.Headers["X-Content-Type-Options"] = "nosniff" } catch {}
    $Res.ContentLength64 = $bytes.Length
    $Res.OutputStream.Write($bytes, 0, $bytes.Length)
    $Res.Close()
  }
  function Write-ChatRaw {
    param($Res, [int]$Code, [string]$Json)
    $bytes = [Text.Encoding]::UTF8.GetBytes($Json)
    $Res.StatusCode = $Code
    $Res.ContentType = "application/json; charset=utf-8"
    $Res.Headers["Cache-Control"] = "no-store"
    try { $Res.Headers["X-Content-Type-Options"] = "nosniff" } catch {}
    $Res.ContentLength64 = $bytes.Length
    $Res.OutputStream.Write($bytes, 0, $bytes.Length)
    $Res.Close()
  }
  function Invoke-LocalAi {
    param([string]$Body, [int]$Port, [string]$Token, [int]$TimeoutMs = 65000)
    $uri = "http://127.0.0.1:$Port/chat"
    $request = [System.Net.HttpWebRequest]::Create($uri)
    $request.Method = "POST"
    $request.Timeout = $TimeoutMs
    $request.ReadWriteTimeout = $TimeoutMs
    $request.KeepAlive = $false
    $request.Proxy = $null
    $request.ContentType = "application/json; charset=utf-8"
    if ($Token) {
      $request.Headers["X-Jarvis-Internal"] = $Token
    }
    $bytes = [Text.Encoding]::UTF8.GetBytes($(if ($null -eq $Body) { "" } else { $Body }))
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    try {
      $stream.Write($bytes, 0, $bytes.Length)
    } finally {
      $stream.Close()
    }
    $response = $null
    try {
      $response = $request.GetResponse()
    } catch [System.Net.WebException] {
      $response = $_.Exception.Response
      if (-not $response) { throw }
    }
    try {
      $code = [int]$response.StatusCode
      $reader = New-Object System.IO.StreamReader($response.GetResponseStream(), [Text.Encoding]::UTF8)
      try {
        $text = $reader.ReadToEnd()
      } finally {
        $reader.Close()
      }
      return @{ StatusCode = $code; Content = $text }
    } finally {
      $response.Close()
    }
  }

  try {
    $proxy = Invoke-LocalAi -Body $RawBody -Port $AiPort -Token $InternalToken
    if ($proxy.Content) {
      Write-ChatRaw $Response ([int]$proxy.StatusCode) $proxy.Content
    } else {
      Write-ChatJson $Response 502 @{ ok = $false; error = "AI request failed" }
    }
  } catch {
    try {
      Write-ChatJson $Response 502 @{ ok = $false; error = "AI request failed" }
    } catch {}
  }
}

try {
  $script:chatPool = [runspacefactory]::CreateRunspacePool(1, 4)
  $script:chatPool.Open()
} catch {
  $script:chatPool = $null
  Write-Output "Chat runspace pool unavailable; AI requests will run inline."
}

$listener = $null
$prefix = $null
foreach ($tryPort in 5500..5510) {
  $candidate = "http://127.0.0.1:$tryPort/"
  $candidateListener = New-Object System.Net.HttpListener
  $candidateListener.Prefixes.Add($candidate)
  try {
    $candidateListener.Start()
    $listener = $candidateListener
    $port = $tryPort
    $prefix = $candidate
    break
  } catch {
    try { $candidateListener.Close() } catch {}
  }
}

if (-not $listener) {
  Write-Output "Failed to start server on ports 5500-5510"
  Write-Output "Close another process using these ports or grant urlacl for this user."
  exit 1
}
$script:listener = $listener

Start-DbCore
if (-not (Test-DbReady)) {
  Write-Output "FATAL: SQLite DB is required but not running."
  Write-Output "Check Node.js install and db/ dependencies."
  try { Stop-DbCore } catch {}
  if ($listener -and $listener.IsListening) { $listener.Stop() }
  if ($listener) { $listener.Close() }
  exit 1
}
Start-AiCore
Start-PdfCore

try {
  [Console]::TreatControlCAsInput = $false
  $null = [Console]::add_CancelKeyPress({
    param($sender, $eventArgs)
    $eventArgs.Cancel = $true
    try { Stop-AiCore } catch {}
    try { Stop-PdfCore } catch {}
    try { Stop-DbCore } catch {}
    try {
      if ($script:listener -and $script:listener.IsListening) { $script:listener.Stop() }
    } catch {}
  })
} catch {}

Write-Output "Serving HTTP on $prefix"
Write-Output "Secrets file: $envFile"
Write-Output "Data directory: $dataDir"
Write-Output "SQLite file: $dbFile"
Write-Output "Admin password is read from secrets file (ADMIN_PASSWORD)."
Write-Output "Open http://127.0.0.1:$port/  (do not use file://)"
Write-Output "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    Complete-ChatJobs
    try { Complete-TelegramOutbox } catch {}
    try {
      $ctx = $listener.GetContext()
    } catch [System.Net.HttpListenerException] {
      if (-not $listener.IsListening) { break }
      Write-Output ("Listener error {0}: {1}" -f $_.Exception.ErrorCode, $_.Exception.Message)
      continue
    } catch {
      Write-Output ("Loop error: {0}" -f $_.Exception.Message)
      continue
    }
    $req = $ctx.Request
    $res = $ctx.Response
    $method = $req.HttpMethod.ToUpperInvariant()
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)

    try {
      if ($path -eq "/api/health") {
        $dbReady = Ensure-DbUp
        $aiReady = Test-AiReady
        $pdfReady = Test-PdfReady
        $payload = @{
          ok = [bool]$dbReady
          storage = "sqlite"
          ai = [bool]($openaiApiKey -and $aiReady)
          db = [bool]$dbReady
          pdf = [bool]$pdfReady
        }
        # Non-200 when DB is down so the frontend does not enter "server mode" blindly.
        Write-JsonResponse $res $(if ($dbReady) { 200 } else { 503 }) $payload
        continue
      }

      if ($path.StartsWith("/api/pdf/") -or $path -eq "/api/pdf") {
        if ($method -ne "GET") {
          Write-JsonResponse $res 405 @{ ok = $false; error = "Method not allowed" }
          continue
        }
        if (-not (Test-AdminAuth $req)) {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Unauthorized" }
          continue
        }
        if (-not (Test-PdfReady)) {
          Write-Output "PDF service unreachable, restarting..."
          Start-PdfCore
        }
        if (-not (Test-PdfReady)) {
          Write-JsonResponse $res 503 @{ ok = $false; error = "PDF service is not ready" }
          continue
        }

        $upstreamPath = $path.Substring("/api/pdf".Length)
        if ([string]::IsNullOrWhiteSpace($upstreamPath)) { $upstreamPath = "/" }
        if (-not $upstreamPath.StartsWith("/")) { $upstreamPath = "/" + $upstreamPath }
        $qs = $req.Url.Query
        if ($qs) { $upstreamPath = $upstreamPath + $qs }

        $authHeader = [string]$req.Headers["Authorization"]
        try {
          $proxy = Invoke-PdfProxy -Path $upstreamPath -Method $method -Authorization $authHeader -TimeoutMs 120000
        } catch {
          Write-Output ("PDF proxy failed: {0}" -f $_.Exception.Message)
          Write-JsonResponse $res 502 @{ ok = $false; error = "PDF service failed" }
          continue
        }

        $bytes = $proxy.Bytes
        if ($null -eq $bytes) { $bytes = [byte[]]@() }
        $res.StatusCode = [int]$proxy.StatusCode
        if ($proxy.ContentType) {
          $res.ContentType = [string]$proxy.ContentType
        } elseif ([int]$proxy.StatusCode -ge 400) {
          $res.ContentType = "application/json; charset=utf-8"
        } else {
          $res.ContentType = "application/pdf"
        }
        if ($proxy.ContentDisposition) {
          $res.Headers["Content-Disposition"] = [string]$proxy.ContentDisposition
        }
        $res.Headers["Cache-Control"] = "no-store"
        $res.ContentLength64 = $bytes.Length
        if ($bytes.Length -gt 0) {
          $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
        $res.Close()
        Write-Output ("{0} {1}" -f $method, $path)
        continue
      }

      if ($path -eq "/api/chat" -and $method -eq "POST") {
        if (-not $openaiApiKey) {
          Write-JsonResponse $res 503 @{ ok = $false; error = "AI is not configured" }
          continue
        }
        $clientIp = Get-ClientIp $req
        if (-not (Test-ChatRate -ClientIp $clientIp)) {
          Write-JsonResponse $res 429 @{ ok = $false; error = "Too many requests" }
          continue
        }
        $chatMaxBytes = 24L * 1024L * 1024L
        try {
          $rawBody = Read-RequestBody $req $chatMaxBytes
        } catch [System.IO.InvalidDataException] {
          Write-JsonResponse $res 413 @{ ok = $false; error = "Payload too large" }
          continue
        }
        if ([string]::IsNullOrWhiteSpace($rawBody)) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Missing messages" }
          continue
        }
        # Do not ConvertFrom-Json here: Windows PowerShell 5.1 caps it at ~2 MB
        # and would drop file payloads. Node core validates the JSON.
        if ($rawBody -notmatch '"messages"\s*:') {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Missing messages" }
          continue
        }

        # Only restart when the process is dead — a busy core may miss a 2s /health probe.
        $aiAlive = $script:aiProc -and -not $script:aiProc.HasExited
        if (-not $aiAlive) {
          Write-Output "AI core process missing, restarting..."
          Start-AiCore
        } elseif (-not (Test-AiReady)) {
          Write-Output "AI core health check failed while process is alive; leaving it running."
        }

        if ($script:chatPool) {
          $ps = [PowerShell]::Create()
          $ps.RunspacePool = $script:chatPool
          # ToString() → script text; ScriptBlock objects are not valid AddScript input on PS 5.1.
          [void]$ps.AddScript([string]$chatWorkerScript).AddArgument($res).AddArgument($rawBody).AddArgument([int]$aiPort).AddArgument([string]$aiInternalToken)
          $handle = $ps.BeginInvoke()
          [void]$script:chatJobs.Add(@{ PowerShell = $ps; Handle = $handle })
          Write-Output ("{0} {1} (async)" -f $method, $path)
          continue
        }

        try {
          $proxy = Invoke-AiProxy -Path "/chat" -Method "POST" -Body $rawBody -TimeoutMs 65000
          if ($proxy.Content) {
            Write-RawJsonResponse $res ([int]$proxy.StatusCode) $proxy.Content
          } else {
            Write-JsonResponse $res 502 @{ ok = $false; error = "AI request failed" }
          }
        } catch {
          Write-Output ("AI chat failed: {0}" -f $_.Exception.Message)
          Write-JsonResponse $res 502 @{ ok = $false; error = "AI request failed" }
        }
        continue
      }

      if ($path -eq "/api/admin/login" -and $method -eq "POST") {
        if (-not $adminPassword) {
          Write-JsonResponse $res 503 @{ ok = $false; error = "Admin password is not configured" }
          continue
        }
        $loginIp = Get-ClientIp $req
        if (-not (Test-LoginRate -ClientIp $loginIp)) {
          Write-JsonResponse $res 429 @{ ok = $false; error = "Too many login attempts" }
          continue
        }
        $body = Read-JsonBody $req
        $password = [string]$body.password
        if ($password -ceq $adminPassword) {
          $token = New-AdminSession
          Write-JsonResponse $res 200 @{ ok = $true; token = $token; expiresInHours = $sessionTtlHours }
        } else {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Invalid password" }
        }
        continue
      }

      if ($path -eq "/api/admin/logout" -and $method -eq "POST") {
        $token = Get-BearerToken $req
        if ($token -and $sessions.ContainsKey($token)) {
          $sessions.Remove($token)
        }
        Write-JsonResponse $res 200 @{ ok = $true }
        continue
      }

      if ($path -eq "/api/admin/session" -and $method -eq "GET") {
        Write-JsonResponse $res 200 @{ ok = (Test-AdminAuth $req) }
        continue
      }

      if ($path -eq "/api/products" -and $method -eq "GET") {
        if (-not (Ensure-DbUp)) {
          Write-JsonResponse $res 503 @{ ok = $false; error = "Database unavailable" }
          continue
        }
        $proxy = Invoke-DbProxy -Path "/products" -Method "GET"
        if ($proxy.StatusCode -ne 200 -and $proxy.StatusCode -ne 304) { throw "Failed to load products" }
        $data = ConvertFrom-DbJson $proxy.Content
        $revision = 0
        try { if ($data -and $data.revision) { $revision = [int]$data.revision } } catch { $revision = 0 }
        $clientRev = 0
        try {
          $inm = [string]$req.Headers["If-None-Match"]
          if ($inm -match 'cat-(\d+)') { $clientRev = [int]$Matches[1] }
        } catch { $clientRev = 0 }
        if ($revision -gt 0 -and $clientRev -eq $revision -and $null -ne $script:productsListCache) {
          $res.StatusCode = 304
          $res.Headers["ETag"] = "W/`"cat-$revision`""
          $res.Headers["Cache-Control"] = "no-cache"
          $res.Headers["X-Catalog-Revision"] = "$revision"
          $res.ContentLength64 = 0
          $res.Close()
          continue
        }
        $list = @()
        foreach ($item in @(Ensure-Array $data.products)) {
          $normalized = Normalize-Product $item
          if ($normalized) { $list += ,$normalized }
        }
        $script:productsListCache = $list
        $script:productsListCacheAt = Get-Date
        $productsJson = ConvertTo-JsonArray $list
        $etag = "W/`"cat-$revision`""
        $bytes = [Text.Encoding]::UTF8.GetBytes(("{`"products`":$productsJson,`"revision`":$revision}"))
        $res.StatusCode = 200
        $res.ContentType = "application/json; charset=utf-8"
        $res.Headers["Cache-Control"] = "no-cache"
        $res.Headers["ETag"] = $etag
        $res.Headers["X-Catalog-Revision"] = "$revision"
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
        $res.Close()
        continue
      }

      if ($path -eq "/api/products" -and $method -eq "PUT") {
        if (-not (Test-AdminAuth $req)) {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Unauthorized" }
          continue
        }
        try {
          $body = Read-JsonBody $req 2097152
        } catch [System.IO.InvalidDataException] {
          Write-JsonResponse $res 413 @{ ok = $false; error = "Payload too large" }
          continue
        }
        $incoming = @(Ensure-Array $body.products)
        $next = @()
        foreach ($item in $incoming) {
          $normalized = Normalize-Product $item
          if ($normalized) { $next += ,$normalized }
        }
        if (-not $next.Count -and -not [bool]$body.allowEmpty) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Catalog cannot be empty" }
          continue
        }
        $overwriteStock = [bool]$body.overwriteStock -or ($body.preserveStock -eq $false)
        $stockOverrides = @()
        foreach ($id in @(Ensure-Array $body.stockOverrides)) {
          $clean = ([string]$id).Trim()
          if ($clean) { $stockOverrides += ,$clean }
        }
        try {
          if ($overwriteStock) {
            $savedProducts = @(Save-ProductsList -Products $next -OverwriteStock -StockOverrides $stockOverrides -AllowEmpty:([bool]$body.allowEmpty))
          } else {
            $savedProducts = @(Save-ProductsList -Products $next -StockOverrides $stockOverrides -AllowEmpty:([bool]$body.allowEmpty))
          }
        } catch {
          Write-JsonResponse $res 400 @{ ok = $false; error = ([string]$_.Exception.Message) }
          continue
        }
        $productsJson = ConvertTo-JsonArray $savedProducts
        Write-RawJsonResponse $res 200 ("{`"ok`":true,`"products`":$productsJson}")
        continue
      }

      if ($path -eq "/api/orders" -and $method -eq "GET") {
        if (-not (Test-AdminAuth $req)) {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Unauthorized" }
          continue
        }
        $limit = 500
        $offset = 0
        try {
          if ($req.QueryString["limit"]) { $limit = [math]::Max(1, [math]::Min(5000, [int]$req.QueryString["limit"])) }
        } catch { $limit = 500 }
        try {
          if ($req.QueryString["offset"]) { $offset = [math]::Max(0, [int]$req.QueryString["offset"]) }
        } catch { $offset = 0 }
        $page = Get-OrdersList -Limit $limit -Offset $offset
        $ordersJson = ConvertTo-JsonArray $page.Orders
        $total = [int]$page.Total
        Write-RawJsonResponse $res 200 ("{`"orders`":$ordersJson,`"total`":$total,`"limit`":$limit,`"offset`":$offset}")
        continue
      }

      if ($path -eq "/api/orders" -and $method -eq "POST") {
        if (-not (Test-OrderRate)) {
          Write-JsonResponse $res 429 @{ ok = $false; error = "Too many requests" }
          continue
        }
        try {
          $body = Read-JsonBody $req 65536
        } catch [System.IO.InvalidDataException] {
          Write-JsonResponse $res 413 @{ ok = $false; error = "Payload too large" }
          continue
        }
        if (-not $body) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Empty body" }
          continue
        }
        $order = $body.order
        if (-not $order) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Missing order" }
          continue
        }
        $name = ([string]$order.customer.name).Trim()
        if ($name.Length -gt 80) { $name = $name.Substring(0, 80) }
        $phone = Normalize-PhoneDigits ([string]$order.customer.phone)
        if ($name.Length -lt 2 -or $phone -notmatch '^7\d{10}$') {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Name and phone required" }
          continue
        }
        $isBooking = ([string]$order.kind -eq "booking") -or ([string]$order.channel -eq "booking")
        $channel = if ($isBooking) { "booking" } elseif ([string]$order.channel -eq "telegram") { "telegram" } else { "whatsapp" }
        $id = ([string]$order.id).Trim()
        if (-not (Test-ClientOrderId -Id $id -Kind $(if ($isBooking) { "booking" } else { "order" }))) {
          $id = New-SecureOrderId -Kind $(if ($isBooking) { "booking" } else { "order" })
        }

        $catalog = @(Get-ProductsList)
        $catalogMap = @{}
        foreach ($product in $catalog) {
          $catalogMap[[string]$product.id] = $product
        }

        $bookingDate = ""
        $bookingTime = ""
        $bookingProcedure = ""
        $bookingNote = ""
        if ($isBooking) {
          $bookingDate = ([string]$order.booking.date).Trim()
          $bookingTime = ([string]$order.booking.time).Trim()
          $bookingProcedure = ([string]$order.booking.procedure).Trim()
          $bookingNote = ([string]$order.booking.note).Trim()
          if ($bookingNote.Length -gt 200) { $bookingNote = $bookingNote.Substring(0, 200) }
          if (-not $bookingDate -or -not $bookingTime -or -not $bookingProcedure) {
            Write-JsonResponse $res 400 @{ ok = $false; error = "Procedure, date and time required" }
            continue
          }
          if ($bookingTimeSlots -notcontains $bookingTime) {
            Write-JsonResponse $res 400 @{ ok = $false; error = "Invalid date or time" }
            continue
          }
          if (-not (Test-BookingDateValid -IsoDate $bookingDate -IsoTime $bookingTime)) {
            Write-JsonResponse $res 400 @{ ok = $false; error = "Invalid date or time" }
            continue
          }
          $procedureOk = $false
          if ($bookingProcedureNames -contains $bookingProcedure) { $procedureOk = $true }
          foreach ($product in $catalog) {
            if ([string]$product.type -eq "service" -and ([string]$product.name).Trim() -eq $bookingProcedure) {
              $procedureOk = $true
              break
            }
          }
          if (-not $procedureOk) {
            Write-JsonResponse $res 400 @{ ok = $false; error = "Unknown procedure" }
            continue
          }
        }

        $items = @()
        if ($isBooking) {
          # Bookings never carry shop lines or client prices — one fixed service row.
          $items += ,[ordered]@{
            id = "booking"
            type = "service"
            name = $bookingProcedure
            price = 0
            quantity = 1
            lineTotal = 0
          }
        } else {
          $rawItems = @(Ensure-Array $order.items)
          if ($rawItems.Count -gt 30) {
            Write-JsonResponse $res 400 @{ ok = $false; error = "Too many items" }
            continue
          }
          $rejectUnknown = $false
          foreach ($item in $rawItems) {
            $qty = 0
            try { $qty = [int]$item.quantity } catch { $qty = 0 }
            if ($qty -lt 1 -or $qty -gt 99) {
              Write-JsonResponse $res 400 @{ ok = $false; error = "Invalid quantity" }
              $rejectUnknown = $true
              break
            }

            $itemId = ([string]$item.id).Trim()
            $catalogItem = $null
            if ($itemId -and $catalogMap.ContainsKey($itemId)) {
              $catalogItem = $catalogMap[$itemId]
            }

            if (-not $catalogItem) {
              Write-JsonResponse $res 400 @{ ok = $false; error = "Unknown product" }
              $rejectUnknown = $true
              break
            }

            $price = [int]$catalogItem.price
            $itemName = ([string]$catalogItem.name).Trim()
            $itemType = if ([string]$catalogItem.type -eq "service") { "service" } else { "product" }

            $items += ,[ordered]@{
              id = $itemId
              type = $itemType
              name = $itemName
              price = [int]$price
              quantity = $qty
              lineTotal = [int]($price * $qty)
            }
          }
          if ($rejectUnknown) { continue }
        }
        if (-not $items.Count) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Empty order" }
          continue
        }
        $total = 0
        foreach ($entry in $items) {
          $total += [int]$entry.lineTotal
        }
        $phoneDisplay = Format-PhoneDisplayRu $phone
        $saved = [ordered]@{
          id = $id
          createdAt = (Get-Date).ToUniversalTime().ToString("o")
          status = "new"
          kind = if ($isBooking) { "booking" } else { "order" }
          channel = $channel
          customer = [ordered]@{
            name = $name
            phone = $phone
            phoneDisplay = $phoneDisplay
          }
          items = @($items)
          total = [int]$total
          currency = "RUB"
        }
        if ($isBooking) {
          $saved.booking = [ordered]@{
            procedure = $bookingProcedure
            date = $bookingDate
            time = $bookingTime
            note = $bookingNote
          }
        }

        if (-not (Ensure-DbUp)) {
          Write-JsonResponse $res 503 @{ ok = $false; error = "Database unavailable"; orderId = $id }
          continue
        }
        try {
          $dbResult = Save-OrderRecord $saved
        } catch {
          Write-Output ("ORDER_SAVE_UNCERTAIN id={0}: {1}" -f $id, $_.Exception.Message)
          Write-JsonResponse $res 503 @{ ok = $false; error = "Order service unavailable, retry with same id"; orderId = $id }
          continue
        }
        Clear-ProductsListCache
        if ([int]$dbResult.StatusCode -eq 409) {
          $errCode = if ($dbResult.Data -and $dbResult.Data.error) { [string]$dbResult.Data.error } else { "Slot already booked" }
          $payload409 = @{ ok = $false; error = $errCode }
          if ($dbResult.Data.productId) { $payload409.productId = [string]$dbResult.Data.productId }
          if ($null -ne $dbResult.Data.available) { $payload409.available = $dbResult.Data.available }
          Write-JsonResponse $res 409 $payload409
          continue
        }
        if ([int]$dbResult.StatusCode -eq 400) {
          $errText = if ($dbResult.Data -and $dbResult.Data.error) { [string]$dbResult.Data.error } else { "Invalid data" }
          Write-JsonResponse $res 400 @{ ok = $false; error = $errText }
          continue
        }
        if ([int]$dbResult.StatusCode -eq 503) {
          $errText = if ($dbResult.Data -and $dbResult.Data.error) { [string]$dbResult.Data.error } else { "Database unavailable" }
          Write-JsonResponse $res 503 @{ ok = $false; error = $errText; orderId = $id }
          continue
        }
        if ([int]$dbResult.StatusCode -lt 200 -or [int]$dbResult.StatusCode -ge 300 -or -not $dbResult.Data -or -not $dbResult.Data.order) {
          $errText = if ($dbResult.Data -and $dbResult.Data.error) { [string]$dbResult.Data.error } else { "Server error" }
          Write-JsonResponse $res 500 @{ ok = $false; error = $errText; orderId = $id }
          continue
        }
        $saved = $dbResult.Data.order
        $idempotentHit = [bool]$dbResult.Data.idempotent

        # Persist status and Telegram notify are independent. Never force true on idempotent replay.
        $telegramOk = $false
        if ($idempotentHit) {
          $prevNotify = Get-TelegramNotified ([string]$saved.id)
          if ($null -ne $prevNotify) {
            $telegramOk = [bool]$prevNotify
          } else {
            # Unknown legacy order — do not claim success; queue a retry best-effort.
            $telegramOk = $false
            Add-TelegramOutbox $saved
          }
        } else {
          try {
            $telegramOk = [bool](Send-TelegramOrderNotify $saved)
          } catch {
            Write-Output ("TELEGRAM_NOTIFY_EXCEPTION order={0}: {1}" -f $saved.id, $_.Exception.Message)
            $telegramOk = $false
          }
          Set-TelegramNotified -OrderId ([string]$saved.id) -Ok $telegramOk
          if (-not $telegramOk) {
            Add-TelegramOutbox $saved
          }
        }
        $orderJson = ConvertTo-Json -InputObject $saved -Depth 40 -Compress
        $tgJson = if ($telegramOk) { "true" } else { "false" }
        $statusCode = if ($idempotentHit) { 200 } else { 201 }
        $idempotentJson = if ($idempotentHit) { "true" } else { "false" }
        $productsPart = ""
        if ($dbResult.Data.products) {
          $productsJson = ConvertTo-JsonArray (Ensure-Array $dbResult.Data.products | ForEach-Object { Normalize-Product $_ } | Where-Object { $_ })
          $productsPart = ",`"products`":$productsJson"
        }
        $revisionPart = ""
        try {
          if ($null -ne $dbResult.Data.revision) {
            $revisionPart = ",`"revision`":$([int]$dbResult.Data.revision)"
          }
        } catch { $revisionPart = "" }
        Write-RawJsonResponse $res $statusCode ("{`"ok`":true,`"telegramNotify`":$tgJson,`"idempotent`":$idempotentJson,`"order`":$orderJson$productsPart$revisionPart}")
        continue
      }

      if ($path -eq "/api/orders" -and $method -eq "PATCH") {
        if (-not (Test-AdminAuth $req)) {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Unauthorized" }
          continue
        }
        $body = Read-JsonBody $req
        $orderId = [string]$body.id
        $status = [string]$body.status
        $allowed = @("new", "in_progress", "done", "cancelled")
        if (-not $orderId -or ($allowed -notcontains $status)) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Invalid data" }
          continue
        }
        $patchResult = Update-OrderRecord -Id $orderId -Status $status
        if ([int]$patchResult.StatusCode -eq 404) {
          Write-JsonResponse $res 404 @{ ok = $false; error = "Order not found" }
          continue
        }
        if ([int]$patchResult.StatusCode -eq 409) {
          $errText = if ($patchResult.Data -and $patchResult.Data.error) { [string]$patchResult.Data.error } else { "Insufficient stock" }
          Write-JsonResponse $res 409 @{ ok = $false; error = $errText }
          continue
        }
        if ([int]$patchResult.StatusCode -ne 200 -or -not $patchResult.Data -or -not $patchResult.Data.order) {
          Write-JsonResponse $res 500 @{ ok = $false; error = "Server error" }
          continue
        }
        Clear-ProductsListCache
        $orderJson = ConvertTo-Json -InputObject $patchResult.Data.order -Depth 40 -Compress
        $productsPart = ""
        if ($patchResult.Data.products) {
          $productsJson = ConvertTo-JsonArray (Ensure-Array $patchResult.Data.products | ForEach-Object { Normalize-Product $_ } | Where-Object { $_ })
          $productsPart = ",`"products`":$productsJson"
        }
        $revisionPart = ""
        try {
          if ($null -ne $patchResult.Data.revision) {
            $revisionPart = ",`"revision`":$([int]$patchResult.Data.revision)"
          }
        } catch { $revisionPart = "" }
        Write-RawJsonResponse $res 200 ("{`"ok`":true,`"order`":$orderJson$productsPart$revisionPart}")
        continue
      }

      if ($path -eq "/api/orders" -and $method -eq "DELETE") {
        if (-not (Test-AdminAuth $req)) {
          Write-JsonResponse $res 401 @{ ok = $false; error = "Unauthorized" }
          continue
        }
        $orderId = $req.QueryString["id"]
        if (-not $orderId) {
          $body = Read-JsonBody $req
          $orderId = [string]$body.id
        }
        if (-not $orderId) {
          Write-JsonResponse $res 400 @{ ok = $false; error = "Missing id" }
          continue
        }
        $deleteResult = Remove-OrderRecord -Id $orderId
        if ([int]$deleteResult.StatusCode -ne 200) {
          Write-JsonResponse $res 500 @{ ok = $false; error = "Server error" }
          continue
        }
        Clear-ProductsListCache
        $productsPart = ""
        if ($deleteResult.Data -and $deleteResult.Data.products) {
          $productsJson = ConvertTo-JsonArray (Ensure-Array $deleteResult.Data.products | ForEach-Object { Normalize-Product $_ } | Where-Object { $_ })
          $productsPart = ",`"products`":$productsJson"
        }
        $revisionPart = ""
        try {
          if ($deleteResult.Data -and $null -ne $deleteResult.Data.revision) {
            $revisionPart = ",`"revision`":$([int]$deleteResult.Data.revision)"
          }
        } catch { $revisionPart = "" }
        Write-RawJsonResponse $res 200 ("{`"ok`":true$productsPart$revisionPart}")
        continue
      }

      if ($path.StartsWith("/api/")) {
        Write-JsonResponse $res 404 @{ ok = $false; error = "Not found" }
        continue
      }

      if (-not (Test-Path -LiteralPath (Join-Path $staticRoot "index.html"))) {
        Write-TextResponse $res 503 "Frontend is not built. Run: cd frontend; npm install; npm run build"
        continue
      }

      $rel = $path.TrimStart("/")
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }
      $rel = $rel.Replace("/", [System.IO.Path]::DirectorySeparatorChar)

      $full = [System.IO.Path]::GetFullPath((Join-Path $staticRoot $rel))
      if (-not $full.StartsWith($staticRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
        Write-TextResponse $res 403 "Forbidden"
        continue
      }

      if (Is-BlockedPath $full) {
        Write-TextResponse $res 404 "Not found"
        continue
      }

      if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
        Write-TextResponse $res 404 "Not found"
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($full)
      $res.StatusCode = 200
      Set-SecurityHeaders $res
      if ($ext -eq ".html") {
        $res.Headers["Cache-Control"] = "no-cache"
      } elseif ($ext -eq ".js" -or $ext -eq ".css" -or $ext -eq ".woff2" -or $ext -eq ".png" -or $ext -eq ".jpg" -or $ext -eq ".webp" -or $ext -eq ".svg") {
        $res.Headers["Cache-Control"] = "public, max-age=86400"
      }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      Write-Output ("{0} {1}" -f $method, $path)
    } catch {
      try {
        Write-JsonResponse $res 500 @{ ok = $false; error = "Server error" }
      } catch {
        try { $res.Close() } catch {}
      }
      Write-Output ("ERROR {0} {1}: {2}" -f $method, $path, $_.Exception.Message)
    }
  }
} finally {
  try { Complete-ChatJobs -Wait -WaitMs 3000 } catch {}
  if ($script:chatPool) {
    try { $script:chatPool.Close() } catch {}
    try { $script:chatPool.Dispose() } catch {}
    $script:chatPool = $null
  }
  Stop-AiCore
  Stop-PdfCore
  Stop-DbCore
  if ($listener -and $listener.IsListening) { $listener.Stop() }
  if ($listener) { $listener.Close() }
}
