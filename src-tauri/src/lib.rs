//! Desktop shell for EmComm Planner.
//!
//! The React application (built by Vite into `../dist`) is the whole UI; this
//! crate only hosts it in a WebView2 window and wires the plugins used by the
//! frontend: the signed auto-updater, process relaunch, native dialogs and
//! opening external links in the default browser.

/// Write bytes the frontend produced (PDF, CSV, JSON) to a path the person
/// chose in the native save dialog. Base64 keeps the IPC payload plain JSON.
#[tauri::command]
fn save_file(path: String, data_base64: String) -> Result<(), String> {
    use base64::Engine as _;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.as_bytes())
        .map_err(|e| format!("bad payload: {e}"))?;
    std::fs::write(&path, bytes).map_err(|e| format!("could not write {path}: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![save_file])
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running EmComm Planner");
}
