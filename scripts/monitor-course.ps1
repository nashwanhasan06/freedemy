# Polls the course's status + video counts until it reaches ready/failed, then prints a summary.
param(
  [Parameter(Mandatory = $true)][string]$CourseId,
  [int]$IntervalSeconds = 60
)

$ErrorActionPreference = "Stop"

# Parse Supabase URL + service-role key from .env.local (RLS blocks anon reads)
$envText = Get-Content "D:\freedemy\frudemy\.env.local" -Raw
$urlMatch = [regex]::Match($envText, 'NEXT_PUBLIC_SUPABASE_URL=(\S+)')
$keyMatch = [regex]::Match($envText, 'SUPABASE_SERVICE_ROLE_KEY=(\S+)')
$baseUrl = $urlMatch.Groups[1].Value.Trim('"', "'")
$serviceKey = $keyMatch.Groups[1].Value.Trim('"', "'")

$headers = @{ apikey = $serviceKey; Authorization = "Bearer $serviceKey" }
$start = Get-Date
$lastStage = ""
$failCount = 0

Write-Output "[$(Get-Date -Format o)] monitor start for course $CourseId"

while ($true) {
  try {
    $resp = Invoke-RestMethod -Uri "$baseUrl/rest/v1/courses?id=eq.$CourseId&select=status,stage,error" -Headers $headers -TimeoutSec 30
    $course = $resp[0]
    $vidResp = Invoke-RestMethod -Uri "$baseUrl/rest/v1/course_videos?course_id=eq.$CourseId&select=status" -Headers $headers -TimeoutSec 30
    $counts = $vidResp | Group-Object status | ForEach-Object { "$($_.Name)=$($_.Count)" }
    $countStr = ($counts -join " ")
    $elapsed = [math]::Round(((Get-Date) - $start).TotalMinutes, 1)
    $stage = if ($course.stage) { $course.stage } else { "" }
    if ($stage -ne $lastStage -or $course.status -in @("ready", "failed")) {
      Write-Output "[$(Get-Date -Format o)] t=${elapsed}m status=$($course.status) videos: $countStr | $stage"
      $lastStage = $stage
    }
    if ($course.status -eq "ready" -or $course.status -eq "failed") {
      $totalMin = [math]::Round(((Get-Date) - $start).TotalMinutes, 1)
      Write-Output "[$(Get-Date -Format o)] DONE status=$($course.status) total=${totalMin}m videos: $countStr"
      if ($course.error) { Write-Output "error: $($course.error)" }
      if ($course.stage) { Write-Output "final stage: $($course.stage)" }
      break
    }
    $failCount = 0
  } catch {
    $failCount += 1
    Write-Output "[$(Get-Date -Format o)] poll error ($failCount): $($_.Exception.Message)"
    if ($failCount -ge 10) { Write-Output "giving up after 10 consecutive poll errors"; break }
  }
  Start-Sleep -Seconds $IntervalSeconds
}
