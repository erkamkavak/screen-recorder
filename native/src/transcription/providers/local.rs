use std::path::Path;

use log::info;

#[cfg(feature = "parakeet")]
use transcribe_rs::{
    engines::parakeet::{ParakeetEngine, ParakeetInferenceParams, ParakeetModelParams},
    TranscriptionEngine,
};

use crate::transcription::{
    is_cancelled, update_job, SubmitTranscriptionRequest, Transcript, TranscriptSegment,
    TranscriptionJobStatus,
};
use crate::transcription::model_manager::{get_model_engine_type, get_model_path_internal, EngineType};

fn read_audio_samples(file_path: &str) -> Result<Vec<f32>, String> {
    use std::process::Command;

    let output = Command::new("ffmpeg")
        .args([
            "-i", file_path,
            "-f", "f32le",
            "-acodec", "pcm_f32le",
            "-ac", "1",
            "-ar", "16000",
            "-"
        ])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {}", stderr));
    }

    let samples: Vec<f32> = output
        .stdout
        .chunks_exact(4)
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect();

    Ok(samples)
}

#[cfg(feature = "parakeet")]
pub(crate) async fn run_parakeet(
    job_id: String,
    req: SubmitTranscriptionRequest,
) -> Result<Transcript, String> {
    let model_id = req
        .model
        .clone()
        .ok_or_else(|| "Missing model for parakeet provider".to_string())?;

    let file_path = req
        .file_path
        .clone()
        .ok_or_else(|| "Missing file_path for parakeet provider".to_string())?;

    if !Path::new(&file_path).exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    update_job(&job_id, |job| {
        job.status = TranscriptionJobStatus::Running;
        job.progress = Some(0.1);
    });

    if is_cancelled(&job_id) {
        return Err("Cancelled".to_string());
    }

    let model_path = get_model_path_internal(&model_id)?;

    update_job(&job_id, |job| {
        job.progress = Some(0.2);
    });

    eprintln!("[PARAKEET] Loading model from: {:?}", model_path);

    let mut engine = ParakeetEngine::new();
    engine
        .load_model_with_params(&model_path, ParakeetModelParams::int8())
        .map_err(|e| format!("Failed to load parakeet model: {}", e))?;

    update_job(&job_id, |job| {
        job.progress = Some(0.3);
    });

    if is_cancelled(&job_id) {
        return Err("Cancelled".to_string());
    }

    eprintln!("[PARAKEET] Reading audio samples from: {}", file_path);
    let samples = read_audio_samples(&file_path)?;

    if samples.is_empty() {
        return Err("Audio file is empty or could not be decoded".to_string());
    }

    // Calculate audio duration in ms (16kHz sample rate)
    let audio_duration_ms = (samples.len() as i64 * 1000) / 16000;
    eprintln!("[PARAKEET] Audio samples: {} samples ({} ms)", samples.len(), audio_duration_ms);

    update_job(&job_id, |job| {
        job.progress = Some(0.4);
    });

    if is_cancelled(&job_id) {
        return Err("Cancelled".to_string());
    }

    let params = ParakeetInferenceParams::default();

    eprintln!("[PARAKEET] Starting transcription...");
    let result = engine
        .transcribe_samples(samples, Some(params))
        .map_err(|e| format!("Parakeet transcription failed: {}", e))?;
    
    eprintln!("[PARAKEET] Raw result text: {:?}", result.text);

    update_job(&job_id, |job| {
        job.progress = Some(0.9);
    });

    let text = result.text.trim().to_string();
    eprintln!("[PARAKEET] Trimmed text: {:?}", text);
    eprintln!("[PARAKEET] Text length: {}", text.len());
    
    // Set segment to span entire audio duration
    let segments = vec![TranscriptSegment {
        start_ms: 0,
        end_ms: audio_duration_ms,
        text: text.clone(),
        speaker: None,
    }];
    
    eprintln!("[PARAKEET] Created {} segments", segments.len());
    eprintln!("[PARAKEET] Transcription completed");

    Ok(Transcript {
        provider: "parakeet".to_string(),
        language: Some("en".to_string()),
        segments,
        raw: None,
    })
}

#[cfg(not(feature = "parakeet"))]
pub(crate) async fn run_parakeet(
    _job_id: String,
    _req: SubmitTranscriptionRequest,
) -> Result<Transcript, String> {
    Err("Parakeet transcription is not available in this build. Please use Soniox for cloud transcription.".to_string())
}

pub(crate) async fn run_local(
    job_id: String,
    req: SubmitTranscriptionRequest,
) -> Result<Transcript, String> {
    let model_id = req
        .model
        .clone()
        .ok_or_else(|| "Missing model for local provider".to_string())?;

    let engine_type = get_model_engine_type(&model_id)
        .ok_or_else(|| format!("Unknown model: {}", model_id))?;

    match engine_type {
        EngineType::Whisper => Err("Whisper support is not currently available. Please use Soniox for cloud transcription.".to_string()),
        EngineType::Parakeet => run_parakeet(job_id, req).await,
    }
}
