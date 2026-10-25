<#
  A small Chrome DevTools Protocol client for measuring the site, in Windows
  PowerShell 5.1 with nothing to install. bench.ps1 drives it; see README.md
  in this folder for what it measures and how to read the numbers.

  Every helper stops on the first error: a receive loop left running on a dead
  socket otherwise spins a core for as long as the shell stays open.
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Web.Extensions

$script:Serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
$script:Serializer.MaxJsonLength = [int]::MaxValue
$script:Serializer.RecursionLimit = 512

function ConvertFrom-CdpJson { param([string]$Text) $script:Serializer.DeserializeObject($Text) }
function ConvertTo-CdpJson { param($Value) $script:Serializer.Serialize($Value) }

$script:ChromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'

# ---- Chrome -----------------------------------------------------------------
function Start-BenchChrome {
    param(
        [int]$Port = 9333,
        [Parameter(Mandatory)][string]$ProfileDir,
        [int]$WindowWidth = 1500,
        [int]$WindowHeight = 1100,
        # 0 keeps the display's own scale; 2 stands in for a Retina MacBook.
        [double]$ScaleFactor = 0,
        [string[]]$ExtraFlags = @(),
        # Off the left of the screen, so a run never covers the desktop.
        [int]$X = -3600,
        [int]$Y = 0
    )
    $flags = @(
        "--remote-debugging-port=$Port", "--user-data-dir=`"$ProfileDir`"",
        '--no-first-run', '--no-default-browser-check', '--disable-extensions',
        '--disable-component-update', '--disable-sync', '--disable-default-apps',
        '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
        '--disable-background-timer-throttling', '--disable-ipc-flooding-protection',
        '--disable-features=CalculateNativeWinOcclusion,Translate,MediaRouter,OptimizationHints,InterestFeedContentSuggestions',
        "--window-position=$X,$Y", "--window-size=$WindowWidth,$WindowHeight"
    )
    if ($ScaleFactor -gt 0) { $flags += "--force-device-scale-factor=$ScaleFactor" }
    # An empty list handed over from an `if` arrives as $null.
    $flags += @($ExtraFlags | Where-Object { $_ })
    $flags += 'about:blank'
    $process = Start-Process -FilePath $script:ChromePath -ArgumentList $flags -PassThru
    $deadline = [DateTime]::UtcNow.AddSeconds(20)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $version = Invoke-RestMethod -UseBasicParsing "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
            return [pscustomobject]@{ Process = $process; Port = $Port; BrowserWs = $version.webSocketDebuggerUrl; Version = $version.Browser }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    throw "Chrome did not open its debugging port $Port"
}

# A Chrome started earlier (by another shell) and still running.
function Connect-BenchChrome {
    param([int]$Port = 9333)
    $version = Invoke-RestMethod -UseBasicParsing "http://127.0.0.1:$Port/json/version" -TimeoutSec 5
    $session = Connect-Cdp $version.webSocketDebuggerUrl
    $info = Invoke-Cdp $session 'SystemInfo.getProcessInfo'
    $browserPid = [int](@($info['processInfo'] | Where-Object { $_['type'] -eq 'browser' })[0]['id'])
    $session.Socket.Dispose()
    [pscustomobject]@{ Process = (Get-Process -Id $browserPid); Port = $Port; BrowserWs = $version.webSocketDebuggerUrl; Version = $version.Browser }
}

function Stop-BenchChrome {
    param($Chrome)
    if (-not $Chrome) { return }
    try { Invoke-Cdp $script:LastSession 'Browser.close' @{} -TimeoutMs 3000 | Out-Null } catch { }
    Start-Sleep -Milliseconds 500
    try { if (-not $Chrome.Process.HasExited) { Stop-Process -Id $Chrome.Process.Id -Force } } catch { }
}

# ---- The socket ---------------------------------------------------------------
function Connect-Cdp {
    param([Parameter(Mandatory)][string]$Url)
    $socket = New-Object System.Net.WebSockets.ClientWebSocket
    $socket.Options.KeepAliveInterval = [TimeSpan]::FromSeconds(20)
    # PowerShell sees a plain Task as Task<VoidTaskResult> and would hand
    # that result back as output.
    [void]$socket.ConnectAsync([Uri]$Url, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $session = @{
        Socket = $socket; Id = 0; Pending = $null
        Buffer = New-Object byte[] (4MB); Stream = New-Object System.IO.MemoryStream
        Events = New-Object System.Collections.Generic.List[object]
        # method -> scriptblock(session, message), run as the event arrives
        # (Fetch.requestPaused has to be answered while the page waits on it).
        Handlers = @{}
    }
    $script:LastSession = $session
    $session
}

# A receive that times out is left pending and picked up by the next call:
# cancelling a ClientWebSocket receive aborts the whole socket.
function Receive-CdpMessage {
    param($Session, [int]$TimeoutMs)
    while ($true) {
        if (-not $Session.Pending) {
            $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList (, $Session.Buffer)
            $Session.Pending = $Session.Socket.ReceiveAsync($segment, [Threading.CancellationToken]::None)
        }
        if (-not $Session.Pending.Wait([Math]::Max(0, $TimeoutMs))) { return $null }
        $result = $Session.Pending.Result
        $Session.Pending = $null
        if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) { throw 'The DevTools socket closed' }
        $Session.Stream.Write($Session.Buffer, 0, $result.Count)
        if ($result.EndOfMessage) {
            $text = [Text.Encoding]::UTF8.GetString($Session.Stream.GetBuffer(), 0, [int]$Session.Stream.Length)
            $Session.Stream.SetLength(0)
            $message = ConvertFrom-CdpJson $text
            if ($message.ContainsKey('method') -and $Session.Handlers.ContainsKey($message['method'])) {
                & $Session.Handlers[$message['method']] $Session $message
                continue
            }
            return $message
        }
    }
}

function Send-CdpRaw {
    param($Session, [string]$Method, $Params, [string]$SessionId)
    $Session.Id += 1
    $message = @{ id = $Session.Id; method = $Method; params = $(if ($null -eq $Params) { @{} } else { $Params }) }
    if ($SessionId) { $message.sessionId = $SessionId }
    $bytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-CdpJson $message))
    $segment = New-Object 'System.ArraySegment[byte]' -ArgumentList (, $bytes)
    [void]$Session.Socket.SendAsync($segment, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    $Session.Id
}

function Invoke-Cdp {
    param($Session, [string]$Method, $Params = @{}, [string]$SessionId, [int]$TimeoutMs = 60000)
    $id = Send-CdpRaw $Session $Method $Params $SessionId
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ($true) {
        $left = [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds
        if ($left -le 0) { throw "DevTools call timed out: $Method" }
        $message = Receive-CdpMessage $Session $left
        if ($null -eq $message) { continue }
        if ($message.ContainsKey('id') -and [int]$message['id'] -eq $id) {
            if ($message.ContainsKey('error')) { throw "DevTools error in ${Method}: $($message['error']['message'])" }
            return $message['result']
        }
        if ($message.ContainsKey('method')) { $Session.Events.Add($message) }
    }
}

# Waits for an event (already queued, or still to come) and takes it off the queue.
function Wait-CdpEvent {
    param($Session, [string]$Method, [int]$TimeoutMs = 30000, [scriptblock]$Where = { $true })
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ($true) {
        for ($i = 0; $i -lt $Session.Events.Count; $i++) {
            $event = $Session.Events[$i]
            if ($event['method'] -eq $Method -and (& $Where $event)) {
                $Session.Events.RemoveAt($i)
                return $event
            }
        }
        $left = [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds
        if ($left -le 0) { throw "Timed out waiting for $Method" }
        $message = Receive-CdpMessage $Session ([Math]::Min($left, 250))
        if ($null -ne $message -and $message.ContainsKey('method')) { $Session.Events.Add($message) }
    }
}

# Reads whatever has arrived, so events do not pile up unseen during a long run.
function Clear-CdpEvents {
    param($Session, [string]$Keep = '')
    while ($true) {
        $message = Receive-CdpMessage $Session 0
        if ($null -eq $message) { break }
        if ($Keep -and $message.ContainsKey('method') -and $message['method'] -like $Keep) { $Session.Events.Add($message) }
    }
    if (-not $Keep) { $Session.Events.Clear() }
}

# ---- A page ------------------------------------------------------------------------
# The first page target, attached through the browser's socket (flattened), so
# browser-wide calls -- tracing, window bounds, process times -- share the socket.
function Open-BenchPage {
    param($Chrome)
    $session = Connect-Cdp $Chrome.BrowserWs
    $targets = Invoke-Cdp $session 'Target.getTargets'
    $page = @($targets['targetInfos'] | Where-Object { $_['type'] -eq 'page' })[0]
    $attached = Invoke-Cdp $session 'Target.attachToTarget' @{ targetId = $page['targetId']; flatten = $true }
    $window = Invoke-Cdp $session 'Browser.getWindowForTarget' @{ targetId = $page['targetId'] }
    [pscustomobject]@{
        Session = $session; SessionId = $attached['sessionId']; TargetId = $page['targetId']; WindowId = $window['windowId']
    }
}

function Invoke-Page {
    param($Page, [string]$Method, $Params = @{}, [int]$TimeoutMs = 60000)
    Invoke-Cdp $Page.Session $Method $Params $Page.SessionId $TimeoutMs
}

# Serves the page a different copy of some of its files -- an instrumented
# build, or the other arm of an A/B -- without touching the working tree.
# Overrides maps a file name as the page requests it (portfolio.js) to a path
# on disk; the query string is ignored.
function Set-BenchOverrides {
    param($Page, [hashtable]$Overrides)
    if (-not $Overrides -or $Overrides.Count -eq 0) {
        $Page.Session.Handlers.Remove('Fetch.requestPaused')
        Invoke-Page $Page 'Fetch.disable' | Out-Null
        return
    }
    $bodies = @{}
    foreach ($name in $Overrides.Keys) { $bodies[$name] = [Convert]::ToBase64String([IO.File]::ReadAllBytes($Overrides[$name])) }
    $types = @{ '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'; '.html' = 'text/html; charset=utf-8' }
    # A closure resolves commands outside this module, so it carries its own.
    $send = ${function:Send-CdpRaw}
    $Page.Session.Handlers['Fetch.requestPaused'] = {
        param($session, $message)
        $params = $message['params']
        $path = ([Uri]$params['request']['url']).AbsolutePath.TrimStart('/')
        if ($path -eq '') { $path = 'index.html' }
        $extension = [IO.Path]::GetExtension($path)
        if ($bodies.ContainsKey($path)) {
            [void](& $send $session 'Fetch.fulfillRequest' @{
                requestId = $params['requestId']; responseCode = 200; body = $bodies[$path]
                responseHeaders = @(@{ name = 'Content-Type'; value = $types[$extension] }, @{ name = 'Cache-Control'; value = 'no-store' })
            } $message['sessionId'])
        } else {
            [void](& $send $session 'Fetch.continueRequest' @{ requestId = $params['requestId'] } $message['sessionId'])
        }
    }.GetNewClosure()
    $patterns = @($Overrides.Keys | ForEach-Object { @{ urlPattern = "*/$_*"; requestStage = 'Request' } })
    Invoke-Page $Page 'Fetch.enable' @{ patterns = $patterns } | Out-Null
}

# Evaluates an expression in the page and returns its value (awaited, by value).
function Invoke-PageJs {
    param($Page, [string]$Expression, [int]$TimeoutMs = 60000)
    $result = Invoke-Page $Page 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true; awaitPromise = $true } $TimeoutMs
    if ($result.ContainsKey('exceptionDetails')) {
        $details = $result['exceptionDetails']
        $text = if ($details.ContainsKey('exception') -and $details['exception'].ContainsKey('description')) { $details['exception']['description'] } else { $details['text'] }
        throw "Page script failed: $text"
    }
    $value = $result['result']
    if ($value.ContainsKey('value')) { return $value['value'] }
    $null
}

# Sizes the window so the page's viewport comes out at Width x Height CSS px.
function Set-BenchViewport {
    param($Page, [int]$Width, [int]$Height)
    for ($attempt = 0; $attempt -lt 4; $attempt++) {
        $inner = Invoke-PageJs $Page '[innerWidth, innerHeight]'
        $dw = $Width - [int]$inner[0]; $dh = $Height - [int]$inner[1]
        if ($dw -eq 0 -and $dh -eq 0) { return }
        $bounds = (Invoke-Cdp $Page.Session 'Browser.getWindowBounds' @{ windowId = $Page.WindowId })['bounds']
        Invoke-Cdp $Page.Session 'Browser.setWindowBounds' @{ windowId = $Page.WindowId; bounds = @{ width = [int]$bounds['width'] + $dw; height = [int]$bounds['height'] + $dh } } | Out-Null
        Start-Sleep -Milliseconds 400
    }
}

function Wait-PageReady {
    param($Page, [int]$TimeoutMs = 30000)
    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            if (Invoke-PageJs $Page "document.readyState === 'complete' && document.querySelectorAll('.project-card').length > 0") { return }
        } catch { }
        Start-Sleep -Milliseconds 200
    }
    throw 'The page never finished loading its projects'
}

# ---- Input -------------------------------------------------------------------------------
function Send-Mouse {
    param($Page, [string]$Type, [double]$X, [double]$Y, [string]$Button = 'none', [int]$Buttons = 0, [int]$ClickCount = 0)
    Invoke-Page $Page 'Input.dispatchMouseEvent' @{ type = $Type; x = $X; y = $Y; button = $Button; buttons = $Buttons; clickCount = $ClickCount; pointerType = 'mouse' } | Out-Null
}

function Send-Click {
    param($Page, [double]$X, [double]$Y)
    Send-Mouse $Page 'mouseMoved' $X $Y
    Send-Mouse $Page 'mousePressed' $X $Y 'left' 1 1
    Start-Sleep -Milliseconds 60
    Send-Mouse $Page 'mouseReleased' $X $Y 'left' 0 1
}

function Send-Key {
    param($Page, [string]$Key, [string]$Code, [int]$KeyCode)
    Invoke-Page $Page 'Input.dispatchKeyEvent' @{ type = 'keyDown'; key = $Key; code = $Code; windowsVirtualKeyCode = $KeyCode } | Out-Null
    Invoke-Page $Page 'Input.dispatchKeyEvent' @{ type = 'keyUp'; key = $Key; code = $Code; windowsVirtualKeyCode = $KeyCode } | Out-Null
}

# A wheel scroll at a steady speed, as a trackpad or a held wheel gives it.
function Send-ScrollGesture {
    param($Page, [double]$X, [double]$Y, [int]$Distance, [int]$Speed = 1600, [string]$Source = $script:ScrollSource)
    if (-not $Source) { $Source = 'mouse' }
    Invoke-Page $Page 'Input.synthesizeScrollGesture' @{ x = $X; y = $Y; yDistance = -$Distance; speed = $Speed; gestureSourceType = $Source; preventFling = $true } -TimeoutMs 120000 | Out-Null
}
# 'touch' for a phone run: the page scrolls under a finger rather than a wheel.
function Set-ScrollSource { param([string]$Source) $script:ScrollSource = $Source }

# The cursor travelling along a list of points, one display frame apart.
function Send-MousePath {
    param($Page, [object[]]$Points, [double]$FrameMs = 16.7)
    $clock = [Diagnostics.Stopwatch]::StartNew()
    for ($i = 0; $i -lt $Points.Count; $i++) {
        $due = $i * $FrameMs
        while ($clock.Elapsed.TotalMilliseconds -lt $due) { Start-Sleep -Milliseconds 1 }
        Send-Mouse $Page 'mouseMoved' $Points[$i][0] $Points[$i][1]
    }
}

# ---- Measuring -----------------------------------------------------------------------------
# CPU seconds per Chrome process, by type, from the browser itself; and by
# process id under "pid:<id>", so one renderer can be told from another.
function Get-ProcessTimes {
    param($Session)
    $info = Invoke-Cdp $Session 'SystemInfo.getProcessInfo'
    $times = @{}
    foreach ($process in $info['processInfo']) {
        $type = [string]$process['type']
        if (-not $times.ContainsKey($type)) { $times[$type] = 0.0 }
        $times[$type] += [double]$process['cpuTime']
        $times["pid:$($process['id'])"] = [double]$process['cpuTime']
    }
    $times
}

# The 3D engine's share of the graphics card for one process (the GPU
# process), averaged since the last call -- Windows' own counter, the one
# Task Manager shows.
function New-GpuCounter {
    param([int]$ProcessId)
    $category = New-Object System.Diagnostics.PerformanceCounterCategory 'GPU Engine'
    $counters = foreach ($name in $category.GetInstanceNames()) {
        if ($name -like "pid_$($ProcessId)_*engtype_3D") {
            $counter = New-Object System.Diagnostics.PerformanceCounter 'GPU Engine', 'Utilization Percentage', $name, $true
            [void]$counter.NextValue()
            $counter
        }
    }
    @($counters)
}

function Read-GpuCounter {
    param([object[]]$Counters)
    $sum = 0.0
    foreach ($counter in $Counters) { try { $sum += $counter.NextValue() } catch { } }
    $sum
}

function Get-GpuProcessId {
    param($Chrome)
    $children = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' AND ParentProcessId=$($Chrome.Process.Id)"
    $gpu = @($children | Where-Object { $_.CommandLine -match '--type=gpu-process' })[0]
    if ($gpu) { [int]$gpu.ProcessId } else { 0 }
}

# ---- Effects levels --------------------------------------------------------------
# A script for Page.addScriptToEvaluateOnNewDocument that has every load start
# at the given level, as a visitor who chose it on the slider would ('low',
# 'medium' or 'high'); with none, it clears any choice so the page picks its
# own, as for a first visit.
function Get-EffectsLevelScript {
    param([string]$Level = '')
    if ($Level) { "try { localStorage.setItem('portfolio-effects-level', '$Level'); } catch (e) {}" }
    else { "try { localStorage.removeItem('portfolio-effects-level'); localStorage.removeItem('portfolio-effects-override-v3'); } catch (e) {}" }
}

# Moves the slider to a level the way the keyboard does: the range input's
# value, then the change event the page listens for.
function Set-EffectsLevel {
    param($Page, [ValidateSet('low', 'medium', 'high')][string]$Level)
    $index = @{ low = 0; medium = 1; high = 2 }[$Level]
    Invoke-PageJs $Page "(() => { const i = document.getElementById('fx-level'); i.value = '$index'; i.dispatchEvent(new Event('change', { bubbles: true })); return document.documentElement.dataset.effects; })()"
}

function Start-BenchTrace {
    param($Session, [string[]]$Categories)
    Invoke-Cdp $Session 'Tracing.start' @{
        transferMode = 'ReturnAsStream'; streamFormat = 'json'
        traceConfig = @{ recordMode = 'recordAsMuchAsPossible'; includedCategories = $Categories }
    } | Out-Null
}

function Stop-BenchTrace {
    param($Session, [string]$OutFile)
    Invoke-Cdp $Session 'Tracing.end' | Out-Null
    $complete = Wait-CdpEvent $Session 'Tracing.tracingComplete' 120000
    $handle = $complete['params']['stream']
    $writer = New-Object System.IO.StreamWriter($OutFile, $false, (New-Object System.Text.UTF8Encoding $false))
    try {
        while ($true) {
            $chunk = Invoke-Cdp $Session 'IO.read' @{ handle = $handle; size = 8MB } -TimeoutMs 120000
            if ($chunk['base64Encoded']) { $writer.Write([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($chunk['data']))) }
            else { $writer.Write($chunk['data']) }
            if ($chunk['eof']) { break }
        }
    } finally { $writer.Dispose() }
    Invoke-Cdp $Session 'IO.close' @{ handle = $handle } | Out-Null
    $OutFile
}

Export-ModuleMember -Function *
