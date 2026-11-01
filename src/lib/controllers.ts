/** Catálogo de protocolos de asistencia compatibles con AimCake. */
import type { ControllerType } from '../types';

export interface ControllerInfo {
  id: ControllerType;
  name: string;
  short: string;
  /** Cómo lo ve Windows / el juego. */
  protocol: string;
  description: string;
  /** Cuándo conviene elegirlo. */
  bestFor: string;
  /** Aviso honesto sobre limitaciones. */
  note?: string;
  accent: string;
}

export const CONTROLLERS: ControllerInfo[] = [
  {
    id: 'X360',
    name: 'Xbox 360',
    short: 'X360',
    protocol: 'XInput',
    description: 'El protocolo más compatible en PC. Casi todos los shooters de Windows activan Aim Assist instantáneo sin configurar nada.',
    bestFor: 'Recomendado para la mayoría de juegos (Call of Duty, Fortnite, Steam, Game Pass…).',
    accent: '#3ddc84',
  },
  {
    id: 'XONE',
    name: 'Xbox One / Series',
    short: 'XONE',
    protocol: 'XInput',
    description: 'Mismos botones y protocolo que Xbox 360. Windows y los juegos activan el mismo Aim Assist rotacional.',
    bestFor: 'Si prefieres ver el nombre de Xbox One / Series en tus perfiles.',
    note: 'Transmite protocolo XInput (asistencia nativa Xbox para los juegos).',
    accent: '#3fd8f0',
  },
  {
    id: 'DS4',
    name: 'DualShock 4',
    short: 'DS4',
    protocol: 'DirectInput / HID',
    description: 'Mando de PlayStation 4. Los juegos muestran los iconos de PlayStation (✕ ○ □ △).',
    bestFor: 'Juegos que solo admiten mando de PlayStation o si quieres sus iconos.',
    note: 'Los gatillos L2/R2 se envían como analógicos y digitales. Sin panel táctil ni giroscopio.',
    accent: '#7c8cff',
  },
];

export const CONTROLLER_BY_ID: Record<ControllerType, ControllerInfo> = Object.fromEntries(
  CONTROLLERS.map((c) => [c.id, c]),
) as Record<ControllerType, ControllerInfo>;

export function controllerName(id: ControllerType | null | undefined): string {
  return id ? CONTROLLER_BY_ID[id].name : 'Sin elegir';
}
