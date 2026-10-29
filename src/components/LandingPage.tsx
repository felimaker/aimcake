import { useState } from 'react';
import type { AuthUser } from '../services/authService';
import {
  IconAlert, IconBolt, IconCheck, IconChevron, IconCpu,
  IconCrosshair, IconDownload, IconGamepad, IconKeyboard, IconLayers,
  IconMenu, IconShield, IconSpark, IconUser, IconWindows, IconX,
} from './Icons';
import { ControllerGlyph } from './ControllerPicker';

interface Props {
  user: AuthUser | null;
  onGoApp: () => void;
  onGoLogin: () => void;
  onGoRegister: () => void;
  onRequireAuth: (actionReason?: string) => void;
}

export default function LandingPage({ user, onGoApp, onGoLogin, onGoRegister, onRequireAuth }: Props) {
  const [controllerTab, setControllerTab] = useState<'X360' | 'DS4'>('X360');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    const target = document.getElementById(id);
    const container = document.querySelector('.landing');
    if (target && container) {
      const top = target.getBoundingClientRect().top + container.scrollTop - 72;
      container.scrollTo({ top, behavior: 'smooth' });
    } else if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      onRequireAuth('Crea tu cuenta gratuita o inicia sesión para descargar AimCake y activar tu Aim Assist.');
    }
  };

  return (
    <div className="landing">
      {/* ------------------------------------------------------------ */}
      {/* Navbar Superior Comercial y Responsive                        */}
      {/* ------------------------------------------------------------ */}
      <header className="land-nav">
        <div
          className="land-nav-brand"
          onClick={() => (document.querySelector('.landing') || window).scrollTo({ top: 0, behavior: 'smooth' })}
          style={{ cursor: 'pointer' }}
        >
          <img src="/cake-icon.svg" alt="Logotipo AimCake" className="land-logo" />
          <div>
            <strong className="land-brand-title">AimCake</strong>
            <span className="land-brand-tag">Aim Assist · 1000 Hz</span>
          </div>
        </div>

        {/* Enlaces de escritorio */}
        <nav className="land-nav-links">
          <button onClick={() => scrollTo('features')} className="land-link">Beneficios</button>
          <button onClick={() => scrollTo('performance')} className="land-link">Comparativa</button>
          <button onClick={() => scrollTo('games')} className="land-link">Juegos</button>
          <button onClick={() => scrollTo('pricing')} className="land-link">Precios</button>
          <button onClick={() => scrollTo('faq')} className="land-link">Preguntas</button>
        </nav>

        {/* Acciones de escritorio */}
        <div className="land-nav-actions">
          {user ? (
            <>
              <button id="nav-btn-account" className="btn btn-ghost" onClick={onGoLogin} title="Gestionar mi cuenta y licencias">
                <IconUser /> <span>{user.name}</span>
              </button>
              <button id="nav-btn-app" className="btn" onClick={onGoApp}>
                <IconGamepad /> Abrir Panel
              </button>
              <a
                id="nav-btn-download"
                href="/downloads/aimcake_drivers.exe"
                download="aimcake_drivers.exe"
                className="btn btn-primary land-dl-pill"
              >
                <IconDownload /> Descargar aimcake_drivers.exe
              </a>
            </>
          ) : (
            <>
              <button id="nav-btn-login" className="btn btn-ghost" onClick={onGoLogin}>
                Iniciar sesión
              </button>
              <button id="nav-btn-register" className="btn" onClick={onGoRegister}>
                Crear cuenta
              </button>
              <button
                id="nav-btn-download"
                className="btn btn-primary land-dl-pill"
                onClick={handleDownloadClick}
              >
                <IconDownload /> Descargar aimcake_drivers.exe
              </button>
            </>
          )}

          {/* Botón hamburguesa para móviles y tablets */}
          <button
            id="nav-hamburger-btn"
            className="land-mobile-toggle"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label="Abrir menú"
          >
            {mobileMenuOpen ? <IconX /> : <IconMenu />}
          </button>
        </div>
      </header>

      {/* Menú móvil desplegable (Responsive Drawer) */}
      {mobileMenuOpen && (
        <div className="land-mobile-drawer">
          <nav className="land-mobile-links">
            <button onClick={() => scrollTo('features')} className="land-mobile-link">Beneficios</button>
            <button onClick={() => scrollTo('performance')} className="land-mobile-link">Comparativa</button>
            <button onClick={() => scrollTo('games')} className="land-mobile-link">Juegos compatibles</button>
            <button onClick={() => scrollTo('pricing')} className="land-mobile-link">Planes y Precios</button>
            <button onClick={() => scrollTo('faq')} className="land-mobile-link">Preguntas Frecuentes</button>
          </nav>
          <div className="land-mobile-actions">
            {user ? (
              <>
                <button className="btn btn-block" onClick={() => { setMobileMenuOpen(false); onGoLogin(); }}>
                  <IconUser /> Mi Cuenta ({user.name})
                </button>
                <button className="btn btn-block" onClick={() => { setMobileMenuOpen(false); onGoApp(); }}>
                  <IconGamepad /> Panel de Control
                </button>
                <a
                  href="/downloads/aimcake_drivers.exe"
                  download="aimcake_drivers.exe"
                  className="btn btn-primary btn-block"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <IconDownload /> Descargar aimcake_drivers.exe
                </a>
              </>
            ) : (
              <>
                <button className="btn btn-ghost btn-block" onClick={() => { setMobileMenuOpen(false); onGoLogin(); }}>
                  Iniciar sesión
                </button>
                <button className="btn btn-block" onClick={() => { setMobileMenuOpen(false); onGoRegister(); }}>
                  Crear cuenta gratuita (+3 días)
                </button>
                <button
                  className="btn btn-primary btn-block"
                  onClick={(e) => { setMobileMenuOpen(false); handleDownloadClick(e); }}
                >
                  <IconDownload /> Descargar aimcake_drivers.exe
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* Hero Section                                                 */}
      {/* ------------------------------------------------------------ */}
      <section className="land-hero">
        <div className="land-hero-glow" />
        <div className="land-hero-glow-2" />

        <div className="land-hero-badge">
          <span className="land-badge-pulse" />
          <IconBolt style={{ width: 14, color: 'var(--accent)' }} />
          <span>🎯 Recupera la asistencia de apuntado (Aim Assist) jugando con Teclado y Ratón</span>
        </div>

        <h1 className="land-hero-h1">
          Juega con <span className="grad-text">Teclado y Ratón</span> recuperando el{' '}
          <span className="grad-text-cyan">Aim Assist Original</span> de Mando.
        </h1>

        <p className="land-hero-sub">
          Al jugar con teclado y ratón en PC, los juegos desactivan por completo tu asistencia de apuntado,
          dejándote en desventaja frente a los jugadores de mando. Con AimCake solucionas esto de inmediato:
          mantén la velocidad, agilidad y reflejos de tu ratón mientras disfrutas del seguimiento rotacional y magnetismo nativo.
        </p>

        <div className="land-hero-ctas">
          {user ? (
            <a
              id="hero-dl-btn"
              href="/downloads/aimcake_drivers.exe"
              download="aimcake_drivers.exe"
              className="btn btn-primary land-btn-hero"
            >
              <IconWindows style={{ width: 22 }} />
              <span>
                <strong>Descargar aimcake_drivers.exe</strong>
                <small>Instalación fácil en 1 clic · Prueba gratuita de 3 días</small>
              </span>
            </a>
          ) : (
            <button
              id="hero-dl-btn"
              className="btn btn-primary land-btn-hero"
              onClick={handleDownloadClick}
            >
              <IconWindows style={{ width: 22 }} />
              <span>
                <strong>Descargar aimcake_drivers.exe</strong>
                <small>Requiere cuenta gratuita · Prueba de 3 días incluida</small>
              </span>
            </button>
          )}

          <button id="hero-try-btn" className="btn land-btn-secondary" onClick={user ? onGoApp : onGoRegister}>
            <IconSpark style={{ width: 20, color: 'var(--accent-2)' }} />
            <span>
              <strong>{user ? 'Abrir Panel de Control' : 'Probar 3 días gratis'}</strong>
              <small>{user ? 'Configura tu Aim Assist' : 'Sin tarjeta de crédito requerida'}</small>
            </span>
          </button>
        </div>

        <div className="land-trust-bar">
          <div className="land-trust-item"><IconCheck /> <span>Aim Assist rotacional nativo</span></div>
          <div className="land-trust-item"><IconCheck /> <span>Compatible con Warzone, BO6, Apex y Fortnite</span></div>
          <div className="land-trust-item"><IconCheck /> <span>Respuesta inmediata y fluida a 1000 Hz</span></div>
          <div className="land-trust-item"><IconCheck /> <span>3 días gratis siempre por cuenta (+3 opcionales)</span></div>
        </div>

        {/* Live Controller Mock Telemetry */}
        <div className="land-preview-box">
          <div className="land-preview-bar">
            <div className="row" style={{ gap: 8 }}>
              <span className="dot ok" />
              <strong>Simulador Virtual en Vivo</strong>
            </div>
            <div className="land-ctrl-tabs">
              <button
                className={`land-ctrl-tab ${controllerTab === 'X360' ? 'on' : ''}`}
                onClick={() => setControllerTab('X360')}
              >
                Xbox 360 (XInput)
              </button>
              <button
                className={`land-ctrl-tab ${controllerTab === 'DS4' ? 'on' : ''}`}
                onClick={() => setControllerTab('DS4')}
              >
                DualShock 4 (PlayStation)
              </button>
            </div>
          </div>

          <div className="land-preview-body">
            <div className="land-preview-glyph">
              <ControllerGlyph type={controllerTab} size={220} />
            </div>

            <div className="land-preview-stats">
              <div className="land-pstat">
                <span className="land-pstat-lbl"><IconBolt /> Frecuencia de polling</span>
                <span className="land-pstat-val">1000 Hz <small>tiempo real</small></span>
                <div className="hz-bar"><div style={{ width: '100%' }} /></div>
              </div>
              <div className="land-pstat">
                <span className="land-pstat-lbl"><IconCrosshair /> Cinemática del ratón</span>
                <span className="land-pstat-val">Stick Derecho (Aim)</span>
                <small className="faint">Curva Bézier con suavizado exponencial</small>
              </div>
              <div className="land-pstat">
                <span className="land-pstat-lbl"><IconCrosshair /> Asistencia de apuntado</span>
                <span className="land-pstat-val" style={{ color: 'var(--accent)' }}>Aim Assist Activo</span>
                <small className="faint">Magnetismo y rotacional original funcionando</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Beneficios Clave: El Problema y la Solución                   */}
      {/* ------------------------------------------------------------ */}
      <section className="land-sec" id="features">
        <div className="land-sec-head">
          <span className="land-eyebrow"><IconSpark /> Diseñado para Competir y Ganar</span>
          <h2 className="land-sec-title">Recupera la ventaja en cada enfrentamiento</h2>
          <p className="land-sec-sub">
            Se acabaron los duelos injustos. Disfruta de la puntería asistida de mando sin tener que soltar tu teclado y ratón de siempre.
          </p>
        </div>

        <div className="land-grid-3">
          <div className="card land-feat-card">
            <div className="land-feat-icon cyan"><IconCrosshair /></div>
            <h3>Aim Assist Original Restaurado</h3>
            <p>
              El gran problema de jugar con ratón es que el juego te quita toda la asistencia. Con AimCake recuperas ese seguimiento rotacional y magnetismo que tienen los jugadores de mando para que no se te escape ningún enemigo.
            </p>
          </div>

          <div className="card land-feat-card">
            <div className="land-feat-icon"><IconBolt /></div>
            <h3>Agilidad de Ratón + Puntería de Mando</h3>
            <p>
              Combina lo mejor de dos mundos: la rapidez de giro de 180° y precisión de tu sensor óptico junto a la fijación asistida de mando en combates a corta y media distancia.
            </p>
          </div>

          <div className="card land-feat-card">
            <div className="land-feat-icon cyan"><IconShield /></div>
            <h3>Sin Comprar Mandos Costosos</h3>
            <p>
              No necesitas gastar $70 o $150 USD en mandos especiales de consola ni adaptadores externos. Todo funciona directamente con tu teclado y ratón actuales en tu PC.
            </p>
          </div>

          <div className="card land-feat-card">
            <div className="land-feat-icon"><IconLayers /></div>
            <h3>Curvas de Sensibilidad a tu Medida</h3>
            <p>
              Personaliza la respuesta de tu puntería a tu gusto: curvas suaves para disparos de precisión con francotirador o reactivas e instantáneas para duelos intensos con subfusil.
            </p>
          </div>

          <div className="card land-feat-card">
            <div className="land-feat-icon cyan"><IconKeyboard /></div>
            <h3>Configuración Simple en 1 Clic</h3>
            <p>
              Olvídate de procesos complicados o tutoriales eternos. Abres AimCake, seleccionas tu perfil de juego y estás listo para saltar a tu partida con Aim Assist activo.
            </p>
          </div>

          <div className="card land-feat-card">
            <div className="land-feat-icon"><IconCpu /></div>
            <h3>Respuesta Fluida a 1000 Hz</h3>
            <p>
              Cero retrasos ni tirones en pantalla. Cada movimiento de tu ratón se transfiere con fluidez milimétrica sin quitarle rendimiento ni FPS a tu videojuego.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Comparativa de Experiencia de Juego                          */}
      {/* ------------------------------------------------------------ */}
      <section className="land-sec" id="performance">
        <div className="land-sec-head">
          <span className="land-eyebrow"><IconBolt /> Comparativa Real</span>
          <h2 className="land-sec-title">¿Por qué estás en desventaja sin AimCake?</h2>
          <p className="land-sec-sub">
            En shooters competitivos, jugar con ratón tradicional contra mandos con Aim Assist rotacional te pone en clara desventaja. Mira la diferencia:
          </p>
        </div>

        <div className="land-table-wrap">
          <table className="land-table">
            <thead>
              <tr>
                <th>Característica</th>
                <th className="highlight">Con AimCake</th>
                <th>Ratón Tradicional</th>
                <th>Mando de Consola</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Asistencia de Apuntado (Aim Assist)</td>
                <td className="highlight"><strong>Original Completo</strong></td>
                <td>Desactivado por el juego</td>
                <td>Activo</td>
              </tr>
              <tr>
                <td>Velocidad y Precisión con Ratón</td>
                <td className="highlight"><strong>Máxima (Sensor Óptico)</strong></td>
                <td>Máxima</td>
                <td>Lenta (Palanca joystick)</td>
              </tr>
              <tr>
                <td>Seguimiento rotacional en duelos 1v1</td>
                <td className="highlight"><strong>Automático y asistido</strong></td>
                <td>100% manual (difícil)</td>
                <td>Asistido</td>
              </tr>
              <tr>
                <td>Gasto adicional en periféricos</td>
                <td className="highlight"><strong>$0 (Usa tu equipo actual)</strong></td>
                <td>$0</td>
                <td>$70 - $180 USD</td>
              </tr>
              <tr>
                <td>Fluidez de respuesta</td>
                <td className="highlight"><strong>1000 Hz (Inmediata)</strong></td>
                <td>1000 Hz</td>
                <td>125 - 250 Hz (Bluetooth)</td>
              </tr>
              <tr>
                <td>Prueba gratuita sin riesgo</td>
                <td className="highlight"><strong>3 días gratis (+3 de regalo)</strong></td>
                <td>N/A</td>
                <td>Sin prueba</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Juegos Optimizados                                            */}
      {/* ------------------------------------------------------------ */}
      <section className="land-sec" id="games">
        <div className="land-sec-head">
          <span className="land-eyebrow"><IconCrosshair /> Máxima Compatibilidad</span>
          <h2 className="land-sec-title">Optimizado para tus juegos favoritos</h2>
          <p className="land-sec-sub">Compatible con cualquier juego de Windows que acepte mandos Xbox o PlayStation.</p>
        </div>

        <div className="land-games-grid">
          {[
            { name: 'Call of Duty: Warzone', genre: 'Battle Royale', assist: 'Aim Assist Rotacional Fuerte', tags: ['XInput', '1000 Hz'] },
            { name: 'Modern Warfare III / Black Ops 6', genre: 'FPS Competitivo', assist: 'Aim Assist Muy Alto', tags: ['XInput', '1000 Hz'] },
            { name: 'Apex Legends', genre: 'Hero Shooter', assist: '0.4 / 0.6 Aim Assist', tags: ['XInput', 'DualShock 4'] },
            { name: 'Fortnite', genre: 'Battle Royale', assist: 'Aim Assist Proporcional', tags: ['XInput', 'Multi-dispositivo'] },
            { name: 'Halo Infinite', genre: 'Arena Shooter', assist: 'Bullet Magnetism + Friction', tags: ['XInput', '1000 Hz'] },
            { name: 'The Finals & Battlefield', genre: 'Tactical FPS', assist: 'Snap Aim Assist', tags: ['Xbox 360', '1000 Hz'] },
          ].map((g, i) => (
            <div key={i} className="card land-game-card">
              <div className="land-game-top">
                <span className="land-game-genre">{g.genre}</span>
                <span className="chip ok sm">{g.assist}</span>
              </div>
              <h3 className="land-game-title">{g.name}</h3>
              <div className="land-game-tags">
                {g.tags.map((t, idx) => <span key={idx} className="chip sm">{t}</span>)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Precios y Suscripción                                         */}
      {/* ------------------------------------------------------------ */}
      <section className="land-sec" id="pricing">
        <div className="land-sec-head">
          <span className="land-eyebrow"><IconShield /> Planes Simples y Transparentes</span>
          <h2 className="land-sec-title">Planes Semanal, Mensual y Anual</h2>
          <p className="land-sec-sub">
            Todos los planes incluyen <strong>3 días de prueba gratis siempre</strong>. Cancela en cualquier momento sin compromiso.
          </p>
        </div>

        {/* Banner de Bonificación 3+3 Días */}
        <div className="land-bonus-banner">
          <div className="land-bonus-icon">🎁</div>
          <div className="land-bonus-content">
            <strong>3 Días Gratis siempre incluidos · Desbloquea +3 Días más de regalo</strong>
            <p>
              Al crear tu cuenta recibes 3 días de acceso Pro completo de inmediato. Si deseas verificar tu número de teléfono móvil en tu perfil (opcional, no obligatorio), desbloqueas <strong>3 días adicionales gratis</strong> (total 6 días de prueba sin pagar nada).
            </p>
          </div>
        </div>

        <div className="land-pricing-grid">
          {/* Card 1: Plan Semanal */}
          <div className="card land-price-card">
            <span className="land-price-plan">Plan Semanal</span>
            <div className="land-price-val">$5 <small>/ semana</small></div>
            <p className="faint">Ideal para torneos de fin de semana o probar el sistema a fondo.</p>
            <ul className="land-price-perks">
              <li><IconCheck /> <strong>3 días gratis siempre</strong> al registrarte</li>
              <li><IconCheck /> +3 días extra verificando teléfono (opcional)</li>
              <li><IconCheck /> Polling Rate de 1000 Hz de respuesta inmediata</li>
              <li><IconCheck /> Aim Assist rotacional nativo activado</li>
              <li><IconCheck /> 1 ratón y 1 teclado por configuración</li>
              <li><IconCheck /> Sin permanencia, cancela cuando quieras</li>
            </ul>
            <button className="btn land-price-btn" onClick={user ? onGoApp : onGoRegister}>
              {user ? 'Elegir Plan Semanal ($5 USD)' : 'Probar 3 Días Gratis'}
            </button>
          </div>

          {/* Card 2: Plan Mensual (Destacado) */}
          <div className="card land-price-card featured">
            <span className="land-price-badge">Más Recomendado</span>
            <span className="land-price-plan">Plan Mensual</span>
            <div className="land-price-val">$15 <small>/ mes</small></div>
            <p className="faint">La elección predilecta de jugadores competitivos y streamers.</p>
            <ul className="land-price-perks">
              <li><IconCheck /> <strong>3 días gratis siempre</strong> al registrarte</li>
              <li><IconCheck /> +3 días extra verificando teléfono (opcional)</li>
              <li><IconCheck /> Perfiles ilimitados por juego (Warzone, Apex, etc.)</li>
              <li><IconCheck /> Curvas de respuesta avanzadas Bézier y deadzones</li>
              <li><IconCheck /> Latencia ultra-baja 0.1 ms en partida</li>
              <li><IconCheck /> Actualizaciones automáticas y soporte prioritario</li>
            </ul>
            <button className="btn btn-primary land-price-btn" onClick={user ? onGoApp : onGoRegister}>
              {user ? 'Elegir Plan Mensual ($15 USD)' : 'Comenzar Prueba Gratis'}
            </button>
          </div>

          {/* Card 3: Plan Anual */}
          <div className="card land-price-card">
            <span className="land-price-badge cyan">Ahorra 44%</span>
            <span className="land-price-plan">Plan Anual</span>
            <div className="land-price-val">$100 <small>/ año</small></div>
            <div className="land-price-equiv">Equivale a solo ~$8.33 USD / mes</div>
            <p className="faint">Acceso total ininterrumpido durante 12 meses al mejor precio.</p>
            <ul className="land-price-perks">
              <li><IconCheck /> <strong>3 días gratis siempre</strong> al registrarte</li>
              <li><IconCheck /> +3 días extra verificando teléfono (opcional)</li>
              <li><IconCheck /> 12 meses completos de acceso Pro</li>
              <li><IconCheck /> Ahorras $80 USD al año vs plan mensual</li>
              <li><IconCheck /> Soporte VIP prioritario 24/7 y acceso Discord</li>
              <li><IconCheck /> Acceso anticipado a nuevas betas y perfiles</li>
            </ul>
            <button className="btn land-price-btn" onClick={user ? onGoApp : onGoRegister}>
              {user ? 'Elegir Plan Anual ($100 USD)' : 'Comenzar Plan Anual'}
            </button>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Preguntas Frecuentes (FAQ)                                    */}
      {/* ------------------------------------------------------------ */}
      <section className="land-sec" id="faq">
        <div className="land-sec-head">
          <span className="land-eyebrow"><IconAlert /> Dudas Frecuentes</span>
          <h2 className="land-sec-title">Todo lo que necesitas saber</h2>
        </div>

        <div className="land-faq-list">
          {[
            {
              q: '¿Cuál es el problema que soluciona AimCake?',
              a: 'En los shooters competitivos (Warzone, MW3, BO6, Apex Legends, Fortnite), los jugadores con mando disfrutan de una ventaja enorme gracias al Aim Assist rotacional, que ayuda a seguir objetivos y no fallar balas a corta y media distancia. Sin embargo, al jugar con teclado y ratón tradicional, el juego desactiva por completo esa ayuda. Con AimCake solucionas esto de raíz: juegas con tu propio ratón y teclado mientras recuperas la asistencia de apuntado original completa.',
            },
            {
              q: '¿Necesito comprar o conectar un mando físico a mi computadora?',
              a: 'No. No necesitas gastar dinero en mandos reales ni adaptadores de consola. AimCake hace que tu juego reconozca directamente tu teclado y ratón con la asistencia de apuntado activa.',
            },
            {
              q: '¿Cómo funciona la prueba gratis de 3 días y el beneficio del teléfono?',
              a: 'Todos los usuarios tienen 3 días de prueba gratis completa siempre garantizados al crear su cuenta. Además, si decides verificar tu número de teléfono móvil en tu perfil, recibes 3 días gratis más de regalo (un total de 6 días gratis sin pagar nada). Añadir el teléfono es totalmente opcional.',
            },
            {
              q: '¿Es difícil de configurar o instalar?',
              a: 'Para nada. No requieres conocimientos técnicos ni configuraciones complicadas. Descargas el instalador en 1 clic, inicias sesión y en 30 segundos estás jugando con Aim Assist en tu partida.',
            },
            {
              q: '¿Puedo seguir usando mi teclado normalmente para escribir mientras juego?',
              a: 'Sí. Puedes usar una tecla rápida (por defecto F8) para pausar la asistencia en cualquier momento para escribir en el chat o usar Windows, y reactivarla de inmediato con un solo toque.',
            },
          ].map((item, idx) => (
            <details key={idx} className="land-faq-item">
              <summary>
                <span>{item.q}</span>
                <IconChevron />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Banner de Descarga Final                                      */}
      {/* ------------------------------------------------------------ */}
      <section className="land-cta-banner">
        <div className="land-cta-box">
          <div className="land-cta-glow" />
          <h2 className="land-cta-h2">¿Listo para mejorar tu puntería hoy mismo?</h2>
          <p className="land-cta-p">Descarga AimCake ahora mismo y empieza a jugar con Aim Assist en menos de 2 minutos.</p>
          <div className="row" style={{ gap: 14, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            {user ? (
              <a
                href="/downloads/aimcake_drivers.exe"
                download="aimcake_drivers.exe"
                className="btn btn-primary btn-lg"
              >
                <IconDownload /> Descargar aimcake_drivers.exe
              </a>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={handleDownloadClick}
              >
                <IconDownload /> Descargar aimcake_drivers.exe
              </button>
            )}
            <button className="btn btn-lg" onClick={user ? onGoApp : onGoRegister}>
              <IconGamepad /> {user ? 'Abrir Panel de Control' : 'Crear Cuenta Gratuita'}
            </button>
          </div>
          <small className="faint" style={{ marginTop: 12, display: 'block' }}>
            Compatible con Windows 10 y Windows 11 (64-bit) · Requiere cuenta de usuario · Instalación rápida en 1 clic sin complicaciones
          </small>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Footer                                                       */}
      {/* ------------------------------------------------------------ */}
      <footer className="land-footer">
        <div className="land-footer-top">
          <div className="land-footer-brand">
            <div className="row" style={{ gap: 8 }}>
              <img src="/cake-icon.svg" alt="" className="land-logo sm" />
              <strong>AimCake</strong>
            </div>
            <p className="faint" style={{ maxWidth: 320, fontSize: 12.5 }}>
              Recupera la asistencia de apuntado (Aim Assist) original de mando jugando con teclado y ratón a 1000 Hz.
            </p>
          </div>
          <div className="land-footer-links">
            <div>
              <strong>Software</strong>
              {user ? (
                <a href="/downloads/aimcake_drivers.exe" download="aimcake_drivers.exe">Descargar aimcake_drivers.exe</a>
              ) : (
                <button onClick={handleDownloadClick}>Descargar aimcake_drivers.exe</button>
              )}
              <button onClick={user ? onGoApp : onGoLogin}>Panel de Control</button>
              <button onClick={() => scrollTo('features')}>Beneficios</button>
            </div>
            <div>
              <strong>Cuenta</strong>
              <button onClick={onGoLogin}>Iniciar Sesión</button>
              <button onClick={onGoRegister}>Crear Cuenta</button>
              <button onClick={() => scrollTo('pricing')}>Planes y Precios</button>
            </div>
            <div>
              <strong>Soporte</strong>
              <button onClick={() => scrollTo('faq')}>Preguntas Frecuentes</button>
              <button onClick={() => scrollTo('performance')}>Comparativa</button>
              <button onClick={() => scrollTo('games')}>Juegos Compatibles</button>
            </div>
          </div>
        </div>
        <div className="land-footer-bot">
          <small className="faint">© 2026 AimCake. Todos los derechos reservados. No afiliado con Microsoft o Sony.</small>
          <div className="row" style={{ gap: 12 }}>
            <span className="chip sm ok"><span className="dot" /> Servidores y pasarela activos</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
