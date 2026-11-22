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

echo Проверяю каналы и заменяю отвалившиеся (5-10 минут)...
node scripts\refresh.mjs
if errorlevel 1 (
  echo.
  echo Ошибка при обновлении. Подробности в data\update-report.json
  pause
  exit /b 1
)

echo.
echo Проверяю формат файлов...
node scripts\validate.mjs
echo.
echo Готово. Отправляю изменения на GitHub...
git add -A
git diff --cached --quiet
if not errorlevel 1 (
  echo Изменений нет.
  pause
  exit /b 0
)
git commit -m "Обновление плейлиста"
git push
echo.
echo Готово! Сайт обновится через 1-2 минуты.
pause
