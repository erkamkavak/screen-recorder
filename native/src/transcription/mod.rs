use std::{collections::HashMap, sync::Arc};

use napi::bindgen_prelude::*;
use napi_derive::napi;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::TOKIO_RUNTIME;

pub(crate) mod model_manager;
pub(crate) mod providers;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TranscriptionJobStatus {
    Idle,
    Uploading,
    Queued,
    Running,
    Completed,
    Error,
    Cancelled,
}

#[napi(object)]
#[derive(Clone)]
pub struct TranscriptSegment {
    pub start_ms: i64,
    pub end_ms: i64,
    pub text: String,
    pub speaker: Option<String>,
}

#[napi(object)]
#[derive(Clone)]
pub struct Transcript {
    pub provider: String,
    pub language: Option<String>,
    pub segments: Vec<TranscriptSegment>,
    pub raw: Option<String>,
}

#[napi(object)]
pub struct SubmitTranscriptionRequest {
    pub provider: String,

    pub api_base_url: Option<String>,
    pub api_key: Option<String>,

    pub audio_url: Option<String>,
    pub file_path: Option<String>,

    pub model: Option<String>,
    pub language_hints: Option<Vec<String>>,
    pub enable_language_identification: Option<bool>,
    pub enable_speaker_diarization: Option<bool>,
    pub client_reference_id: Option<String>,
}

#[napi(object)]
pub struct TranscriptionJobInfo {
    pub job_id: String,
    pub provider: String,
    pub status: String,
}

#[napi(object)]
pub struct TranscriptionJobSnapshot {
    pub job_id: String,
    pub provider: String,
    pub status: String,
    pub error_message: Option<String>,
    pub progress: Option<f64>,
}

pub(crate) struct JobState {
    pub(crate) provider: String,
    pub(crate) status: TranscriptionJobStatus,
    pub(crate) error_message: Option<String>,
    pub(crate) progress: Option<f64>,
    pub(crate) result: Option<Transcript>,
    pub(crate) cancelled: bool,
}

lazy_static::lazy_static! {
    static ref JOBS: Arc<Mutex<HashMap<String, JobState>>> = Arc::new(Mutex::new(HashMap::new()));
}

fn status_to_string(status: &TranscriptionJobStatus) -> String {
    match status {
        TranscriptionJobStatus::Idle => "idle",
        TranscriptionJobStatus::Uploading => "uploading",
        TranscriptionJobStatus::Queued => "queued",
        TranscriptionJobStatus::Running => "running",
        TranscriptionJobStatus::Completed => "completed",
        TranscriptionJobStatus::Error => "error",
        TranscriptionJobStatus::Cancelled => "cancelled",
    }
    .to_string()
}

pub(crate) fn update_job<F: FnOnce(&mut JobState)>(job_id: &str, f: F) {
    let mut jobs = JOBS.lock();
    if let Some(job) = jobs.get_mut(job_id) {
        f(job);
    }
}

fn get_job(job_id: &str) -> Option<TranscriptionJobSnapshot> {
    let jobs = JOBS.lock();
    let job = jobs.get(job_id)?;
    Some(TranscriptionJobSnapshot {
        job_id: job_id.to_string(),
        provider: job.provider.clone(),
        status: status_to_string(&job.status),
        error_message: job.error_message.clone(),
        progress: job.progress,
    })
}

#[napi]
pub fn transcription_list_providers() -> Vec<String> {
    let mut providers = vec!["soniox".to_string(), "local".to_string(), "noop".to_string()];
    #[cfg(feature = "parakeet")]
    providers.push("parakeet".to_string());
    providers
}

#[napi]
pub fn transcription_cancel(job_id: String) -> bool {
    update_job(&job_id, |job| {
        job.cancelled = true;
        job.status = TranscriptionJobStatus::Cancelled;
    });
    true
}

#[napi]
pub fn transcription_get_job(job_id: String) -> Option<TranscriptionJobSnapshot> {
    get_job(&job_id)
}

#[napi]
pub fn transcription_get_result(job_id: String) -> Option<Transcript> {
    let jobs = JOBS.lock();
    jobs.get(&job_id).and_then(|j| j.result.clone())
}

#[napi]
pub fn transcription_submit(req: SubmitTranscriptionRequest) -> Result<TranscriptionJobInfo> {
    let provider = req.provider.trim().to_lowercase();
    if provider.is_empty() {
        return Err(Error::from_reason("Missing provider"));
    }

    let provider_for_job = provider.clone();

    let job_id = Uuid::new_v4().to_string();

    {
        let mut jobs = JOBS.lock();
        jobs.insert(
            job_id.clone(),
            JobState {
                provider: provider.clone(),
                status: TranscriptionJobStatus::Queued,
                error_message: None,
                progress: None,
                result: None,
                cancelled: false,
            },
        );
    }

    let job_id_clone = job_id.clone();

    TOKIO_RUNTIME.spawn(async move {
        let run_res = match provider_for_job.as_str() {
            "soniox" => providers::soniox::run_soniox(job_id_clone.clone(), req).await,
            #[cfg(feature = "parakeet")]
            "parakeet" => providers::local::run_parakeet(job_id_clone.clone(), req).await,
            "local" => providers::local::run_local(job_id_clone.clone(), req).await,
            "noop" => run_noop(job_id_clone.clone(), req).await,
            _ => Err(format!("Unknown provider: {}", provider_for_job)),
        };

        match run_res {
            Ok(transcript) => {
                eprintln!("[TRANSCRIPTION] Job {} completed with {} segments", job_id_clone, transcript.segments.len());
                for (i, seg) in transcript.segments.iter().enumerate() {
                    eprintln!("[TRANSCRIPTION] Segment {}: text='{}' (len={})", i, &seg.text[..seg.text.len().min(50)], seg.text.len());
                }
                update_job(&job_id_clone, |job| {
                    if job.cancelled {
                        job.status = TranscriptionJobStatus::Cancelled;
                        return;
                    }
                    job.status = TranscriptionJobStatus::Completed;
                    job.result = Some(transcript);
                    job.progress = Some(1.0);
                });
            }
            Err(err) => {
                eprintln!("[TRANSCRIPTION] Job {} failed: {}", job_id_clone, err);
                update_job(&job_id_clone, |job| {
                    if job.cancelled {
                        job.status = TranscriptionJobStatus::Cancelled;
                        return;
                    }
                    job.status = TranscriptionJobStatus::Error;
                    job.error_message = Some(err);
                });
            }
        }
    });

    Ok(TranscriptionJobInfo {
        job_id: job_id.clone(),
        provider: provider.clone(),
        status: "queued".to_string(),
    })
}

async fn run_noop(
    job_id: String,
    _req: SubmitTranscriptionRequest,
) -> std::result::Result<Transcript, String> {
    update_job(&job_id, |job| {
        job.status = TranscriptionJobStatus::Running;
        job.progress = Some(0.5);
    });

    Ok(Transcript {
        provider: "noop".to_string(),
        language: None,
        segments: vec![],
        raw: Some("{}".to_string()),
    })
}

pub(crate) fn is_cancelled(job_id: &str) -> bool {
    let jobs = JOBS.lock();
    jobs.get(job_id).map(|j| j.cancelled).unwrap_or(false)
}
