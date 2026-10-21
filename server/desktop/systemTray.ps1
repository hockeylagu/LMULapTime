param([Parameter(Mandatory = $true)][string]$WebsiteUrl)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Draw a small telemetry gauge that stays legible at notification-area sizes.
# DestroyIcon releases the native handle created by Bitmap.GetHicon().
Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
public static class TrayIconHandle {
    [DllImport("user32.dll")]
    public static extern bool DestroyIcon(IntPtr handle);
    public static Task WaitForServer() {
        return Task.Run(() => Console.In.ReadLine());
    }
}
'@

$bitmap = New-Object System.Drawing.Bitmap(32, 32)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$background = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(15, 23, 42))
$accent = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(56, 189, 248), 3)
$needle = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 2)
$graphics.FillEllipse($background, 0, 0, 31, 31)
$graphics.DrawArc($accent, 5, 5, 21, 21, 135, 270)
$graphics.DrawLine($needle, 16, 17, 24, 9)
$iconHandle = $bitmap.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($iconHandle)
$tray = New-Object System.Windows.Forms.NotifyIcon
$menu = New-Object System.Windows.Forms.ContextMenuStrip
$timer = New-Object System.Windows.Forms.Timer

try {
    $tray.Icon = $icon
    $tray.Text = 'LMU Lap Time Analyzer'
    $open = $menu.Items.Add('Open LMU Lap Time Analyzer')
    $open.Add_Click({ Start-Process -FilePath $WebsiteUrl })
    $tray.ContextMenuStrip = $menu
    $tray.Add_DoubleClick({ Start-Process -FilePath $WebsiteUrl })

    # A pending read completes on EOF even after a crash or tsx watch restart.
    # No polling of HTTP endpoints or access to the application's databases.
    $serverLifetime = [TrayIconHandle]::WaitForServer()
    $timer.Interval = 500
    $timer.Add_Tick({
        if ($serverLifetime.IsCompleted) {
            [System.Windows.Forms.Application]::ExitThread()
        }
    })
    $timer.Start()
    $tray.Visible = $true
    [System.Windows.Forms.Application]::Run()
} finally {
    $timer.Stop()
    $tray.Visible = $false
    $tray.Dispose()
    $menu.Dispose()
    $timer.Dispose()
    $icon.Dispose()
    [void][TrayIconHandle]::DestroyIcon($iconHandle)
    $needle.Dispose()
    $accent.Dispose()
    $background.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
}
