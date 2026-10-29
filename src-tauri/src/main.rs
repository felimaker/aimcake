#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;
mod licensing;

use engine::devices::{self, InputDevice};
use engine::input_capture::{InputCaptureService, RawEvent};
use engine::vigem_worker::{check_driver, ViGEmWorker};
use engine::{EngineSettings, EngineShared};
use licensing::crypto::{verify_license_token, LicensePayload};
use licensing::hwid::get_hardware_fingerprint;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::sync::mpsc::channel;
use std::sync::{Arc, Mutex};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, RunEvent, State};

/// Instalador de ViGEmBus incluido en el paquete (ver `bundle.resources`).
const DRIVER_INSTALLER: &str = "drivers/ViGEmBus_Setup.exe";

struct AppState {
    /// La captura Raw Input se ejecuta siempre (para identificar dispositivos);
    /// solo reenvía eventos al worker mientras se emula.
    capture: Mutex<InputCaptureService>,
    worker: Mutex<ViGEmWorker>,
    shared: Arc<EngineShared>,
}

impl AppState {
    fn stop_emulation(&self) {
        self.shared.emulating.store(false, Ordering::SeqCst);
        if let Ok(mut tx) = self.shared.event_tx.lock() {
            *tx = None;
        }
        if let Ok(mut w) = self.worker.lock() {
            w.stop();
        }
    }

    fn shutdown(&self) {
        self.stop_emulation();
        if let Ok(mut c) = self.capture.lock() {
            c.stop();
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EngineStatus {
    running: bool,
    paused: bool,
    driver_ok: bool,
    driver_error: Option<String>,
    /// El instalador de ViGEmBus viene incluido y se puede lanzar desde la app.
    driver_installer: bool,
    capture_ok: bool,
    capture_error: Option<String>,
    is_debug: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DriverInstallResult {
    exit_code: i32,
    /// 3010 / 1641: instalado, pero Windows pide reiniciar.
    reboot_required: bool,
    /// 1602: el usuario canceló el instalador.
    cancelled: bool,
    driver_ok: bool,
}

fn driver_installer_path(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .resolve(DRIVER_INSTALLER, BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
}

#[tauri::command]
fn get_hwid() -> String {
    get_hardware_fingerprint()
}

#[tauri::command]
fn verify_license(token_json: String, sig: String) -> Result<LicensePayload, String> {
    verify_license_token(&token_json, &sig, &get_hardware_fingerprint())
}

#[tauri::command]
fn get_engine_status(app: AppHandle, state: State<'_, AppState>) -> EngineStatus {
    let running = state.worker.lock().map(|w| w.is_running()).unwrap_or(false);
    let driver = check_driver();
    let (capture_ok, capture_error) = state
        .capture
        .lock()
        .map(|c| (c.is_running(), c.error.clone()))
        .unwrap_or((false, Some("Estado de captura bloqueado.".into())));
    EngineStatus {
        running,
        paused: state.shared.paused.load(Ordering::Relaxed),
        driver_ok: driver.is_ok(),
        driver_error: driver.err(),
        driver_installer: driver_installer_path(&app).is_some(),
        capture_ok,
        capture_error,
        is_debug: cfg!(debug_assertions),
    }
}

/// Ejecuta el instalador de ViGEmBus incluido y espera a que termine.
/// La app ya corre como administrador (manifiesto), así que el instalador hereda la
/// elevación; si no fuera así (error 740), se pide elevación con UAC.
#[tauri::command]
async fn install_driver(app: AppHandle) -> Result<DriverInstallResult, String> {
    let path = driver_installer_path(&app)
        .ok_or("No se encontró el instalador de ViGEmBus incluido. Reinstala la aplicación.")?;

    let code = tauri::async_runtime::spawn_blocking(move || -> Result<i32, String> {
        match std::process::Command::new(&path).status() {
            Ok(s) => Ok(s.code().unwrap_or(-1)),
            Err(e) if e.raw_os_error() == Some(740) => {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                let script = format!(
                    "$p = Start-Process -FilePath '{}' -Verb RunAs -Wait -PassThru; exit $p.ExitCode",
                    path.display().to_string().replace('\'', "''")
                );
                std::process::Command::new("powershell.exe")
                    .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .status()
                    .map(|s| s.code().unwrap_or(-1))
                    .map_err(|e| format!("No se pudo solicitar permisos de administrador: {e}"))
            }
            Err(e) => Err(format!("No se pudo ejecutar el instalador: {e}")),
        }
    })
    .await
    .map_err(|e| format!("El instalador se interrumpió: {e}"))??;

    Ok(DriverInstallResult {
        exit_code: code,
        reboot_required: code == 3010 || code == 1641,
        cancelled: code == 1602,
        driver_ok: check_driver().is_ok(),
    })
}

#[tauri::command]
fn update_settings(state: State<'_, AppState>, settings: EngineSettings) -> Result<(), String> {
    state.shared.apply(settings);
    Ok(())
}

#[tauri::command]
fn set_paused(state: State<'_, AppState>, paused: bool) {
    state.shared.paused.store(paused, Ordering::Relaxed);
}

/// Lista los teclados y ratones físicos conectados (con nombre, fabricante y VID:PID).
#[tauri::command]
fn list_devices() -> Vec<InputDevice> {
    devices::enumerate()
}

fn profiles_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("No se encontró la carpeta de configuración: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("No se pudo crear {dir:?}: {e}"))?;
    Ok(dir.join("profiles.json"))
}

/// Devuelve el JSON de perfiles guardado (o `None` si es la primera ejecución).
#[tauri::command]
fn load_profiles(app: AppHandle) -> Result<Option<String>, String> {
    let path = profiles_path(&app)?;
    match std::fs::read_to_string(&path) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("No se pudieron leer los perfiles: {e}")),
    }
}

/// Guarda los perfiles de forma atómica (archivo temporal + renombrado).
#[tauri::command]
fn save_profiles(app: AppHandle, json: String) -> Result<(), String> {
    serde_json::from_str::<serde_json::Value>(&json)
        .map_err(|e| format!("JSON de perfiles inválido: {e}"))?;
    let path = profiles_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, json).map_err(|e| format!("No se pudieron guardar los perfiles: {e}"))?;
    std::fs::rename(&tmp, &path).map_err(|e| format!("No se pudieron guardar los perfiles: {e}"))
}

#[tauri::command]
fn start_emulation(
    app: AppHandle,
    state: State<'_, AppState>,
    token_json: String,
    sig: String,
) -> Result<String, String> {
    let hwid = get_hardware_fingerprint();

    // Validación estricta antes de crear el gamepad virtual.
    let payload = verify_license_token(&token_json, &sig, &hwid)?;
    state.shared.license_expires_at.store(payload.expires_at, Ordering::SeqCst);
    state.shared.paused.store(false, Ordering::SeqCst);

    {
        let capture = state.capture.lock().map_err(|_| "Estado de captura bloqueado.")?;
        if !capture.is_running() {
            return Err(capture
                .error
                .clone()
                .unwrap_or_else(|| "La captura de entrada no está activa.".into()));
        }
    }

    let mut worker = state.worker.lock().map_err(|_| "Estado del worker bloqueado.")?;
    if worker.is_running() {
        return Err("La emulación ya está en ejecución.".into());
    }

    let (tx, rx) = channel::<RawEvent>();
    worker.start(rx, state.shared.clone(), app)?;
    if let Ok(mut slot) = state.shared.event_tx.lock() {
        *slot = Some(tx);
    }
    state.shared.emulating.store(true, Ordering::SeqCst);

    let hz = state.shared.snapshot().polling_hz;
    Ok(format!("Emulación iniciada a {hz} Hz"))
}

#[tauri::command]
fn stop_emulation(state: State<'_, AppState>) -> Result<String, String> {
    state.stop_emulation();
    Ok("Emulación detenida".into())
}

fn main() {
    let app = tauri::Builder::default()
        // Debe ser el primer plugin: si ya hay una instancia abierta, le reenvía
        // el deep link (`xcb://auth/callback?code=...`) y enfoca su ventana.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        // Evita que el bucle de eventos de la ventana registre Raw Input por su
        // cuenta y le quite el registro al hilo de captura.
        .device_event_filter(tauri::DeviceEventFilter::Always)
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            capture: Mutex::new(InputCaptureService::new()),
            worker: Mutex::new(ViGEmWorker::new()),
            shared: Arc::new(EngineShared::new()),
        })
        .setup(|app| {
            // En desarrollo el esquema `xcb://` no lo registra ningún instalador.
            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    eprintln!("No se pudo registrar el esquema xcb://: {e}");
                }
            }
            let handle = app.handle().clone();
            let state = app.state::<AppState>();
            if let Ok(mut capture) = state.capture.lock() {
                if let Err(e) = capture.start(state.shared.clone(), handle) {
                    capture.error = Some(e);
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_hwid,
            verify_license,
            get_engine_status,
            install_driver,
            update_settings,
            set_paused,
            list_devices,
            load_profiles,
            save_profiles,
            start_emulation,
            stop_emulation
        ])
        .build(tauri::generate_context!())
        .expect("Error al inicializar la aplicación");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            handle.state::<AppState>().shutdown();
        }
    });
}
