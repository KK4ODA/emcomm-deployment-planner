//! Desktop shell for EmComm Planner.
//!
//! The React application (built by Vite into `../dist`) is the whole UI; this
//! crate only hosts it in a WebView2 window and wires the plugins used by the
//! frontend: the signed auto-updater, process relaunch, native dialogs and
//! opening external links in the default browser.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running EmComm Planner");
}
