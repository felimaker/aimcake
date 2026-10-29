//! Hilo nativo de captura (siempre activo mientras la app está abierta).
//!
//! - Raw Input de teclado y ratón con identificación del dispositivo de origen
//!   (permite elegir qué teclado/ratón controla el mando, como reWASD).
//! - Hook `WH_KEYBOARD_LL` solo para bloquear teclas mapeadas y la tecla de pausa
//!   mientras se emula.
//! - Emite eventos `device-activity` a la UI para identificar dispositivos en vivo.

use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter};
use windows::core::w;
use windows::Win32::Foundation::{HANDLE, HWND, LPARAM, LRESULT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::{
    GetCurrentThread, GetCurrentThreadId, SetThreadPriority, THREAD_PRIORITY_TIME_CRITICAL,
};
use windows::Win32::UI::Input::*;
use windows::Win32::UI::WindowsAndMessaging::*;

use super::devices::{device_id, device_path, KIND_KEYBOARD, KIND_MOUSE};
use super::mapping::vk;
use super::EngineShared;

#[derive(Debug, Clone, Copy)]
pub enum RawEvent {
    MouseMove { dx: i32, dy: i32 },
    KeyAction { vk_code: u32, is_down: bool },
    /// La rueda no tiene estado "soltado": se emite un pulso corto.
    WheelPulse { vk_code: u32 },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceActivity {
    pub id: String,
    pub kind: &'static str,
    /// Última tecla/botón (VK) si aplica.
    pub vk: Option<u32>,
}

thread_local! {
    static HOOK_SHARED: RefCell<Option<Arc<EngineShared>>> = const { RefCell::new(None) };
}

static HOTKEY_HELD: AtomicBool = AtomicBool::new(false);
const WM_INPUT_DEVICE_CHANGE_MSG: u32 = 0x00FE;

pub struct InputCaptureService {
    thread_id: Arc<AtomicU32>,
    handle: Option<JoinHandle<()>>,
    pub error: Option<String>,
}

impl InputCaptureService {
    pub fn new() -> Self {
        Self { thread_id: Arc::new(AtomicU32::new(0)), handle: None, error: None }
    }

    pub fn is_running(&self) -> bool {
        self.handle.as_ref().map(|h| !h.is_finished()).unwrap_or(false)
    }

    pub fn start(&mut self, shared: Arc<EngineShared>, app: AppHandle) -> Result<(), String> {
        if self.is_running() {
            return Ok(());
        }
        let thread_id = self.thread_id.clone();
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

        let handle = thread::Builder::new()
            .name("input-capture".into())
            .spawn(move || unsafe { run_capture_loop(shared, app, thread_id, ready_tx) })
            .map_err(|e| format!("No se pudo crear el hilo de captura: {e}"))?;

        let result = match ready_rx.recv_timeout(Duration::from_secs(3)) {
            Ok(Ok(())) => {
                self.handle = Some(handle);
                Ok(())
            }
            Ok(Err(e)) => {
                let _ = handle.join();
                Err(e)
            }
            Err(_) => Err("El hilo de captura no respondió a tiempo.".into()),
        };
        self.error = result.as_ref().err().cloned();
        result
    }

    pub fn stop(&mut self) {
        let tid = self.thread_id.load(Ordering::SeqCst);
        if tid != 0 {
            unsafe {
                let _ = PostThreadMessageW(tid, WM_QUIT, WPARAM(0), LPARAM(0));
            }
        }
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for InputCaptureService {
    fn drop(&mut self) {
        self.stop();
    }
}

unsafe extern "system" fn sink_wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    DefWindowProcW(hwnd, msg, wparam, lparam)
}

/// El hook ya no genera eventos: solo pausa y bloquea teclas mapeadas durante la emulación.
unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        let injected = (kb.flags.0 & 0x10) != 0; // LLKHF_INJECTED
        let msg = wparam.0 as u32;
        let is_down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
        let is_up = msg == WM_KEYUP || msg == WM_SYSKEYUP;

        if !injected && (is_down || is_up) {
            let vk_code = kb.vkCode;
            let block = HOOK_SHARED.with(|cell| {
                let guard = cell.borrow();
                let Some(shared) = guard.as_ref() else { return false };
                if !shared.emulating.load(Ordering::Relaxed) {
                    return false;
                }

                if vk_code == shared.pause_hotkey.load(Ordering::Relaxed) {
                    if is_down && !HOTKEY_HELD.swap(true, Ordering::Relaxed) {
                        let p = shared.paused.load(Ordering::Relaxed);
                        shared.paused.store(!p, Ordering::Relaxed);
                    } else if is_up {
                        HOTKEY_HELD.store(false, Ordering::Relaxed);
                    }
                    return false;
                }

                let block = shared.suppress_keys.load(Ordering::Relaxed)
                    && !shared.paused.load(Ordering::Relaxed)
                    && shared.mapped_keys.read().map(|s| s.contains(&vk_code)).unwrap_or(false);

                // Si no hay filtro de teclado, reenviar la tecla bloqueada directamente al
                // worker para no depender del orden hook/Raw Input.
                if block {
                    let no_filter = shared.device_filter.read().map(|f| f.keyboards.is_empty()).unwrap_or(true);
                    if no_filter {
                        shared.dispatch(RawEvent::KeyAction { vk_code, is_down });
                    }
                }
                block
            });
            if block {
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

/// Pares (flag down, flag up, código VK) de RAWMOUSE.usButtonFlags.
const MOUSE_BUTTONS: [(u32, u32, u32); 5] = [
    (0x0001, 0x0002, vk::MOUSE_LEFT),
    (0x0004, 0x0008, vk::MOUSE_RIGHT),
    (0x0010, 0x0020, vk::MOUSE_MIDDLE),
    (0x0040, 0x0080, vk::MOUSE_X1),
    (0x0100, 0x0200, vk::MOUSE_X2),
];
const RI_MOUSE_WHEEL: u32 = 0x0400;

/// Convierte el VK genérico de Raw Input en su variante izquierda/derecha.
fn normalize_vk(vkey: u16, make: u16, flags: u16) -> Option<u32> {
    let e0 = flags & 0x02 != 0; // RI_KEY_E0
    match vkey {
        0xFF | 0 => None, // tecla falsa (secuencias de escape)
        0x10 => Some(if make == 0x36 { 0xA1 } else { 0xA0 }),
        0x11 => Some(if e0 { 0xA3 } else { 0xA2 }),
        0x12 => Some(if e0 { 0xA5 } else { 0xA4 }),
        v => Some(v as u32),
    }
}

struct CaptureCtx {
    shared: Arc<EngineShared>,
    app: AppHandle,
    buffer: Vec<u64>,
    /// handle de Raw Input -> id estable del dispositivo.
    ids: HashMap<isize, Option<String>>,
    /// Limitador de eventos de actividad por dispositivo.
    last_activity: HashMap<String, Instant>,
}

impl CaptureCtx {
    fn resolve(&mut self, handle: HANDLE, kind: &str) -> Option<String> {
        let key = handle.0 as isize;
        if key == 0 {
            return None;
        }
        self.ids
            .entry(key)
            .or_insert_with(|| device_path(handle).map(|p| device_id(kind, &p)))
            .clone()
    }

    fn activity(&mut self, id: &Option<String>, kind: &'static str, vk: Option<u32>, force: bool) {
        let Some(id) = id else { return };
        let now = Instant::now();
        let throttle = Duration::from_millis(if force { 30 } else { 120 });
        if let Some(t) = self.last_activity.get(id) {
            if now.duration_since(*t) < throttle {
                return;
            }
        }
        self.last_activity.insert(id.clone(), now);
        let _ = self.app.emit("device-activity", DeviceActivity { id: id.clone(), kind, vk });
    }

    unsafe fn handle_raw_input(&mut self, lparam: LPARAM) {
        let hraw = HRAWINPUT(lparam.0 as *mut c_void);
        let header_size = std::mem::size_of::<RAWINPUTHEADER>() as u32;

        let mut size: u32 = 0;
        GetRawInputData(hraw, RID_INPUT, None, &mut size, header_size);
        if size == 0 {
            return;
        }
        let words = (size as usize + 7) / 8;
        if self.buffer.len() < words {
            self.buffer.resize(words, 0);
        }
        let read = GetRawInputData(hraw, RID_INPUT, Some(self.buffer.as_mut_ptr() as *mut c_void), &mut size, header_size);
        if read != size {
            return;
        }
        let raw = &*(self.buffer.as_ptr() as *const RAWINPUT);

        match raw.header.dwType {
            0 => self.on_mouse(raw),
            1 => self.on_keyboard(raw),
            _ => {}
        }
    }

    unsafe fn on_mouse(&mut self, raw: &RAWINPUT) {
        let id = self.resolve(raw.header.hDevice, KIND_MOUSE);
        let allowed = self.shared.device_filter.read().map(|f| f.allows(true, id.as_deref())).unwrap_or(true);

        let mouse = &raw.data.mouse;
        let (dx, dy) = (mouse.lLastX, mouse.lLastY);
        let flags = mouse.Anonymous.Anonymous.usButtonFlags as u32;

        if dx != 0 || dy != 0 {
            if allowed {
                self.shared.dispatch(RawEvent::MouseMove { dx, dy });
            }
            self.activity(&id, KIND_MOUSE, None, false);
        }
        if flags == 0 {
            return;
        }
        for (down, up, code) in MOUSE_BUTTONS {
            if flags & down != 0 {
                if allowed {
                    self.shared.dispatch(RawEvent::KeyAction { vk_code: code, is_down: true });
                }
                self.activity(&id, KIND_MOUSE, Some(code), true);
            }
            if flags & up != 0 && allowed {
                self.shared.dispatch(RawEvent::KeyAction { vk_code: code, is_down: false });
            }
        }
        if flags & RI_MOUSE_WHEEL != 0 {
            let delta = mouse.Anonymous.Anonymous.usButtonData as i16;
            let code = if delta > 0 { vk::WHEEL_UP } else { vk::WHEEL_DOWN };
            if allowed {
                self.shared.dispatch(RawEvent::WheelPulse { vk_code: code });
            }
            self.activity(&id, KIND_MOUSE, Some(code), true);
        }
    }

    unsafe fn on_keyboard(&mut self, raw: &RAWINPUT) {
        let kb = &raw.data.keyboard;
        let Some(vk_code) = normalize_vk(kb.VKey, kb.MakeCode, kb.Flags) else { return };
        let is_down = kb.Flags & 0x01 == 0; // RI_KEY_BREAK
        let id = self.resolve(raw.header.hDevice, KIND_KEYBOARD);
        let allowed = self.shared.device_filter.read().map(|f| f.allows(false, id.as_deref())).unwrap_or(true);

        if allowed && vk_code != self.shared.pause_hotkey.load(Ordering::Relaxed) {
            self.shared.dispatch(RawEvent::KeyAction { vk_code, is_down });
        }
        if is_down {
            self.activity(&id, KIND_KEYBOARD, Some(vk_code), true);
        }
    }
}

unsafe fn run_capture_loop(
    shared: Arc<EngineShared>,
    app: AppHandle,
    thread_id: Arc<AtomicU32>,
    ready: mpsc::Sender<Result<(), String>>,
) {
    let _ = SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);
    thread_id.store(GetCurrentThreadId(), Ordering::SeqCst);

    // Forzar la creación de la cola de mensajes del hilo.
    let mut msg = MSG::default();
    let _ = PeekMessageW(&mut msg, None, 0, 0, PM_NOREMOVE);

    let fail = |e: String| {
        thread_id.store(0, Ordering::SeqCst);
        let _ = ready.send(Err(e));
    };

    let instance = match GetModuleHandleW(None) {
        Ok(h) => h,
        Err(e) => return fail(format!("GetModuleHandleW falló: {e}")),
    };

    let class_name = w!("XcbRawInputSink");
    let wc = WNDCLASSW {
        lpfnWndProc: Some(sink_wndproc),
        hInstance: instance.into(),
        lpszClassName: class_name,
        ..Default::default()
    };
    RegisterClassW(&wc);

    let hwnd = match CreateWindowExW(
        WINDOW_EX_STYLE::default(),
        class_name,
        w!("XCB Raw Input Sink"),
        WINDOW_STYLE::default(),
        0,
        0,
        0,
        0,
        HWND_MESSAGE,
        None,
        instance,
        None,
    ) {
        Ok(h) => h,
        Err(e) => return fail(format!("No se pudo crear la ventana de captura: {e}")),
    };

    let flags = RIDEV_INPUTSINK | RIDEV_DEVNOTIFY;
    let devices = [
        RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: 0x02, dwFlags: flags, hwndTarget: hwnd }, // ratón
        RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: 0x06, dwFlags: flags, hwndTarget: hwnd }, // teclado
    ];
    if let Err(e) = RegisterRawInputDevices(&devices, std::mem::size_of::<RAWINPUTDEVICE>() as u32) {
        let _ = DestroyWindow(hwnd);
        return fail(format!("No se pudo registrar Raw Input: {e}"));
    }

    HOOK_SHARED.with(|c| *c.borrow_mut() = Some(shared.clone()));
    let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), instance, 0) {
        Ok(h) => h,
        Err(e) => {
            HOOK_SHARED.with(|c| *c.borrow_mut() = None);
            let _ = DestroyWindow(hwnd);
            return fail(format!("No se pudo instalar el hook de teclado: {e}"));
        }
    };

    let _ = ready.send(Ok(()));

    let mut ctx = CaptureCtx {
        shared,
        app,
        buffer: vec![0; 128],
        ids: HashMap::new(),
        last_activity: HashMap::new(),
    };

    loop {
        let result = GetMessageW(&mut msg, None, 0, 0);
        if result.0 <= 0 {
            break; // WM_QUIT o error
        }
        match msg.message {
            WM_INPUT => ctx.handle_raw_input(msg.lParam),
            WM_INPUT_DEVICE_CHANGE_MSG => {
                ctx.ids.clear();
                let _ = ctx.app.emit("devices-changed", ());
            }
            _ => {}
        }
        let _ = TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }

    let remove = [
        RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: 0x02, dwFlags: RIDEV_REMOVE, hwndTarget: HWND::default() },
        RAWINPUTDEVICE { usUsagePage: 0x01, usUsage: 0x06, dwFlags: RIDEV_REMOVE, hwndTarget: HWND::default() },
    ];
    let _ = RegisterRawInputDevices(&remove, std::mem::size_of::<RAWINPUTDEVICE>() as u32);
    let _ = UnhookWindowsHookEx(hook);
    HOOK_SHARED.with(|c| *c.borrow_mut() = None);
    let _ = DestroyWindow(hwnd);
    thread_id.store(0, Ordering::SeqCst);
}
