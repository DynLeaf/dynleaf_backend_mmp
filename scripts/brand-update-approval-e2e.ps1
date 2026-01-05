param(
  [string]$ApiBase = "http://localhost:5005/v1",
  [string]$Email = "admin@gmail.com",
  [string]$Password = "pass@123",
  [ValidateSet("pending","approved","rejected","all")] [string]$Status = "pending",
  [string]$Search = "",
  [switch]$ApproveFirst,
  [string]$ApproveId
)

$ErrorActionPreference = "Stop"

function Join-QueryString([hashtable]$params) {
  ($params.GetEnumerator() | ForEach-Object {
    "{0}={1}" -f $_.Key, [uri]::EscapeDataString([string]$_.Value)
  }) -join "&"
}

Write-Host "Using API base: $ApiBase"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# 1) Admin login (sets admin_token cookie)
$loginBody = @{ email = $Email; password = $Password } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$ApiBase/auth/admin/login" -ContentType "application/json" -Body $loginBody -WebSession $session | Out-Null
Write-Host "Logged in as admin (cookie-based)"

# 2) List requests
$query = @{ status = $Status; limit = 50 }
if ($Search.Trim()) { $query.search = $Search.Trim() }
$listUrl = "$ApiBase/admin/brand-updates?" + (Join-QueryString $query)

$response = Invoke-RestMethod -Method Get -Uri $listUrl -WebSession $session
$requests = @($response.data.requests)

Write-Host "Found $($requests.Count) request(s)" 
$requests |
  Select-Object -First 15 _id, @{n="brand";e={ $_.brand_id.name }}, status, created_at |
  Format-Table -AutoSize

# 3) Optionally approve
$targetId = $null
if ($ApproveId) {
  $targetId = $ApproveId
} elseif ($ApproveFirst -and $requests.Count -gt 0) {
  $targetId = $requests[0]._id
}

if ($targetId) {
  Write-Host "Approving request: $targetId"
  Invoke-RestMethod -Method Post -Uri "$ApiBase/admin/brand-updates/$targetId/approve" -WebSession $session | Out-Null
  Write-Host "Approved. Re-fetching list..."

  $response2 = Invoke-RestMethod -Method Get -Uri $listUrl -WebSession $session
  @($response2.data.requests) |
    Select-Object -First 15 _id, @{n="brand";e={ $_.brand_id.name }}, status, created_at |
    Format-Table -AutoSize
}

Write-Host "Done."