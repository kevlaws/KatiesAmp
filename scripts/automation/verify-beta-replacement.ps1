param(
    [Parameter(Mandatory = $true)]
    [string]$PreviousInstallerPath,

    [Parameter(Mandatory = $true)]
    [string]$ManifestName,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$previousInstaller = [IO.Path]::GetFullPath($PreviousInstallerPath)
if (-not (Test-Path -LiteralPath $previousInstaller)) {
    throw "Previous beta installer not found at $previousInstaller"
}

$manifestPath = Join-Path $PWD "dist/$ManifestName"
$installerEntry = Select-String -LiteralPath $manifestPath -Pattern '^path:\s*(.+)$' |
    Select-Object -First 1
if (-not $installerEntry) {
    throw "$ManifestName does not identify the replacement installer."
}

$installerName = $installerEntry.Matches[0].Groups[1].Value.Trim("'", '"')
$replacementInstaller = [IO.Path]::GetFullPath((Join-Path $PWD "dist/$installerName"))
if (-not (Test-Path -LiteralPath $replacementInstaller)) {
    throw "Replacement beta installer not found at $replacementInstaller"
}

$testRoot = Join-Path ([IO.Path]::GetTempPath()) 'KatiesAmpBetaReplacementTests'
$installDirectory = Join-Path $testRoot ([guid]::NewGuid().ToString('N'))
$resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
$resolvedInstallDirectory = [IO.Path]::GetFullPath($installDirectory)
if (-not $resolvedInstallDirectory.StartsWith($resolvedTestRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The temporary install path escaped the beta replacement test directory.'
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
$application = $null

try {
    $previousProcess = Start-Process -FilePath $previousInstaller -ArgumentList '/S', "/D=$installDirectory" -PassThru -Wait -WindowStyle Hidden
    if ($previousProcess.ExitCode -ne 0) {
        throw "The previous beta installer exited with code $($previousProcess.ExitCode)."
    }

    $applicationPath = Join-Path $installDirectory 'KatiesAmp.exe'
    if (-not (Test-Path -LiteralPath $applicationPath)) {
        throw "The previous beta installer did not create $applicationPath"
    }
    $previousVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($applicationPath).FileVersion

    $replacementProcess = Start-Process -FilePath $replacementInstaller -ArgumentList '/S', "/D=$installDirectory" -PassThru -Wait -WindowStyle Hidden
    if ($replacementProcess.ExitCode -ne 0) {
        throw "The replacement beta installer exited with code $($replacementProcess.ExitCode)."
    }

    $installedVersion = [Diagnostics.FileVersionInfo]::GetVersionInfo($applicationPath).FileVersion
    if ($installedVersion -ne $ExpectedVersion) {
        throw "Expected replacement version $ExpectedVersion but installed executable reports $installedVersion."
    }
    if ($installedVersion -eq $previousVersion) {
        throw "Beta replacement left the application at $previousVersion."
    }

    $env:DISABLE_AUTO_UPDATES = '1'
    $application = Start-Process -FilePath $applicationPath -ArgumentList '--disable-gpu' -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 8
    if ($application.HasExited) {
        throw "The replaced application exited with code $($application.ExitCode)."
    }
} finally {
    if ($application -and -not $application.HasExited) {
        Stop-Process -Id $application.Id -Force
    }

    $uninstallerPath = Join-Path $installDirectory 'Uninstall KatiesAmp.exe'
    if (Test-Path -LiteralPath $uninstallerPath) {
        $uninstaller = Start-Process -FilePath $uninstallerPath -ArgumentList '/S' -PassThru -Wait -WindowStyle Hidden
        if ($uninstaller.ExitCode -ne 0) {
            Write-Warning "The uninstaller exited with code $($uninstaller.ExitCode)."
        }
    }

    if (Test-Path -LiteralPath $installDirectory) {
        Remove-Item -LiteralPath $installDirectory -Recurse -Force
    }
}

Write-Host "Verified beta replacement from $previousVersion to $installedVersion."
