//! Enumeración e identificación de teclados y ratones (Raw Input + HID).
//!
//! Cada dispositivo físico puede exponer varias interfaces (p. ej. un teclado gaming
//! con teclas multimedia). Se agrupan por VID/PID para mostrar un único dispositivo.

use serde::Serialize;
use std::collections::BTreeMap;
use std::ffi::c_void;

use windows::core::PCWSTR;
use windows::Win32::Devices::HumanInterfaceDevice::{HidD_GetManufacturerString, HidD_GetProductString};
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows::Win32::UI::Input::{
    GetRawInputDeviceInfoW, GetRawInputDeviceList, RAWINPUTDEVICELIST, RIDI_DEVICENAME,
};

pub const KIND_MOUSE: &str = "mouse";
pub const KIND_KEYBOARD: &str = "keyboard";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InputDevice {
    /// Identificador estable (sobrevive a reinicios y reconexiones).
    pub id: String,
    pub kind: String,
    pub name: String,
    pub manufacturer: Option<String>,
    pub vid: Option<String>,
    pub pid: Option<String>,
    pub interfaces: u32,
    pub connection: String,
}

/// Ruta de interfaz (`\\?\HID#VID_046D&PID_C08B&MI_00#...`) de un handle de Raw Input.
pub fn device_path(handle: HANDLE) -> Option<String> {
    unsafe {
        let mut size: u32 = 0;
        GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, None, &mut size);
        if size == 0 || size > 4096 {
            return None;
        }
        let mut buf: Vec<u16> = vec![0; size as usize + 1];
        let read = GetRawInputDeviceInfoW(handle, RIDI_DEVICENAME, Some(buf.as_mut_ptr() as *mut c_void), &mut size);
        if read == u32::MAX || read == 0 {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        Some(String::from_utf16_lossy(&buf[..end]))
    }
}

fn extract_hex(path_upper: &str, key: &str) -> Option<String> {
    let idx = path_upper.find(key)? + key.len();
    let hex: String = path_upper[idx..].chars().take(4).collect();
    (hex.len() == 4 && hex.chars().all(|c| c.is_ascii_hexdigit())).then_some(hex)
}

pub fn parse_vid_pid(path: &str) -> (Option<String>, Option<String>) {
    let up = path.to_uppercase();
    // USB: VID_xxxx&PID_xxxx · Bluetooth: VID&02xxxx_PID&xxxx
    let vid = extract_hex(&up, "VID_").or_else(|| {
        let i = up.find("VID&")? + 4;
        let hex: String = up[i..].chars().skip(2).take(4).collect();
        (hex.len() == 4).then_some(hex)
    });
    let pid = extract_hex(&up, "PID_").or_else(|| extract_hex(&up, "PID&"));
    (vid, pid)
}

/// Identificador estable del dispositivo físico al que pertenece la interfaz.
pub fn device_id(kind: &str, path: &str) -> String {
    match parse_vid_pid(path) {
        (Some(v), Some(p)) => format!("{kind}:{v}:{p}"),
        _ => {
            // Sin VID/PID (PS/2, ACPI, RDP...): usar la ruta sin el GUID de clase.
            let base = path.split('{').next().unwrap_or(path).trim_end_matches('#');
            format!("{kind}:{}", base.to_lowercase())
        }
    }
}

fn read_hid_string(path: &str, product: bool) -> Option<String> {
    unsafe {
        let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        // Acceso 0: permitido incluso para teclados/ratones que el sistema tiene abiertos en exclusiva.
        let handle = CreateFileW(
            PCWSTR(wide.as_ptr()),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            None,
            OPEN_EXISTING,
            FILE_FLAGS_AND_ATTRIBUTES(0),
            HANDLE::default(),
        )
        .ok()?;
        let mut buf = [0u16; 256];
        let ok = if product {
            HidD_GetProductString(handle, buf.as_mut_ptr() as *mut c_void, (buf.len() * 2) as u32)
        } else {
            HidD_GetManufacturerString(handle, buf.as_mut_ptr() as *mut c_void, (buf.len() * 2) as u32)
        };
        let _ = CloseHandle(handle);
        if ok.0 == 0 {
            return None;
        }
        let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
        let s = String::from_utf16_lossy(&buf[..end]).trim().to_string();
        (!s.is_empty()).then_some(s)
    }
}

fn vendor_name(vid: &str) -> Option<&'static str> {
    Some(match vid {
        "046D" => "Logitech",
        "1532" => "Razer",
        "1B1C" => "Corsair",
        "1038" => "SteelSeries",
        "0951" | "03F0" => "HyperX",
        "045E" => "Microsoft",
        "0B05" => "ASUS",
        "258A" => "Glorious / Sinowealth",
        "3367" => "Endgame Gear",
        "093A" => "Pixart",
        "1EA7" => "SHARKOON",
        "2516" => "Cooler Master",
        "1A2C" => "China Resource Semico",
        "04D9" => "Holtek",
        "17EF" => "Lenovo",
        "413C" => "Dell",
        "05AC" => "Apple",
        "0C45" => "Microdia",
        "320F" => "Evision",
        "3434" => "Keychron",
        "373B" => "Compx (Lamzu/ATK)",
        "1E7D" => "ROCCAT",
        "0738" => "Mad Catz",
        "24AE" => "Rapoo",
        "1915" => "Nordic (2.4 GHz)",
        _ => return None,
    })
}

fn connection_of(path: &str) -> &'static str {
    let up = path.to_uppercase();
    if up.contains("00001124-0000-1000-8000-00805F9B34FB") || up.contains("BTH") {
        "Bluetooth"
    } else if up.contains("VID_") {
        "USB"
    } else if up.contains("ACPI") || up.contains("PNP0") {
        "PS/2 / integrado"
    } else if up.contains("RDP") || up.contains("ROOT#") {
        "Virtual"
    } else {
        "Otro"
    }
}

/// Lista los teclados y ratones conectados, agrupados por dispositivo físico.
pub fn enumerate() -> Vec<InputDevice> {
    let mut list: Vec<RAWINPUTDEVICELIST> = Vec::new();
    unsafe {
        let cb = std::mem::size_of::<RAWINPUTDEVICELIST>() as u32;
        let mut count: u32 = 0;
        if GetRawInputDeviceList(None, &mut count, cb) == u32::MAX || count == 0 {
            return Vec::new();
        }
        list.resize(count as usize, RAWINPUTDEVICELIST::default());
        let n = GetRawInputDeviceList(Some(list.as_mut_ptr()), &mut count, cb);
        if n == u32::MAX {
            return Vec::new();
        }
        list.truncate(n as usize);
    }

    let mut groups: BTreeMap<String, (String, Vec<String>)> = BTreeMap::new();
    for dev in &list {
        let kind = match dev.dwType.0 {
            0 => KIND_MOUSE,
            1 => KIND_KEYBOARD,
            _ => continue,
        };
        let Some(path) = device_path(dev.hDevice) else { continue };
        let id = device_id(kind, &path);
        groups.entry(id).or_insert_with(|| (kind.to_string(), Vec::new())).1.push(path);
    }

    groups
        .into_iter()
        .map(|(id, (kind, paths))| {
            let (vid, pid) = parse_vid_pid(&paths[0]);
            let product = paths.iter().find_map(|p| read_hid_string(p, true));
            let manufacturer = paths
                .iter()
                .find_map(|p| read_hid_string(p, false))
                .or_else(|| vid.as_deref().and_then(vendor_name).map(String::from));
            let connection = connection_of(&paths[0]).to_string();
            let generic = if kind == KIND_MOUSE { "Ratón" } else { "Teclado" };
            let name = product.unwrap_or_else(|| match (&manufacturer, connection.as_str()) {
                (_, "Virtual") => format!("{generic} virtual"),
                (_, "PS/2 / integrado") => format!("{generic} integrado"),
                (Some(m), _) => format!("{generic} {m}"),
                (None, _) => format!("{generic} HID genérico"),
            });
            InputDevice {
                id,
                kind,
                name,
                manufacturer,
                vid,
                pid,
                interfaces: paths.len() as u32,
                connection,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_usb_path() {
        let p = r"\\?\HID#VID_046D&PID_C08B&MI_00#7&2a8f&0&0000#{378de44c-56ef-11d1-bc8c-00a0c91405dd}";
        assert_eq!(parse_vid_pid(p), (Some("046D".into()), Some("C08B".into())));
        assert_eq!(device_id("mouse", p), "mouse:046D:C08B");
    }
}
