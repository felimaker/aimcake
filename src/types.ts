export interface KinematicsConfig {
  deadzoneInner: number;
  deadzoneOuter: number;
  sensitivity: number;
  exponent: number;
  decayRate: number;
  smoothing: number;
  holdMs: number;
  invertY: boolean;
}

export interface Binding {
  input: number;
  target: string;
}

/** Stick que controla el movimiento del ratón. */
export type MouseTarget = 'RS' | 'LS' | 'NONE';

/** Mando virtual que se emula. XONE usa el mismo protocolo XInput que X360. */
export type ControllerType = 'X360' | 'XONE' | 'DS4';

export interface EngineSettings {
  config: KinematicsConfig;
  bindings: Binding[];
  pollingHz: number;
  suppressKeys: boolean;
  pauseHotkey: number;
  mouseTarget: MouseTarget;
  /** Teclado elegido (exactamente 1 por perfil; se guarda como lista por compatibilidad). */
  keyboards: string[];
  /** Ratón elegido (exactamente 1 por perfil; se guarda como lista por compatibilidad). */
  mice: string[];
  /** Tipo de mando a emular; `null` = sin elegir (obligatorio para activar el perfil). */
  controller: ControllerType | null;
}

export interface Profile {
  id: string;
  name: string;
  game: string;
  color: string;
  settings: EngineSettings;
  updatedAt: number;
}

export interface ProfileStore {
  version: 1;
  activeId: string;
  profiles: Profile[];
}

export type DeviceKind = 'mouse' | 'keyboard';

export interface InputDevice {
  id: string;
  kind: DeviceKind;
  name: string;
  manufacturer: string | null;
  vid: string | null;
  pid: string | null;
  interfaces: number;
  connection: string;
}

export interface DeviceActivity {
  id: string;
  kind: DeviceKind;
  vk: number | null;
}

export interface GamepadSnapshot {
  buttons: number;
  lt: number;
  rt: number;
  lx: number;
  ly: number;
  rx: number;
  ry: number;
  hz: number;
  paused: boolean;
}

export interface EngineStatus {
  running: boolean;
  paused: boolean;
  driverOk: boolean;
  driverError: string | null;
  /** El instalador de drivers de AimCake viene incluido con la app. */
  driverInstaller?: boolean;
  captureOk?: boolean;
  captureError?: string | null;
  isDebug: boolean;
}

export interface DriverInstallResult {
  exitCode: number;
  rebootRequired: boolean;
  cancelled: boolean;
  driverOk: boolean;
}

export interface LicensePayload {
  user_id: string;
  hwid: string;
  expires_at: number;
  status: 'trial' | 'active' | string;
}

export interface LicenseToken {
  payload: string;
  signature: string;
}

export const XB = {
  UP: 0x0001,
  DOWN: 0x0002,
  LEFT: 0x0004,
  RIGHT: 0x0008,
  START: 0x0010,
  BACK: 0x0020,
  LTHUMB: 0x0040,
  RTHUMB: 0x0080,
  LB: 0x0100,
  RB: 0x0200,
  GUIDE: 0x0400,
  A: 0x1000,
  B: 0x2000,
  X: 0x4000,
  Y: 0x8000,
} as const;

export const EMPTY_SNAPSHOT: GamepadSnapshot = {
  buttons: 0, lt: 0, rt: 0, lx: 0, ly: 0, rx: 0, ry: 0, hz: 0, paused: false,
};
