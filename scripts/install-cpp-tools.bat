@echo off
title AimCake - Instalador de C++ Build Tools (MSVC)
echo ========================================================
echo   Instalando Herramientas de C++ de Visual Studio (MSVC)
echo ========================================================
echo.
echo Se solicitara permiso de Administrador (UAC) en tu pantalla.
echo Por favor pulsa "Si" en el cuadro emergente para permitir la instalacion.
echo.
powershell -Command "Start-Process -FilePath '%TEMP%\vs_BuildTools.exe' -ArgumentList '--passive --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' -Verb RunAs"
echo.
echo ========================================================
echo   Listo! Ahora ejecuta: scripts\build-installer.bat
echo ========================================================
pause
