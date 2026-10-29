//! Motor de emulación: captura de entrada, cinemática, mapeo, dispositivos y worker ViGEm.

pub mod devices;
pub mod input_capture;
pub mod kinematics;
pub mod mapping;
pub mod vigem_worker;

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU32, AtomicU64, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Mutex, RwLock};

use input_capture::RawEvent;
use kinematics::KinematicsConfig;
use mapping::{default_bindings, Binding};

/// Configuración completa del perfil activo, sincronizada desde la UI.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EngineSettings {
    pub config: KinematicsConfig,
    pub bindings: Vec<Binding>,
    /// Frecuencia de reporte al gamepad virtual (125–1000 Hz).
    pub polling_hz: u32,
    /// Bloquear las teclas mapeadas para que no lleguen al juego como teclado.
    pub suppress_keys: bool,
    /// Tecla virtual (VK) que pausa/reanuda la emulación sin detenerla.
    pub pause_hotkey: u32,
    /// Stick controlado por el movimiento del ratón: "RS", "LS" o "NONE".
    pub mouse_target: String,
    /// IDs de teclados permitidos (vacío = todos).
    pub keyboards: Vec<String>,
    /// IDs de ratones permitidos (vacío = todos).
    pub mice: Vec<String>,
    /// Mando virtual a emular: "X360", "XONE" (XInput, igual que X360) o "DS4".
    /// `None` = sin elegir (la UI no deja iniciar); el worker usa Xbox 360.
    pub controller: Option<String>,
}

impl Default for EngineSettings {
    fn default() -> Self {
        Self {
            config: KinematicsConfig::default(),
            bindings: default_bindings(),
            polling_hz: 1000,
            suppress_keys: false,
            pause_hotkey: 0x77, // F8
            mouse_target: "RS".into(),
            keyboards: Vec::new(),
            mice: Vec::new(),
            controller: None,
        }
    }
}

#[derive(Default)]
pub struct DeviceFilter {
    pub keyboards: HashSet<String>,
    pub mice: HashSet<String>,
}

impl DeviceFilter {
    pub fn allows(&self, kind_is_mouse: bool, id: Option<&str>) -> bool {
        let set = if kind_is_mouse { &self.mice } else { &self.keyboards };
        if set.is_empty() {
            return true;
        }
        id.map(|i| set.contains(i)).unwrap_or(false)
    }
}

/// Estado compartido entre el hilo de captura, el worker y los comandos IPC.
pub struct EngineShared {
    pub settings: RwLock<EngineSettings>,
    /// Se incrementa cada vez que cambian los ajustes para que el worker los recargue.
    pub version: AtomicU64,
    pub paused: AtomicBool,
    /// La emulación está activa (el hook solo bloquea/pausa cuando es true).
    pub emulating: AtomicBool,
    pub suppress_keys: AtomicBool,
    pub pause_hotkey: AtomicU32,
    pub mapped_keys: RwLock<HashSet<u32>>,
    pub device_filter: RwLock<DeviceFilter>,
    /// Canal hacia el worker; `None` cuando no se está emulando.
    pub event_tx: Mutex<Option<Sender<RawEvent>>>,
    /// Unix timestamp de expiración de la licencia validada (0 = sin licencia).
    pub license_expires_at: AtomicI64,
}

impl EngineShared {
    pub fn new() -> Self {
        let settings = EngineSettings::default();
        let shared = Self {
            settings: RwLock::new(settings.clone()),
            version: AtomicU64::new(1),
            paused: AtomicBool::new(false),
            emulating: AtomicBool::new(false),
            suppress_keys: AtomicBool::new(settings.suppress_keys),
            pause_hotkey: AtomicU32::new(settings.pause_hotkey),
            mapped_keys: RwLock::new(HashSet::new()),
            device_filter: RwLock::new(DeviceFilter::default()),
            event_tx: Mutex::new(None),
            license_expires_at: AtomicI64::new(0),
        };
        shared.apply(settings);
        shared
    }

    pub fn apply(&self, mut settings: EngineSettings) {
        settings.polling_hz = settings.polling_hz.clamp(125, 1000);
        settings.config.sanitize();

        self.suppress_keys.store(settings.suppress_keys, Ordering::SeqCst);
        self.pause_hotkey.store(settings.pause_hotkey, Ordering::SeqCst);
        if let Ok(mut keys) = self.mapped_keys.write() {
            *keys = settings.bindings.iter().map(|b| b.input).collect();
        }
        if let Ok(mut f) = self.device_filter.write() {
            f.keyboards = settings.keyboards.iter().cloned().collect();
            f.mice = settings.mice.iter().cloned().collect();
        }
        if let Ok(mut s) = self.settings.write() {
            *s = settings;
        }
        self.version.fetch_add(1, Ordering::Release);
    }

    pub fn snapshot(&self) -> EngineSettings {
        self.settings.read().map(|s| s.clone()).unwrap_or_default()
    }

    /// Envía un evento al worker si la emulación está activa.
    pub fn dispatch(&self, ev: RawEvent) {
        if let Ok(guard) = self.event_tx.lock() {
            if let Some(tx) = guard.as_ref() {
                let _ = tx.send(ev);
            }
        }
    }
}

pub fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
