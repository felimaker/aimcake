# AimCake 🎂 · Native Aim Assist & 1000 Hz Virtual Controller System

<p align="center">
  <img src="public/cake-icon.svg" alt="AimCake Logo" width="120" height="120" style="border-radius: 28px;" />
</p>

<p align="center">
  <strong>Juega con Teclado y Ratón recuperando el Aim Assist Original de Mando a 1000 Hz.</strong><br>
  Plataforma de emulación de mando virtual ultra-rápida, calibración cinemática Bézier y sincronización de perfiles en la nube.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?logo=windows&logoColor=white" alt="Windows Support" />
  <img src="https://img.shields.io/badge/Polling%20Rate-1000%20Hz%20%2F%200.1ms-00e676?style=flat" alt="1000 Hz Polling" />
  <img src="https://img.shields.io/badge/Frontend-React%2018%20%2B%20TypeScript%20%2B%20Vite-61DAFB?logo=react&logoColor=black" alt="React & Vite" />
  <img src="https://img.shields.io/badge/Desktop-Tauri%20v2%20%2B%20Rust-FFC107?logo=tauri&logoColor=black" alt="Tauri v2" />
  <img src="https://img.shields.io/badge/Backend-Supabase%20Auth-3ECF8E?logo=supabase&logoColor=white" alt="Supabase" />
</p>

---

## 🎯 ¿Qué es AimCake?

En los videojuegos competitivos modernos (*Call of Duty: Warzone*, *Modern Warfare III / Black Ops 6*, *Apex Legends*, *Fortnite*, *Halo*), los jugadores con mando físico tienen una ventaja competitiva gracias a la **asistencia de apuntado nativa (Aim Assist rotacional y magnetismo)**. Sin embargo, al jugar con teclado y ratón tradicional, los juegos desactivan por completo cualquier asistencia.

**AimCake soluciona este problema:**
Permite jugar con la precisión milimétrica, giros rápidos de 180° y agilidad de tu **ratón y teclado**, mientras el sistema emula una comunicación nativa de mando para que el juego active el **Aim Assist original completo**.

---

## ✨ Características Principales

* ⚡ **Respuesta Inmediata a 1000 Hz (0.1 ms):** Motor de emulación en tiempo real sin latencia perceptible ni pérdida de fotogramas por segundo (FPS).
* 🎯 **Aim Assist Rotacional Restaurado:** Seguimiento fluido de objetivos en duelos a corta y media distancia.
* 📈 **Sintonizador de Curvas Bézier:** Curva de respuesta matemática totalmente personalizable (lineal, progresiva, suavizado EMA, anti-zona muerta, saturación y retención de stick).
* 🎮 **Emulación Multi-Mando:** Soporte nativo para perfiles **Xbox 360 (XInput)**, **Xbox One / Series** y **DualShock 4 (PlayStation)**.
* ⌨️ **Mapeo Visual Completo:** Interfaz interactiva para mapear teclas físicas y botones de ratón directamente sobre la silueta del mando.
* 🔒 **Autenticación y Perfiles en la Nube:** Sistema completo con Supabase Auth (correo/contraseña, Google OAuth, verificación de email y bonificación opcional de +3 días por teléfono móvil).
* 📦 **Instalador de Drivers en 1 Clic (`aimcake_drivers.exe`):** Asistente automático que registra los controladores necesarios sin pasos técnicos complejos.
* 🌐 **Landing Page Integrada:** Interfaz comercial moderna, responsiva, con comparativa en vivo, simulador de telemetría y planes de suscripción.

---

## 🏗️ Arquitectura del Sistema

```
aimcake/
├── src/                          # Frontend React 18 + Vite (Puerto 1420)
│   ├── App.tsx                   # Enrutador principal, shell de la app y lógica de estados
│   ├── components/               # Módulos y componentes UI
│   │   ├── LandingPage.tsx       # Landing page comercial pública y responsiva
│   │   ├── SetupChecklist.tsx    # Guía interactiva de 4 pasos de configuración
│   │   ├── LiveController.tsx    # Mando virtual en vivo con telemetría visual
│   │   ├── MappingView.tsx       # Mapeo interactivo de controles con teclado virtual
│   │   ├── CurveTuner.tsx        # Calibrador de curvas cinemáticas en Canvas
│   │   ├── DevicesView.tsx       # Detección y filtrado de teclados y ratones
│   │   ├── ProfilesView.tsx      # Gestor de perfiles (importar/exportar JSON)
│   │   ├── AccountView.tsx       # Gestión de cuenta, seguridad y teléfono
│   │   ├── DownloadCard.tsx      # Área de descarga de aimcake_drivers.exe
│   │   └── DesktopRequiredBanner # Aviso responsivo para pantallas móviles/tablets
│   ├── hooks/                    # Hooks personalizados (useAuth, useLicense)
│   ├── lib/                      # Modelos matemáticos (cinemática, curvas, teclas)
│   ├── services/                 # Puentes Tauri IPC, Supabase y autenticación
│   └── index.css                 # Sistema de diseño con variables CSS y glassmorphism
├── src-tauri/                    # Backend nativo en Rust (Tauri v2)
│   ├── app.manifest              # Manifiesto de Windows (privilegios de administrador)
│   └── src/                      # Captura Win32 Raw Input, cinemática y comunicación
├── supabase/                     # Backend Cloud y base de datos
│   ├── migrations/               # Esquema SQL (licencias, perfiles, RPC)
│   └── functions/                # Edge Functions (emisión de licencias, pasarelas)
├── public/                       # Recursos estáticos
│   ├── cake-icon.svg             # Logotipo oficial de AimCake
│   └── downloads/                # Archivo ejecutable aimcake_drivers.exe
└── package.json                  # Dependencias y scripts de construcción
```

---

## 🚀 Inicio Rápido y Desarrollo Local

### Prerrequisitos
* **Node.js** v20 o superior
* **pnpm** o **npm**
* *(Opcional para compilar el ejecutable nativo de escritorio)*: Rust toolchain con `x86_64-pc-windows-msvc` y Visual Studio 2022 C++ Build Tools.

### Instalación

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/felimaker/aimcake.git
   cd aimcake
   ```

2. **Instalar dependencias:**
   ```bash
   npm install
   # o bien con pnpm:
   # pnpm install
   ```

3. **Configurar variables de entorno:**
   Copia `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Configura las claves de tu proyecto Supabase (`VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).

4. **Iniciar el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Abre tu navegador en **[http://localhost:1420](http://localhost:1420)**.

5. **Compilar para producción:**
   ```bash
   npm run build
   ```

---

## 🛠️ Instalación de Controladores

Para que Windows reconozca el mando virtual, descarga y ejecuta el instalador oficial de drivers:
* **Archivo:** `public/downloads/aimcake_drivers.exe`
* **Instalación:** Ejecutar como administrador, presionar *Instalar* y en menos de 30 segundos estará listo.

---

## 💳 Modelo de Licenciamiento

* **3 días gratis siempre** garantizados al registrarte.
* **+3 días gratis de bonificación** al verificar tu número de teléfono móvil (opcional).
* **Planes Pro:** Semanal ($5 USD), Mensual ($15 USD) y Anual ($100 USD).

---

## 📄 Licencia

Este proyecto se distribuye bajo términos de software privativo y comercial. Todos los derechos reservados © 2026 AimCake.
