@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   IPTV-playlist: обновление плейлиста
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите его с https://nodejs.org/ и запустите снова.
  pause
  exit /b 1
)

echo Проверяю каналы и заменяю отвалившиеся...
node scripts\refresh.mjs
if errorlevel 1 (
  echo.
  echo Ошибка при обновлении. Файл data\update-report.json может содержать подробности.
  pause
  exit /b 1
)

echo.
echo Проверяю формат файлов...
node scripts\validate.mjs
echo.
pause
