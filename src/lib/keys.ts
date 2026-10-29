/** Nombres legibles para códigos de tecla virtual de Windows (VK) y botones del ratón. */
const NAMES: Record<number, string> = {
  0x01: 'Clic izq.', 0x02: 'Clic der.', 0x04: 'Clic central', 0x05: 'Ratón X1', 0x06: 'Ratón X2',
  0x100: 'Rueda ↑', 0x101: 'Rueda ↓',
  0x08: 'Retroceso', 0x09: 'Tab', 0x0d: 'Enter', 0x10: 'Shift', 0x11: 'Ctrl', 0x12: 'Alt',
  0x13: 'Pausa', 0x14: 'Bloq Mayús', 0x1b: 'Esc', 0x20: 'Espacio',
  0x21: 'Re Pág', 0x22: 'Av Pág', 0x23: 'Fin', 0x24: 'Inicio',
  0x25: '←', 0x26: '↑', 0x27: '→', 0x28: '↓', 0x2c: 'Impr Pant', 0x2d: 'Insert', 0x2e: 'Supr',
  0x5b: 'Win', 0x5c: 'Win der.', 0x5d: 'Menú', 0x90: 'Bloq Num', 0x91: 'Bloq Despl',
  0x6a: 'Num *', 0x6b: 'Num +', 0x6d: 'Num -', 0x6e: 'Num .', 0x6f: 'Num /',
  0xa0: 'Shift izq.', 0xa1: 'Shift der.', 0xa2: 'Ctrl izq.', 0xa3: 'Ctrl der.', 0xa4: 'Alt', 0xa5: 'Alt Gr',
  // Distribución española (OEM)
  0xdc: 'º', 0xdb: "'", 0xdd: '¡', 0xba: '`', 0xbb: '+', 0xbf: 'Ç', 0xc0: 'Ñ', 0xde: '´',
  0xbc: ',', 0xbe: '.', 0xbd: '-', 0xe2: '<',
};

export function keyName(vk: number): string {
  if (NAMES[vk]) return NAMES[vk];
  if ((vk >= 0x30 && vk <= 0x39) || (vk >= 0x41 && vk <= 0x5a)) return String.fromCharCode(vk);
  if (vk >= 0x60 && vk <= 0x69) return `Num ${vk - 0x60}`;
  if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6f}`;
  return `VK 0x${vk.toString(16).toUpperCase()}`;
}

export const isMouseInput = (vk: number) => vk === 0x01 || vk === 0x02 || (vk >= 0x04 && vk <= 0x06) || vk === 0x100 || vk === 0x101;

/**
 * Convierte un KeyboardEvent al VK de Windows.
 * En WebView2/Chromium `keyCode` ya es el VK nativo; solo se distinguen
 * los modificadores izquierdo/derecho mediante `code`.
 */
export function vkFromKeyboardEvent(e: KeyboardEvent): number | null {
  switch (e.keyCode) {
    case 0x10: return e.code === 'ShiftRight' ? 0xa1 : 0xa0;
    case 0x11: return e.code === 'ControlRight' ? 0xa3 : 0xa2;
    case 0x12: return e.code === 'AltRight' ? 0xa5 : 0xa4;
  }
  if (e.keyCode > 0 && e.keyCode < 0xff) return e.keyCode;
  return null;
}

export function vkFromMouseButton(button: number): number | null {
  return ({ 0: 0x01, 1: 0x04, 2: 0x02, 3: 0x05, 4: 0x06 } as Record<number, number>)[button] ?? null;
}

/* ------------------------------------------------------------------ */
/* Salidas del mando                                                    */
/* ------------------------------------------------------------------ */
export type TargetGroup = 'face' | 'shoulder' | 'ls' | 'rs' | 'dpad' | 'system';

export interface TargetDef {
  id: string;
  /** Etiqueta corta para insignias (≤4 caracteres). */
  short: string;
  /** Nombre descriptivo en español. */
  name: string;
  group: TargetGroup;
  color: string;
}

export const GROUP_COLORS: Record<TargetGroup, string> = {
  face: '#3ddc84',
  shoulder: '#b18cff',
  ls: '#3fd8f0',
  rs: '#ff9f43',
  dpad: '#ff6fb5',
  system: '#9fb0c8',
};

export const TARGETS: TargetDef[] = [
  { id: 'A', short: 'A', name: 'Botón A', group: 'face', color: '#3ddc84' },
  { id: 'B', short: 'B', name: 'Botón B', group: 'face', color: '#ff5c6c' },
  { id: 'X', short: 'X', name: 'Botón X', group: 'face', color: '#3fa7ff' },
  { id: 'Y', short: 'Y', name: 'Botón Y', group: 'face', color: '#ffc531' },
  { id: 'LT', short: 'LT', name: 'Gatillo izquierdo', group: 'shoulder', color: GROUP_COLORS.shoulder },
  { id: 'RT', short: 'RT', name: 'Gatillo derecho', group: 'shoulder', color: GROUP_COLORS.shoulder },
  { id: 'LB', short: 'LB', name: 'Bumper izquierdo', group: 'shoulder', color: GROUP_COLORS.shoulder },
  { id: 'RB', short: 'RB', name: 'Bumper derecho', group: 'shoulder', color: GROUP_COLORS.shoulder },
  { id: 'LS_UP', short: 'LS↑', name: 'Stick izquierdo · arriba', group: 'ls', color: GROUP_COLORS.ls },
  { id: 'LS_DOWN', short: 'LS↓', name: 'Stick izquierdo · abajo', group: 'ls', color: GROUP_COLORS.ls },
  { id: 'LS_LEFT', short: 'LS←', name: 'Stick izquierdo · izquierda', group: 'ls', color: GROUP_COLORS.ls },
  { id: 'LS_RIGHT', short: 'LS→', name: 'Stick izquierdo · derecha', group: 'ls', color: GROUP_COLORS.ls },
  { id: 'LTHUMB', short: 'L3', name: 'Pulsar stick izquierdo (L3)', group: 'ls', color: GROUP_COLORS.ls },
  { id: 'RS_UP', short: 'RS↑', name: 'Stick derecho · arriba', group: 'rs', color: GROUP_COLORS.rs },
  { id: 'RS_DOWN', short: 'RS↓', name: 'Stick derecho · abajo', group: 'rs', color: GROUP_COLORS.rs },
  { id: 'RS_LEFT', short: 'RS←', name: 'Stick derecho · izquierda', group: 'rs', color: GROUP_COLORS.rs },
  { id: 'RS_RIGHT', short: 'RS→', name: 'Stick derecho · derecha', group: 'rs', color: GROUP_COLORS.rs },
  { id: 'RTHUMB', short: 'R3', name: 'Pulsar stick derecho (R3)', group: 'rs', color: GROUP_COLORS.rs },
  { id: 'UP', short: 'D↑', name: 'Cruceta · arriba', group: 'dpad', color: GROUP_COLORS.dpad },
  { id: 'DOWN', short: 'D↓', name: 'Cruceta · abajo', group: 'dpad', color: GROUP_COLORS.dpad },
  { id: 'LEFT', short: 'D←', name: 'Cruceta · izquierda', group: 'dpad', color: GROUP_COLORS.dpad },
  { id: 'RIGHT', short: 'D→', name: 'Cruceta · derecha', group: 'dpad', color: GROUP_COLORS.dpad },
  { id: 'BACK', short: 'View', name: 'View / Back', group: 'system', color: GROUP_COLORS.system },
  { id: 'START', short: 'Menu', name: 'Menu / Start', group: 'system', color: GROUP_COLORS.system },
  { id: 'GUIDE', short: 'Guía', name: 'Botón Guía Xbox', group: 'system', color: GROUP_COLORS.system },
];

export const TARGET_BY_ID: Record<string, TargetDef> = Object.fromEntries(TARGETS.map((t) => [t.id, t]));

/* ------------------------------------------------------------------ */
/* Teclado virtual (distribución española ISO)                          */
/* ------------------------------------------------------------------ */
export interface VKey {
  vk: number;
  label: string;
  /** Ancho en unidades de tecla (1u = tecla normal). */
  w?: number;
  /** Hueco vacío (no es tecla). */
  gap?: boolean;
}

const k = (vk: number, label?: string, w?: number): VKey => ({ vk, label: label ?? keyName(vk), w });
const gap = (w: number): VKey => ({ vk: -1, label: '', w, gap: true });
const letters = (s: string) => s.split('').map((c) => k(c.charCodeAt(0)));

export const MAIN_ROWS: VKey[][] = [
  [k(0x1b), gap(1), k(0x70), k(0x71), k(0x72), k(0x73), gap(0.5), k(0x74), k(0x75), k(0x76), k(0x77), gap(0.5), k(0x78), k(0x79), k(0x7a), k(0x7b)],
  [k(0xdc), ...letters('1234567890'), k(0xdb), k(0xdd), k(0x08, '⌫ Retroceso', 2)],
  [k(0x09, '⇥ Tab', 1.5), ...letters('QWERTYUIOP'), k(0xba), k(0xbb), k(0x0d, '↵ Enter', 1.5)],
  [k(0x14, 'Bloq Mayús', 1.75), ...letters('ASDFGHJKL'), k(0xc0), k(0xde), k(0xbf), k(0x0d, '↵', 1.25)],
  [k(0xa0, '⇧ Shift', 1.25), k(0xe2), ...letters('ZXCVBNM'), k(0xbc), k(0xbe), k(0xbd), k(0xa1, '⇧ Shift', 2.75)],
  [k(0xa2, 'Ctrl', 1.25), k(0x5b, 'Win', 1.25), k(0xa4, 'Alt', 1.25), k(0x20, 'Espacio', 6.25), k(0xa5, 'Alt Gr', 1.25), k(0x5c, 'Win', 1.25), k(0x5d, 'Menú', 1.25), k(0xa3, 'Ctrl', 1.25)],
];

export const NAV_ROWS: VKey[][] = [
  [k(0x2c, 'Impr'), k(0x91, 'Bloq'), k(0x13, 'Pausa')],
  [k(0x2d, 'Ins'), k(0x24, 'Inicio'), k(0x21, 'RePág')],
  [k(0x2e, 'Supr'), k(0x23, 'Fin'), k(0x22, 'AvPág')],
  [gap(3)],
  [gap(1), k(0x26), gap(1)],
  [k(0x25), k(0x28), k(0x27)],
];
