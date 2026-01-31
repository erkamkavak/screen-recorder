use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Arc;

use log::info;
use flate2::read::GzDecoder;
use futures_util::StreamExt;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tar::Archive;

use crate::state::TOKIO_RUNTIME;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[napi(string_enum)]
pub enum EngineType {
    Whisper,
    Parakeet,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u32,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u32,
    pub is_directory: bool,
    pub engine_type: String,
    pub accuracy_score: f64,
    pub speed_score: f64,
}

#[napi(object)]
#[derive(Debug, Clone)]
pub struct DownloadProgress {
    pub model_id: String,
    pub downloaded: u32,
    pub total: u32,
    pub percentage: f64,
}

#[derive(Debug, Clone)]
pub(crate) struct ModelInfoInternal {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: Option<String>,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub partial_size: u64,
    pub is_directory: bool,
    pub engine_type: EngineType,
    pub accuracy_score: f32,
    pub speed_score: f32,
}

impl From<&ModelInfoInternal> for ModelInfo {
    fn from(m: &ModelInfoInternal) -> Self {
        ModelInfo {
            id: m.id.clone(),
            name: m.name.clone(),
            description: m.description.clone(),
            filename: m.filename.clone(),
            url: m.url.clone(),
            size_mb: m.size_mb as u32,
            is_downloaded: m.is_downloaded,
            is_downloading: m.is_downloading,
            partial_size: m.partial_size as u32,
            is_directory: m.is_directory,
            engine_type: match m.engine_type {
                EngineType::Whisper => "whisper".to_string(),
                EngineType::Parakeet => "parakeet".to_string(),
            },
            accuracy_score: m.accuracy_score as f64,
            speed_score: m.speed_score as f64,
        }
    }
}

lazy_static::lazy_static! {
    static ref MODELS: Arc<Mutex<HashMap<String, ModelInfoInternal>>> = Arc::new(Mutex::new(HashMap::new()));
    static ref MODELS_DIR: Arc<Mutex<Option<PathBuf>>> = Arc::new(Mutex::new(None));
    static ref DOWNLOAD_CANCEL: Arc<Mutex<HashMap<String, bool>>> = Arc::new(Mutex::new(HashMap::new()));
}

fn get_models_dir() -> PathBuf {
    let mut dir_lock = MODELS_DIR.lock();
    if let Some(ref dir) = *dir_lock {
        return dir.clone();
    }

    let models_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("clips")
        .join("models");

    if !models_dir.exists() {
        let _ = fs::create_dir_all(&models_dir);
    }

    *dir_lock = Some(models_dir.clone());
    models_dir
}

fn init_available_models() {
    let mut models = MODELS.lock();
    if !models.is_empty() {
        return;
    }

    models.insert(
        "small".to_string(),
        ModelInfoInternal {
            id: "small".to_string(),
            name: "Whisper Small".to_string(),
            description: "Fast and fairly accurate.".to_string(),
            filename: "ggml-small.bin".to_string(),
            url: Some("https://blob.handy.computer/ggml-small.bin".to_string()),
            size_mb: 487,
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Whisper,
            accuracy_score: 0.60,
            speed_score: 0.85,
        },
    );

    models.insert(
        "medium".to_string(),
        ModelInfoInternal {
            id: "medium".to_string(),
            name: "Whisper Medium".to_string(),
            description: "Good accuracy, medium speed".to_string(),
            filename: "whisper-medium-q4_1.bin".to_string(),
            url: Some("https://blob.handy.computer/whisper-medium-q4_1.bin".to_string()),
            size_mb: 492,
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Whisper,
            accuracy_score: 0.75,
            speed_score: 0.60,
        },
    );

    models.insert(
        "turbo".to_string(),
        ModelInfoInternal {
            id: "turbo".to_string(),
            name: "Whisper Turbo".to_string(),
            description: "Balanced accuracy and speed.".to_string(),
            filename: "ggml-large-v3-turbo.bin".to_string(),
            url: Some("https://blob.handy.computer/ggml-large-v3-turbo.bin".to_string()),
            size_mb: 1600,
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Whisper,
            accuracy_score: 0.80,
            speed_score: 0.40,
        },
    );

    models.insert(
        "large".to_string(),
        ModelInfoInternal {
            id: "large".to_string(),
            name: "Whisper Large".to_string(),
            description: "Good accuracy, but slow.".to_string(),
            filename: "ggml-large-v3-q5_0.bin".to_string(),
            url: Some("https://blob.handy.computer/ggml-large-v3-q5_0.bin".to_string()),
            size_mb: 1100,
            is_downloaded: false,
            is_downloading: false,
            partial_size: 0,
            is_directory: false,
            engine_type: EngineType::Whisper,
            accuracy_score: 0.85,
            speed_score: 0.30,
        },
    );

    #[cfg(feature = "parakeet")]
    {
        models.insert(
            "parakeet-tdt-0.6b-v2".to_string(),
            ModelInfoInternal {
                id: "parakeet-tdt-0.6b-v2".to_string(),
                name: "Parakeet V2".to_string(),
                description: "English only. The best model for English speakers.".to_string(),
                filename: "parakeet-tdt-0.6b-v2-int8".to_string(),
                url: Some("https://blob.handy.computer/parakeet-v2-int8.tar.gz".to_string()),
                size_mb: 473,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_directory: true,
                engine_type: EngineType::Parakeet,
                accuracy_score: 0.85,
                speed_score: 0.85,
            },
        );

        models.insert(
            "parakeet-tdt-0.6b-v3".to_string(),
            ModelInfoInternal {
                id: "parakeet-tdt-0.6b-v3".to_string(),
                name: "Parakeet V3".to_string(),
                description: "Fast and accurate".to_string(),
                filename: "parakeet-tdt-0.6b-v3-int8".to_string(),
                url: Some("https://blob.handy.computer/parakeet-v3-int8.tar.gz".to_string()),
                size_mb: 478,
                is_downloaded: false,
                is_downloading: false,
                partial_size: 0,
                is_directory: true,
                engine_type: EngineType::Parakeet,
                accuracy_score: 0.80,
                speed_score: 0.85,
            },
        );
    }

    drop(models);
    update_download_status();
}

fn update_download_status() {
    let models_dir = get_models_dir();
    let mut models = MODELS.lock();

    for model in models.values_mut() {
        if model.is_directory {
            let model_path = models_dir.join(&model.filename);
            let partial_path = models_dir.join(format!("{}.partial", &model.filename));
            let extracting_path = models_dir.join(format!("{}.extracting", &model.filename));

            // Only clean up extracting dir if model is NOT currently downloading
            // (downloading includes extraction phase)
            if extracting_path.exists() && !model.is_downloading {
                eprintln!("Cleaning up interrupted extraction for model: {}", model.id);
                let _ = fs::remove_dir_all(&extracting_path);
            }

            model.is_downloaded = model_path.exists() && model_path.is_dir();

            if partial_path.exists() {
                model.partial_size = partial_path.metadata().map(|m| m.len()).unwrap_or(0);
            } else {
                model.partial_size = 0;
            }
        } else {
            let model_path = models_dir.join(&model.filename);
            let partial_path = models_dir.join(format!("{}.partial", &model.filename));

            model.is_downloaded = model_path.exists();

            if partial_path.exists() {
                model.partial_size = partial_path.metadata().map(|m| m.len()).unwrap_or(0);
            } else {
                model.partial_size = 0;
            }
        }
    }
}

#[napi]
pub fn model_list_available() -> Vec<ModelInfo> {
    init_available_models();
    let models = MODELS.lock();
    models.values().map(ModelInfo::from).collect()
}

#[napi]
pub fn model_get_info(model_id: String) -> Option<ModelInfo> {
    init_available_models();
    let models = MODELS.lock();
    models.get(&model_id).map(ModelInfo::from)
}

#[napi]
pub fn model_get_path(model_id: String) -> Result<String> {
    init_available_models();
    let models = MODELS.lock();
    let model = models
        .get(&model_id)
        .ok_or_else(|| Error::from_reason(format!("Model not found: {}", model_id)))?;

    if !model.is_downloaded {
        return Err(Error::from_reason(format!(
            "Model not downloaded: {}",
            model_id
        )));
    }

    if model.is_downloading {
        return Err(Error::from_reason(format!(
            "Model is currently downloading: {}",
            model_id
        )));
    }

    let models_dir = get_models_dir();
    let model_path = models_dir.join(&model.filename);

    if model.is_directory {
        if model_path.exists() && model_path.is_dir() {
            Ok(model_path.to_string_lossy().to_string())
        } else {
            Err(Error::from_reason(format!(
                "Model directory not found: {}",
                model_id
            )))
        }
    } else {
        if model_path.exists() {
            Ok(model_path.to_string_lossy().to_string())
        } else {
            Err(Error::from_reason(format!(
                "Model file not found: {}",
                model_id
            )))
        }
    }
}

pub(crate) fn get_model_path_internal(model_id: &str) -> std::result::Result<PathBuf, String> {
    init_available_models();
    let models = MODELS.lock();
    let model = models
        .get(model_id)
        .ok_or_else(|| format!("Model not found: {}", model_id))?;

    if !model.is_downloaded {
        return Err(format!("Model not downloaded: {}", model_id));
    }

    let models_dir = get_models_dir();
    Ok(models_dir.join(&model.filename))
}

pub(crate) fn get_model_engine_type(model_id: &str) -> Option<EngineType> {
    init_available_models();
    let models = MODELS.lock();
    models.get(model_id).map(|m| m.engine_type)
}

#[napi]
pub fn model_download(model_id: String) -> Result<bool> {
    init_available_models();

    let (url, filename, is_directory) = {
        let models = MODELS.lock();
        let model = models
            .get(&model_id)
            .ok_or_else(|| Error::from_reason(format!("Model not found: {}", model_id)))?;

        if model.is_downloaded {
            return Ok(true);
        }

        let url = model
            .url
            .clone()
            .ok_or_else(|| Error::from_reason("No download URL for model"))?;

        (url, model.filename.clone(), model.is_directory)
    };

    {
        let mut models = MODELS.lock();
        if let Some(model) = models.get_mut(&model_id) {
            model.is_downloading = true;
        }
    }

    {
        let mut cancel = DOWNLOAD_CANCEL.lock();
        cancel.insert(model_id.clone(), false);
    }

    let model_id_clone = model_id.clone();
    TOKIO_RUNTIME.spawn(async move {
        let result =
            download_model_internal(&model_id_clone, &url, &filename, is_directory).await;

        {
            let mut models = MODELS.lock();
            if let Some(model) = models.get_mut(&model_id_clone) {
                model.is_downloading = false;
                if result.is_ok() {
                    model.is_downloaded = true;
                    model.partial_size = 0;
                }
            }
        }

        if let Err(e) = result {
            eprintln!("Failed to download model {}: {}", model_id_clone, e);
        } else {
            eprintln!("Successfully downloaded model: {}", model_id_clone);
        }
    });

    Ok(true)
}

async fn download_model_internal(
    model_id: &str,
    url: &str,
    filename: &str,
    is_directory: bool,
) -> std::result::Result<(), String> {
    let models_dir = get_models_dir();
    let model_path = models_dir.join(filename);
    let partial_path = models_dir.join(format!("{}.partial", filename));

    if model_path.exists() {
        if partial_path.exists() {
            let _ = fs::remove_file(&partial_path);
        }
        return Ok(());
    }

    let mut resume_from = if partial_path.exists() {
        let size = partial_path
            .metadata()
            .map_err(|e| e.to_string())?
            .len();
        info!("Resuming download of model {} from byte {}", model_id, size);
        size
    } else {
        info!("Starting fresh download of model {} from {}", model_id, url);
        0
    };

    let client = reqwest::Client::new();
    let mut request = client.get(url);

    if resume_from > 0 {
        request = request.header("Range", format!("bytes={}-", resume_from));
    }

    let mut response = request.send().await.map_err(|e| e.to_string())?;

    if resume_from > 0 && response.status() == reqwest::StatusCode::OK {
        eprintln!(
            "Server doesn't support range requests for model {}, restarting download",
            model_id
        );
        let _ = fs::remove_file(&partial_path);
        resume_from = 0;
        response = client.get(url).send().await.map_err(|e| e.to_string())?;
    }

    // HTTP 416 means the range is not satisfiable - file is already complete
    if response.status() == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
        eprintln!(
            "Model {} partial file appears complete (HTTP 416), proceeding to extraction",
            model_id
        );
        // Skip download, go straight to extraction
    } else if !response.status().is_success()
        && response.status() != reqwest::StatusCode::PARTIAL_CONTENT
    {
        return Err(format!(
            "Failed to download model: HTTP {}",
            response.status()
        ));
    } else {
        // Normal download flow
        let total_size = if resume_from > 0 {
            resume_from + response.content_length().unwrap_or(0)
        } else {
            response.content_length().unwrap_or(0)
        };

        let mut downloaded = resume_from;
        let mut stream = response.bytes_stream();

        let mut file = if resume_from > 0 {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&partial_path)
                .map_err(|e| e.to_string())?
        } else {
            std::fs::File::create(&partial_path).map_err(|e| e.to_string())?
        };

        while let Some(chunk) = stream.next().await {
            {
                let cancel = DOWNLOAD_CANCEL.lock();
                if cancel.get(model_id).copied().unwrap_or(false) {
                    return Err("Download cancelled".to_string());
                }
            }

            let chunk = chunk.map_err(|e| e.to_string())?;
            file.write_all(&chunk).map_err(|e| e.to_string())?;
            downloaded += chunk.len() as u64;

            {
                let mut models = MODELS.lock();
                if let Some(model) = models.get_mut(model_id) {
                    model.partial_size = downloaded;
                }
            }
        }

        file.flush().map_err(|e| e.to_string())?;
        drop(file);

        if total_size > 0 {
            let actual_size = partial_path
                .metadata()
                .map_err(|e| e.to_string())?
                .len();
            if actual_size != total_size {
                let _ = fs::remove_file(&partial_path);
                return Err(format!(
                    "Download incomplete: expected {} bytes, got {} bytes",
                    total_size, actual_size
                ));
            }
        }
    }

    if is_directory {
        let temp_extract_dir = models_dir.join(format!("{}.extracting", filename));
        let final_model_dir = models_dir.join(filename);

        if temp_extract_dir.exists() {
            let _ = fs::remove_dir_all(&temp_extract_dir);
        }

        fs::create_dir_all(&temp_extract_dir).map_err(|e| {
            format!("Failed to create temp extract dir: {}", e)
        })?;

        let tar_gz = File::open(&partial_path).map_err(|e| {
            format!("Failed to open partial file: {}", e)
        })?;
        
        let tar = GzDecoder::new(tar_gz);
        let mut archive = Archive::new(tar);
        archive.set_ignore_zeros(true);

        for entry in archive.entries().map_err(|e| format!("Failed to read archive: {}", e))? {
            let mut entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            
            let path = match entry.path() {
                Ok(p) => p.to_path_buf(),
                Err(_) => continue,
            };
            
            // Skip macOS resource fork files
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("._") {
                    continue;
                }
            }
            
            let _ = entry.unpack_in(&temp_extract_dir);
        }

        let extracted_dirs: Vec<_> = fs::read_dir(&temp_extract_dir)
            .map_err(|e| format!("Failed to read temp extract dir: {}", e))?
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
            .collect();

        if extracted_dirs.len() == 1 {
            let source_dir = extracted_dirs[0].path();
            if final_model_dir.exists() {
                fs::remove_dir_all(&final_model_dir).map_err(|e| {
                    format!("Failed to remove existing final dir: {}", e)
                })?;
            }
            fs::rename(&source_dir, &final_model_dir).map_err(|e| {
                format!("Failed to rename source to final: {}", e)
            })?;
            let _ = fs::remove_dir_all(&temp_extract_dir);
        } else {
            if final_model_dir.exists() {
                fs::remove_dir_all(&final_model_dir).map_err(|e| {
                    format!("Failed to remove existing final dir: {}", e)
                })?;
            }
            fs::rename(&temp_extract_dir, &final_model_dir).map_err(|e| {
                format!("Failed to rename temp to final: {}", e)
            })?;
        }

        let _ = fs::remove_file(&partial_path);
    } else {
        fs::rename(&partial_path, &model_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[napi]
pub fn model_cancel_download(model_id: String) -> bool {
    {
        let mut cancel = DOWNLOAD_CANCEL.lock();
        cancel.insert(model_id.clone(), true);
    }

    {
        let mut models = MODELS.lock();
        if let Some(model) = models.get_mut(&model_id) {
            model.is_downloading = false;
        }
    }

    true
}

#[napi]
pub fn model_delete(model_id: String) -> Result<bool> {
    init_available_models();

    let (filename, is_directory) = {
        let models = MODELS.lock();
        let model = models
            .get(&model_id)
            .ok_or_else(|| Error::from_reason(format!("Model not found: {}", model_id)))?;
        (model.filename.clone(), model.is_directory)
    };

    let models_dir = get_models_dir();
    let model_path = models_dir.join(&filename);
    let partial_path = models_dir.join(format!("{}.partial", &filename));

    let mut deleted = false;

    if is_directory {
        if model_path.exists() && model_path.is_dir() {
            fs::remove_dir_all(&model_path)
                .map_err(|e| Error::from_reason(format!("Failed to delete model: {}", e)))?;
            deleted = true;
        }
    } else {
        if model_path.exists() {
            fs::remove_file(&model_path)
                .map_err(|e| Error::from_reason(format!("Failed to delete model: {}", e)))?;
            deleted = true;
        }
    }

    if partial_path.exists() {
        let _ = fs::remove_file(&partial_path);
        deleted = true;
    }

    update_download_status();

    Ok(deleted)
}

#[napi]
pub fn model_refresh_status() {
    init_available_models();
    update_download_status();
}
