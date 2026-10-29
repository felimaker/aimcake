import { useEffect, useRef } from 'react';
import type { EngineSettings, GamepadSnapshot, KinematicsConfig } from '../types';
import { DEFAULT_CONFIG, PRESETS, response } from '../lib/curve';
import { IconReset } from './Icons';

interface Props {
  settings: EngineSettings;
  onChange: (s: EngineSettings) => void;
  live: GamepadSnapshot;
}

interface SliderDef {
  key: keyof Omit<KinematicsConfig, 'invertY'>;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: 'sensitivity', label: 'Sensibilidad', hint: 'Multiplicador de los deltas del ratón', min: 0.2, max: 8, step: 0.05, fmt: (v) => `${v.toFixed(2)}×` },
  { key: 'exponent', label: 'Curva de respuesta', hint: '1.0 = lineal · >1 = progresiva (más precisión en micro-movimientos)', min: 0.5, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'deadzoneInner', label: 'Anti-zona muerta', hint: 'Deflexión mínima para superar la zona muerta del juego', min: 0, max: 0.4, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'deadzoneOuter', label: 'Saturación', hint: 'Velocidad relativa a la que el stick llega al 100%', min: 0.2, max: 1, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: 'smoothing', label: 'Suavizado', hint: 'Filtro EMA: elimina tirones a costa de algo de latencia', min: 0, max: 0.9, step: 0.01, fmt: (v) => v.toFixed(2) },
  { key: 'decayRate', label: 'Retención (decay)', hint: 'Cuánto tarda el stick en volver al centro al parar el ratón', min: 0.5, max: 0.99, step: 0.005, fmt: (v) => v.toFixed(3) },
  { key: 'holdMs', label: 'Mantener tras parar', hint: 'Compensa ratones de 125–500 Hz entre reportes', min: 0, max: 20, step: 1, fmt: (v) => `${v} ms` },
];

function CurveCanvas({ config, liveMag }: { config: KinematicsConfig; liveMag: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const pad = 34;
    const w = width - pad * 1.5;
    const h = height - pad * 1.8;
    const ox = pad;
    const oy = height - pad;
    const X = (v: number) => ox + v * w;
    const Y = (v: number) => oy - v * h;

    ctx.clearRect(0, 0, width, height);

    // Rejilla
    ctx.strokeStyle = 'hsla(220, 30%, 80%, 0.06)';
    ctx.lineWidth = 1;
    ctx.font = '600 10px JetBrains Mono, monospace';
    ctx.fillStyle = 'hsla(215, 12%, 50%, 1)';
    for (let i = 0; i <= 4; i++) {
      const v = i / 4;
      ctx.beginPath(); ctx.moveTo(X(v), Y(0)); ctx.lineTo(X(v), Y(1)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(0), Y(v)); ctx.lineTo(X(1), Y(v)); ctx.stroke();
      ctx.fillText(`${i * 25}`, X(v) - 6, oy + 18);
      if (i > 0) ctx.fillText(`${i * 25}`, ox - 26, Y(v) + 4);
    }
    ctx.fillText('VELOCIDAD DEL RATÓN →', X(0.62), oy + 30 > height ? oy + 18 : oy + 30);
    ctx.save(); ctx.translate(12, Y(0.62)); ctx.rotate(-Math.PI / 2); ctx.fillText('DEFLEXIÓN →', 0, 0); ctx.restore();

    // Lineal de referencia
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'hsla(215, 16%, 68%, 0.25)';
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(1), Y(1)); ctx.stroke();
    ctx.setLineDash([]);

    // Zona de saturación
    ctx.fillStyle = 'hsla(186, 95%, 55%, 0.05)';
    ctx.fillRect(X(config.deadzoneOuter), Y(1), X(1) - X(config.deadzoneOuter), h);

    // Curva: área + trazo
    const pts: [number, number][] = [];
    for (let i = 0; i <= 200; i++) {
      const n = i / 200;
      pts.push([X(n), Y(response(n, config))]);
    }
    const grad = ctx.createLinearGradient(0, Y(1), 0, Y(0));
    grad.addColorStop(0, 'hsla(142, 88%, 52%, 0.28)');
    grad.addColorStop(1, 'hsla(142, 88%, 52%, 0)');
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(X(1), Y(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    const lineGrad = ctx.createLinearGradient(X(0), 0, X(1), 0);
    lineGrad.addColorStop(0, 'hsl(142, 88%, 52%)');
    lineGrad.addColorStop(1, 'hsl(186, 95%, 55%)');
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.strokeStyle = lineGrad;
    ctx.lineWidth = 3;
    ctx.shadowColor = 'hsla(142, 88%, 52%, 0.7)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Indicador en vivo (magnitud actual del stick derecho)
    if (liveMag > 0.001) {
      // Invertir la curva aproximadamente para ubicar el punto
      let n = 0;
      for (let i = 0; i <= 200; i++) { if (response(i / 200, config) >= liveMag) { n = i / 200; break; } n = 1; }
      ctx.beginPath();
      ctx.arc(X(n), Y(liveMag), 7, 0, Math.PI * 2);
      ctx.fillStyle = 'hsl(210, 30%, 96%)';
      ctx.shadowColor = 'hsl(186, 95%, 55%)';
      ctx.shadowBlur = 18;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }, [config, liveMag]);

  return <canvas ref={ref} className="curve-canvas" aria-label="Gráfica de la curva de respuesta" />;
}

export default function CurveTuner({ settings, onChange, live }: Props) {
  const cfg = settings.config;
  const setCfg = (patch: Partial<KinematicsConfig>) => onChange({ ...settings, config: { ...cfg, ...patch } });
  const liveMag = Math.min(Math.hypot(live.rx, live.ry) / 32767, 1);

  const activePreset = PRESETS.find((p) =>
    Object.entries(p.config).every(([k, v]) => Math.abs((cfg as unknown as Record<string, number>)[k] - (v as number)) < 1e-6),
  )?.id;

  return (
    <div className="grid grid-2 curve-grid">
      <div className="stack">
        <section className="card">
          <div className="card-title">
            <span>Curva de respuesta</span>
            <span className="chip"><span className="mono">{Math.round(liveMag * 100)}%</span> deflexión RS</span>
          </div>
          <CurveCanvas config={cfg} liveMag={liveMag} />
        </section>
        <section className="card">
          <div className="card-title">Perfiles rápidos</div>
          <div className="preset-grid">
            {PRESETS.map((p) => (
              <button key={p.id} id={`preset-${p.id}`} className={`preset ${activePreset === p.id ? 'active' : ''}`} onClick={() => setCfg({ ...DEFAULT_CONFIG, ...p.config, invertY: cfg.invertY })}>
                <strong>{p.name}</strong>
                <span>{p.desc}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-title">
          <span>Parámetros cinemáticos</span>
          <button id="reset-curve" className="btn btn-ghost btn-sm" onClick={() => setCfg({ ...DEFAULT_CONFIG })}>
            <IconReset /> Restablecer
          </button>
        </div>
        <div className="stack" style={{ gap: 18 }}>
          {SLIDERS.map((s) => {
            const v = cfg[s.key];
            const fill = ((v - s.min) / (s.max - s.min)) * 100;
            return (
              <div className="slider-row" key={s.key}>
                <div className="slider-head">
                  <span>{s.label}</span>
                  <span className="slider-value">{s.fmt(v)}</span>
                </div>
                <input
                  id={`slider-${s.key}`}
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={v}
                  style={{ ['--fill' as string]: `${fill}%` }}
                  onChange={(e) => setCfg({ [s.key]: parseFloat(e.target.value) } as Partial<KinematicsConfig>)}
                />
                <span className="slider-hint">{s.hint}</span>
              </div>
            );
          })}
          <hr className="divider" style={{ margin: '4px 0' }} />
          <label className="toggle" htmlFor="toggle-invert-y">
            <div className="toggle-text">
              <strong>Invertir eje Y</strong>
              <span>Mover el ratón hacia arriba apunta hacia abajo</span>
            </div>
            <input id="toggle-invert-y" type="checkbox" hidden checked={cfg.invertY} onChange={(e) => setCfg({ invertY: e.target.checked })} />
            <span className={`switch ${cfg.invertY ? 'on' : ''}`} />
          </label>
        </div>
      </section>
    </div>
  );
}
