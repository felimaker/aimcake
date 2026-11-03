@echo off
title AimCake - Compilador de Instalador Oficial Windows
echo ========================================================
echo   AimCake 1000 Hz - Generador de Setup Oficial (Tauri v2)
echo ========================================================
echo.

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

echo 1. Comprobando compilador de Rust...
where cargo >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] No se encontro Cargo. Asegurate de tener Rust instalado.
    pause
    exit /b 1
)
echo    Rust y Cargo detectados correctamente.
echo.

echo 2. Compilando interfaz web (React + Vite + TypeScript)...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion de la interfaz web.
    pause
    exit /b 1
)
echo.

echo 3. Empaquetando instalador de escritorio con Tauri v2 y NSIS...
call npx tauri build
if %errorlevel% neq 0 (
    echo [ERROR] Fallo la compilacion de Tauri.
    pause
    exit /b 1
)
echo.

echo 4. Copiando instalador generado a la carpeta de descargas...
if exist "src-tauri\target\release\bundle\nsis\AimCake_1.0.0_x64-setup.exe" (
    copy /Y "src-tauri\target\release\bundle\nsis\AimCake_1.0.0_x64-setup.exe" "public\downloads\aimcake_setup.exe"
    echo.
    echo ========================================================
    echo   EXITO: Instalador definitivo generado correctamente!
    echo   Ubicacion: public\downloads\aimcake_setup.exe
    echo ========================================================
) else (
    echo [AVISO] El instalador se compilo pero verifica la ruta en src-tauri\target\release\bundle\nsis\
)
echo.
pause
