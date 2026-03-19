use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use std::sync::Mutex;
use std::process::Child;
use std::path::PathBuf;

struct BackendProcess(Mutex<Option<Child>>);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncStatus {
    pub last_synced: Option<String>,
    pub is_online: bool,
    pub pending_changes: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: u16,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct InstallStatus {
    pub installed: bool,
    pub installing: bool,
    pub progress: String,
    pub error: Option<String>,
}

fn get_app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| e.to_string())
}

fn get_backend_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_app_data_dir(app)?;
    Ok(data_dir.join("backend"))
}

fn get_install_marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = get_app_data_dir(app)?;
    Ok(data_dir.join(".installed"))
}

fn is_backend_installed(app: &AppHandle) -> bool {
    if let Ok(marker_path) = get_install_marker_path(app) {
        return marker_path.exists();
    }
    false
}

fn extract_backend(app: &AppHandle) -> Result<(), String> {
    let backend_dir = get_backend_dir(app)?;
    let resource_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let bundled_backend = resource_dir.join("backend");

    if !bundled_backend.exists() {
        return Err("Backend not found in app bundle".to_string());
    }

    if backend_dir.exists() {
        std::fs::remove_dir_all(&backend_dir).map_err(|e| e.to_string())?;
    }

    std::fs::create_dir_all(&backend_dir).map_err(|e| e.to_string())?;

    copy_dir_all(&bundled_backend, &backend_dir).map_err(|e| e.to_string())?;

    Ok(())
}

fn copy_dir_all(src: &PathBuf, dst: &PathBuf) -> Result<(), String> {
    if !dst.exists() {
        std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    }

    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&entry.path(), &dest_path)?;
        } else {
            std::fs::copy(entry.path(), dest_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn run_command(cmd: &str, args: &[&str], cwd: &PathBuf) -> Result<String, String> {
    let output = std::process::Command::new(cmd)
        .args(args)
        .current_dir(cwd)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn install_backend(app: &AppHandle) -> Result<(), String> {
    let backend_dir = get_backend_dir(app)?;
    let app_handle = app.clone();
    let data_dir = get_app_data_dir(app)?;

    log::info!("Installing backend to: {:?}", backend_dir);

    let status_store = app_handle.store("install_status.json").map_err(|e| e.to_string())?;
    status_store.set("installing", serde_json::Value::Bool(true));
    status_store.set("progress", serde_json::Value::String("Extracting backend files...".to_string()));
    status_store.save().map_err(|e| e.to_string())?;

    extract_backend(app)?;

    // node_modules is already bundled, no need to npm install

    let db_path = data_dir.join("bantu.db");
    let env_content = format!(
        "DATABASE_URL=\"file:{}\"\nJWT_SECRET=\"demo_secret_key_123\"\nPORT=5005\nNODE_ENV=development\nFRONTEND_URL=\"*\"\nSTRIPE_SECRET_KEY=\"\"\nSTRIPE_WEBHOOK_SECRET=\"\"",
        db_path.to_string_lossy()
    );
    let env_path = backend_dir.join(".env");
    std::fs::write(&env_path, env_content).map_err(|e| e.to_string())?;

    status_store.set("progress", serde_json::Value::String("Creating demo account...".to_string()));
    status_store.save().map_err(|e| e.to_string())?;

    run_command("node", &["scripts/create-demo-account.js"], &backend_dir)?;

    let marker_path = get_install_marker_path(app)?;
    std::fs::write(&marker_path, "installed").map_err(|e| e.to_string())?;

    status_store.set("installing", serde_json::Value::Bool(false));
    status_store.set("progress", serde_json::Value::String("Installation complete".to_string()));
    status_store.save().map_err(|e| e.to_string())?;

    log::info!("Backend installation complete");
    Ok(())
}

#[tauri::command]
fn get_sync_status(app: tauri::AppHandle) -> Result<SyncStatus, String> {
    let store = app.store("sync.json").map_err(|e| e.to_string())?;
    let last_synced = store.get("last_synced").and_then(|v| v.as_str().map(String::from));
    let is_online = store.get("is_online").and_then(|v| v.as_bool()).unwrap_or(true);
    let pending_changes = store.get("pending_changes").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
    
    Ok(SyncStatus {
        last_synced,
        is_online,
        pending_changes,
    })
}

#[tauri::command]
fn set_last_synced(app: tauri::AppHandle, timestamp: String) -> Result<(), String> {
    let store = app.store("sync.json").map_err(|e| e.to_string())?;
    store.set("last_synced", serde_json::Value::String(timestamp));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_online_status(app: tauri::AppHandle, online: bool) -> Result<(), String> {
    let store = app.store("sync.json").map_err(|e| e.to_string())?;
    store.set("is_online", serde_json::Value::Bool(online));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn increment_pending_changes(app: tauri::AppHandle) -> Result<u32, String> {
    let store = app.store("sync.json").map_err(|e| e.to_string())?;
    let current = store.get("pending_changes").and_then(|v| v.as_u64()).unwrap_or(0);
    let new_value = current + 1;
    store.set("pending_changes", serde_json::Value::Number(serde_json::Number::from(new_value)));
    store.save().map_err(|e| e.to_string())?;
    Ok(new_value as u32)
}

#[tauri::command]
fn clear_pending_changes(app: tauri::AppHandle) -> Result<(), String> {
    let store = app.store("sync.json").map_err(|e| e.to_string())?;
    store.set("pending_changes", serde_json::Value::Number(serde_json::Number::from(0)));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_api_url(_app: tauri::AppHandle) -> Result<String, String> {
    Ok("http://localhost:5005/api".to_string())
}

#[tauri::command]
fn set_api_url(_app: tauri::AppHandle, _url: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn get_install_status(app: tauri::AppHandle) -> Result<InstallStatus, String> {
    let store = app.store("install_status.json").map_err(|e| e.to_string())?;
    
    let installed = is_backend_installed(&app);
    let installing = store.get("installing").and_then(|v| v.as_bool()).unwrap_or(false);
    let progress = store.get("progress").and_then(|v| v.as_str().map(String::from)).unwrap_or_default();
    
    Ok(InstallStatus {
        installed,
        installing,
        progress,
        error: None,
    })
}

#[tauri::command]
async fn install_backend_cmd(app: AppHandle) -> Result<InstallStatus, String> {
    if is_backend_installed(&app) {
        return Ok(InstallStatus {
            installed: true,
            installing: false,
            progress: "Already installed".to_string(),
            error: None,
        });
    }

    install_backend(&app)?;
    
    Ok(InstallStatus {
        installed: true,
        installing: false,
        progress: "Installation complete".to_string(),
        error: None,
    })
}

#[tauri::command]
async fn start_backend(app: AppHandle) -> Result<ServerStatus, String> {
    let backend_process = app.state::<BackendProcess>();
    let mut process = backend_process.0.lock().map_err(|e| e.to_string())?;
    
    if process.is_some() {
        return Ok(ServerStatus { 
            running: true, 
            pid: process.as_ref().map(|p| p.id()), 
            port: 5005,
            path: get_backend_dir(&app).ok().map(|p| p.to_string_lossy().to_string()),
            error: None,
        });
    }

    if !is_backend_installed(&app) {
        install_backend(&app).map_err(|e| e.to_string())?;
    }

    let backend_dir = get_backend_dir(&app).map_err(|e| e.to_string())?;
    let backend_dir_str = backend_dir.to_string_lossy().to_string();
    
    log::info!("Starting backend from: {}", backend_dir_str);
    
    #[cfg(target_os = "windows")]
    let child = std::process::Command::new("cmd")
        .args(&["/C", &format!("cd /d \"{}\" && npm run dev", backend_dir_str)])
        .spawn();
    
    #[cfg(not(target_os = "windows"))]
    let child = std::process::Command::new("sh")
        .args(&["-c", &format!("cd '{}' && npm run dev &", backend_dir_str)])
        .spawn();
    
    match child {
        Ok(c) => {
            let pid = c.id();
            *process = Some(c);
            log::info!("Backend started with PID: {}", pid);
            
            std::thread::sleep(std::time::Duration::from_millis(500));
            
            Ok(ServerStatus { 
                running: true, 
                pid: Some(pid), 
                port: 5005,
                path: Some(backend_dir_str),
                error: None,
            })
        }
        Err(e) => {
            log::error!("Failed to start backend: {}", e);
            Err(format!("Failed to start backend: {}", e))
        }
    }
}

#[tauri::command]
async fn stop_backend(app: AppHandle) -> Result<(), String> {
    let backend_process = app.state::<BackendProcess>();
    let mut process = backend_process.0.lock().map_err(|e| e.to_string())?;
    
    if let Some(ref mut child) = *process {
        child.kill().map_err(|e| e.to_string())?;
        *process = None;
        log::info!("Backend stopped");
    }
    
    Ok(())
}

#[tauri::command]
async fn get_server_status(app: AppHandle) -> Result<ServerStatus, String> {
    let backend_process = app.state::<BackendProcess>();
    let process = backend_process.0.lock().map_err(|e| e.to_string())?;
    
    let backend_path = get_backend_dir(&app).ok().map(|p| p.to_string_lossy().to_string());
    let has_backend = is_backend_installed(&app);
    
    Ok(ServerStatus {
        running: process.is_some(),
        pid: process.as_ref().map(|p| p.id()),
        port: 5005,
        path: backend_path,
        error: if !has_backend { Some("Backend not installed".to_string()) } else { None },
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .manage(BackendProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_sync_status,
            set_last_synced,
            set_online_status,
            increment_pending_changes,
            clear_pending_changes,
            get_api_url,
            set_api_url,
            get_install_status,
            install_backend_cmd,
            start_backend,
            stop_backend,
            get_server_status,
        ])
        .setup(|app| {
            log::info!("Bantu Payroll starting up...");
            
            let handle = app.handle();
            let data_dir = get_app_data_dir(handle).unwrap_or_else(|_| PathBuf::from("."));
            log::info!("App data directory: {:?}", data_dir);
            
            if is_backend_installed(handle) {
                log::info!("Backend already installed");
            } else {
                log::info!("Backend will be installed on first run");
            }
            
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}