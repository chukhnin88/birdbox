@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo BirdTrack Pro - restore and build
 echo ==========================================
dotnet restore "BirdTrack.csproj"
if errorlevel 1 (
  echo.
  echo Restore failed. Check Internet and .NET 8 SDK.
  pause
  exit /b 1
)
dotnet build "BirdTrack.csproj"
if errorlevel 1 (
  echo.
  echo Build failed. Read the first error above.
  pause
  exit /b 1
)
echo.
echo Starting BirdTrack...
dotnet run --no-build --project "BirdTrack.csproj"
if errorlevel 1 pause
