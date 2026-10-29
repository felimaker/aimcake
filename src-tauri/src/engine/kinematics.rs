//! Algoritmo cinemático: convierte diferenciales del ratón en deflexión de stick.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct KinematicsConfig {
    /// Anti-zona muerta: deflexión mínima al detectar movimiento (supera la deadzone del juego).
    pub deadzone_inner: f32,
    /// Fracción de velocidad de entrada a la que la deflexión se satura al 100%.
    pub deadzone_outer: f32,
    /// Factor de multiplicación de los deltas del ratón.
    pub sensitivity: f32,
    /// Curva de respuesta: 1.0 = lineal, >1.0 = progresiva.
    pub exponent: f32,
    /// Decaimiento por milisegundo cuando el ratón deja de moverse.
    pub decay_rate: f32,
    /// Suavizado EMA de la salida (0 = sin suavizado, 0.9 = muy suave).
    pub smoothing: f32,
    /// Milisegundos que se mantiene la última deflexión antes de decaer (ratones de 125–500 Hz).
    pub hold_ms: f32,
    pub invert_y: bool,
}

impl Default for KinematicsConfig {
    fn default() -> Self {
        Self {
            deadzone_inner: 0.12,
            deadzone_outer: 0.98,
            sensitivity: 2.2,
            exponent: 1.35,
            decay_rate: 0.85,
            smoothing: 0.35,
            hold_ms: 6.0,
            invert_y: false,
        }
    }
}

impl KinematicsConfig {
    pub fn sanitize(&mut self) {
        self.deadzone_inner = self.deadzone_inner.clamp(0.0, 0.6);
        self.deadzone_outer = self.deadzone_outer.clamp(0.05, 1.0);
        self.sensitivity = self.sensitivity.clamp(0.05, 20.0);
        self.exponent = self.exponent.clamp(0.3, 4.0);
        self.decay_rate = self.decay_rate.clamp(0.0, 0.999);
        self.smoothing = self.smoothing.clamp(0.0, 0.95);
        self.hold_ms = self.hold_ms.clamp(0.0, 50.0);
    }

    /// Curva de respuesta pura (entrada normalizada 0..1 -> salida 0..1).
    pub fn response(&self, normalized: f32) -> f32 {
        if normalized <= 0.0 {
            return 0.0;
        }
        let scale = (normalized / self.deadzone_outer).clamp(0.0, 1.0).powf(self.exponent);
        (self.deadzone_inner + (1.0 - self.deadzone_inner) * scale).clamp(0.0, 1.0)
    }
}

/// Velocidad (cuentas/ms tras sensibilidad) que corresponde a entrada normalizada 1.0.
const FULL_SPEED: f32 = 100.0;

pub struct StickProcessor {
    config: KinematicsConfig,
    current_x: f32,
    current_y: f32,
    idle_ms: f32,
}

impl StickProcessor {
    pub fn new(config: KinematicsConfig) -> Self {
        Self { config, current_x: 0.0, current_y: 0.0, idle_ms: 0.0 }
    }

    pub fn set_config(&mut self, config: KinematicsConfig) {
        self.config = config;
    }

    pub fn reset(&mut self) {
        self.current_x = 0.0;
        self.current_y = 0.0;
        self.idle_ms = 0.0;
    }

    /// Transforma los deltas acumulados durante `dt_ms` en valores XInput de 16 bits.
    pub fn process_delta(&mut self, dx: i32, dy: i32, dt_ms: f32) -> (i16, i16) {
        let dt = dt_ms.max(0.001);
        let sens = self.config.sensitivity;
        let f_dx = dx as f32 * sens / dt;
        // El eje Y del ratón crece hacia abajo; el del gamepad hacia arriba.
        let y_sign = if self.config.invert_y { 1.0 } else { -1.0 };
        let f_dy = dy as f32 * sens * y_sign / dt;

        let raw_magnitude = (f_dx * f_dx + f_dy * f_dy).sqrt();

        if raw_magnitude <= 0.001 {
            self.idle_ms += dt;
            if self.idle_ms > self.config.hold_ms {
                let decay = self.config.decay_rate.powf(dt);
                self.current_x *= decay;
                self.current_y *= decay;
                if self.current_x.abs() < 0.002 && self.current_y.abs() < 0.002 {
                    self.current_x = 0.0;
                    self.current_y = 0.0;
                }
            }
        } else {
            self.idle_ms = 0.0;
            let normalized = (raw_magnitude / FULL_SPEED).clamp(0.0, 1.0);
            let out = self.config.response(normalized);
            let angle = f_dy.atan2(f_dx);
            let tx = angle.cos() * out;
            let ty = angle.sin() * out;
            // EMA independiente de la frecuencia de muestreo.
            let alpha = 1.0 - self.config.smoothing.powf(dt);
            self.current_x += (tx - self.current_x) * alpha;
            self.current_y += (ty - self.current_y) * alpha;
        }

        // Restringir al círculo unitario.
        let mag = (self.current_x * self.current_x + self.current_y * self.current_y).sqrt();
        if mag > 1.0 {
            self.current_x /= mag;
            self.current_y /= mag;
        }

        (to_axis(self.current_x), to_axis(self.current_y))
    }
}

#[inline]
pub fn to_axis(v: f32) -> i16 {
    (v * 32767.0).clamp(-32768.0, 32767.0) as i16
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_returns_to_center() {
        let mut p = StickProcessor::new(KinematicsConfig::default());
        p.process_delta(40, 0, 1.0);
        for _ in 0..500 {
            p.process_delta(0, 0, 1.0);
        }
        assert_eq!(p.process_delta(0, 0, 1.0), (0, 0));
    }

    #[test]
    fn moving_right_gives_positive_x() {
        let mut p = StickProcessor::new(KinematicsConfig::default());
        let mut out = (0, 0);
        for _ in 0..10 {
            out = p.process_delta(20, 0, 1.0);
        }
        assert!(out.0 > 0 && out.1 == 0);
    }

    #[test]
    fn moving_mouse_down_gives_negative_y() {
        let mut p = StickProcessor::new(KinematicsConfig::default());
        let mut out = (0, 0);
        for _ in 0..10 {
            out = p.process_delta(0, 20, 1.0);
        }
        assert!(out.1 < 0);
    }
}
