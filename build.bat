@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   IPTV-playlist: полная пересборка
echo ============================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не найден. Установите его с https://nodejs.org/ и запустите снова.
  pause
  exit /b 1
)

echo Собираю плейлист с нуля (5-10 минут)...
node scripts\build.mjs --limit-per-channel=4
if errorlevel 1 (
  echo.
  echo Ошибка при сборке.
  pause
  exit /b 1
)

node scripts\validate.mjs
echo.
echo Готово. Отправить изменения на GitHub? Закройте окно, если пока не нужно.
pause
git add -A
git commit -m "Пересборка плейлиста"
git push
pause
