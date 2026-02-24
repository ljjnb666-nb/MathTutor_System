$source = "C:\Users\LJJ2004\PycharmProjects\PythonProject\家教"
$dest = "C:\Users\LJJ2004\Desktop\家教.zip"

Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $dest) { Remove-Item $dest }

$files = Get-ChildItem -Path $source -Recurse -File | Where-Object { $_.FullName -notmatch '__pycache__|\.git|node_modules|\.pyc' }
$total = $files.Count
$count = 0

$archive = [System.IO.Compression.ZipFile]::Open($dest, [System.IO.Compression.ZipArchiveMode]::Create)

foreach ($file in $files) {
    $relativePath = $file.FullName.Substring($source.Length + 1)
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relativePath, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    $count++
    Write-Host "$count / $total"
}

$archive.Dispose()
Write-Host "Done!"
