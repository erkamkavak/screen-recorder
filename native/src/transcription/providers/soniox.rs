use std::path::Path;

use reqwest::multipart;
use serde_json::Value;

use crate::transcription::{
    is_cancelled, update_job, SubmitTranscriptionRequest, Transcript, TranscriptSegment,
    TranscriptionJobStatus,
};

fn extract_ms(v: &Value) -> Option<i64> {
    let n = if let Some(n) = v.as_i64() {
        n as f64
    } else if let Some(n) = v.as_f64() {
        n
    } else {
        return None;
    };

    if n.is_finite() {
        if n > 0.0 && n < 1_000.0 {
            Some((n * 1000.0).round() as i64)
        } else {
            Some(n.round() as i64)
        }
    } else {
        None
    }
}

fn token_start_end_ms(token: &Value) -> (Option<i64>, Option<i64>) {
    let start = token
        .get("start_ms")
        .or_else(|| token.get("start_time_ms"))
        .or_else(|| token.get("start_time"))
        .or_else(|| token.get("start"))
        .and_then(extract_ms);

    let end = token
        .get("end_ms")
        .or_else(|| token.get("end_time_ms"))
        .or_else(|| token.get("end_time"))
        .or_else(|| token.get("end"))
        .and_then(extract_ms);

    (start, end)
}

fn tokens_to_segments(tokens: &[Value]) -> Vec<TranscriptSegment> {
    let mut segments: Vec<TranscriptSegment> = Vec::new();

    let mut current_text = String::new();
    let mut current_start: Option<i64> = None;
    let mut current_end: Option<i64> = None;
    let mut current_speaker: Option<String> = None;

    fn flush_segment(
        segments: &mut Vec<TranscriptSegment>,
        text: &mut String,
        start: &mut Option<i64>,
        end: &mut Option<i64>,
        speaker: &mut Option<String>,
    ) {
        let t = text.trim();
        if t.is_empty() {
            text.clear();
            *start = None;
            *end = None;
            *speaker = None;
            return;
        }

        let s = start.unwrap_or(0);
        let e = end.unwrap_or(s);
        segments.push(TranscriptSegment {
            start_ms: s,
            end_ms: e,
            text: t.to_string(),
            speaker: speaker.clone(),
        });

        text.clear();
        *start = None;
        *end = None;
        *speaker = None;
    }

    for token in tokens {
        let text = token.get("text").and_then(|v| v.as_str()).unwrap_or("");
        let speaker = token.get("speaker").and_then(|v| {
            if v.is_string() {
                v.as_str().map(|s| s.to_string())
            } else {
                v.as_i64().map(|n| n.to_string())
            }
        });

        let (start_ms, end_ms) = token_start_end_ms(token);

        let speaker_changed = speaker.is_some() && speaker != current_speaker;
        if speaker_changed && !current_text.is_empty() {
            flush_segment(
                &mut segments,
                &mut current_text,
                &mut current_start,
                &mut current_end,
                &mut current_speaker,
            );
        }

        if current_start.is_none() {
            current_start = start_ms;
        }
        if end_ms.is_some() {
            current_end = end_ms;
        } else if start_ms.is_some() {
            current_end = start_ms;
        }

        if current_speaker.is_none() {
            current_speaker = speaker;
        }

        current_text.push_str(text);

        let should_break = text.contains('.') || text.contains('!') || text.contains('?') || current_text.len() >= 90;
        if should_break {
            flush_segment(
                &mut segments,
                &mut current_text,
                &mut current_start,
                &mut current_end,
                &mut current_speaker,
            );
        }
    }

    flush_segment(
        &mut segments,
        &mut current_text,
        &mut current_start,
        &mut current_end,
        &mut current_speaker,
    );

    segments
}

pub(crate) async fn run_soniox(
    job_id: String,
    req: SubmitTranscriptionRequest,
) -> std::result::Result<Transcript, String> {
    let api_base_url = req
        .api_base_url
        .unwrap_or_else(|| "https://api.soniox.com".to_string());
    let api_key = req
        .api_key
        .ok_or_else(|| "Missing api_key for soniox".to_string())?;

    let audio_url = req.audio_url.clone();
    let file_path = req.file_path.clone();

    if audio_url.is_none() && file_path.is_none() {
        return Err("Missing audio input: audio_url or file_path".to_string());
    }
    if audio_url.is_some() && file_path.is_some() {
        return Err("Only one of audio_url or file_path can be provided".to_string());
    }

    update_job(&job_id, |job| {
        job.status = TranscriptionJobStatus::Uploading;
        job.progress = Some(0.05);
    });

    let client = reqwest::Client::new();

    let mut uploaded_file_id: Option<String> = None;

    if let Some(path) = file_path {
        if is_cancelled(&job_id) {
            return Err("Cancelled".to_string());
        }

        let p = Path::new(&path);
        let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("audio");

        let bytes = tokio::fs::read(&path)
            .await
            .map_err(|e| format!("Failed to read file: {}", e))?;

        let part = multipart::Part::bytes(bytes).file_name(file_name.to_string());
        let form = multipart::Form::new().part("file", part);

        let res = client
            .post(format!("{}/v1/files", api_base_url))
            .bearer_auth(&api_key)
            .multipart(form)
            .send()
            .await
            .map_err(|e| format!("Upload failed: {}", e))?;

        let status = res.status();
        let text = res
            .text()
            .await
            .map_err(|e| format!("Failed to read upload response: {}", e))?;

        if !status.is_success() {
            return Err(format!("Upload failed: HTTP {}: {}", status.as_u16(), text));
        }

        let v: Value =
            serde_json::from_str(&text).map_err(|e| format!("Bad JSON from upload: {}", e))?;
        uploaded_file_id = v.get("id").and_then(|v| v.as_str()).map(|s| s.to_string());

        if uploaded_file_id.is_none() {
            return Err("Upload succeeded but file id missing".to_string());
        }
    }

    if is_cancelled(&job_id) {
        return Err("Cancelled".to_string());
    }

    update_job(&job_id, |job| {
        job.status = TranscriptionJobStatus::Queued;
        job.progress = Some(0.15);
    });

    let mut config = serde_json::json!({
        "model": req.model.unwrap_or_else(|| "stt-async-v3".to_string()),
    });

    if let Some(hints) = req.language_hints {
        config["language_hints"] = serde_json::json!(hints);
    }
    if let Some(v) = req.enable_language_identification {
        config["enable_language_identification"] = serde_json::json!(v);
    }
    if let Some(v) = req.enable_speaker_diarization {
        config["enable_speaker_diarization"] = serde_json::json!(v);
    }
    if let Some(v) = req.client_reference_id {
        config["client_reference_id"] = serde_json::json!(v);
    }

    if let Some(url) = audio_url {
        config["audio_url"] = serde_json::json!(url);
    }
    if let Some(file_id) = uploaded_file_id.clone() {
        config["file_id"] = serde_json::json!(file_id);
    }

    let res = client
        .post(format!("{}/v1/transcriptions", api_base_url))
        .bearer_auth(&api_key)
        .json(&config)
        .send()
        .await
        .map_err(|e| format!("Create transcription failed: {}", e))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read create response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Create transcription failed: HTTP {}: {}",
            status.as_u16(),
            text
        ));
    }

    let v: Value =
        serde_json::from_str(&text).map_err(|e| format!("Bad JSON from create: {}", e))?;
    let transcription_id = v
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Create transcription succeeded but id missing".to_string())?
        .to_string();

    update_job(&job_id, |job| {
        job.status = TranscriptionJobStatus::Running;
        job.progress = Some(0.25);
    });

    loop {
        if is_cancelled(&job_id) {
            return Err("Cancelled".to_string());
        }

        let res = client
            .get(format!("{}/v1/transcriptions/{}", api_base_url, transcription_id))
            .bearer_auth(&api_key)
            .send()
            .await
            .map_err(|e| format!("Poll failed: {}", e))?;

        let status = res.status();
        let text = res
            .text()
            .await
            .map_err(|e| format!("Failed to read poll response: {}", e))?;

        if !status.is_success() {
            return Err(format!("Poll failed: HTTP {}: {}", status.as_u16(), text));
        }

        let v: Value =
            serde_json::from_str(&text).map_err(|e| format!("Bad JSON from poll: {}", e))?;
        let job_status = v.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");

        if job_status == "completed" {
            break;
        }
        if job_status == "error" {
            let msg = v
                .get("error_message")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown error")
                .to_string();
            return Err(msg);
        }

        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    if is_cancelled(&job_id) {
        return Err("Cancelled".to_string());
    }

    let res = client
        .get(format!(
            "{}/v1/transcriptions/{}/transcript",
            api_base_url, transcription_id
        ))
        .bearer_auth(&api_key)
        .send()
        .await
        .map_err(|e| format!("Fetch transcript failed: {}", e))?;

    let status = res.status();
    let text = res
        .text()
        .await
        .map_err(|e| format!("Failed to read transcript response: {}", e))?;

    if !status.is_success() {
        return Err(format!(
            "Fetch transcript failed: HTTP {}: {}",
            status.as_u16(),
            text
        ));
    }

    let v: Value =
        serde_json::from_str(&text).map_err(|e| format!("Bad JSON from transcript: {}", e))?;
    let tokens: Vec<Value> = v
        .get("tokens")
        .and_then(|t| t.as_array())
        .map(|arr| arr.clone())
        .unwrap_or_else(|| Vec::new());

    let segments = tokens_to_segments(&tokens);

    update_job(&job_id, |job| {
        job.progress = Some(0.95);
    });

    Ok(Transcript {
        provider: "soniox".to_string(),
        language: None,
        segments,
        raw: Some(text),
    })
}
