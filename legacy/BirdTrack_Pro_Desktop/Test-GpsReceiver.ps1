$body = @{
    ring = "1298"\n    latitude = 55.7558
    longitude = 37.6173
    accuracy = 10
    timestamp = (Get-Date).ToString("o")
    place = "ТЕСТОВЫЕ КООРДИНАТЫ — НЕ GPS ТЕЛЕФОНА"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8766/gps/" -Method Post -ContentType "application/json" -Body $body
Write-Host "Отправлены тестовые координаты. Это не местоположение телефона."
