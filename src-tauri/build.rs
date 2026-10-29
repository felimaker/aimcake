fn main() {
    // Recompilar si cambia la clave pública de licencias inyectada en tiempo de compilación.
    println!("cargo:rerun-if-env-changed=LICENSE_PUBLIC_KEY_HEX");

    let mut windows = tauri_build::WindowsAttributes::new();
    windows = windows.app_manifest(include_str!("app.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("Fallo al compilar recursos de Tauri");
}
