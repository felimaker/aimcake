import { useState } from 'react';
import {
  IconCake, IconCheck, IconChip, IconCopy, IconDownload, IconGamepad, IconLock, IconWindows,
} from './Icons';

interface Props {
  userEmail?: string | null;
  compact?: boolean;
  onRequireLogin?: () => void;
}

const SHA256_HASH = '89220A7865076B342892F98865F3499FB7C4CFD673159E89D352C360FD014C6A';

export default function DownloadCard({ userEmail, compact, onRequireLogin }: Props) {
  const [copiedHash, setCopiedHash] = useState(false);

  const copyHash = () => {
    navigator.clipboard.writeText(SHA256_HASH);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2500);
  };

  return (
    <section className={`card dl-card ${compact ? 'compact' : ''}`} id="acc-download-section">
      <div className="dl-glow" />
      <div className="card-title" style={{ position: 'relative', zIndex: 1 }}>
        <span className="row" style={{ gap: 8 }}>
          <IconWindows style={{ width: 18, color: 'var(--accent-2)' }} />
          Descargar AimCake para Windows
        </span>
        <span className="chip ok sm">
          <IconCake style={{ width: 14 }} /> AimCake v1.0.0 Oficial
        </span>
      </div>

      <div className="dl-main">
        <div className="dl-hero">
          <div className="dl-badge-bar">
            <span className="chip sm ok"><IconChip /> Drivers Oficiales AimCake</span>
            <span className="chip sm ok"><IconGamepad /> 1000 Hz / 0.1 ms</span>
          </div>

          <h3 className="dl-title">Instalador AimCake para Windows PC</h3>
          <p className="dl-sub">
            Instalador oficial para Windows 10 y Windows 11. Instala los componentes de alta velocidad necesarios
            para activar el Aim Assist nativo con tu ratón y teclado a 1000 Hz.
          </p>

          <div className="dl-actions">
            {userEmail ? (
              <div className="stack" style={{ gap: 10 }}>
                <a
                  id="download-app-exe"
                  href="/downloads/aimcake_setup.exe"
                  download="aimcake_setup.exe"
                  className="btn btn-primary btn-lg dl-btn"
                >
                  <IconDownload />
                  <span>
                    <strong>Descargar aimcake_setup.exe</strong>
                    <small>Instalador oficial Windows 64-bit · ~6.3 MB</small>
                  </span>
                </a>

                <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <a
                    id="launch-desktop-app"
                    href="aimcake://launch"
                    className="btn btn-sm btn-secondary"
                    title="Si ya tienes AimCake instalado en este PC, ábrelo directamente"
                  >
                    <IconWindows />
                    <span>¿Ya lo instalaste? Abrir Monitor en el Reloj</span>
                  </a>
                </div>
              </div>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                <button
                  id="download-app-exe-locked"
                  type="button"
                  className="btn btn-primary btn-lg dl-btn"
                  onClick={onRequireLogin}
                >
                  <IconLock />
                  <span>
                    <strong>Crear cuenta para descargar aimcake_setup.exe</strong>
                    <small>Acceso inmediato · 3 días de prueba gratis</small>
                  </span>
                </button>
                <small className="faint" style={{ fontSize: 11.5 }}>
                  Debes iniciar sesión o registrar tu cuenta gratuita para desbloquear el instalador.
                </small>
              </div>
            )}
          </div>
        </div>

        <div className="dl-steps">
          <div className="dl-step">
            <span className="dl-step-num">1</span>
            <div>
              <strong>Descarga el instalador</strong>
              <small>Guarda <code>aimcake_setup.exe</code> en tu equipo (un solo archivo).</small>
            </div>
          </div>
          <div className="dl-step">
            <span className="dl-step-num">2</span>
            <div>
              <strong>Sigue el Wizard (15 seg)</strong>
              <small>Instala silenciosamente la app y el driver de mando certificado WHQL.</small>
            </div>
          </div>
          <div className="dl-step">
            <span className="dl-step-num">3</span>
            <div>
              <strong>Conexión con 1 clic</strong>
              <small>Inicia sesión con tu navegador o cuenta para activar tus 3 días de prueba.</small>
            </div>
          </div>
          <div className="dl-step">
            <span className="dl-step-num">4</span>
            <div>
              <strong>Control desde el Reloj</strong>
              <small>La app se aloja junto al reloj de Windows. Pulsa ENCENDER y ¡a jugar!</small>
            </div>
          </div>
        </div>
      </div>

      <div className="dl-meta">
        <div className="dl-meta-item">
          <span>Sistema operativo</span>
          <strong>Windows 10 / 11 (x64)</strong>
        </div>
        <div className="dl-meta-item">
          <span>Seguridad del driver</span>
          <strong>WHQL Microsoft Certified</strong>
        </div>
        <div className="dl-meta-item">
          <span>Latencia de respuesta</span>
          <strong>1 ms (1000 Hz real)</strong>
        </div>
        <div className="dl-meta-item hash">
          <span>SHA-256 Checksum</span>
          <button className="dl-hash-btn" onClick={copyHash} title="Copiar hash SHA-256">
            <code>{SHA256_HASH.slice(0, 16)}…{SHA256_HASH.slice(-8)}</code>
            {copiedHash ? <IconCheck style={{ color: 'var(--accent)' }} /> : <IconCopy />}
          </button>
        </div>
      </div>
    </section>
  );
}
