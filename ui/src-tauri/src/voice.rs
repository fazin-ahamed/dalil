//! Voice in and out. The microphone is read here, and the clip goes only to the speech-to-text route of
//! the endpoint the user saved. Spoken replies come back from its text-to-speech route as WAV. As in the
//! tutor chat, the endpoint comes from endpoint.json and the key from the OS keychain, both read here, so
//! the webview never sees either. Errors are short codes, never audio, keys or response bodies.

use std::{
    io::Cursor,
    sync::{
        atomic::{AtomicU32, Ordering},
        mpsc, Arc, Mutex,
    },
    thread::JoinHandle,
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use reqwest::{
    header::CONTENT_TYPE,
    multipart::{Form, Part},
    RequestBuilder,
};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};
use url::Url;

use crate::{
    chat::{self, ChatEndpoint},
    KEYRING_SERVICE, KEYRING_USER,
};

const LEVEL_EVENT: &str = "dalil://level";
/// How often the meter is sent to the notch.
const TICK: Duration = Duration::from_millis(40);
const TIMEOUT: Duration = Duration::from_secs(60);
const TARGET_RATE: u32 = 16_000;
const MAX_SECONDS: usize = 120;
const MIN_SECONDS: f32 = 0.4;
const MIN_PEAK: f32 = 0.01;
const MAX_TRANSCRIPT_BYTES: usize = 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 12 * 1024 * 1024;
const SPEECH_MAX_CHARS: usize = 1200;

/// What the capture thread fills in: mono samples at the device rate, up to the cap, and the RMS of the
/// newest chunk for the meter.
struct Shared {
    samples: Mutex<Vec<f32>>,
    rms: AtomicU32,
}

/// A recording in progress. Dropping `stop` ends the capture thread, which closes the stream and exits.
struct Recording {
    shared: Arc<Shared>,
    rate: u32,
    stop: mpsc::Sender<()>,
    thread: JoinHandle<()>,
}

/// The recording in progress, if any. Starting while one runs does nothing.
static RECORDING: Mutex<Option<Recording>> = Mutex::new(None);

impl Recording {
    /// Ends the capture. The stream is closed before this returns, so the samples are complete.
    fn finish(self) -> (Vec<f32>, u32) {
        drop(self.stop);
        let _ = self.thread.join();
        let samples = self.shared.samples.lock().map(|mut buffer| std::mem::take(&mut *buffer)).unwrap_or_default();
        (samples, self.rate)
    }
}

/// Starts recording from the default microphone. Resolves once the device is open. Rejects with
/// no-microphone or mic-busy.
#[tauri::command]
pub async fn voice_start(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || start(app)).await.map_err(|_| "mic-busy".to_string())?
}

/// Ends the recording, turns it into a 16 kHz mono WAV and sends it to the endpoint's speech-to-text route.
/// Resolves with the trimmed transcript. A clip under 0.4 seconds, or one with no sound in it, is no-speech.
#[tauri::command]
pub async fn voice_stop(app: AppHandle) -> Result<String, String> {
    let recording = RECORDING.lock().ok().and_then(|mut slot| slot.take()).ok_or("no-speech")?;
    let (samples, rate) = tauri::async_runtime::spawn_blocking(move || recording.finish())
        .await
        .map_err(|_| "no-speech")?;
    let wav = clip_wav(&samples, rate)?;
    let (endpoint, settings) = saved_endpoint(&app)?;
    transcribe(&endpoint, setting(&settings, "sttModel", "whisper-1"), wav).await
}

/// Ends the recording and throws the audio away. The wait for the stream to close runs off the main thread.
#[tauri::command]
pub async fn voice_cancel() {
    let recording = RECORDING.lock().ok().and_then(|mut slot| slot.take());
    if let Some(recording) = recording {
        let _ = tauri::async_runtime::spawn_blocking(move || recording.finish()).await;
    }
}

/// Reads `text` aloud with the endpoint's speech route. Resolves with the WAV audio as base64. A missing
/// route is tts-unsupported.
#[tauri::command]
pub async fn voice_speak(app: AppHandle, text: String) -> Result<String, String> {
    if text.trim().is_empty() {
        return Err("bad-response".into());
    }
    let (endpoint, settings) = saved_endpoint(&app)?;
    let body = serde_json::to_vec(&speech_body(
        &setting(&settings, "ttsModel", "tts-1"),
        &setting(&settings, "ttsVoice", "alloy"),
        &text,
    ))
    .map_err(|_| "bad-response")?;
    let request = client()?
        .post(audio_url(&endpoint.base, "speech")?)
        .header(CONTENT_TYPE, "application/json")
        .body(body);
    let response = authorize(request, &endpoint)?.send().await.map_err(chat::transport_error)?;
    if let Some(code) = route_error(response.status().as_u16(), "tts-unsupported") {
        return Err(code.into());
    }
    Ok(STANDARD.encode(read_capped(response, MAX_AUDIO_BYTES).await?))
}

/// Opens the microphone on its own thread and keeps the recording. Waits until the device has answered.
fn start(app: AppHandle) -> Result<(), String> {
    let mut slot = RECORDING.lock().map_err(|_| "mic-busy")?;
    if slot.is_some() {
        return Ok(());
    }
    let shared = Arc::new(Shared { samples: Mutex::new(Vec::new()), rms: AtomicU32::new(0) });
    let (stop, stop_rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::channel();
    let thread_shared = Arc::clone(&shared);
    let thread = std::thread::spawn(move || capture(app, thread_shared, stop_rx, ready_tx));
    let rate = match ready_rx.recv() {
        Ok(Ok(rate)) => rate,
        Ok(Err(code)) => return Err(code.into()),
        Err(_) => return Err("mic-busy".into()),
    };
    *slot = Some(Recording { shared, rate, stop, thread });
    Ok(())
}

/// The capture thread. It opens the stream here, since cpal streams are not `Send` on every platform,
/// reports whether that worked, then sends the level every tick until the recording stops.
fn capture(
    app: AppHandle,
    shared: Arc<Shared>,
    stop: mpsc::Receiver<()>,
    ready: mpsc::Sender<Result<u32, &'static str>>,
) {
    let (stream, rate) = match open_input(&shared) {
        Ok(opened) => opened,
        Err(code) => {
            let _ = ready.send(Err(code));
            return;
        }
    };
    let _ = ready.send(Ok(rate));
    let mut level = 0.0;
    while matches!(stop.recv_timeout(TICK), Err(mpsc::RecvTimeoutError::Timeout)) {
        let loudness = f32::from_bits(shared.rms.load(Ordering::Relaxed));
        level = smooth_level(level, level_from_rms(loudness));
        let _ = app.emit_to("notch", LEVEL_EVENT, level);
    }
    let _ = app.emit_to("notch", LEVEL_EVENT, 0.0_f32);
    drop(stream);
}

/// Opens the default input device in the format it reports, and starts it. A device that cannot be opened
/// or started is mic-busy.
fn open_input(shared: &Arc<Shared>) -> Result<(cpal::Stream, u32), &'static str> {
    let device = cpal::default_host().default_input_device().ok_or("no-microphone")?;
    let supported = device.default_input_config().map_err(|_| "no-microphone")?;
    let config = supported.config();
    let built = match supported.sample_format() {
        cpal::SampleFormat::I8 => build_stream::<i8>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::I16 => build_stream::<i16>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::I32 => build_stream::<i32>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::I64 => build_stream::<i64>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::U8 => build_stream::<u8>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::U16 => build_stream::<u16>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::U32 => build_stream::<u32>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::U64 => build_stream::<u64>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::F32 => build_stream::<f32>(&device, &config, Arc::clone(shared)),
        cpal::SampleFormat::F64 => build_stream::<f64>(&device, &config, Arc::clone(shared)),
        _ => return Err("no-microphone"),
    };
    let stream = built.map_err(|_| "mic-busy")?;
    stream.play().map_err(|_| "mic-busy")?;
    Ok((stream, config.sample_rate.0))
}

/// An input stream for samples of type `T`. Each callback mixes its frames down to mono, keeps the RMS of
/// the chunk for the meter, and appends the mono samples until the 120 second cap.
fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    shared: Arc<Shared>,
) -> Result<cpal::Stream, cpal::BuildStreamError>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let channels = usize::from(config.channels.max(1));
    let cap = config.sample_rate.0 as usize * MAX_SECONDS;
    let errors = Arc::clone(&shared);
    device.build_input_stream::<T, _, _>(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let mono: Vec<f32> = data
                .chunks(channels)
                .map(|frame| {
                    frame.iter().map(|sample| <f32 as cpal::FromSample<T>>::from_sample_(*sample)).sum::<f32>()
                        / frame.len() as f32
                })
                .collect();
            shared.rms.store(rms(&mono).to_bits(), Ordering::Relaxed);
            if let Ok(mut samples) = shared.samples.lock() {
                let room = cap.saturating_sub(samples.len()).min(mono.len());
                samples.extend_from_slice(&mono[..room]);
            }
        },
        move |_: cpal::StreamError| errors.rms.store(0, Ordering::Relaxed),
        None,
    )
}

/// The clip as a 16 kHz mono 16-bit WAV. A clip that holds no speech is no-speech.
fn clip_wav(samples: &[f32], rate: u32) -> Result<Vec<u8>, String> {
    if !holds_speech(samples, rate) {
        return Err("no-speech".into());
    }
    wav_bytes(&to_pcm16(&resample_linear(samples, rate, TARGET_RATE)))
}

/// Posts the clip to the speech-to-text route and returns the trimmed transcript.
async fn transcribe(endpoint: &ChatEndpoint, model: String, wav: Vec<u8>) -> Result<String, String> {
    let part = Part::bytes(wav).file_name("speech.wav").mime_str("audio/wav").map_err(|_| "bad-response")?;
    let form = Form::new().part("file", part).text("model", model).text("response_format", "json");
    let request = client()?.post(audio_url(&endpoint.base, "transcriptions")?).multipart(form);
    let response = authorize(request, endpoint)?.send().await.map_err(chat::transport_error)?;
    if let Some(code) = route_error(response.status().as_u16(), "stt-unsupported") {
        return Err(code.into());
    }
    transcript_from(&read_capped(response, MAX_TRANSCRIPT_BYTES).await?)
}

/// The saved endpoint for the chat call, and the whole file for the speech settings. A missing or unreadable
/// file is no-endpoint, as it is for chat.
fn saved_endpoint(app: &AppHandle) -> Result<(ChatEndpoint, Value), String> {
    let saved = std::fs::read_to_string(crate::config_path(app)?).map_err(|_| "no-endpoint")?;
    let endpoint: ChatEndpoint = serde_json::from_str(&saved).map_err(|_| "no-endpoint")?;
    let settings: Value = serde_json::from_str(&saved).map_err(|_| "no-endpoint")?;
    Ok((endpoint, settings))
}

/// A model or voice name from the saved endpoint, or the fallback when the field is missing, not text or blank.
fn setting(settings: &Value, field: &str, fallback: &str) -> String {
    settings
        .get(field)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(fallback)
        .to_string()
}

/// The key from the OS keychain, or empty when none is stored. It only ever goes into the request header.
fn stored_key() -> String {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|entry| entry.get_password())
        .unwrap_or_default()
}

/// The HTTP client for the audio calls: no redirects and a 60 second limit.
fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| "unreachable".into())
}

/// The request with the stored key in the endpoint's header. With no key the request goes unchanged, as it
/// does for a local endpoint.
fn authorize(request: RequestBuilder, endpoint: &ChatEndpoint) -> Result<RequestBuilder, String> {
    let key = stored_key();
    Ok(match chat::auth_header(&key, &endpoint.header_name, endpoint.scheme)? {
        Some((name, value)) => request.header(name, value),
        None => request,
    })
}

/// An audio route under the saved base, such as `<base>/audio/speech`. The base gets the same checks as the
/// chat URL: http or https only, no login details, and no query or fragment.
fn audio_url(base: &str, route: &str) -> Result<Url, String> {
    let mut url = chat::completions_url(base)?;
    let root = url.path().strip_suffix("/chat/completions").unwrap_or_default().to_string();
    url.set_path(&format!("{root}/audio/{route}"));
    Ok(url)
}

/// The code for a status that is not a usable answer. A missing route (404 or 405) means this endpoint does not
/// offer the feature. Other statuses map as they do for chat.
fn route_error(status: u16, unsupported: &'static str) -> Option<&'static str> {
    match status {
        404 | 405 => Some(unsupported),
        _ => chat::status_error(status),
    }
}

/// The body, read in chunks. A body past `limit` bytes is a bad response.
async fn read_capped(mut response: reqwest::Response, limit: usize) -> Result<Vec<u8>, String> {
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(chat::transport_error)? {
        if body.len() + chunk.len() > limit {
            return Err("bad-response".into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}

/// The trimmed `text` of a transcription reply. A reply with no text is a bad response, and blank text means
/// nothing was said.
fn transcript_from(bytes: &[u8]) -> Result<String, String> {
    let reply: Value = serde_json::from_slice(bytes).map_err(|_| "bad-response")?;
    let text = reply.get("text").and_then(Value::as_str).ok_or("bad-response")?.trim();
    if text.is_empty() {
        return Err("no-speech".into());
    }
    Ok(text.to_string())
}

/// The text the speech route reads: trimmed and cut to 1200 characters.
fn speech_input(text: &str) -> String {
    text.trim().chars().take(SPEECH_MAX_CHARS).collect()
}

/// The speech request: the model, the voice, the cut text, and WAV so the webview can play it.
fn speech_body(model: &str, voice: &str, text: &str) -> Value {
    json!({ "model": model, "input": speech_input(text), "voice": voice, "response_format": "wav" })
}

/// Mean loudness of the samples as root mean square. No samples is silence.
fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|sample| sample * sample).sum::<f32>() / samples.len() as f32).sqrt()
}

/// The loudest sample, as an absolute value.
fn peak(samples: &[f32]) -> f32 {
    samples.iter().fold(0.0_f32, |loudest, sample| loudest.max(sample.abs()))
}

/// The meter value for an RMS level. -50 dBFS reads 0 and -10 dBFS reads 1, so normal speech sits mid-meter.
fn level_from_rms(rms: f32) -> f32 {
    let db = 20.0 * rms.max(1e-6).log10();
    ((db + 50.0) / 40.0).clamp(0.0, 1.0)
}

/// Eases the meter toward a new value. It rises quickly and falls back slowly.
fn smooth_level(previous: f32, target: f32) -> f32 {
    let speed = if target > previous { 0.6 } else { 0.2 };
    (previous + (target - previous) * speed).clamp(0.0, 1.0)
}

/// A clip is worth sending when it is at least 0.4 seconds long and its peak reaches 0.01. Shorter or quieter
/// clips are no speech, so they are never sent.
fn holds_speech(samples: &[f32], rate: u32) -> bool {
    let seconds = samples.len() as f32 / rate.max(1) as f32;
    seconds >= MIN_SECONDS && peak(samples) >= MIN_PEAK
}

/// Linear resampling from `from` Hz to `to` Hz. The output holds the input length times `to / from` samples,
/// rounded down.
fn resample_linear(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if input.is_empty() || from == 0 || to == 0 {
        return Vec::new();
    }
    let step = from as f64 / to as f64;
    let len = (input.len() as f64 / step).floor() as usize;
    let last = input.len() - 1;
    (0..len)
        .map(|i| {
            let position = i as f64 * step;
            let index = position.floor() as usize;
            let fraction = (position - index as f64) as f32;
            let a = input[index.min(last)];
            let b = input[(index + 1).min(last)];
            a + (b - a) * fraction
        })
        .collect()
}

/// Float samples as 16-bit PCM. Values outside -1 to 1 are clipped.
fn to_pcm16(samples: &[f32]) -> Vec<i16> {
    samples.iter().map(|sample| (sample.clamp(-1.0, 1.0) * f32::from(i16::MAX)).round() as i16).collect()
}

/// 16 kHz mono 16-bit PCM in a WAV container, built in memory.
fn wav_bytes(pcm: &[i16]) -> Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: TARGET_RATE,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut cursor = Cursor::new(Vec::new());
    let mut writer = hound::WavWriter::new(&mut cursor, spec).map_err(|_| "bad-response")?;
    for sample in pcm {
        writer.write_sample(*sample).map_err(|_| "bad-response")?;
    }
    writer.finalize().map_err(|_| "bad-response")?;
    Ok(cursor.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A square wave of `seconds` at the target rate, with the given peak.
    fn clip(seconds: f32, peak: f32) -> Vec<f32> {
        (0..(seconds * TARGET_RATE as f32) as usize).map(|i| if i % 2 == 0 { peak } else { -peak }).collect()
    }

    fn route(base: &str, leaf: &str) -> String {
        audio_url(base, leaf).unwrap().to_string()
    }

    #[test]
    fn resampling_follows_the_rate_ratio_and_keeps_levels() {
        assert_eq!(resample_linear(&vec![0.25; 48_000], 48_000, TARGET_RATE).len(), 16_000);
        let up = resample_linear(&vec![0.25; 8_000], 8_000, TARGET_RATE);
        assert_eq!(up.len(), 16_000);
        assert!(up.iter().all(|sample| (sample - 0.25).abs() < 1e-6));
        assert!(resample_linear(&[], 48_000, TARGET_RATE).is_empty());
    }

    #[test]
    fn resampling_keeps_a_ramp_and_passes_equal_rates_through() {
        let ramp: Vec<f32> = (0..300).map(|i| i as f32).collect();
        let down = resample_linear(&ramp, 48_000, TARGET_RATE);
        assert_eq!(down.len(), 100);
        assert!(down.iter().enumerate().all(|(i, sample)| *sample == (3 * i) as f32));
        assert_eq!(resample_linear(&[0.1, 0.2, 0.3], TARGET_RATE, TARGET_RATE), vec![0.1, 0.2, 0.3]);
    }

    #[test]
    fn rms_and_peak_describe_a_chunk() {
        assert_eq!(rms(&[1.0, -1.0, 1.0, -1.0]), 1.0);
        assert_eq!(rms(&[]), 0.0);
        assert_eq!(peak(&[0.2, -0.7, 0.1]), 0.7);
    }

    #[test]
    fn level_scale_puts_silence_at_zero_and_normal_speech_mid_meter() {
        assert_eq!(level_from_rms(0.0), 0.0);
        assert_eq!(level_from_rms(1.0), 1.0);
        assert!((level_from_rms(0.1) - 0.75).abs() < 1e-4);
        for speech in [0.02, 0.05, 0.1] {
            let level = level_from_rms(speech);
            assert!((0.35..=0.8).contains(&level), "{speech} gives {level}");
        }
    }

    #[test]
    fn smoothing_rises_quickly_falls_slowly_and_stays_in_range() {
        let up = smooth_level(0.2, 0.8) - 0.2;
        let down = 0.8 - smooth_level(0.8, 0.2);
        assert!(up > down * 2.0, "up {up} down {down}");
        assert!(smooth_level(0.9, 5.0) <= 1.0);
        assert!(smooth_level(0.1, -3.0) >= 0.0);
        let settled = (0..200).fold(0.0, |level, _| smooth_level(level, 0.5));
        assert!((settled - 0.5).abs() < 1e-3);
    }

    #[test]
    fn wav_is_riff_16_khz_mono_16_bit() {
        let wav = wav_bytes(&[0, 1000, -1000, 32_767]).unwrap();
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(&wav[12..16], b"fmt ");
        assert_eq!(u16::from_le_bytes([wav[20], wav[21]]), 1, "PCM");
        assert_eq!(u16::from_le_bytes([wav[22], wav[23]]), 1, "mono");
        assert_eq!(u32::from_le_bytes(wav[24..28].try_into().unwrap()), 16_000);
        assert_eq!(u16::from_le_bytes([wav[34], wav[35]]), 16);
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 8);
        assert_eq!(wav.len(), 52);
    }

    #[test]
    fn pcm_conversion_clips_to_the_16_bit_range() {
        assert_eq!(to_pcm16(&[0.0, 1.0, -1.0, 2.0, -2.0]), vec![0, 32_767, -32_767, 32_767, -32_767]);
    }

    #[test]
    fn silence_and_short_clips_are_no_speech() {
        assert!(holds_speech(&clip(1.0, 0.5), TARGET_RATE));
        assert!(holds_speech(&clip(1.0, 0.01), TARGET_RATE));
        assert!(!holds_speech(&clip(1.0, 0.009), TARGET_RATE));
        assert!(!holds_speech(&clip(0.3, 0.5), TARGET_RATE));
        assert!(!holds_speech(&vec![0.0; 16_000], TARGET_RATE));
        assert!(!holds_speech(&[], TARGET_RATE));
    }

    #[test]
    fn model_and_voice_come_from_the_saved_settings_or_defaults() {
        let saved = json!({ "sttModel": " whisper-large-v3 ", "ttsModel": "", "ttsVoice": 3 });
        assert_eq!(setting(&saved, "sttModel", "whisper-1"), "whisper-large-v3");
        assert_eq!(setting(&saved, "ttsModel", "tts-1"), "tts-1");
        assert_eq!(setting(&saved, "ttsVoice", "alloy"), "alloy");
        assert_eq!(setting(&json!({}), "sttModel", "whisper-1"), "whisper-1");
    }

    #[test]
    fn speech_input_is_trimmed_and_cut_to_1200_characters() {
        let long = format!("  {}  ", "e".repeat(2_000));
        assert_eq!(speech_input(&long).chars().count(), 1_200);
        assert_eq!(speech_input("  Hello there. "), "Hello there.");
        let accented = "\u{e9}".repeat(1_500);
        assert_eq!(speech_input(&accented).chars().count(), 1_200);
    }

    #[test]
    fn speech_body_asks_for_wav_with_the_saved_voice() {
        let body = speech_body("tts-1-hd", "nova", "Press Ctrl+S.");
        assert_eq!(body["model"].as_str(), Some("tts-1-hd"));
        assert_eq!(body["voice"].as_str(), Some("nova"));
        assert_eq!(body["input"].as_str(), Some("Press Ctrl+S."));
        assert_eq!(body["response_format"].as_str(), Some("wav"));
    }

    #[test]
    fn transcript_is_the_trimmed_text_and_blank_is_no_speech() {
        assert_eq!(transcript_from(br#"{"text":"  Open the Align menu.  "}"#).unwrap(), "Open the Align menu.");
        assert_eq!(transcript_from(br#"{"text":" \n "}"#).unwrap_err(), "no-speech");
        assert_eq!(transcript_from(b"{}").unwrap_err(), "bad-response");
        assert_eq!(transcript_from(b"not json").unwrap_err(), "bad-response");
    }

    #[test]
    fn audio_routes_sit_under_the_saved_base_and_refuse_odd_bases() {
        assert_eq!(route("https://api.example.com/v1/", "speech"), "https://api.example.com/v1/audio/speech");
        assert_eq!(route("http://localhost:11434", "transcriptions"), "http://localhost:11434/audio/transcriptions");
        assert_eq!(
            route("https://gw.example.com/openai/v1?api-version=1#top", "speech"),
            "https://gw.example.com/openai/v1/audio/speech"
        );
        assert!(audio_url("ftp://api.example.com/v1", "speech").is_err());
        assert!(audio_url("https://user:pw@api.example.com/v1", "speech").is_err());
    }

    #[test]
    fn a_missing_audio_route_is_unsupported_and_other_statuses_match_chat() {
        assert_eq!(route_error(404, "stt-unsupported"), Some("stt-unsupported"));
        assert_eq!(route_error(405, "tts-unsupported"), Some("tts-unsupported"));
        assert_eq!(route_error(200, "tts-unsupported"), None);
        assert_eq!(route_error(401, "stt-unsupported"), Some("key-rejected"));
        assert_eq!(route_error(429, "stt-unsupported"), Some("rate-limited"));
        assert_eq!(route_error(503, "tts-unsupported"), Some("server-error"));
    }
}
