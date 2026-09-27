# scripts/redteam-helper.ps1
# Wraps `vercel curl` so Node can spawn a single command without quoting hell.
# Usage: powershell -ExecutionPolicy Bypass -File scripts/redteam-helper.ps1 -Url <url> -Method <POST|GET> [-BodyFile <path>]
# BodyFile is the safest path because PowerShell will eat JSON braces if passed inline.
param(
  [Parameter(Mandatory=$true)][string]$Url,
  [Parameter(Mandatory=$true)][string]$Method,
  [string]$BodyFile = ''
)
$argsList = @('curl', $Url, '--', '-X', $Method, '-H', 'content-type: application/json', '-s', '-w', "`n__HTTP_STATUS__:%{http_code}`n")
if ($BodyFile -ne '') {
  # Use curl's @file syntax so the JSON is not re-parsed by PowerShell.
  $argsList += @('--data-binary', "@$BodyFile")
}
& vercel @argsList
