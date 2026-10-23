# Build once after changing the native tray source; normal dev startup uses the bundled binary.
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$installation) { throw 'Install Visual Studio C++ build tools and the Windows SDK to rebuild the tray.' }
$toolVersion = (Get-Content (Join-Path $installation 'VC/Auxiliary/Build/Microsoft.VCToolsVersion.default.txt')).Trim()
$toolRoot = Join-Path $installation "VC/Tools/MSVC/$toolVersion"
$sdkRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits/10'
$sdkVersion = Get-ChildItem (Join-Path $sdkRoot 'Include') -Directory |
    Where-Object { Test-Path (Join-Path $_.FullName 'um/Windows.h') } |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty Name
if (!$sdkVersion) { throw 'Windows SDK headers were not found.' }
$source = Join-Path $projectRoot 'server/desktop'
$temporary = Join-Path $projectRoot '.tmp/tray-build'
$output = Join-Path $source 'bin'
New-Item -ItemType Directory -Force $temporary, $output | Out-Null
$resource = Join-Path $temporary 'systemTray.res'
$compiler = Join-Path $toolRoot 'bin/Hostx64/x64/cl.exe'
$resourceCompiler = Join-Path $sdkRoot "bin/$sdkVersion/x64/rc.exe"
& $resourceCompiler /nologo "/I$source" /fo $resource (Join-Path $source 'systemTray.rc')
if ($LASTEXITCODE -ne 0) { throw 'Tray resource compilation failed.' }
& $compiler /nologo /W4 /WX /O2 /MT /DUNICODE /D_UNICODE `
    "/I$toolRoot/include" "/I$sdkRoot/Include/$sdkVersion/ucrt" `
    "/I$sdkRoot/Include/$sdkVersion/shared" "/I$sdkRoot/Include/$sdkVersion/um" `
    (Join-Path $source 'systemTray.c') (Join-Path $source 'monitorBrowser.c') $resource "/Fo$temporary/" `
    "/Fe$temporary/systemTray-win32-x64.exe" /link /SUBSYSTEM:WINDOWS /INCREMENTAL:NO /Brepro `
    "/LIBPATH:$toolRoot/lib/x64" "/LIBPATH:$sdkRoot/Lib/$sdkVersion/ucrt/x64" `
    "/LIBPATH:$sdkRoot/Lib/$sdkVersion/um/x64" user32.lib shell32.lib shlwapi.lib advapi32.lib
if ($LASTEXITCODE -ne 0) { throw 'Tray compilation failed.' }
Copy-Item -LiteralPath (Join-Path $temporary 'systemTray-win32-x64.exe') -Destination $output -Force
