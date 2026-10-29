# Blueprint Maestro: Emulador de Mando Xbox con Tauri, Rust, ViGEmBus y Suscripción SaaS

Esta guía contiene la especificación técnica completa y modular para construir desde cero un software de emulación de mando virtual de Xbox (estilo reWASD) para Windows, optimizado para alto rendimiento (1000 Hz / 1 ms), con interfaz gráfica moderna e integración con sistema de licencias por hardware (HWID) y suscripción Stripe con 3 días de prueba gratuita.

---

## Índice General

1. [Entorno de Desarrollo y Prerrequisitos de Windows](#modulo-1-entorno-de-desarrollo-y-prerrequisitos)
2. [Estructura del Proyecto y Configuración Base](#modulo-2-estructura-del-proyecto-y-configuración-base)
3. [Motor Nativo: Captura de Entrada (Win32 Raw Input & Low-Level Hooks)](#modulo-3-motor-nativo-captura-de-entrada)
4. [Motor Matemático: Algoritmo Cinemático y Curvas de Respuesta](#modulo-4-motor-matemático-algoritmo-cinemático-y-curvas)
5. [Inyección de Hardware: Integración con ViGEmBus](#modulo-5-inyección-de-hardware-integración-con-vigembus)
6. [Sistema de Licenciamiento: HWID, Criptografía Ed25519 y Supabase](#modulo-6-sistema-de-licenciamiento-hwid-criptografía-y-supabase)
7. [Interfaz Gráfica: Tauri v2 IPC y Frontend React](#modulo-7-interfaz-gráfica-tauri-v2-ipc-y-frontend-react)
8. [Pipeline de Compilación, Empaquetado NSIS y Firma Digital](#modulo-8-pipeline-de-compilación-empaquetado-y-firma-digital)

---

## Módulo 1: Entorno de Desarrollo y Prerrequisitos

Para compilar código en bajo nivel e interactuar con el subsistema de controladores de Windows, se requiere un entorno Windows 10/11 x64 configurado con precisión:

### 1.1. Herramientas Obligatorias

1. **Visual Studio 2022 (Community o Build Tools):**
   * Instalar la carga de trabajo: **Desarrollo para el escritorio con C++** (*Desktop development with C++*).
   * Componentes individuales requeridos:
     * MSVC v143 (o superior).
     * Windows 10/11 SDK (versión 10.0.22621.0 o superior).
     * CMake Tools para Windows.
2. **Rust Toolchain:**
   * Instalar vía `rustup` ([rustup.rs](https://rustup.rs/)).
   * Establecer toolchain predeterminado:
     ```powershell
     rustup default stable-x86_64-pc-windows-msvc
     ```
3. **Node.js y Gestor de Paquetes:**
   * Node.js v20+ LTS instalado.
   * `pnpm` instalado globalmente: `npm install -g pnpm`.
4. **Driver de Emulación de Hardware (ViGEmBus):**
   * Descargar e instalar el runtime oficial de [ViGEmBus (Virtual Gamepad Emulation Bus)](https://github.com/nefarius/ViGEmBus/releases).
   * Verificar en el Administrador de Dispositivos que aparezca bajo *Dispositivos del sistema* -> `Virtual Gamepad Emulation Bus`.

---

## Módulo 2: Estructura del Proyecto y Configuración Base

### 2.1. Inicialización de Tauri v2

Ejecutar en la terminal de PowerShell:

```powershell
pnpm create tauri-app@latest xbox-emulator --template react-ts
cd xbox-emulator
pnpm install
```

### 2.2. Árbol de Directorios del Proyecto

```
xbox-emulator/
├── package.json
├── vite.config.ts
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── ControllerViewer.tsx
│   │   ├── CurveTuner.tsx
│   │   └── LicenseStatus.tsx
│   └── services/
│       └── tauriBridge.ts
└── src-tauri/
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── app.manifest
    └── src/
        ├── main.rs
        ├── engine/
        │   ├── mod.rs
        │   ├── input_capture.rs
        │   ├── kinematics.rs
        │   └── vigem_worker.rs
        └── licensing/
            ├── mod.rs
            ├── hwid.rs
            └── crypto.rs
```

### 2.3. Dependencias de Rust (`src-tauri/Cargo.toml`)

```toml
[package]
name = "xbox-emulator"
version = "1.0.0"
description = "Controlador virtual de alto estándar con captura de bajo nivel"
edition = "2021"

[build-dependencies]
tauri-build = { version = "2.0.0", features = [] }

[dependencies]
tauri = { version = "2.0.0", features = [] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.38", features = ["full"] }

# Interacción con la API de Windows
windows = { version = "0.58", features = [
    "Win32_Foundation",
    "Win32_UI_WindowsAndMessaging",
    "Win32_UI_Input",
    "Win32_System_Threading",
    "Win32_Media"
] }

# Driver ViGEmClient
vigem-client = "0.2"

# Criptografía y Fingerprint HWID
sha2 = "0.10"
ed25519-dalek = { version = "2.1", features = ["rand_core"] }
base64 = "0.22"
sysinfo = "0.30"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
panic = "abort"
strip = true
```

### 2.4. Elevación de Privilegios (`src-tauri/app.manifest`)

Para evitar que juegos ejecutados en modo administrador ignoren la captura de teclado y ratón, la aplicación debe requerir elevación mediante su manifiesto:

```xml
<?xml version="1.0" encoding="utf-8"?>
<assembly manifestVersion="1.0" xmlns="urn:schemas-microsoft-com:asm.v1">
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v2">
    <security>
      <requestedPrivileges xmlns="urn:schemas-microsoft-com:asm.v3">
        <requestedExecutionLevel level="requireAdministrator" uiAccess="false" />
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>
```

Configurar `src-tauri/build.rs`:

```rust
fn main() {
    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(include_str!("app.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("Fallo al compilar recursos de Tauri");
}
```

---

## Módulo 3: Motor Nativo: Captura de Entrada

Para lograr una tasa de refresco libre de tirones (*micro-stutter*), la captura no debe ejecutarse en el bucle principal de la aplicación ni en el renderizador de la UI. Se crea un hilo Win32 dedicado para `Raw Input` (ratón) y un Hook de bajo nivel (teclado).

### 3.1. Hilo de Captura (`src-tauri/src/engine/input_capture.rs`)

```rust
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::thread;
use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::UI::Input::*;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Debug, Clone, Copy)]
pub enum RawEvent {
    MouseMove { dx: i32, dy: i32 },
    KeyAction { vk_code: u32, is_down: bool },
}

pub struct InputCaptureService {
    is_running: Arc<AtomicBool>,
}

impl InputCaptureService {
    pub fn new() -> Self {
        Self {
            is_running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, tx: Sender<RawEvent>) {
        self.is_running.store(true, Ordering::SeqCst);
        let running = self.is_running.clone();

        thread::spawn(move || unsafe {
            // Registro de Raw Input Devices
            let devices = [
                RAWINPUTDEVICE {
                    usUsagePage: 0x01, // Generic Desktop Controls
                    usUsage: 0x02,     // Mouse
                    dwFlags: RIDEV_INPUTSINK,
                    hwndTarget: HWND(0),
                },
            ];

            let registered = RegisterRawInputDevices(
                &devices,
                std::mem::size_of::<RAWINPUTDEVICE>() as u32,
            );

            if registered.is_err() {
                eprintln!("[Error] No se pudo registrar Raw Input Devices.");
                return;
            }

            let mut msg = MSG::default();
            while running.load(Ordering::Relaxed) {
                // Obtener mensajes sin bloquear permanentemente
                if PeekMessageW(&mut msg, HWND(0), 0, 0, PM_REMOVE).as_bool() {
                    if msg.message == WM_INPUT {
                        let mut raw_size: u32 = 0;
                        GetRawInputData(
                            HRAWINPUT(msg.lParam.0),
                            RID_INPUT,
                            None,
                            &mut raw_size,
                            std::mem::size_of::<RAWINPUTHEADER>() as u32,
                        );

                        let mut buffer: Vec<u8> = vec![0; raw_size as usize];
                        if GetRawInputData(
                            HRAWINPUT(msg.lParam.0),
                            RID_INPUT,
                            Some(buffer.as_mut_ptr() as *mut _),
                            &mut raw_size,
                            std::mem::size_of::<RAWINPUTHEADER>() as u32,
                        ) == raw_size
                        {
                            let raw = &*(buffer.as_ptr() as *const RAWINPUT);
                            if raw.header.dwType == RIM_TYPEMOUSE.0 {
                                let mouse = raw.data.mouse;
                                let dx = mouse.lLastX;
                                let dy = mouse.lLastY;
                                if dx != 0 || dy != 0 {
                                    let _ = tx.send(RawEvent::MouseMove { dx, dy });
                                }
                            }
                        }
                    }
                    TranslateMessage(&msg);
                    DispatchMessageW(&msg);
                } else {
                    thread::sleep(std::time::Duration::from_micros(250));
                }
            }
        });
    }

    pub fn stop(&self) {
        self.is_running.store(false, Ordering::SeqCst);
    }
}
```

---

## Módulo 4: Motor Matemático: Algoritmo Cinemático y Curvas

Un joystick de consola es un vector posicional acotado a un radio circular de $[-32768, 32767]$, mientras que el mouse genera ráfagas de velocidad $(\Delta X, \Delta Y)$. Para que el control se sienta fluido y preciso, se aplica una función matemática con zona muerta, aceleración exponencial y decaimiento temporal (*exponential decay*).

### 4.1. Cinemática de Stick (`src-tauri/src/engine/kinematics.rs`)

```rust
pub struct KinematicsConfig {
    pub deadzone_inner: f32, // Umbral para empezar a registrar movimiento (ej. 0.15)
    pub deadzone_outer: f32, // Límite donde se satura la deflexión al 100% (ej. 0.95)
    pub sensitivity: f32,    // Factor de multiplicación
    pub exponent: f32,       // Curva de respuesta: 1.0 = Lineal, >1.0 = Progresiva/Bézier
    pub decay_rate: f32,     // Suavizado cuando el mouse deja de moverse
}

impl Default for KinematicsConfig {
    fn default() -> Self {
        Self {
            deadzone_inner: 0.12,
            deadzone_outer: 0.98,
            sensitivity: 2.2,
            exponent: 1.35,
            decay_rate: 0.85,
        }
    }
}

pub struct StickProcessor {
    config: KinematicsConfig,
    current_x: f32,
    current_y: f32,
}

impl StickProcessor {
    pub fn new(config: KinematicsConfig) -> Self {
        Self {
            config,
            current_x: 0.0,
            current_y: 0.0,
        }
    }

    /// Transforma los diferenciales del ratón en valores analógicos de 16 bits (-32768 a 32767)
    pub fn process_delta(&mut self, dx: i32, dy: i32) -> (i16, i16) {
        let f_dx = (dx as f32) * self.config.sensitivity;
        let f_dy = -(dy as f32) * self.config.sensitivity; // Inversión estándar del eje Y para gamepad

        // Magnitud euclidiana
        let raw_magnitude = (f_dx.powi(2) + f_dy.powi(2)).sqrt();

        if raw_magnitude <= 0.001 {
            // Aplicar decaimiento progresivo si no hay entrada
            self.current_x *= self.config.decay_rate;
            self.current_y *= self.config.decay_rate;
        } else {
            let normalized_magnitude = (raw_magnitude / 100.0).clamp(0.0, 1.0);

            // Mapeo dentro de las zonas muertas
            let processed_magnitude = if normalized_magnitude < self.config.deadzone_inner {
                0.0
            } else {
                let range = self.config.deadzone_outer - self.config.deadzone_inner;
                let scale = (normalized_magnitude - self.config.deadzone_inner) / range;
                scale.clamp(0.0, 1.0).powf(self.config.exponent)
            };

            let angle = f_dy.atan2(f_dx);
            self.current_x = angle.cos() * processed_magnitude;
            self.current_y = angle.sin() * processed_magnitude;
        }

        // Conversión a rango entero de 16 bits de XInput
        let final_x = (self.current_x * 32767.0).clamp(-32768.0, 32767.0) as i16;
        let final_y = (self.current_y * 32767.0).clamp(-32768.0, 32767.0) as i16;

        (final_x, final_y)
    }
}
```

---

## Módulo 5: Inyección de Hardware: Integración con ViGEmBus

Este componente toma las coordenadas calculadas y alimenta continuamente el controlador virtual a una frecuencia fija de $1000\text{ Hz}$ (1 ms) utilizando el timer multimedia de Windows (`timeBeginPeriod(1)`).

### 5.1. Worker de Emulación (`src-tauri/src/engine/vigem_worker.rs`)

```rust
use crate::engine::kinematics::{KinematicsConfig, StickProcessor};
use crate::engine::input_capture::RawEvent;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use vigem_client::{Client, TargetId, XGamepad, Xbox360};
use windows::Win32::Media::timeBeginPeriod;

pub struct ViGEmWorker {
    is_active: Arc<AtomicBool>,
}

impl ViGEmWorker {
    pub fn new() -> Self {
        Self {
            is_active: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn start(&self, rx: Receiver<RawEvent>, config: KinematicsConfig) -> Result<(), String> {
        self.is_active.store(true, Ordering::SeqCst);
        let active = self.is_active.clone();

        thread::spawn(move || {
            // Forzar resolución de programador de tareas de Windows a 1ms
            unsafe { timeBeginPeriod(1) };

            let client = Client::connect().expect("No se pudo conectar al driver ViGEmBus");
            let mut target = Xbox360::new(client, TargetId::XBOX360_WIRED);
            target.plugin().expect("No se pudo conectar el gamepad virtual");
            target.wait_ready().expect("Gamepad virtual no responde");

            let mut processor = StickProcessor::new(config);
            let mut gamepad = XGamepad::default();

            let mut accum_dx = 0;
            let mut accum_dy = 0;

            while active.load(Ordering::Relaxed) {
                // Drenar eventos de la cola de Raw Input
                while let Ok(event) = rx.try_recv() {
                    match event {
                        RawEvent::MouseMove { dx, dy } => {
                            accum_dx += dx;
                            accum_dy += dy;
                        }
                        RawEvent::KeyAction { vk_code, is_down } => {
                            // Mapeo básico de ejemplo: Espacio -> Botón A
                            if vk_code == 0x20 {
                                if is_down {
                                    gamepad.buttons.raw |= vigem_client::XButtons::A;
                                } else {
                                    gamepad.buttons.raw &= !vigem_client::XButtons::A;
                                }
                            }
                        }
                    }
                }

                // Procesar movimiento analógico del stick derecho
                let (stick_x, stick_y) = processor.process_delta(accum_dx, accum_dy);
                accum_dx = 0;
                accum_dy = 0;

                gamepad.thumb_rx = stick_x;
                gamepad.thumb_ry = stick_y;

                let _ = target.update(&gamepad);

                // Espera precisa de 1ms (1000 Hz)
                thread::sleep(Duration::from_millis(1));
            }

            let _ = target.unplug();
        });

        Ok(())
    }

    pub fn stop(&self) {
        self.is_active.store(false, Ordering::SeqCst);
    }
}
```

---

## Módulo 6: Sistema de Licenciamiento: HWID, Criptografía y Supabase

Para evitar fraudes en el período de prueba de 3 días gratuitos, el cliente genera un identificador de hardware irreversible que se valida contra Supabase. La autorización se otorga mediante un token firmado por el servidor usando **Ed25519**.

### 6.1. Generación de Hardware ID (`src-tauri/src/licensing/hwid.rs`)

```rust
use sha2::{Digest, Sha256};
use std::process::Command;

pub fn get_hardware_fingerprint() -> String {
    let mut hasher = Sha256::new();

    // Obtener UUID de placa base mediante WMIC
    let output = Command::new("wmic")
        .args(["csproduct", "get", "UUID"])
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
        .unwrap_or_else(|_| "UNKNOWN_UUID".into());

    let clean_uuid = output.lines().nth(1).unwrap_or("").trim();
    hasher.update(clean_uuid.as_bytes());

    // Añadir identificador del procesador
    let cpu_info = std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default();
    hasher.update(cpu_info.as_bytes());

    format!("{:x}", hasher.finalize())
}
```

### 6.2. Verificación Local Criptográfica (`src-tauri/src/licensing/crypto.rs`)

El servidor emite una carga útil JSON y una firma Base64. El cliente almacena la clave pública del servidor embebida en el binario:

```rust
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

// Clave pública fija del servidor generada previamente (32 bytes en hex o raw)
const SERVER_PUBLIC_KEY: [u8; 32] = [
    0xa3, 0x5f, 0x12, 0x90, 0x44, 0xab, 0xcd, 0xef,
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
    0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01,
];

#[derive(Serialize, Deserialize, Debug)]
pub struct LicensePayload {
    pub user_id: String,
    pub hwid: String,
    pub expires_at: i64, // Unix Timestamp
    pub status: String,  // "trial" o "active"
}

pub fn verify_license_token(payload_json: &str, signature_b64: &str, current_hwid: &str) -> bool {
    let verifying_key = match VerifyingKey::from_bytes(&SERVER_PUBLIC_KEY) {
        Ok(k) => k,
        Err(_) => return false,
    };

    let sig_bytes = match base64::decode(signature_b64) {
        Ok(b) => b,
        Err(_) => return false,
    };

    let signature = match Signature::from_bytes(&sig_bytes[..]) {
        Ok(s) => s,
        Err(_) => return false,
    };

    // Verificar firma Ed25519
    if verifying_key.verify(payload_json.as_bytes(), &signature).is_err() {
        return false;
    }

    // Verificar expiración y coincidencia de HWID
    let payload: LicensePayload = match serde_json::from_str(payload_json) {
        Ok(p) => p,
        Err(_) => return false,
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if payload.hwid != current_hwid || payload.expires_at < now {
        return false;
    }

    true
}
```

### 6.3. Esquema de Base de Datos y Lógica del Trial (Supabase SQL)

Ejecutar en la consola SQL de Supabase:

```sql
-- 1. Tabla de Dispositivos y Licencias
create table public.licenses (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    hwid text not null unique,
    status text not null default 'trial', -- 'trial', 'active', 'expired'
    trial_start_at timestamptz not null default now(),
    trial_end_at timestamptz not null default (now() + interval '3 days'),
    stripe_subscription_id text,
    created_at timestamptz not null default now()
);

-- Habilitar RLS
alter table public.licenses enable row level security;

create policy "Lectura de usuario para su propia licencia"
    on public.licenses for select
    using (auth.uid() = user_id);

-- 2. Función almacenada para registrar dispositivo con trial único de 3 días
create or replace function public.register_or_validate_device(device_hwid text)
returns json as $$
declare
    v_license public.licenses%rowtype;
    v_now timestamptz := now();
begin
    -- Buscar si el HWID ya fue registrado
    select * into v_license from public.licenses where hwid = device_hwid;

    if not found then
        -- Primer registro del dispositivo: se otorgan 3 días
        insert into public.licenses (user_id, hwid, status, trial_start_at, trial_end_at)
        values (auth.uid(), device_hwid, 'trial', v_now, v_now + interval '3 days')
        returning * into v_license;
    else
        -- Si el HWID ya existe pero el usuario actual es diferente, rechazar asignación fraudulenta
        if v_license.user_id <> auth.uid() then
            return json_build_object('allowed', false, 'reason', 'HWID ya registrado con otra cuenta.');
        end if;
    end if;

    -- Comprobar estado de vigencia
    if v_license.status = 'active' then
        return json_build_object('allowed', true, 'status', 'active', 'expires_at', 9999999999);
    elsif v_license.status = 'trial' and v_license.trial_end_at > v_now then
        return json_build_object(
            'allowed', true, 
            'status', 'trial', 
            'expires_at', extract(epoch from v_license.trial_end_at)::bigint
        );
    else
        return json_build_object('allowed', false, 'reason', 'El periodo de prueba de 3 dias ha expirado.');
    end if;
end;
$$ language plpgsql security definer;
```

---

## Módulo 7: Interfaz Gráfica: Tauri v2 IPC y Frontend React

### 7.1. Punto de Entrada Tauri (`src-tauri/src/main.rs`)

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod engine;
mod licensing;

use engine::input_capture::{InputCaptureService, RawEvent};
use engine::kinematics::KinematicsConfig;
use engine::vigem_worker::ViGEmWorker;
use licensing::crypto::verify_license_token;
use licensing::hwid::get_hardware_fingerprint;

use std::sync::mpsc::channel;
use std::sync::Mutex;
use tauri::State;

struct AppState {
    capture: Mutex<InputCaptureService>,
    worker: Mutex<ViGEmWorker>,
}

#[tauri::command]
fn get_hwid() -> String {
    get_hardware_fingerprint()
}

#[tauri::command]
fn start_emulation(
    state: State<'_, AppState>,
    token_json: String,
    sig: String,
) -> Result<String, String> {
    let hwid = get_hardware_fingerprint();
    
    // Validación estricta antes de iniciar hilos de captura
    if !verify_license_token(&token_json, &sig, &hwid) {
        return Err("Licencia no válida o período de prueba expirado.".into());
    }

    let (tx, rx) = channel::<RawEvent>();

    let capture = state.capture.lock().unwrap();
    let worker = state.worker.lock().unwrap();

    capture.start(tx);
    worker.start(rx, KinematicsConfig::default())?;

    Ok("Emulación iniciada a 1000 Hz".into())
}

#[tauri::command]
fn stop_emulation(state: State<'_, AppState>) -> Result<String, String> {
    let capture = state.capture.lock().unwrap();
    let worker = state.worker.lock().unwrap();

    capture.stop();
    worker.stop();

    Ok("Emulación detenida".into())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState {
            capture: Mutex::new(InputCaptureService::new()),
            worker: Mutex::new(ViGEmWorker::new()),
        })
        .invoke_handler(tauri::generate_handler![
            get_hwid,
            start_emulation,
            stop_emulation
        ])
        .run(tauri::generate_context!())
        .expect("Error al inicializar la aplicación");
}
```

### 7.2. Frontend: Componente Principal (`src/App.tsx`)

```tsx
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export default function App() {
  const [hwid, setHwid] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [licenseStatus, setLicenseStatus] = useState<string>('Verificando...');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>('get_hwid').then(setHwid);
  }, []);

  const handleToggle = async () => {
    setErrorMessage(null);
    if (!isRunning) {
      try {
        // En producción: payload y firma provistos por la API de backend firmados con Ed25519
        const dummyPayload = JSON.stringify({
          user_id: "demo-user",
          hwid: hwid,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
          status: "trial"
        });
        const dummySignature = "FAKESIGNATURE==";

        const res = await invoke<string>('start_emulation', {
          tokenJson: dummyPayload,
          sig: dummySignature,
        });
        setIsRunning(true);
      } catch (err: any) {
        setErrorMessage(err.toString());
      }
    } else {
      await invoke('stop_emulation');
      setIsRunning(false);
    }
  };

  return (
    <div style={{ padding: '30px', fontFamily: 'Segoe UI, sans-serif', background: '#121212', color: '#fff', minHeight: '100vh' }}>
      <h1>Xbox Virtual Controller Bridge</h1>
      
      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
        <h3>Estado de Licencia</h3>
        <p><strong>HWID:</strong> <code>{hwid}</code></p>
        <p><strong>Prueba Gratuita:</strong> 3 Días activos</p>
      </div>

      <div style={{ background: '#1e1e1e', padding: '20px', borderRadius: '8px' }}>
        <h3>Control de Emulación (1000 Hz)</h3>
        {errorMessage && (
          <div style={{ color: '#ff5555', marginBottom: '15px' }}>
            {errorMessage}
          </div>
        )}
        <button
          onClick={handleToggle}
          style={{
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            borderRadius: '6px',
            border: 'none',
            cursor: 'pointer',
            backgroundColor: isRunning ? '#d32f2f' : '#2e7d32',
            color: '#fff',
          }}
        >
          {isRunning ? 'Detener Emulador' : 'Iniciar Emulador Virtual'}
        </button>
      </div>
    </div>
  );
}
```

---

## Módulo 8: Pipeline de Compilación, Empaquetado y Firma Digital

### 8.1. Configuración del Instalador NSIS (`src-tauri/tauri.conf.json`)

```json
{
  "productName": "XboxControllerBridge",
  "version": "1.0.0",
  "identifier": "com.reWASDalternative.virtualcontroller",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "pnpm dev",
    "beforeBuildCommand": "pnpm build"
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "msi"],
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/icon.ico"
    ],
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": "http://timestamp.digicert.com",
      "nsis": {
        "installMode": "perMachine",
        "languages": ["Spanish", "English"]
      }
    }
  }
}
```

### 8.2. Compilación en Producción

Ejecutar desde PowerShell en la raíz del proyecto:

```powershell
# 1. Compilación del bundle completo optimizado
pnpm tauri build
```

El binario de instalación se genera en:
`src-tauri/target/release/bundle/nsis/XboxControllerBridge_1.0.0_x64-setup.exe`

### 8.3. Firma de Código Digital (Code Signing)

Para evitar la pantalla de bloqueo de **Windows Defender SmartScreen**, firma el archivo `.exe` generado con tu certificado de firma de código (EV o Standard):

```powershell
$signtool = "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe"
$setupPath = "src-tauri\target\release\bundle\nsis\XboxControllerBridge_1.0.0_x64-setup.exe"

& $signtool sign /f "C:\Certs\CodeSigningCert.pfx" `
  /p "PasswordCertificado" `
  /fd SHA256 `
  /tr http://timestamp.digicert.com `
  /td SHA256 `
  $setupPath
```

---

## Checklist de Pruebas y Control de Calidad

1. **Verificación de Inyección:**
   * Abrir la consola de Windows y ejecutar `joy.cpl`.
   * Al presionar "Iniciar Emulador Virtual" en la aplicación, debe aparecer de inmediato un dispositivo denominado `Xbox 360 Controller for Windows`.
   * Al mover el ratón físico, la cruceta analógica en `joy.cpl` debe desplazarse sin saltos bruscos.
2. **Prueba de Latencia:**
   * Utilizar una herramienta de sondeo de gamepad (ej. *Gamepad Poller*) para confirmar que el reporte se procesa a $1000\text{ Hz}$ con un intervalo medio de $\approx 1.0\text{ ms}$.
3. **Validación de HWID:**
   * Comprobar que modificar la dirección MAC o IP no altera el HWID generado, garantizando que el usuario no pueda reiniciar su prueba gratuita de 3 días sin adquirir una suscripción activa vía Stripe.