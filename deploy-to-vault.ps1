# Run this script to copy the built prototype to the vault.
# It assumes the G: drive (Google Drive) is mounted in your Windows session.

$src = "C:\dev\ai-staff-ui\dist-single\index.html"
$dst = "G:\My Drive\8. Agents\ai_team_root\6. Outputs\drafts\design\2026-06-11_ai-staff-ui-prototype.html"

if (-not (Test-Path (Split-Path $dst))) {
    Write-Error "Destination folder not found. Check G: drive is mounted."
    exit 1
}

Copy-Item -Path $src -Destination $dst -Force
Write-Output "Copied: $src -> $dst"
Write-Output "File size: $([math]::Round((Get-Item $dst).Length / 1KB, 1)) KB"
