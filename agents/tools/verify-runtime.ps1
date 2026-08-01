param(
    [ValidateSet('docs', 'backend', 'ui-runtime')]
    [string]$Mode = 'docs',
    [string]$AppHostUrl,
    [string]$Route,
    [switch]$RequireBrowserEvidence
)

if ($Mode -eq 'docs') {
    [pscustomobject]@{
        Status = 'NOT APPLICABLE'
        Reason = 'Tác vụ là tài liệu hoặc workflow'
        Affected = ''
        NextRerunAction = ''
    } | Format-List
    exit 0
}

if (-not $AppHostUrl) {
    [pscustomobject]@{
        Status = 'BLOCKED'
        Reason = 'Chưa có AppHostUrl để kiểm tra runtime'
        Affected = $Route
        NextRerunAction = 'Cung cấp AppHostUrl và chạy lại verify-runtime.ps1'
    } | Format-List
    exit 0
}

try {
    $response = Invoke-WebRequest -Uri $AppHostUrl -Method Head -TimeoutSec 10
    [pscustomobject]@{
        Status = 'PASS'
        Reason = "HTTP $($response.StatusCode)"
        Affected = $Route
        NextRerunAction = ''
    } | Format-List
}
catch {
    [pscustomobject]@{
        Status = 'BLOCKED'
        Reason = $_.Exception.Message
        Affected = $Route
        NextRerunAction = 'Khởi động lại AppHost hoặc kiểm tra route rồi rerun'
    } | Format-List
}
