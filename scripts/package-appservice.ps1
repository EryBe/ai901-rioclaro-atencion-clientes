param(
    [string]$OutputPath = '.azure\appservice-package.zip'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputFile = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $OutputPath))
$requiredItems = @(
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.server.json',
    'vite.config.ts',
    'index.html',
    'server',
    'src',
    'Datos',
    'dist'
)

foreach ($item in $requiredItems) {
    if (-not (Test-Path -LiteralPath (Join-Path $workspaceRoot $item))) {
        throw "Required deployment input is missing: $item"
    }
}

$outputDirectory = Split-Path -Parent $outputFile
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("rio-claro-appservice-" + [guid]::NewGuid().ToString('N'))
$temporaryZipFile = Join-Path ([System.IO.Path]::GetTempPath()) ("appservice-package-" + [guid]::NewGuid().ToString('N') + '.zip')
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

try {
    foreach ($item in $requiredItems) {
        $sourcePath = Join-Path $workspaceRoot $item
        $destinationPath = Join-Path $stagingDirectory $item
        Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse
    }

    Add-Type -AssemblyName System.IO.Compression
    $archiveStream = [System.IO.File]::Open(
        $temporaryZipFile,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None
    )
    $archive = [System.IO.Compression.ZipArchive]::new(
        $archiveStream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        Get-ChildItem -LiteralPath $stagingDirectory -File -Recurse | ForEach-Object {
            $entryName = $_.FullName.Substring($stagingDirectory.Length + 1).Replace('\', '/')
            $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
            $sourceStream = [System.IO.File]::OpenRead($_.FullName)
            $entryStream = $entry.Open()
            try {
                $sourceStream.CopyTo($entryStream)
            }
            finally {
                $entryStream.Dispose()
                $sourceStream.Dispose()
            }
        }
    }
    finally {
        $archive.Dispose()
        $archiveStream.Dispose()
    }

    Move-Item -LiteralPath $temporaryZipFile -Destination $outputFile -Force
    Write-Output "Created deployment package: $outputFile"
}
finally {
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
    if (Test-Path -LiteralPath $temporaryZipFile) {
        Remove-Item -LiteralPath $temporaryZipFile -Force
    }
}
