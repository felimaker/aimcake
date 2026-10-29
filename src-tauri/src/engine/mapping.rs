//! Mapeo de teclas/botones del ratón a salidas del gamepad Xbox 360.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use vigem_client::{XButtons, XGamepad};

/// Códigos virtuales extra para el ratón (los botones usan los VK estándar de Windows).
pub mod vk {
    pub const MOUSE_LEFT: u32 = 0x01;
    pub const MOUSE_RIGHT: u32 = 0x02;
    pub const MOUSE_MIDDLE: u32 = 0x04;
    pub const MOUSE_X1: u32 = 0x05;
    pub const MOUSE_X2: u32 = 0x06;
    pub const WHEEL_UP: u32 = 0x100;
    pub const WHEEL_DOWN: u32 = 0x101;
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Binding {
    /// Código VK de la tecla o botón del ratón (ver `vk`).
    pub input: u32,
    /// Nombre de la salida: A, B, X, Y, LB, RB, LT, RT, BACK, START, GUIDE,
    /// LTHUMB, RTHUMB, UP, DOWN, LEFT, RIGHT, LS_UP, LS_DOWN, LS_LEFT, LS_RIGHT,
    /// RS_UP, RS_DOWN, RS_LEFT, RS_RIGHT.
    pub target: String,
}

#[derive(Debug, Clone, Copy)]
enum Target {
    Button(u16),
    LeftTrigger,
    RightTrigger,
    LsUp,
    LsDown,
    LsLeft,
    LsRight,
    RsUp,
    RsDown,
    RsLeft,
    RsRight,
}

/// Direcciones digitales activas de ambos sticks tras aplicar el mapeo.
#[derive(Debug, Default, Clone, Copy)]
pub struct StickOverrides {
    /// Vector normalizado del stick izquierdo si alguna tecla lo controla.
    pub ls: Option<(f32, f32)>,
    /// Vector normalizado del stick derecho si alguna tecla lo controla.
    pub rs: Option<(f32, f32)>,
}

fn dir_vector(up: bool, down: bool, left: bool, right: bool) -> Option<(f32, f32)> {
    if !(up || down || left || right) {
        return None;
    }
    let x = (right as i8 - left as i8) as f32;
    let y = (up as i8 - down as i8) as f32;
    // Normalizar diagonales para no exceder el círculo unitario.
    let norm = if x != 0.0 && y != 0.0 { std::f32::consts::FRAC_1_SQRT_2 } else { 1.0 };
    Some((x * norm, y * norm))
}

fn parse_target(name: &str) -> Option<Target> {
    Some(match name {
        "A" => Target::Button(XButtons::A),
        "B" => Target::Button(XButtons::B),
        "X" => Target::Button(XButtons::X),
        "Y" => Target::Button(XButtons::Y),
        "LB" => Target::Button(XButtons::LB),
        "RB" => Target::Button(XButtons::RB),
        "BACK" => Target::Button(XButtons::BACK),
        "START" => Target::Button(XButtons::START),
        "GUIDE" => Target::Button(XButtons::GUIDE),
        "LTHUMB" => Target::Button(XButtons::LTHUMB),
        "RTHUMB" => Target::Button(XButtons::RTHUMB),
        "UP" => Target::Button(XButtons::UP),
        "DOWN" => Target::Button(XButtons::DOWN),
        "LEFT" => Target::Button(XButtons::LEFT),
        "RIGHT" => Target::Button(XButtons::RIGHT),
        "LT" => Target::LeftTrigger,
        "RT" => Target::RightTrigger,
        "LS_UP" => Target::LsUp,
        "LS_DOWN" => Target::LsDown,
        "LS_LEFT" => Target::LsLeft,
        "LS_RIGHT" => Target::LsRight,
        "RS_UP" => Target::RsUp,
        "RS_DOWN" => Target::RsDown,
        "RS_LEFT" => Target::RsLeft,
        "RS_RIGHT" => Target::RsRight,
        _ => return None,
    })
}

fn b(input: u32, target: &str) -> Binding {
    Binding { input, target: target.to_string() }
}

/// Perfil por defecto orientado a shooters (estilo Call of Duty).
pub fn default_bindings() -> Vec<Binding> {
    vec![
        b(0x57, "LS_UP"),    // W
        b(0x53, "LS_DOWN"),  // S
        b(0x41, "LS_LEFT"),  // A
        b(0x44, "LS_RIGHT"), // D
        b(0x20, "A"),        // Espacio: saltar
        b(0x43, "B"),        // C: agacharse
        b(0x52, "X"),        // R: recargar / interactuar
        b(0x31, "Y"),        // 1: cambiar arma
        b(0x51, "LB"),       // Q: táctico
        b(0x45, "RB"),       // E: letal
        b(0xA0, "LTHUMB"),   // Shift izq.: correr
        b(0x56, "RTHUMB"),   // V: cuerpo a cuerpo
        b(0x09, "BACK"),     // Tab: marcador
        b(0x1B, "START"),    // Esc: menú
        b(0x26, "UP"),       // Flechas: cruceta
        b(0x28, "DOWN"),
        b(0x25, "LEFT"),
        b(0x27, "RIGHT"),
        b(vk::MOUSE_LEFT, "RT"),   // Disparar
        b(vk::MOUSE_RIGHT, "LT"),  // Apuntar
        b(vk::MOUSE_MIDDLE, "RTHUMB"),
        b(vk::WHEEL_UP, "Y"),
        b(vk::WHEEL_DOWN, "Y"),
    ]
}

pub struct Mapper {
    map: HashMap<u32, Vec<Target>>,
}

impl Mapper {
    pub fn new(bindings: &[Binding]) -> Self {
        let mut map: HashMap<u32, Vec<Target>> = HashMap::new();
        for binding in bindings {
            if let Some(t) = parse_target(&binding.target) {
                map.entry(binding.input).or_default().push(t);
            }
        }
        Self { map }
    }

    /// Construye el estado digital del gamepad a partir de las entradas activas y
    /// devuelve las direcciones digitales de los sticks (el worker decide cómo
    /// mezclarlas con el ratón).
    pub fn apply<'a>(
        &self,
        active: impl Iterator<Item = &'a u32>,
        pad: &mut XGamepad,
    ) -> StickOverrides {
        let mut l = [false; 4];
        let mut r = [false; 4];
        for code in active {
            let Some(targets) = self.map.get(code) else { continue };
            for t in targets {
                match *t {
                    Target::Button(bits) => pad.buttons.raw |= bits,
                    Target::LeftTrigger => pad.left_trigger = 255,
                    Target::RightTrigger => pad.right_trigger = 255,
                    Target::LsUp => l[0] = true,
                    Target::LsDown => l[1] = true,
                    Target::LsLeft => l[2] = true,
                    Target::LsRight => l[3] = true,
                    Target::RsUp => r[0] = true,
                    Target::RsDown => r[1] = true,
                    Target::RsLeft => r[2] = true,
                    Target::RsRight => r[3] = true,
                }
            }
        }
        StickOverrides {
            ls: dir_vector(l[0], l[1], l[2], l[3]),
            rs: dir_vector(r[0], r[1], r[2], r[3]),
        }
    }
}
