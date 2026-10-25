<#
  Runs several variants of the page against each other, interleaved round by
  round so that whatever else the machine is doing lands on every arm alike,
  and prints the medians side by side.

    powershell -NoProfile -ExecutionPolicy Bypass -File tools/perf/ab.ps1 -Variants .\variants.psd1 -Config native -Rounds 3

  A variants file is a PowerShell data file: one entry per arm, each with any
  of Css (a stylesheet laid over the site's), Js (run before the page's own
  scripts) and Overrides (file name -> path of the copy to serve instead).

    @{ base = @{}; frost = @{ Js = "window.__glassForce = 'frost';" } }
#>
param(
    [Parameter(Mandatory)][string]$Variants,
    [ValidateSet('native', 'mac', 'lowend', 'phone')][string]$Config = 'native',
    [string[]]$Scenarios = @('scroll', 'idle-projects'),
    [int]$Rounds = 3,
    [string]$Label = 'ab'
)
$ErrorActionPreference = 'Stop'
$arms = Import-PowerShellDataFile $Variants
$names = @($arms.Keys | Sort-Object { if ($_ -eq 'base') { '' } else { $_ } })
$all = New-Object System.Collections.Generic.List[object]
for ($round = 1; $round -le $Rounds; $round++) {
    # Alternate the order each round as well, so no arm always runs first.
    $order = if ($round % 2) { $names } else { $names[($names.Count - 1)..0] }
    foreach ($name in $order) {
        $arm = $arms[$name]
        $overrides = if ($arm.Overrides) { $arm.Overrides } else { @{} }
        $output = & (Join-Path $PSScriptRoot 'bench.ps1') -Config $Config -Scenarios $Scenarios -Label "$Label-$name" `
            -InjectCss ([string]$arm.Css) -InjectJs ([string]$arm.Js) -Overrides $overrides 6>&1
        $output | Where-Object { "$_" -match '^\[' } | ForEach-Object { Write-Host "  r$round $name $_" }
        $dir = ($output | Where-Object { "$_" -match '^Results: ' } | Select-Object -Last 1) -replace '^Results: ', ''
        foreach ($row in (Get-Content -Raw (Join-Path $dir 'results.json') | ConvertFrom-Json)) {
            $row | Add-Member -NotePropertyName arm -NotePropertyValue $name -Force
            $row | Add-Member -NotePropertyName abRound -NotePropertyValue $round -Force
            $all.Add($row)
        }
    }
}
$median = { param($values) $v = @($values | Where-Object { $null -ne $_ } | ForEach-Object { [double]$_ } | Sort-Object); if ($v.Count -eq 0) { return $null }; if ($v.Count % 2) { $v[[int][math]::Floor($v.Count / 2)] } else { ($v[$v.Count / 2 - 1] + $v[$v.Count / 2]) / 2 } }
$metrics = 'droppedPct', 'droppedFrames', 'presentedFrames', 'mainFramesPerSec', 'mainFrameGapP90Ms', 'mainFrameGapMaxMs', 'missingContentFrames', 'fps', 'frameP95Ms', 'frameP99Ms', 'frameMaxMs', 'mainTaskMsPerSec', 'styleMsPerSec', 'longTasks', 'cpu_page', 'cpu_GPU', 'gpu3d', 'busyPct_gpu:CrGpuMain', 'gpuMsPerSec_composite', 'gpuMsPerSec_canvas', 'gpuMsPerSec_tiles', 'gpuMsPerSec_swap'
$table = New-Object System.Collections.Generic.List[string]
foreach ($scenario in $Scenarios) {
    $table.Add("### $scenario ($Config, median of $Rounds)")
    $table.Add("| metric | $($names -join ' | ') |")
    $table.Add("| --- | $(($names | ForEach-Object { '---' }) -join ' | ') |")
    foreach ($metric in $metrics) {
        $cells = foreach ($name in $names) {
            $m = & $median ($all | Where-Object { $_.arm -eq $name -and $_.scenario -eq $scenario } | ForEach-Object { $_.$metric })
            if ($null -eq $m) { '-' } else { '{0:0.##}' -f $m }
        }
        $table.Add("| $metric | $($cells -join ' | ') |")
    }
    $table.Add('')
}
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$file = Join-Path $repo "tools\.cache\perf\$Label-$Config-$(Get-Date -Format 'yyyyMMdd-HHmmss').md"
$table | Set-Content -Encoding UTF8 $file
$all | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 ($file -replace '\.md$', '.json')
$table
"Saved: $file"
