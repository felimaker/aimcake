//! Worker de emulación: alimenta el gamepad virtual de ViGEmBus a frecuencia fija.

use crate::engine::input_capture::RawEvent;
use crate::engine::kinematics::{to_axis, StickProcessor};
use crate::engine::mapping::Mapper;
use crate::engine::{unix_now, EngineShared};

use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use vigem_client::{Client, DS4Report, DualShock4Wired, TargetId, XGamepad, Xbox360Wired};
use windows::core::PCWSTR;
use windows::Win32::Foundation::{CloseHandle, BOOL, HANDLE};
use windows::Win32::Media::{timeBeginPeriod, timeEndPeriod};
use windows::Win32::System::Threading::{
    CreateWaitableTimerExW, GetCurrentThread, SetThreadPriority, SetWaitableTimer,
    WaitForSingleObject, THREAD_PRIORITY_TIME_CRITICAL,
};

/// Duración del pulso generado por la rueda del ratón.
const WHEEL_PULSE: Duration = Duration::from_millis(40);

/// Mando virtual conectado al bus. Toda la lógica trabaja con el estado XInput
/// (`XGamepad`); para DualShock 4 se traduce al informe HID en cada `update`.
enum VirtualPad {
    Xbox(Xbox360Wired<Client>),
    Ds4(DualShock4Wired<Client>),
}

impl VirtualPad {
    /// `kind`: "DS4" crea un DualShock 4; cualquier otro valor ("X360", "XONE", None)
    /// crea un Xbox 360 (Xbox One/Series usan el mismo protocolo XInput en Windows).
    fn create(client: Client, kind: Option<&str>) -> Self {
        match kind {
            Some("DS4") => VirtualPad::Ds4(DualShock4Wired::new(client, TargetId::DUALSHOCK4_WIRED)),
            _ => VirtualPad::Xbox(Xbox360Wired::new(client, TargetId::XBOX360_WIRED)),
        }
    }

    fn plugin(&mut self) -> Result<(), vigem_client::Error> {
        match self {
            VirtualPad::Xbox(t) => t.plugin(),
            VirtualPad::Ds4(t) => t.plugin(),
        }
    }

    fn wait_ready(&mut self) -> Result<(), vigem_client::Error> {
        match self {
            VirtualPad::Xbox(t) => t.wait_ready(),
            VirtualPad::Ds4(t) => t.wait_ready(),
        }
    }

    fn unplug(&mut self) -> Result<(), vigem_client::Error> {
        match self {
            VirtualPad::Xbox(t) => t.unplug(),
            VirtualPad::Ds4(t) => t.unplug(),
        }
    }

    fn update(&mut self, g: &XGamepad) -> Result<(), vigem_client::Error> {
        match self {
            VirtualPad::Xbox(t) => t.update(g),
            VirtualPad::Ds4(t) => t.update(&to_ds4(g)),
        }
    }
}

/// Traduce el estado XInput a un informe DualShock 4.
/// Ejes: XInput i16 (Y+ arriba) → DS4 u8 centrado en 0x80 (Y+ abajo).
fn to_ds4(g: &XGamepad) -> DS4Report {
    const UP: u16 = 0x0001;
    const DOWN: u16 = 0x0002;
    const LEFT: u16 = 0x0004;
    const RIGHT: u16 = 0x0008;
    let b = g.buttons.raw;
    let has = |m: u16| b & m != 0;

    // Cruceta como "hat": 0 = N, 1 = NE … 7 = NO, 8 = suelta.
    let (u, d, l, r) = (has(UP), has(DOWN), has(LEFT), has(RIGHT));
    let hat: u16 = match (u && !d, d && !u, r && !l, l && !r) {
        (true, _, true, _) => 1,
        (_, true, true, _) => 3,
        (_, true, _, true) => 5,
        (true, _, _, true) => 7,
        (true, _, _, _) => 0,
        (_, _, true, _) => 2,
        (_, true, _, _) => 4,
        (_, _, _, true) => 6,
        _ => 8,
    };

    let mut buttons = hat;
    let map: [(u16, u16); 10] = [
        (0x4000, 1 << 4),  // X → Cuadrado
        (0x1000, 1 << 5),  // A → Cruz
        (0x2000, 1 << 6),  // B → Círculo
        (0x8000, 1 << 7),  // Y → Triángulo
        (0x0100, 1 << 8),  // LB → L1
        (0x0200, 1 << 9),  // RB → R1
        (0x0020, 1 << 12), // BACK → Share
        (0x0010, 1 << 13), // START → Options
        (0x0040, 1 << 14), // LTHUMB → L3
        (0x0080, 1 << 15), // RTHUMB → R3
    ];
    for (x, ds) in map {
        if has(x) {
            buttons |= ds;
        }
    }
    if g.left_trigger > 0 {
        buttons |= 1 << 10; // L2 (digital)
    }
    if g.right_trigger > 0 {
        buttons |= 1 << 11; // R2 (digital)
    }

    let axis = |v: i16| ((v as i32 + 32768) >> 8) as u8;
    let axis_inv = |v: i16| 255 - axis(v);
    DS4Report {
        thumb_lx: axis(g.thumb_lx),
        thumb_ly: axis_inv(g.thumb_ly),
        thumb_rx: axis(g.thumb_rx),
        thumb_ry: axis_inv(g.thumb_ry),
        buttons,
        special: if has(0x0400) { 1 } else { 0 }, // GUIDE → botón PS
        trigger_l: g.left_trigger,
        trigger_r: g.right_trigger,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GamepadSnapshot {
    pub buttons: u16,
    pub lt: u8,
    pub rt: u8,
    pub lx: i16,
    pub ly: i16,
    pub rx: i16,
    pub ry: i16,
    pub hz: f64,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStopped {
    pub reason: String,
}

/// Temporizador de alta resolución (Windows 10 1803+) con espera activa final.
struct PrecisionTimer {
    handle: Option<HANDLE>,
}

impl PrecisionTimer {
    fn new() -> Self {
        // CREATE_WAITABLE_TIMER_HIGH_RESOLUTION = 0x2, TIMER_ALL_ACCESS = 0x1F0003
        let handle = unsafe { CreateWaitableTimerExW(None, PCWSTR::null(), 0x2, 0x1F0003).ok() };
        Self { handle }
    }

    fn wait_until(&self, deadline: Instant) {
        let now = Instant::now();
        if deadline <= now {
            return;
        }
        let remaining = deadline - now;
        let spin_margin = Duration::from_micros(150);
        if remaining > spin_margin {
            let sleep_for = remaining - spin_margin;
            let mut slept = false;
            if let Some(h) = self.handle {
                let due: i64 = -((sleep_for.as_nanos() / 100) as i64);
                unsafe {
                    if SetWaitableTimer(h, &due, 0, None, None, BOOL::from(false)).is_ok() {
                        WaitForSingleObject(h, 50);
                        slept = true;
                    }
                }
            }
            if !slept {
                thread::sleep(sleep_for);
            }
        }
        while Instant::now() < deadline {
            std::hint::spin_loop();
        }
    }
}

impl Drop for PrecisionTimer {
    fn drop(&mut self) {
        if let Some(h) = self.handle.take() {
            unsafe {
                let _ = CloseHandle(h);
            }
        }
    }
}

pub struct ViGEmWorker {
    is_active: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

impl ViGEmWorker {
    pub fn new() -> Self {
        Self { is_active: Arc::new(AtomicBool::new(false)), handle: None }
    }

    pub fn is_running(&self) -> bool {
        self.is_active.load(Ordering::SeqCst)
            && self.handle.as_ref().map(|h| !h.is_finished()).unwrap_or(false)
    }

    pub fn start(
        &mut self,
        rx: Receiver<RawEvent>,
        shared: Arc<EngineShared>,
        app: AppHandle,
    ) -> Result<(), String> {
        if self.is_running() {
            return Err("La emulación ya está en ejecución.".into());
        }
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }

        self.is_active.store(true, Ordering::SeqCst);
        let active = self.is_active.clone();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        let handle = thread::Builder::new()
            .name("vigem-worker".into())
            .spawn(move || run_worker(rx, shared, app, active, ready_tx))
            .map_err(|e| format!("No se pudo crear el hilo de emulación: {e}"))?;

        match ready_rx.recv_timeout(Duration::from_secs(5)) {
            Ok(Ok(())) => {
                self.handle = Some(handle);
                Ok(())
            }
            Ok(Err(e)) => {
                self.is_active.store(false, Ordering::SeqCst);
                let _ = handle.join();
                Err(e)
            }
            Err(_) => {
                self.is_active.store(false, Ordering::SeqCst);
                Err("El driver ViGEmBus no respondió a tiempo.".into())
            }
        }
    }

    pub fn stop(&mut self) {
        self.is_active.store(false, Ordering::SeqCst);
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}

impl Drop for ViGEmWorker {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Comprueba si el driver ViGEmBus está instalado y accesible.
pub fn check_driver() -> Result<(), String> {
    Client::connect()
        .map(|_| ())
        .map_err(|e| format!("ViGEmBus no disponible: {e:?}"))
}

fn run_worker(
    rx: Receiver<RawEvent>,
    shared: Arc<EngineShared>,
    app: AppHandle,
    active: Arc<AtomicBool>,
    ready: Sender<Result<(), String>>,
) {
    // Forzar resolución del programador de Windows a 1 ms.
    unsafe {
        timeBeginPeriod(1);
        let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
    }

    let fail = |msg: String| {
        unsafe { timeEndPeriod(1) };
        let _ = ready.send(Err(msg));
    };

    let client = match Client::connect() {
        Ok(c) => c,
        Err(e) => {
            return fail(format!(
                "No se pudo conectar al driver ViGEmBus ({e:?}). Instálalo desde github.com/nefarius/ViGEmBus."
            ))
        }
    };
    let controller = shared.snapshot().controller;
    let mut target = VirtualPad::create(client, controller.as_deref());
    if let Err(e) = target.plugin() {
        return fail(format!("No se pudo conectar el gamepad virtual: {e:?}"));
    }
    if let Err(e) = target.wait_ready() {
        let _ = target.unplug();
        return fail(format!("El gamepad virtual no responde: {e:?}"));
    }
    let _ = ready.send(Ok(()));

    let mut settings = shared.snapshot();
    let mut version = shared.version.load(Ordering::Acquire);
    let mut processor = StickProcessor::new(settings.config.clone());
    let mut mapper = Mapper::new(&settings.bindings);
    let timer = PrecisionTimer::new();

    let mut pressed: HashSet<u32> = HashSet::new();
    let mut wheel_until: HashMap<u32, Instant> = HashMap::new();
    let (mut accum_dx, mut accum_dy) = (0i32, 0i32);

    let mut next = Instant::now();
    let mut tick_count: u32 = 0;
    let mut hz_window = Instant::now();
    let mut measured_hz = 0.0f64;
    let mut ui_last = Instant::now();
    let mut license_check = Instant::now();
    let mut stop_reason: Option<String> = None;

    while active.load(Ordering::Relaxed) {
        // Recargar ajustes si la UI los cambió.
        let v = shared.version.load(Ordering::Acquire);
        if v != version {
            settings = shared.snapshot();
            processor.set_config(settings.config.clone());
            mapper = Mapper::new(&settings.bindings);
            version = v;
        }
        let period = Duration::from_nanos(1_000_000_000 / settings.polling_hz.max(1) as u64);
        let period_ms = period.as_secs_f32() * 1000.0;

        // Drenar eventos de la cola de captura.
        loop {
            match rx.try_recv() {
                Ok(RawEvent::MouseMove { dx, dy }) => {
                    accum_dx = accum_dx.saturating_add(dx);
                    accum_dy = accum_dy.saturating_add(dy);
                }
                Ok(RawEvent::KeyAction { vk_code, is_down }) => {
                    if is_down {
                        pressed.insert(vk_code);
                    } else {
                        pressed.remove(&vk_code);
                    }
                }
                Ok(RawEvent::WheelPulse { vk_code }) => {
                    wheel_until.insert(vk_code, Instant::now() + WHEEL_PULSE);
                }
                Err(mpsc::TryRecvError::Empty) => break,
                Err(mpsc::TryRecvError::Disconnected) => {
                    // El canal se cierra al detener la emulación desde la UI.
                    active.store(false, Ordering::SeqCst);
                    break;
                }
            }
        }

        let now = Instant::now();
        wheel_until.retain(|_, t| *t > now);

        let paused = shared.paused.load(Ordering::Relaxed);
        let mut gamepad = XGamepad::default();
        if !paused {
            let overrides = mapper.apply(pressed.iter().chain(wheel_until.keys()), &mut gamepad);
            let mouse = match settings.mouse_target.as_str() {
                "NONE" => {
                    processor.reset();
                    None
                }
                _ => Some(processor.process_delta(accum_dx, accum_dy, period_ms)),
            };
            let to_axes = |v: (f32, f32)| (to_axis(v.0), to_axis(v.1));
            let mouse_on_ls = settings.mouse_target == "LS";

            // Stick izquierdo: teclas digitales > ratón (si está asignado al LS).
            let (lx, ly) = match (overrides.ls, mouse_on_ls, mouse) {
                (Some(v), _, _) => to_axes(v),
                (None, true, Some(m)) => m,
                _ => (0, 0),
            };
            // Stick derecho: teclas digitales > ratón (si está asignado al RS).
            let (rx, ry) = match (overrides.rs, mouse_on_ls, mouse) {
                (Some(v), _, _) => to_axes(v),
                (None, false, Some(m)) => m,
                _ => (0, 0),
            };
            gamepad.thumb_lx = lx;
            gamepad.thumb_ly = ly;
            gamepad.thumb_rx = rx;
            gamepad.thumb_ry = ry;
        } else {
            processor.reset();
        }
        accum_dx = 0;
        accum_dy = 0;

        let _ = target.update(&gamepad);

        // Métricas y telemetría para la UI (~60 fps).
        tick_count += 1;
        let elapsed = hz_window.elapsed();
        if elapsed >= Duration::from_millis(500) {
            measured_hz = tick_count as f64 / elapsed.as_secs_f64();
            tick_count = 0;
            hz_window = now;
        }
        if ui_last.elapsed() >= Duration::from_millis(16) {
            ui_last = now;
            let _ = app.emit(
                "gamepad-state",
                GamepadSnapshot {
                    buttons: gamepad.buttons.raw,
                    lt: gamepad.left_trigger,
                    rt: gamepad.right_trigger,
                    lx: gamepad.thumb_lx,
                    ly: gamepad.thumb_ly,
                    rx: gamepad.thumb_rx,
                    ry: gamepad.thumb_ry,
                    hz: measured_hz,
                    paused,
                },
            );
        }

        // Revalidar expiración de la licencia cada segundo.
        if license_check.elapsed() >= Duration::from_secs(1) {
            license_check = now;
            let exp = shared.license_expires_at.load(Ordering::Relaxed);
            if exp <= unix_now() {
                stop_reason = Some("La licencia ha expirado.".into());
                active.store(false, Ordering::SeqCst);
            }
        }

        next += period;
        timer.wait_until(next);
        // Evitar ráfagas de recuperación si el hilo se retrasó mucho.
        let late = Instant::now();
        if late > next + period * 4 {
            next = late;
        }
    }

    let _ = target.update(&XGamepad::default());
    let _ = target.unplug();
    unsafe { timeEndPeriod(1) };

    let _ = app.emit(
        "engine-stopped",
        EngineStopped { reason: stop_reason.unwrap_or_else(|| "Emulación detenida".into()) },
    );
}
