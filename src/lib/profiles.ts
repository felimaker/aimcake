/** Gestión de perfiles de configuración: persistencia, importación y exportación. */
import type { Binding, EngineSettings, InputDevice, Profile, ProfileStore } from '../types';
import { DEFAULT_SETTINGS, normalizeSettings } from './curve';
import { bridge } from '../services/tauriBridge';

const LEGACY_SETTINGS_KEY = 'xcb.settings.v1';

export const PROFILE_COLORS = ['#3ddc84', '#3fd8f0', '#b18cff', '#ff9f43', '#ff6fb5', '#ffc531', '#ff5c6c', '#3fa7ff'];

export function newId(): string {
  return `p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function createProfile(name: string, settings: EngineSettings = DEFAULT_SETTINGS, extra: Partial<Profile> = {}): Profile {
  return {
    id: newId(),
    name,
    game: '',
    color: PROFILE_COLORS[0],
    ...extra,
    settings: structuredClone(normalizeSettings(settings)),
    updatedAt: Date.now(),
  };
}

const b = (input: number, target: string): Binding => ({ input, target });

/** Perfiles de ejemplo para la primera ejecución. */
function starterProfiles(): Profile[] {
  let main = DEFAULT_SETTINGS;
  try {
    const legacy = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (legacy) main = normalizeSettings(JSON.parse(legacy));
  } catch { /* ajustes antiguos corruptos: usar los por defecto */ }

  const driving: EngineSettings = {
    ...DEFAULT_SETTINGS,
    mouseTarget: 'NONE',
    bindings: [
      b(0x57, 'RT'), b(0x53, 'LT'), b(0x41, 'LS_LEFT'), b(0x44, 'LS_RIGHT'),
      b(0x20, 'A'), b(0x45, 'Y'), b(0x51, 'X'), b(0xa0, 'B'), b(0x43, 'RTHUMB'),
      b(0x25, 'RS_LEFT'), b(0x27, 'RS_RIGHT'), b(0x26, 'RS_UP'), b(0x28, 'RS_DOWN'),
      b(0x09, 'BACK'), b(0x1b, 'START'), b(0x01, 'RB'), b(0x02, 'LB'),
    ],
  };

  return [
    createProfile('Shooter · Call of Duty', main, { game: 'Warzone / MWIII', color: PROFILE_COLORS[0] }),
    createProfile('Conducción', driving, { game: 'Teclado sin ratón', color: PROFILE_COLORS[3] }),
  ];
}

function defaultStore(): ProfileStore {
  const profiles = starterProfiles();
  return { version: 1, activeId: profiles[0].id, profiles };
}

function normalizeProfile(raw: Partial<Profile>): Profile {
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 48) : 'Perfil sin nombre',
    game: typeof raw.game === 'string' ? raw.game.slice(0, 48) : '',
    color: typeof raw.color === 'string' ? raw.color : PROFILE_COLORS[0],
    settings: normalizeSettings(raw.settings),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

export function parseStore(json: string): ProfileStore | null {
  try {
    const raw = JSON.parse(json) as Partial<ProfileStore>;
    if (!Array.isArray(raw.profiles) || raw.profiles.length === 0) return null;
    const profiles = raw.profiles.map(normalizeProfile);
    const activeId = profiles.some((p) => p.id === raw.activeId) ? raw.activeId! : profiles[0].id;
    return { version: 1, activeId, profiles };
  } catch {
    return null;
  }
}

export async function loadStore(): Promise<ProfileStore> {
  try {
    const json = await bridge.loadProfiles();
    const parsed = json ? parseStore(json) : null;
    if (parsed) return parsed;
  } catch { /* primera ejecución o archivo ilegible */ }
  return defaultStore();
}

export function saveStore(store: ProfileStore): Promise<void> {
  return bridge.saveProfiles(JSON.stringify(store, null, 2));
}

/* ------------------------------------------------------------------ */
/* Requisitos obligatorios del perfil                                   */
/* ------------------------------------------------------------------ */
export type Requirement = 'controller' | 'keyboard' | 'mouse' | 'mapping';

export const REQUIREMENTS: Requirement[] = ['controller', 'keyboard', 'mouse', 'mapping'];

export interface ProfileCheck {
  controller: boolean;
  keyboard: boolean;
  mouse: boolean;
  mapping: boolean;
  /** Mando, teclado, ratón y mapeo definidos: se puede activar. */
  complete: boolean;
  done: number;
  total: number;
  missing: Requirement[];
  /** IDs elegidos que ahora mismo no están conectados (solo aviso). */
  disconnected: string[];
}

export const REQUIREMENT_TEXT: Record<Requirement, { title: string; hint: string }> = {
  controller: { title: 'Mando', hint: 'Elige qué mando se emula: Xbox 360, Xbox One o DualShock 4' },
  keyboard: { title: 'Teclado', hint: 'Elige el teclado que controlará el mando' },
  mouse: { title: 'Ratón', hint: 'Elige el ratón que controlará el mando' },
  mapping: { title: 'Mapeo', hint: 'Asigna al menos una tecla a un botón del mando' },
};

export function checkProfile(p: Profile, devices?: InputDevice[]): ProfileCheck {
  const s = p.settings;
  const state: Record<Requirement, boolean> = {
    controller: !!s.controller,
    keyboard: s.keyboards.length > 0,
    mouse: s.mice.length > 0,
    mapping: s.bindings.length > 0,
  };
  const missing = REQUIREMENTS.filter((r) => !state[r]);
  const disconnected = devices && devices.length
    ? [...s.keyboards, ...s.mice].filter((id) => !devices.some((d) => d.id === id))
    : [];
  return {
    ...state,
    complete: missing.length === 0,
    done: REQUIREMENTS.length - missing.length,
    total: REQUIREMENTS.length,
    missing,
    disconnected,
  };
}

export function missingText(c: ProfileCheck): string {
  const names = c.missing.map((m) => REQUIREMENT_TEXT[m].title.toLowerCase());
  if (names.length === 0) return '';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
  return `Falta configurar: ${list}`;
}

/* ------------------------------------------------------------------ */
/* Importar / exportar                                                  */
/* ------------------------------------------------------------------ */
interface ExportFile {
  type: 'xcb-profile';
  version: 1;
  profile: Profile;
}

const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'perfil';

export function exportProfile(p: Profile) {
  const data: ExportFile = { type: 'xcb-profile', version: 1, profile: p };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug(p.name)}.xcbprofile.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Acepta un perfil exportado o un `profiles.json` completo. Siempre asigna IDs nuevos. */
export async function importProfiles(file: File): Promise<Profile[]> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un JSON válido.');
  }
  const obj = raw as Partial<ExportFile> & Partial<ProfileStore>;
  let list: Partial<Profile>[] = [];
  if (obj?.type === 'xcb-profile' && obj.profile) list = [obj.profile];
  else if (Array.isArray(obj?.profiles)) list = obj.profiles;
  else if ((raw as Partial<Profile>)?.settings) list = [raw as Partial<Profile>];
  if (list.length === 0) throw new Error('No se encontró ningún perfil en el archivo.');
  return list.map((p) => ({ ...normalizeProfile(p), id: newId(), updatedAt: Date.now() }));
}
