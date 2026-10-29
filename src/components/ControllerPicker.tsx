import type { ControllerType } from '../types';
import { CONTROLLERS } from '../lib/controllers';
import { IconCheck } from './Icons';

/** Silueta ilustrativa de cada mando (no son logotipos oficiales). */
export function ControllerGlyph({ type, size = 120 }: { type: ControllerType; size?: number }) {
  const h = Math.round(size * 0.68);
  if (type === 'DS4') {
    return (
      <svg className="cglyph ds4" width={size} height={h} viewBox="0 0 160 108" aria-hidden="true">
        <defs>
          <linearGradient id="cg-ds4" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a3150" />
            <stop offset="1" stopColor="#151a2c" />
          </linearGradient>
        </defs>
        <path d="M30 22h100c12 0 20 8 23 20l6 40c2 14-10 22-20 16l-18-12H39l-18 12c-10 6-22-2-20-16l6-40c3-12 11-20 23-20z" fill="url(#cg-ds4)" stroke="#5a66a8" strokeWidth="1.5" />
        <rect x="58" y="24" width="44" height="26" rx="5" fill="#0f1322" stroke="#3b4470" />
        <rect x="62" y="20" width="36" height="3" rx="1.5" fill="#7c8cff" className="cglyph-led" />
        <circle cx="56" cy="70" r="11" fill="#0d1120" stroke="#3b4470" />
        <circle cx="104" cy="70" r="11" fill="#0d1120" stroke="#3b4470" />
        <path d="M30 44h6v-6h6v6h6v6h-6v6h-6v-6h-6z" fill="#3b4470" />
        <g fontSize="8" fontWeight="700" textAnchor="middle" fontFamily="sans-serif">
          <circle cx="128" cy="36" r="5" fill="none" stroke="#43d9a3" /><circle cx="138" cy="46" r="5" fill="none" stroke="#ff6b81" />
          <circle cx="118" cy="46" r="5" fill="none" stroke="#e58cff" /><circle cx="128" cy="56" r="5" fill="none" stroke="#7cb4ff" />
        </g>
      </svg>
    );
  }
  const one = type === 'XONE';
  return (
    <svg className={`cglyph ${one ? 'xone' : 'x360'}`} width={size} height={h} viewBox="0 0 160 108" aria-hidden="true">
      <defs>
        <linearGradient id={`cg-${type}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={one ? '#262b33' : '#e9edf2'} />
          <stop offset="1" stopColor={one ? '#14171c' : '#b9c0ca'} />
        </linearGradient>
      </defs>
      <path d="M38 20h84c14 0 22 10 26 24l8 34c3 14-9 24-21 16l-17-12H52L35 94c-12 8-24-2-21-16l8-34c4-14 12-24 26-24z" fill={`url(#cg-${type})`} stroke={one ? '#4b5563' : '#ffffff'} strokeWidth="1.5" />
      <circle cx="80" cy="36" r={one ? 7 : 9} fill={one ? '#1b1f26' : '#c7ced8'} stroke={one ? '#3ddc84' : '#7a8594'} strokeWidth="2" />
      {!one && <circle cx="80" cy="36" r="4" fill="#3ddc84" className="cglyph-led" />}
      {one && <path d="M76 32l8 8M84 32l-8 8" stroke="#3ddc84" strokeWidth="1.8" strokeLinecap="round" />}
      <circle cx="48" cy="46" r="10" fill={one ? '#0d1014' : '#2b3038'} />
      <circle cx="98" cy="70" r="10" fill={one ? '#0d1014' : '#2b3038'} />
      <path d="M56 64h6v-6h6v6h6v6h-6v6h-6v-6h-6z" fill={one ? '#3a414c' : '#59616d'} />
      <circle cx="122" cy="38" r="5" fill="#f5c542" /><circle cx="132" cy="48" r="5" fill="#ff5c6c" />
      <circle cx="112" cy="48" r="5" fill="#3fa7ff" /><circle cx="122" cy="58" r="5" fill="#3ddc84" />
    </svg>
  );
}

interface Props {
  value: ControllerType | null;
  onChange: (v: ControllerType) => void;
  compact?: boolean;
}

/** Selector del mando a emular (uno por perfil). */
export default function ControllerPicker({ value, onChange, compact }: Props) {
  return (
    <div className={`cpick ${compact ? 'compact' : ''}`} role="radiogroup" aria-label="Mando a emular">
      {CONTROLLERS.map((c) => {
        const on = value === c.id;
        return (
          <button
            key={c.id}
            id={`controller-${c.id.toLowerCase()}`}
            role="radio"
            aria-checked={on}
            className={`cpick-item ${on ? 'on' : ''}`}
            style={{ ['--cc' as string]: c.accent }}
            onClick={() => onChange(c.id)}
          >
            <span className="cpick-radio">{on && <IconCheck />}</span>
            <ControllerGlyph type={c.id} size={compact ? 92 : 124} />
            <span className="cpick-text">
              <strong>{c.name}</strong>
              <em>{c.protocol}</em>
              {!compact && <small>{c.description}</small>}
            </span>
            {c.id === 'X360' && <span className="cpick-badge">Recomendado</span>}
          </button>
        );
      })}
    </div>
  );
}
