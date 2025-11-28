# Dashboard de Rutas - Script de Inicio

# Construir y levantar todos los servicios
Write-Host "🚀 Iniciando Dashboard de Rutas..." -ForegroundColor Green
Write-Host "Construyendo contenedores..." -ForegroundColor Yellow

docker-compose up --build -d

Write-Host "✅ Servicios iniciados:" -ForegroundColor Green
Write-Host "📊 Frontend: http://localhost:5173" -ForegroundColor Cyan
Write-Host "🔧 Backend API: http://localhost:8000" -ForegroundColor Cyan
Write-Host "📚 API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host "🗄️ PostgreSQL: localhost:5432" -ForegroundColor Cyan

Write-Host ""
Write-Host "Para ver logs en tiempo real:" -ForegroundColor Yellow
Write-Host "docker-compose logs -f" -ForegroundColor White

Write-Host ""
Write-Host "Para detener todos los servicios:" -ForegroundColor Yellow
Write-Host "docker-compose down" -ForegroundColor White