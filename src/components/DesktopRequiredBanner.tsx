import { IconCpu, IconGamepad, IconSpark, IconUser } from './Icons';

interface Props {
  onGoAccount: () => void;
  onGoLanding: () => void;
  onBypass?: () => void;
}

export default function DesktopRequiredBanner({ onGoAccount, onGoLanding, onBypass }: Props) {
  return (
    <div className="desktop-req-wrap">
      <div className="card desktop-req-card">
        <div className="desktop-req-icon-ring">
          <IconGamepad className="desktop-req-icon" />
          <span className="desktop-req-badge">1000 Hz</span>
        </div>

        <span className="chip warn sm" style={{ marginBottom: 12 }}>
          <IconCpu style={{ width: 14 }} /> Pantalla de escritorio requerida
        </span>

        <h2 className="desktop-req-title">
          Vista optimizada para <span className="grad-text">PC y Laptop</span>
        </h2>

        <p className="desktop-req-sub">
          La emulación de mando en tiempo real, el mapeo visual de teclas, la telemetría a 1000 Hz y las curvas de respuesta
          requieren una resolución mínima de pantalla de escritorio (recomendado 1024px o superior).
        </p>

        <div className="desktop-req-info">
          <div className="desktop-req-info-item">
            <strong>¿Por qué?</strong>
            <span>
              El banco de trabajo de AimCake simula un mando físico completo con botones, sticks y ratón. En pantallas móviles o compactas
              no hay espacio suficiente para la calibración precisa.
            </span>
          </div>
          <div className="desktop-req-info-item">
            <strong>¿Qué puedes hacer desde este dispositivo?</strong>
            <span>
              Puedes gestionar tu <strong>Cuenta</strong>, verificar tu <strong>Teléfono</strong> para recibir <strong>+3 días gratis</strong>,
              consultar el estado de tu <strong>Licencia</strong> o explorar la <strong>Web Oficial</strong>.
            </span>
          </div>
        </div>

        <div className="desktop-req-actions">
          <button id="btn-desktop-account" className="btn btn-primary btn-lg" onClick={onGoAccount}>
            <IconUser /> Mi Cuenta y Bonificación (+3 días)
          </button>
          <button id="btn-desktop-landing" className="btn btn-ghost btn-lg" onClick={onGoLanding}>
            <IconSpark /> Volver a la Web Oficial
          </button>
          {onBypass && (
            <button id="btn-desktop-bypass" className="link-btn" onClick={onBypass} style={{ fontSize: 12, marginTop: 4 }}>
              Continuar de todos modos (vista previa reducida)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
