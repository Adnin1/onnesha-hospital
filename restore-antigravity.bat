@echo off
title Restore Antigravity Master Autonomous OS
echo ============================================================
echo    ANTIGRAVITY MASTER AUTONOMOUS OS - 1-CLICK RESTORER
echo ============================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restore-antigravity.ps1"
echo.
pause
