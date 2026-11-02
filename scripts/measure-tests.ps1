#requires -Version 7.0
param(
  [Parameter(Mandatory)][string]$Root,
  [Parameter(Mandatory)][string]$Output,
  [Parameter(Mandatory)][ValidatePattern('^[a-zA-Z0-9_-]+$')][string]$Label,
  [ValidateSet('coverage', 'unit', 'setup', 'backend', 'validate', 'changed')][string]$Stage = 'coverage',
  [ValidateRange(1, 64)][int]$Workers = 4,
  [ValidateRange(0, 64)][int]$TestConcurrency = 0,
  [string]$Config,
  [string[]]$Files = @()
)
# Windows / PowerShell 7. Sampled sums, not unique physical memory or exact CPU.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path -LiteralPath $Root).Path
$Output = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Force -Path $Output | Out-Null
# Fail before starting the suite if CIM is unavailable.
[void](Get-CimInstance Win32_Process -Filter "ProcessId=$PID")
$node = (Get-Command node).Source
$npm = Join-Path (Split-Path (Get-Command npm.cmd).Source) 'node_modules/npm/bin/npm-cli.js'
switch ($Stage) {
  { $_ -in 'coverage', 'unit', 'changed' } {
    $arguments = @('node_modules/vitest/vitest.mjs', 'run', "--maxWorkers=$Workers",
      '--reporter=default', '--reporter=json', "--outputFile.json=$Output/$Label-results.json")
    if ($Stage -eq 'coverage') { $arguments += '--coverage' }
    if ($Stage -eq 'changed') { $arguments += @('--changed', '--passWithNoTests') }
    if ($Config) { $arguments += @('--config', $Config) }
    $arguments += $Files
  }
  'setup' {
    $arguments = @('--test')
    if ($TestConcurrency) { $arguments += "--test-concurrency=$TestConcurrency" }
    $arguments += 'scripts/*.test.mjs'
  }
  'backend' { $arguments = @($npm, '--prefix', 'functions', 'test') }
  'validate' { $arguments = @($npm, 'run', 'validate') }
}
$info = [Diagnostics.ProcessStartInfo]::new()
$info.FileName = $node
$info.WorkingDirectory = $Root
$info.UseShellExecute = $false
$info.CreateNoWindow = $true
$info.RedirectStandardOutput = $true
$info.RedirectStandardError = $true
foreach ($argument in $arguments) { $info.ArgumentList.Add($argument) }
$process = [Diagnostics.Process]::new()
$process.StartInfo = $info
$start = [DateTime]::UtcNow
$watch = [Diagnostics.Stopwatch]::StartNew()
$stdoutFile = [IO.FileStream]::new("$Output/$Label.stdout.log", 'Create', 'Write', 'ReadWrite')
$stderrFile = [IO.FileStream]::new("$Output/$Label.stderr.log", 'Create', 'Write', 'ReadWrite')
# Open output files before launching the suite; an I/O failure must not orphan it.
[void]$process.Start()
$outTask = $process.StandardOutput.BaseStream.CopyToAsync($stdoutFile)
$errTask = $process.StandardError.BaseStream.CopyToAsync($stderrFile)
# Track creation times as well as PIDs: Windows can reuse IDs during long runs.
$tracked = @{ $process.Id = $null }
$peakWorking = 0L
$peakPrivate = 0L
$maxProcesses = 0
$samples = 0
$cpu = @{}
try {
  while (-not $process.HasExited) {
    $rows = @(Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='esbuild.exe' OR Name='cmd.exe'")
    $births = @{}
    foreach ($row in $rows) { $births[[int]$row.ProcessId] = $row.CreationDate }
    $known = [Collections.Generic.HashSet[int]]::new()
    foreach ($row in $rows) {
      $id = [int]$row.ProcessId
      if ($tracked.ContainsKey($id) -and
          ($null -eq $tracked[$id] -or $tracked[$id] -eq $row.CreationDate)) {
        [void]$known.Add($id)
      }
    }
    do {
      $added = $false
      foreach ($row in $rows) {
        if ($known.Contains([int]$row.ParentProcessId) -and
            $row.CreationDate -ge $births[[int]$row.ParentProcessId] -and
            $known.Add([int]$row.ProcessId)) {
          $added = $true
        }
      }
    } while ($added)
    $tracked = @{}
    $working = 0L
    $private = 0L
    $count = 0
    foreach ($row in $rows) {
      if ($known.Contains([int]$row.ProcessId)) {
        $tracked[[int]$row.ProcessId] = $row.CreationDate
        $working += [long]$row.WorkingSetSize
        $private += [long]$row.PrivatePageCount
        $identity = [string]$row.ProcessId + ':' + $row.CreationDate.ToUniversalTime().Ticks
        $cpu[$identity] = ([double]$row.KernelModeTime + [double]$row.UserModeTime) / 1e7
        $count++
      }
    }
    $peakWorking = [math]::Max($peakWorking, $working)
    $peakPrivate = [math]::Max($peakPrivate, $private)
    $maxProcesses = [math]::Max($maxProcesses, $count)
    $samples++
    Start-Sleep -Milliseconds 500
  }
} finally {
  # Never leave our suite running after a sampler failure or interruption.
  if (-not $process.HasExited) { $process.Kill($true) }
  $process.WaitForExit()
  [Threading.Tasks.Task]::WaitAll(@($outTask, $errTask))
  $stdoutFile.Dispose()
  $stderrFile.Dispose()
}
$watch.Stop()
$exitCode = $process.ExitCode
$result = [ordered]@{
  label = $Label; stage = $Stage; workers = $Workers; samplerVersion = 2
  startedUtc = $start.ToString('o'); elapsedSeconds = [math]::Round($watch.Elapsed.TotalSeconds, 3)
  peakWorkingSetMiB = [math]::Round($peakWorking / 1MB, 1)
  peakPrivateMiB = [math]::Round($peakPrivate / 1MB, 1)
  sampledCpuSeconds = [math]::Round(($cpu.Values | Measure-Object -Sum).Sum, 3)
  maxProcesses = $maxProcesses; samples = $samples; exitCode = $exitCode
  nodeVersion = (& $node --version); root = $Root; command = @($node) + $arguments
}
$result | ConvertTo-Json -Depth 4 | Set-Content "$Output/$Label-metrics.json" -Encoding utf8
$result | ConvertTo-Json -Depth 4
$process.Dispose()
exit $exitCode
