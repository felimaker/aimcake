ViGEmBus_Setup.exe
==================

Instalador oficial del driver ViGEmBus v1.22.0 (Virtual Gamepad Emulation Bus),
redistribuido sin modificar.

- Origen:   https://github.com/nefarius/ViGEmBus/releases/tag/v1.22.0
            (ViGEmBus_1.22.0_x64_x86_arm64.exe)
- SHA-256:  89220A7865076B342892F98865F3499FB7C4CFD673159E89D352C360FD014C6A
- Firma:    Nefarius Software Solutions e.U. (Authenticode)
- Licencia: BSD 3-Clause — Copyright (c) Nefarius Software Solutions e.U.

Uso en la app:
- El instalador NSIS lo ejecuta en silencio si el driver no está instalado
  (src-tauri/windows/hooks.nsh).
- Panel → Paso 1 → «Instalar driver» lo abre con su asistente normal.

Para actualizarlo, sustituye este archivo por la nueva versión con el mismo nombre.
