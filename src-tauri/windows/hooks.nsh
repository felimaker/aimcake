; Hooks del instalador NSIS de Tauri (bundle.windows.nsis.installerHooks).
; Instala el driver ViGEmBus incluido solo si todavía no está en el sistema.
;
; - El servicio del driver se registra en HKLM\SYSTEM\CurrentControlSet\Services\ViGEmBus
;   (esa rama no la redirige WOW64, así que el instalador de 32 bits la ve bien).
; - ViGEmBus_Setup.exe es un paquete de Advanced Installer firmado por Nefarius:
;   /exenoui /qn = sin interfaz · /norestart = no reiniciar automáticamente.
; - Códigos de salida: 0 = OK · 3010/1641 = OK, requiere reinicio · otro = error.

!macro NSIS_HOOK_POSTINSTALL
  ClearErrors
  ReadRegStr $0 HKLM "SYSTEM\CurrentControlSet\Services\ViGEmBus" "ImagePath"
  StrCmp $0 "" xcb_install_vigem xcb_vigem_present

  xcb_install_vigem:
    DetailPrint "Instalando el driver ViGEmBus (mando virtual)..."
    ExecWait '"$INSTDIR\drivers\ViGEmBus_Setup.exe" /exenoui /qn /norestart' $1
    DetailPrint "ViGEmBus: codigo de salida $1"
    StrCmp $1 "0" xcb_vigem_done
    StrCmp $1 "3010" xcb_vigem_reboot
    StrCmp $1 "1641" xcb_vigem_reboot
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo instalar el driver ViGEmBus (codigo $1).$\r$\n$\r$\nPuedes instalarlo mas tarde desde la app: Panel -> Paso 1 -> Instalar driver."
    Goto xcb_vigem_done

  xcb_vigem_reboot:
    SetRebootFlag true
    Goto xcb_vigem_done

  xcb_vigem_present:
    DetailPrint "El driver ViGEmBus ya esta instalado."

  xcb_vigem_done:
    ; Registro del protocolo de enlace web aimcake://
    DetailPrint "Registrando protocolo de enlace aimcake://..."
    WriteRegStr HKCR "aimcake" "" "URL:AimCake Protocol"
    WriteRegStr HKCR "aimcake" "URL Protocol" ""
    WriteRegStr HKCR "aimcake\DefaultIcon" "" "$INSTDIR\AimCake.exe,0"
    WriteRegStr HKCR "aimcake\shell\open\command" "" '"$INSTDIR\AimCake.exe" "%1"'

    WriteRegStr HKCR "xcb" "" "URL:AimCake XCB Protocol"
    WriteRegStr HKCR "xcb" "URL Protocol" ""
    WriteRegStr HKCR "xcb\DefaultIcon" "" "$INSTDIR\AimCake.exe,0"
    WriteRegStr HKCR "xcb\shell\open\command" "" '"$INSTDIR\AimCake.exe" "%1"'
!macroend
