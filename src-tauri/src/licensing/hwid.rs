//! Generación de Hardware ID irreversible (SHA-256 de UUID de placa + CPU).
//!
//! No usa MAC ni IP, por lo que cambiar de red no altera el HWID.

use sha2::{Digest, Sha256};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::OnceLock;

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
static HWID: OnceLock<String> = OnceLock::new();

fn run_hidden(program: &str, args: &[&str]) -> Option<String> {
    Command::new(program)
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

fn is_valid_uuid(s: &str) -> bool {
    let s = s.trim();
    !s.is_empty()
        && s.len() >= 32
        && !s.eq_ignore_ascii_case("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")
        && !s.eq_ignore_ascii_case("00000000-0000-0000-0000-000000000000")
}

/// UUID SMBIOS de la placa base. WMIC está obsoleto en Windows 11 24H2,
/// por lo que se usa PowerShell/CIM como alternativa.
fn motherboard_uuid() -> String {
    if let Some(out) = run_hidden("wmic", &["csproduct", "get", "UUID"]) {
        if let Some(line) = out.lines().map(str::trim).filter(|l| !l.is_empty()).nth(1) {
            if is_valid_uuid(line) {
                return line.to_uppercase();
            }
        }
    }
    if let Some(out) = run_hidden(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID",
        ],
    ) {
        let line = out.trim();
        if is_valid_uuid(line) {
            return line.to_uppercase();
        }
    }
    "UNKNOWN_UUID".into()
}

pub fn get_hardware_fingerprint() -> String {
    HWID.get_or_init(|| {
        let mut hasher = Sha256::new();
        hasher.update(b"xcb-hwid-v1|");
        hasher.update(motherboard_uuid().as_bytes());
        hasher.update(b"|");
        let cpu_info = std::env::var("PROCESSOR_IDENTIFIER").unwrap_or_default();
        hasher.update(cpu_info.as_bytes());
        format!("{:x}", hasher.finalize())
    })
    .clone()
}
