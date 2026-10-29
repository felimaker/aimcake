//! Verificación local criptográfica de tokens de licencia firmados con Ed25519.
//!
//! El servidor (Supabase Edge Function `issue-license`) firma el JSON del payload
//! con su clave privada. El cliente solo contiene la clave pública.

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Clave pública de respaldo (placeholder del blueprint). En producción compila con:
/// `$env:LICENSE_PUBLIC_KEY_HEX="<64 hex>"; pnpm tauri build`
/// (genera el par con `node scripts/generate-keys.mjs`).
const FALLBACK_PUBLIC_KEY: [u8; 32] = [
    0xa3, 0x5f, 0x12, 0x90, 0x44, 0xab, 0xcd, 0xef,
    0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
    0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
    0xef, 0xcd, 0xab, 0x89, 0x67, 0x45, 0x23, 0x01,
];

fn decode_hex32(hex: &str) -> Option<[u8; 32]> {
    let hex = hex.trim();
    if hex.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(&hex[i * 2..i * 2 + 2], 16).ok()?;
    }
    Some(out)
}

fn server_public_key() -> [u8; 32] {
    option_env!("LICENSE_PUBLIC_KEY_HEX")
        .and_then(decode_hex32)
        .unwrap_or(FALLBACK_PUBLIC_KEY)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct LicensePayload {
    pub user_id: String,
    pub hwid: String,
    pub expires_at: i64, // Unix Timestamp
    pub status: String,  // "trial" o "active"
}

fn check_payload(payload_json: &str, current_hwid: &str) -> Result<LicensePayload, String> {
    let payload: LicensePayload =
        serde_json::from_str(payload_json).map_err(|_| "Token de licencia malformado.".to_string())?;

    if payload.hwid != current_hwid {
        return Err("La licencia pertenece a otro equipo (HWID distinto).".into());
    }
    if payload.expires_at < crate::engine::unix_now() {
        return Err(if payload.status == "trial" {
            "El periodo de prueba de 3 días ha expirado.".into()
        } else {
            "La licencia ha expirado. Vuelve a validarla en línea.".into()
        });
    }
    Ok(payload)
}

pub fn verify_license_token(
    payload_json: &str,
    signature_b64: &str,
    current_hwid: &str,
) -> Result<LicensePayload, String> {
    // Modo desarrollador: SOLO disponible en compilaciones debug (`pnpm tauri dev`).
    #[cfg(debug_assertions)]
    if signature_b64 == "DEV" {
        return check_payload(payload_json, current_hwid);
    }

    let verifying_key = VerifyingKey::from_bytes(&server_public_key())
        .map_err(|_| "Clave pública del servidor inválida en el binario.".to_string())?;

    let sig_bytes = STANDARD
        .decode(signature_b64.trim())
        .map_err(|_| "Firma de licencia no es Base64 válido.".to_string())?;

    let signature =
        Signature::from_slice(&sig_bytes).map_err(|_| "Firma de licencia con longitud inválida.".to_string())?;

    verifying_key
        .verify(payload_json.as_bytes(), &signature)
        .map_err(|_| "Firma de licencia inválida.".to_string())?;

    check_payload(payload_json, current_hwid)
}
