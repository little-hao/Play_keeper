param(
    [ValidateSet('Release', 'Debug')]
    [string]$Variant = 'Release',
    [string]$LogPath = (Join-Path $env:TEMP 'playkeeper-windows-build.log')
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fallbackJdk = Join-Path $env:TEMP 'playkeeper-microsoft-jdk17\jdk-17.0.20.1+1'
$fallbackSdk = Join-Path $env:TEMP 'playkeeper-android-sdk'

if (-not $env:JAVA_HOME -and (Test-Path -LiteralPath $fallbackJdk)) {
    $env:JAVA_HOME = $fallbackJdk
}
if (-not $env:ANDROID_HOME -and (Test-Path -LiteralPath $fallbackSdk)) {
    $env:ANDROID_HOME = $fallbackSdk
}
if (-not $env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
}
if (-not (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    throw 'JDK 17 not found. Set JAVA_HOME.'
}
if (-not (Test-Path -LiteralPath $env:ANDROID_HOME)) {
    throw 'Android SDK not found. Set ANDROID_HOME.'
}

$env:Path = "$(Join-Path $env:JAVA_HOME 'bin');$env:Path"
Set-Location -LiteralPath $projectRoot
$tasks = if ($Variant -eq 'Release') {
    @('testDebugUnitTest', 'assembleRelease')
} else {
    @('testDebugUnitTest', 'assembleDebug')
}
$ErrorActionPreference = 'Continue'
& .\gradlew.bat @tasks --no-daemon *>&1 | Tee-Object -FilePath $LogPath
$gradleExitCode = $LASTEXITCODE
exit $gradleExitCode
