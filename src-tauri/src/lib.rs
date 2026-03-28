use serde::{Serialize, Deserialize};
use std::path::{Path, PathBuf};
use std::fs;
use urlencoding;

#[derive(Serialize, Deserialize)]
pub struct SteamPaths {
    pub depotcache: String,
    pub stplugin: String,
    pub steamapps: String,
}

#[tauri::command]
async fn get_steam_paths() -> Result<SteamPaths, String> {
    let steam_base = if cfg!(windows) {
        PathBuf::from(r"C:\Program Files (x86)\Steam")
    } else {
        // Linux detection
        let home = directories::BaseDirs::new()
            .ok_or("Não foi possível encontrar o diretório home")?
            .home_dir()
            .to_path_buf();
        
        let p1 = home.join(".steam/steam");
        let p2 = home.join(".local/share/Steam");
        let p3 = home.join(".var/app/com.valvesoftware.Steam/.steam/steam");
        
        if p1.exists() {
            p1
        } else if p2.exists() {
            p2
        } else if p3.exists() {
            p3
        } else {
            // Default Linux path
            p1
        }
    };

    let depotcache = steam_base.join("depotcache");
    let stplugin = steam_base.join("config/stplug-in");
    let steamapps = steam_base.join("steamapps");

    Ok(SteamPaths {
        depotcache: depotcache.to_string_lossy().to_string(),
        stplugin: stplugin.to_string_lossy().to_string(),
        steamapps: steamapps.to_string_lossy().to_string(),
    })
}

#[tauri::command]
async fn download_and_save(url: String, path: String, filename: String) -> Result<String, String> {
    let target_dir = Path::new(&path);
    let target_file = target_dir.join(&filename);

    // Create directory if it doesn't exist
    if !target_dir.exists() {
        fs::create_dir_all(target_dir).map_err(|e| format!("Erro ao criar diretório: {}", e))?;
    }

    // Download content
    let response = reqwest::get(url).await.map_err(|e| format!("Erro no download: {}", e))?;
    let bytes = response.bytes().await.map_err(|e| format!("Erro ao ler bytes: {}", e))?;

    // Save to disk
    fs::write(&target_file, bytes).map_err(|e| format!("Erro ao salvar arquivo: {}", e))?;

    Ok(format!("Arquivo salvo com sucesso em: {}", target_file.display()))
}

#[tauri::command]
async fn search_steam(query: String) -> Result<String, String> {
    let url = format!("https://store.steampowered.com/search/suggest?term={}&f=games&cc=US&l=english&v=21259854", urlencoding::encode(&query));
    
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| format!("Erro ao criar cliente: {}", e))?;

    let response = client.get(&url)
        .send()
        .await
        .map_err(|e| format!("Erro na requisição: {}", e))?;
    
    let text = response.text()
        .await
        .map_err(|e| format!("Erro ao ler texto: {}", e))?;
    
    Ok(text)
}

#[tauri::command]
async fn open_steam_link(appid: String) -> Result<(), String> {
    let url = format!("steam://install/{}", appid);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", &url])
            .spawn()
            .map_err(|e| format!("Falha ao abrir Steam: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Falha ao abrir Steam: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Falha ao abrir Steam: {}", e))?;
    }
    
    Ok(())
}

#[tauri::command]
async fn generate_acf(appid: String, name: String, path: String) -> Result<String, String> {
    let target_dir = Path::new(&path);
    let filename = format!("appmanifest_{}.acf", appid);
    let target_file = target_dir.join(&filename);

    // Basic ACF template to make the game appear in library
    let content = format!(
r#""AppState"
{{
  "appid" "{appid}"
  "Universe" "1"
  "StateFlags" "1026"
  "installdir" "{name}"
  "LastUpdated" "0"
  "UpdateResult" "0"
  "SizeOnDisk" "0"
  "buildid" "0"
  "LastOwner" "0"
  "BytesToDownload" "0"
  "BytesDownloaded" "0"
  "AutoUpdateBehavior" "0"
  "AllowOtherDownloadsWhileRunning" "0"
  "ScheduledAutoUpdate" "0"
  "InstalledDepots"
  {{
  }}
}}"#
    );

    if !target_dir.exists() {
        fs::create_dir_all(target_dir).map_err(|e| format!("Erro ao criar pasta steamapps: {}", e))?;
    }

    fs::write(&target_file, content).map_err(|e| format!("Erro ao gerar ACF: {}", e))?;

    Ok(format!("Arquivo ACF gerado: {}", target_file.display()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .invoke_handler(tauri::generate_handler![get_steam_paths, download_and_save, search_steam, open_steam_link, generate_acf])
    .setup(|_app| {
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
