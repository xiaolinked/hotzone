Add-Type -AssemblyName System.Drawing
$imgPath = "C:\Users\leonx\.gemini\antigravity\brain\71a09125-650f-491f-8ed4-689cfb563727\terraria_pixel_pistol_1772856550282.png"
if (-Not (Test-Path $imgPath)) {
    Write-Host "File not found"
    Exit
}
$img = [System.Drawing.Image]::FromFile($imgPath)
$bmp = New-Object System.Drawing.Bitmap($img)
$img.Dispose()

$w = $bmp.Width
$h = $bmp.Height

# Simple magenta background removal
for ($x = 0; $x -lt $w; $x++) {
    for ($y = 0; $y -lt $h; $y++) {
        $pixel = $bmp.GetPixel($x, $y)
        # Magenta is usually R=255, G=0, B=255. Allow some tolerance due to AI generation.
        if ($pixel.R -gt 200 -and $pixel.B -gt 200 -and $pixel.G -lt 50) {
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
        } elseif ($pixel.R -gt 150 -and $pixel.B -gt 150 -and $pixel.G -lt 120) {
            # Attempt to anti-alias the edges that blend with magenta
            $alpha = $pixel.G * 2
            if ($alpha -gt 255) { $alpha = 255 }
            $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $pixel.R, $pixel.G, $pixel.B))
        }
    }
}

$outPath = "C:\Users\leonx\.gemini\antigravity\brain\71a09125-650f-491f-8ed4-689cfb563727\terraria_pixel_pistol_transparent.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "SUCCESS"
