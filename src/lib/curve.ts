import type { Binding, EngineSettings, KinematicsConfig } from '../types';

export const DEFAULT_CONFIG: KinematicsConfig = {
  deadzoneInner: 0.12,
  deadzoneOuter: 0.98,
  sensitivity: 2.2,
  exponent: 1.35,
  decayRate: 0.85,
  smoothing: 0.35,
  holdMs: 6,
  invertY: false,
};

export const PRESETS: { id: string; name: string; desc: string; config: Partial<KinematicsConfig> }[] = [
  { id: 'precision', name: 'Precisión', desc: 'Curva suave, ideal para francotirador', config: { sensitivity: 1.6, exponent: 1.8, deadzoneInner: 0.1, smoothing: 0.5 } },
  { id: 'balanced', name: 'Balanceado', desc: 'Valores recomendados del blueprint', config: { ...DEFAULT_CONFIG } },
  { id: 'aggressive', name: 'Agresivo', desc: 'Respuesta rápida para combate cercano', config: { sensitivity: 3.2, exponent: 1.0, deadzoneInner: 0.18, smoothing: 0.15, holdMs: 4 } },
];

const b = (input: number, target: string): Binding => ({ input, target });

/** Debe coincidir con `default_bindings()` en src-tauri/src/engine/mapping.rs */
export const DEFAULT_BINDINGS: Binding[] = [
  b(0x57, 'LS_UP'), b(0x53, 'LS_DOWN'), b(0x41, 'LS_LEFT'), b(0x44, 'LS_RIGHT'),
  b(0x20, 'A'), b(0x43, 'B'), b(0x52, 'X'), b(0x31, 'Y'),
  b(0x51, 'LB'), b(0x45, 'RB'), b(0xa0, 'LTHUMB'), b(0x56, 'RTHUMB'),
  b(0x09, 'BACK'), b(0x1b, 'START'),
  b(0x26, 'UP'), b(0x28, 'DOWN'), b(0x25, 'LEFT'), b(0x27, 'RIGHT'),
  b(0x01, 'RT'), b(0x02, 'LT'), b(0x04, 'RTHUMB'), b(0x100, 'Y'), b(0x101, 'Y'),
];

export const DEFAULT_SETTINGS: EngineSettings = {
  config: DEFAULT_CONFIG,
  bindings: DEFAULT_BINDINGS,
  pollingHz: 1000,
  suppressKeys: false,
  pauseHotkey: 0x77,
  mouseTarget: 'RS',
  keyboards: [],
  mice: [],
  controller: null,
};

const CONTROLLERS = ['X360', 'XONE', 'DS4'] as const;

/** Completa ajustes parciales (perfiles antiguos o importados) con los valores por defecto. */
export function normalizeSettings(s: Partial<EngineSettings> | undefined): EngineSettings {
  const src = s ?? {};
  // Un único teclado y un único ratón por perfil: de listas antiguas se conserva el primero.
  const one = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 1) : []);
  return {
    ...DEFAULT_SETTINGS,
    ...src,
    config: { ...DEFAULT_CONFIG, ...(src.config ?? {}) },
    bindings: Array.isArray(src.bindings) ? src.bindings.filter((b) => typeof b?.input === 'number' && typeof b?.target === 'string') : DEFAULT_BINDINGS,
    mouseTarget: src.mouseTarget === 'LS' || src.mouseTarget === 'NONE' ? src.mouseTarget : 'RS',
    keyboards: one(src.keyboards),
    mice: one(src.mice),
    controller: CONTROLLERS.includes(src.controller as never) ? src.controller! : null,
  };
}

/** Réplica exacta de `KinematicsConfig::response` en Rust. */
export function response(n: number, c: KinematicsConfig): number {
  if (n <= 0) return 0;
  const scale = Math.pow(Math.min(Math.max(n / c.deadzoneOuter, 0), 1), c.exponent);
  return Math.min(Math.max(c.deadzoneInner + (1 - c.deadzoneInner) * scale, 0), 1);
}

const FULL_SPEED = 100;

/** Réplica de `StickProcessor` para la vista previa en navegador. */
export class StickProcessor {
  x = 0;
  y = 0;
  idle = 0;
  constructor(public config: KinematicsConfig) {}

  reset() { this.x = 0; this.y = 0; this.idle = 0; }

  process(dx: number, dy: number, dtMs: number): [number, number] {
    const c = this.config;
    const dt = Math.max(dtMs, 0.001);
    const fx = (dx * c.sensitivity) / dt;
    const fy = (dy * c.sensitivity * (c.invertY ? 1 : -1)) / dt;
    const mag = Math.hypot(fx, fy);
    if (mag <= 0.001) {
      this.idle += dt;
      if (this.idle > c.holdMs) {
        const decay = Math.pow(c.decayRate, dt);
        this.x *= decay; this.y *= decay;
        if (Math.abs(this.x) < 0.002 && Math.abs(this.y) < 0.002) { this.x = 0; this.y = 0; }
      }
    } else {
      this.idle = 0;
      const out = response(Math.min(mag / FULL_SPEED, 1), c);
      const a = Math.atan2(fy, fx);
      const alpha = 1 - Math.pow(c.smoothing, dt);
      this.x += (Math.cos(a) * out - this.x) * alpha;
      this.y += (Math.sin(a) * out - this.y) * alpha;
    }
    const m = Math.hypot(this.x, this.y);
    if (m > 1) { this.x /= m; this.y /= m; }
    return [Math.round(this.x * 32767), Math.round(this.y * 32767)];
  }
}
