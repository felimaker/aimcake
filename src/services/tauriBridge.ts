/**
 * Puente IPC con el backend Rust de Tauri.
 * Fuera de Tauri (navegador), expone un motor simulado para previsualizar la UI.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { DeviceActivity, DriverInstallResult, EngineSettings, EngineStatus, GamepadSnapshot, InputDevice, LicensePayload } from '../types';
import { DEFAULT_SETTINGS, StickProcessor } from '../lib/curve';
import { vkFromKeyboardEvent, vkFromMouseButton } from '../lib/keys';
import { XB } from '../types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

type Listener<T> = (v: T) => void;

/* ------------------------------------------------------------------ */
/* Dispositivos simulados (solo navegador)                              */
/* ------------------------------------------------------------------ */
const MOCK_DEVICES: InputDevice[] = [
  { id: 'keyboard:046D:C33F', kind: 'keyboard', name: 'G815 RGB Mechanical Gaming Keyboard', manufacturer: 'Logitech', vid: '046D', pid: 'C33F', interfaces: 3, connection: 'USB' },
  { id: 'keyboard:acpi\\pnp0303', kind: 'keyboard', name: 'Teclado integrado', manufacturer: null, vid: null, pid: null, interfaces: 1, connection: 'PS/2 / integrado' },
  { id: 'mouse:046D:C547', kind: 'mouse', name: 'PRO X SUPERLIGHT 2 (LIGHTSPEED)', manufacturer: 'Logitech', vid: '046D', pid: 'C547', interfaces: 2, connection: 'USB' },
  { id: 'mouse:1532:0084', kind: 'mouse', name: 'Razer DeathAdder V2', manufacturer: 'Razer', vid: '1532', pid: '0084', interfaces: 4, connection: 'USB' },
];
/** En la vista previa, las entradas del navegador se atribuyen a estos dispositivos. */
const MOCK_KEYBOARD = MOCK_DEVICES[0].id;
const MOCK_MOUSE = MOCK_DEVICES[2].id;

/* ------------------------------------------------------------------ */
/* Motor simulado (solo navegador)                                     */
/* ------------------------------------------------------------------ */
class MockEngine {
  settings: EngineSettings = DEFAULT_SETTINGS;
  running = false;
  paused = false;
  private stateListeners = new Set<Listener<GamepadSnapshot>>();
  private stopListeners = new Set<Listener<string>>();
  private activityListeners = new Set<Listener<DeviceActivity>>();
  private pressed = new Set<number>();
  private wheel = new Map<number, number>();
  private dx = 0;
  private dy = 0;
  private timer = 0;
  private last = 0;
  private lastMoveActivity = 0;
  private stick = new StickProcessor(DEFAULT_SETTINGS.config);

  private allowed(kind: 'mouse' | 'keyboard') {
    const list = kind === 'mouse' ? this.settings.mice : this.settings.keyboards;
    return list.length === 0 || list.includes(kind === 'mouse' ? MOCK_MOUSE : MOCK_KEYBOARD);
  }

  private activity(kind: 'mouse' | 'keyboard', vk: number | null) {
    const ev: DeviceActivity = { id: kind === 'mouse' ? MOCK_MOUSE : MOCK_KEYBOARD, kind, vk };
    this.activityListeners.forEach((l) => l(ev));
  }

  // Captura global permanente (equivalente al hilo Raw Input del backend).
  private onMove = (e: MouseEvent) => {
    const t = performance.now();
    if (t - this.lastMoveActivity > 120) { this.lastMoveActivity = t; this.activity('mouse', null); }
    if (!this.running || !this.allowed('mouse')) return;
    this.dx += e.movementX; this.dy += e.movementY;
  };
  private onKey = (e: KeyboardEvent) => {
    const vk = vkFromKeyboardEvent(e);
    if (vk == null) return;
    if (e.type === 'keydown' && !e.repeat) this.activity('keyboard', vk);
    if (!this.running) return;
    if (vk === this.settings.pauseHotkey && e.type === 'keydown' && !e.repeat) { this.paused = !this.paused; return; }
    if (!this.allowed('keyboard')) return;
    if (e.type === 'keydown') this.pressed.add(vk); else this.pressed.delete(vk);
  };
  private onMouse = (e: MouseEvent) => {
    const vk = vkFromMouseButton(e.button);
    if (vk == null) return;
    if (e.type === 'mousedown') this.activity('mouse', vk);
    if (!this.running || !this.allowed('mouse')) return;
    if (e.type === 'mousedown') this.pressed.add(vk); else this.pressed.delete(vk);
  };
  private onWheel = (e: WheelEvent) => {
    const vk = e.deltaY < 0 ? 0x100 : 0x101;
    this.activity('mouse', vk);
    if (!this.running || !this.allowed('mouse')) return;
    this.wheel.set(vk, performance.now() + 40);
  };

  constructor() {
    window.addEventListener('mousemove', this.onMove);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('mousedown', this.onMouse);
    window.addEventListener('mouseup', this.onMouse);
    window.addEventListener('wheel', this.onWheel, { passive: true });
  }

  start() {
    if (this.running) throw new Error('La emulación ya está en ejecución.');
    this.running = true;
    this.paused = false;
    this.stick = new StickProcessor(this.settings.config);
    this.last = performance.now();
    this.timer = window.setInterval(() => {
      const t = performance.now();
      const dt = Math.max(t - this.last, 1);
      this.last = t;
      const snap = this.tick(dt);
      this.stateListeners.forEach((l) => l(snap));
    }, 16);
  }

  stop(reason = 'Emulación detenida') {
    if (!this.running) return;
    this.running = false;
    clearInterval(this.timer);
    this.pressed.clear();
    this.dx = this.dy = 0;
    this.stopListeners.forEach((l) => l(reason));
  }

  private tick(dt: number): GamepadSnapshot {
    const now = performance.now();
    for (const [key, until] of this.wheel) if (until < now) this.wheel.delete(key);
    const snap: GamepadSnapshot = { buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0, hz: this.settings.pollingHz, paused: this.paused };
    if (this.paused) { this.stick.reset(); this.dx = this.dy = 0; return snap; }
    const l = [false, false, false, false];
    const r = [false, false, false, false];
    const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const active = new Set<number>([...this.pressed, ...this.wheel.keys()]);
    for (const b of this.settings.bindings) {
      if (!active.has(b.input)) continue;
      if (b.target === 'LT') snap.lt = 255;
      else if (b.target === 'RT') snap.rt = 255;
      else if (b.target.startsWith('LS_')) l[dirs.indexOf(b.target.slice(3))] = true;
      else if (b.target.startsWith('RS_')) r[dirs.indexOf(b.target.slice(3))] = true;
      else snap.buttons |= (XB as Record<string, number>)[b.target] ?? 0;
    }
    const vec = (d: boolean[]): [number, number] | null => {
      if (!d.some(Boolean)) return null;
      const x = (d[3] ? 1 : 0) - (d[2] ? 1 : 0);
      const y = (d[0] ? 1 : 0) - (d[1] ? 1 : 0);
      const n = x && y ? Math.SQRT1_2 : 1;
      return [Math.round(x * n * 32767), Math.round(y * n * 32767)];
    };
    this.stick.config = this.settings.config;
    const target = this.settings.mouseTarget;
    let mouse: [number, number] = [0, 0];
    if (target === 'NONE') this.stick.reset(); else mouse = this.stick.process(this.dx, this.dy, dt);
    this.dx = this.dy = 0;
    const lv = vec(l), rv = vec(r);
    [snap.lx, snap.ly] = lv ?? (target === 'LS' ? mouse : [0, 0]);
    [snap.rx, snap.ry] = rv ?? (target === 'RS' ? mouse : [0, 0]);
    return snap;
  }

  // Envolturas únicas por suscripción: React StrictMode suscribe dos veces la misma función.
  onState(l: Listener<GamepadSnapshot>) { const w: Listener<GamepadSnapshot> = (v) => l(v); this.stateListeners.add(w); return () => { this.stateListeners.delete(w); }; }
  onStop(l: Listener<string>) { const w: Listener<string> = (v) => l(v); this.stopListeners.add(w); return () => { this.stopListeners.delete(w); }; }
  onActivity(l: Listener<DeviceActivity>) { const w: Listener<DeviceActivity> = (v) => l(v); this.activityListeners.add(w); return () => { this.activityListeners.delete(w); }; }
}

const mock = isTauri ? null : new MockEngine();

function mockHwid(): string {
  let id = localStorage.getItem('xcb.mockHwid');
  if (!id) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    id = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('xcb.mockHwid', id);
  }
  return id;
}

const MOCK_PROFILES_KEY = 'xcb.profiles.v1';
/** Vista previa: estado simulado del driver (empieza sin instalar para probar el checklist). */
const MOCK_DRIVER_KEY = 'xcb.mockDriver';
const mockDriverOk = () => localStorage.getItem(MOCK_DRIVER_KEY) === '1';

/* ------------------------------------------------------------------ */
/* API pública                                                          */
/* ------------------------------------------------------------------ */
export const bridge = {
  async getHwid(): Promise<string> {
    return isTauri ? invoke<string>('get_hwid') : mockHwid();
  },

  async getStatus(): Promise<EngineStatus> {
    if (isTauri) return invoke<EngineStatus>('get_engine_status');
    const ok = mockDriverOk();
    return {
      running: mock!.running, paused: mock!.paused,
      driverOk: ok, driverError: ok ? null : 'Drivers de AimCake no disponibles: NotInstalled (simulado)',
      driverInstaller: true, captureOk: true, captureError: null, isDebug: true,
    };
  },

  /** Ejecuta el instalador de drivers de AimCake incluido con la app y espera a que termine. */
  async installDriver(): Promise<DriverInstallResult> {
    if (isTauri) return invoke<DriverInstallResult>('install_driver');
    await new Promise((r) => setTimeout(r, 2200));
    localStorage.setItem(MOCK_DRIVER_KEY, '1');
    return { exitCode: 0, rebootRequired: false, cancelled: false, driverOk: true };
  },

  async verifyLicense(tokenJson: string, sig: string): Promise<LicensePayload> {
    if (isTauri) return invoke<LicensePayload>('verify_license', { tokenJson, sig });
    const p = JSON.parse(tokenJson) as LicensePayload;
    if (p.expires_at < Date.now() / 1000) throw new Error('La licencia ha expirado.');
    return p;
  },

  async start(tokenJson: string, sig: string): Promise<string> {
    if (isTauri) return invoke<string>('start_emulation', { tokenJson, sig });
    await this.verifyLicense(tokenJson, sig);
    if (!mockDriverOk()) throw new Error('No se pudo conectar a los drivers de AimCake. Instálalos desde el Panel (paso 1).');
    mock!.start();
    return `Emulación simulada a ${mock!.settings.pollingHz} Hz (vista previa en navegador)`;
  },

  async stop(): Promise<string> {
    if (isTauri) return invoke<string>('stop_emulation');
    mock!.stop();
    return 'Emulación detenida';
  },

  async updateSettings(settings: EngineSettings): Promise<void> {
    if (isTauri) return invoke('update_settings', { settings });
    mock!.settings = settings;
  },

  async setPaused(paused: boolean): Promise<void> {
    if (isTauri) return invoke('set_paused', { paused });
    mock!.paused = paused;
  },

  /** Teclados y ratones físicos conectados. */
  async listDevices(): Promise<InputDevice[]> {
    if (isTauri) return invoke<InputDevice[]>('list_devices');
    return MOCK_DEVICES.map((d) => ({ ...d }));
  },

  /** JSON de perfiles guardado en disco (`%APPDATA%/…/profiles.json`). */
  async loadProfiles(): Promise<string | null> {
    if (isTauri) return invoke<string | null>('load_profiles');
    return localStorage.getItem(MOCK_PROFILES_KEY);
  },

  async saveProfiles(json: string): Promise<void> {
    if (isTauri) return invoke('save_profiles', { json });
    localStorage.setItem(MOCK_PROFILES_KEY, json);
  },

  async onGamepadState(cb: Listener<GamepadSnapshot>): Promise<UnlistenFn> {
    if (isTauri) return listen<GamepadSnapshot>('gamepad-state', (e) => cb(e.payload));
    return mock!.onState(cb);
  },

  async onEngineStopped(cb: Listener<string>): Promise<UnlistenFn> {
    if (isTauri) return listen<{ reason: string }>('engine-stopped', (e) => cb(e.payload.reason));
    return mock!.onStop(cb);
  },

  /** Actividad por dispositivo físico (para identificarlo visualmente). */
  async onDeviceActivity(cb: Listener<DeviceActivity>): Promise<UnlistenFn> {
    if (isTauri) return listen<DeviceActivity>('device-activity', (e) => cb(e.payload));
    return mock!.onActivity(cb);
  },

  /** Se dispara al conectar o desconectar un teclado/ratón. */
  async onDevicesChanged(cb: () => void): Promise<UnlistenFn> {
    if (isTauri) return listen('devices-changed', () => cb());
    return () => {};
  },

  async openExternal(url: string): Promise<void> {
    if (isTauri) {
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      return openUrl(url);
    }
    window.open(url, '_blank', 'noopener');
  },
};
