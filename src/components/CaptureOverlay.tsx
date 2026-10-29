import { useEffect, useRef } from 'react';
import { vkFromKeyboardEvent, vkFromMouseButton } from '../lib/keys';
import { IconKeyboard, IconMouse } from './Icons';

interface Props {
  title: string;
  subtitle?: string;
  /** Permite capturar botones del ratón y la rueda dentro de la zona. */
  allowMouse?: boolean;
  onCapture: (vk: number) => void;
  onCancel: () => void;
}

/** Capa modal que espera la siguiente tecla (o botón del ratón) del usuario. */
export default function CaptureOverlay({ title, subtitle, allowMouse = true, onCapture, onCancel }: Props) {
  const cb = useRef(onCapture);
  cb.current = onCapture;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const vk = vkFromKeyboardEvent(e);
      if (vk != null) cb.current(vk);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  return (
    <div className="capture-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="capture-box">
        <h3>{title}</h3>
        <p>{subtitle ?? (allowMouse ? 'Pulsa una tecla, o haz clic / gira la rueda dentro del recuadro' : 'Pulsa cualquier tecla del teclado')}</p>
        <div
          id="capture-zone"
          className={`capture-zone ${allowMouse ? '' : 'kbd-only'}`}
          onMouseDown={(e) => {
            if (!allowMouse) return;
            e.preventDefault();
            const vk = vkFromMouseButton(e.button);
            if (vk != null) cb.current(vk);
          }}
          onMouseUp={(e) => e.preventDefault()}
          onWheel={(e) => { if (allowMouse) cb.current(e.deltaY < 0 ? 0x100 : 0x101); }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <span className="capture-pulse" />
          <div className="row" style={{ gap: 18, justifyContent: 'center' }}>
            <IconKeyboard style={{ width: 40, height: 40 }} />
            {allowMouse && <IconMouse style={{ width: 34, height: 34 }} />}
          </div>
          <span className="faint">Esperando entrada…</span>
        </div>
        <button id="capture-cancel" className="btn btn-ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
