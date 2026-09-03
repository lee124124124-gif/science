# Node/Python 없이도 바로 실행할 수 있는 간단한 정적 파일 서버.
# IndexedDB 등 일부 브라우저 기능은 file:// 로 직접 열면 제한될 수 있으므로
# index.html을 더블클릭하지 말고 이 스크립트로 서버를 띄운 뒤 브라우저로 접속하세요.
#   사용법: powershell -ExecutionPolicy Bypass -File .\serve.ps1 [포트]

param(
    [int]$Port = 8000
)

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

Write-Host "Serving $root at http://localhost:$Port  (Ctrl+C to stop)"

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        # 요청 하나 처리 중 오류(예: HEAD 요청 등 예외적인 경우)가 나도 서버 전체가 죽지 않도록
        # 요청 단위로 감싼다 — 예전엔 여기서 예외가 나면 while 루프 자체가 끝나버려 서버가
        # 완전히 멈췄고, 그 상태에서 접속하면 흰 화면만 보이는 원인 중 하나였다.
        try {
            $request = $context.Request
            $response = $context.Response

            $path = $request.Url.LocalPath
            if ($path -eq "/") { $path = "/index.html" }
            $filePath = Join-Path $root ($path.TrimStart("/"))

            if (Test-Path $filePath -PathType Leaf) {
                $ext = [System.IO.Path]::GetExtension($filePath)
                $contentType = $mime[$ext]
                if (-not $contentType) { $contentType = "application/octet-stream" }
                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                # "no-store"는 새 파일을 즉시 반영하려고 넣었던 옵션인데, 브라우저의 뒤로가기 캐시
                # (bfcache)까지 꺼버려서 실행 화면에서 뒤로가기를 누르면 매번 서버에서 새로 로드해야
                # 했다 — 느린 와이파이 등에서는 그 사이 흰 화면으로 멈춰 보이는 원인이 됐다.
                # "no-cache"만 쓰면 매 요청마다 재검증은 하되(내용은 항상 최신), 뒤로가기 캐시는
                # 막지 않아 즉시, 안정적으로 복원된다.
                $response.Headers.Add("Cache-Control", "no-cache")
                $response.ContentType = $contentType
                $response.ContentLength64 = $bytes.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $response.StatusCode = 404
                $notFound = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
                $response.ContentLength64 = $notFound.Length
                if ($request.HttpMethod -ne "HEAD") {
                    $response.OutputStream.Write($notFound, 0, $notFound.Length)
                }
            }
            $response.OutputStream.Close()
        } catch {
            Write-Host "요청 처리 중 오류(무시하고 계속 서비스): $_"
            try { $context.Response.OutputStream.Close() } catch {}
        }
    }
} finally {
    $listener.Stop()
}
