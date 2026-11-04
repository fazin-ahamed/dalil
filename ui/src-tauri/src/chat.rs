//! Tutor chat. The request is made here, not in the webview: the API key lives in the OS keychain,
//! is read here, and is sent only to the endpoint the user saved. Errors are short codes, never the
//! key or the response body.

use std::time::Duration;

use reqwest::header::{HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use url::Url;

use crate::{KEYRING_SERVICE, KEYRING_USER};

const TIMEOUT: Duration = Duration::from_secs(60);
const MAX_REPLY_BYTES: usize = 1024 * 1024;
/// The whole request body, screenshots included. A larger body is refused before it is sent.
const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;

/// The saved endpoint, read from `endpoint.json`. The key is not part of it; it comes from the keychain.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatEndpoint {
    pub(crate) base: String,
    model: String,
    pub(crate) header_name: String,
    pub(crate) scheme: Scheme,
}

#[derive(Deserialize, Clone, Copy)]
pub(crate) enum Scheme {
    /// `Authorization: Bearer <key>` style.
    Bearer,
    /// The key as it is, in the chosen header.
    #[serde(rename = "None")]
    Raw,
}

#[derive(Serialize, Deserialize)]
pub struct ChatMessage {
    role: String,
    /// A string, or an array of text and data-image parts in the OpenAI chat format. `request_bytes` checks it.
    content: Value,
}

/// One chat completion. Resolves with the text of the first choice, or a short error code.
#[tauri::command]
pub async fn chat_complete(app: tauri::AppHandle, messages: Vec<ChatMessage>) -> Result<String, String> {
    // The endpoint comes from the saved file, never from the webview, so a compromised page cannot
    // point the keychain key at another host.
    let saved = std::fs::read_to_string(crate::config_path(&app)?).map_err(|_| "no-endpoint")?;
    let endpoint: ChatEndpoint = serde_json::from_str(&saved).map_err(|_| "no-endpoint")?;
    let url = completions_url(&endpoint.base)?;
    let key = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .and_then(|entry| entry.get_password())
        .unwrap_or_default();
    let body = request_bytes(&endpoint.model, &messages)?;
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(TIMEOUT)
        .build()
        .map_err(|_| "unreachable")?;

    let mut request = client.post(url).header(CONTENT_TYPE, "application/json").body(body);
    if let Some((name, value)) = auth_header(&key, &endpoint.header_name, endpoint.scheme)? {
        request = request.header(name, value);
    }
    let mut response = request.send().await.map_err(transport_error)?;
    if let Some(code) = status_error(response.status().as_u16()) {
        return Err(code.into());
    }

    let mut reply = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(transport_error)? {
        if reply.len() + chunk.len() > MAX_REPLY_BYTES {
            return Err("bad-response".into());
        }
        reply.extend_from_slice(&chunk);
    }
    parse_reply(&reply).map_err(String::from)
}

/// The chat completions URL under the saved base. Only http and https, no login details, and any
/// query or fragment is dropped.
pub(crate) fn completions_url(base: &str) -> Result<Url, &'static str> {
    let mut url = Url::parse(base.trim()).map_err(|_| "bad-url")?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err("bad-url");
    }
    let path = format!("{}/chat/completions", url.path().trim_end_matches('/'));
    url.set_path(&path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

/// The key header, or None when there is no key (a local endpoint). Control characters are dropped.
/// An unusable header name falls back to Authorization, as in endpoint.ts.
pub(crate) fn auth_header(
    key: &str,
    header_name: &str,
    scheme: Scheme,
) -> Result<Option<(HeaderName, HeaderValue)>, &'static str> {
    let cleaned: String = key.chars().filter(|c| !c.is_control()).collect();
    let secret = cleaned.trim();
    if secret.is_empty() {
        return Ok(None);
    }
    let name = HeaderName::from_bytes(header_name.trim().as_bytes()).unwrap_or(AUTHORIZATION);
    let value = match scheme {
        Scheme::Bearer => format!("Bearer {secret}"),
        Scheme::Raw => secret.to_string(),
    };
    let value = HeaderValue::from_str(&value).map_err(|_| "key-rejected")?;
    Ok(Some((name, value)))
}

/// The short code for a status that is not a usable answer, or None for a 2xx. Redirects are not
/// followed, so a 3xx is a bad response.
pub(crate) fn status_error(status: u16) -> Option<&'static str> {
    match status {
        200..=299 => None,
        401 | 403 => Some("key-rejected"),
        404 => Some("not-found"),
        429 => Some("rate-limited"),
        500..=599 => Some("server-error"),
        _ => Some("bad-response"),
    }
}

/// A timeout, or anything else as unreachable. The error text itself is never passed on.
pub(crate) fn transport_error(error: reqwest::Error) -> String {
    let code = if error.is_timeout() { "timeout" } else { "unreachable" };
    code.into()
}

/// The request body: the model, the messages as sent, and a low temperature for steady answers.
fn request_body(model: &str, messages: &[ChatMessage]) -> serde_json::Value {
    json!({ "model": model, "messages": messages, "temperature": 0.3 })
}

/// The request body as bytes. A part that is not text or a data image is bad-request, and a body over
/// 8 MiB is too-large.
fn request_bytes(model: &str, messages: &[ChatMessage]) -> Result<Vec<u8>, &'static str> {
    if !messages.iter().all(|message| valid_content(&message.content)) {
        return Err("bad-request");
    }
    let body = serde_json::to_vec(&request_body(model, messages)).map_err(|_| "bad-response")?;
    if body.len() > MAX_REQUEST_BYTES {
        return Err("too-large");
    }
    Ok(body)
}

/// Plain text, or an array of parts. Anything else is refused.
fn valid_content(content: &Value) -> bool {
    match content {
        Value::String(_) => true,
        Value::Array(parts) => parts.iter().all(valid_part),
        _ => false,
    }
}

/// Exactly `{"type":"text","text":string}`, or `{"type":"image_url","image_url":{"url":"data:image/..."}}`.
fn valid_part(part: &Value) -> bool {
    let Some(part) = part.as_object().filter(|part| part.len() == 2) else {
        return false;
    };
    match part.get("type").and_then(Value::as_str) {
        Some("text") => part.get("text").is_some_and(Value::is_string),
        Some("image_url") => part
            .get("image_url")
            .and_then(Value::as_object)
            .filter(|image| image.len() == 1)
            .and_then(|image| image.get("url")?.as_str())
            .is_some_and(|url| url.starts_with("data:image/")),
        _ => false,
    }
}

/// The text of the first choice. Not JSON, no choices or no text is a bad response.
fn parse_reply(bytes: &[u8]) -> Result<String, &'static str> {
    let answer: serde_json::Value = serde_json::from_slice(bytes).map_err(|_| "bad-response")?;
    answer
        .pointer("/choices/0/message/content")
        .and_then(|content| content.as_str())
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .ok_or("bad-response")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str) -> ChatMessage {
        ChatMessage { role: role.into(), content: json!(content) }
    }

    fn url(base: &str) -> String {
        completions_url(base).unwrap().to_string()
    }

    #[test]
    fn chat_url_is_the_saved_base_plus_chat_completions() {
        assert_eq!(url("https://api.example.com/v1/"), "https://api.example.com/v1/chat/completions");
        assert_eq!(url("https://api.example.com"), "https://api.example.com/chat/completions");
        assert_eq!(url("http://localhost:11434"), "http://localhost:11434/chat/completions");
    }

    #[test]
    fn chat_url_drops_query_and_fragment_and_refuses_odd_bases() {
        assert_eq!(
            url("https://gw.example.com/openai/v1?api-version=1#top"),
            "https://gw.example.com/openai/v1/chat/completions"
        );
        for base in ["", "ftp://api.example.com/v1", "https://user:pw@api.example.com/v1", "https://exa mple.com", "not a url"] {
            assert_eq!(completions_url(base).unwrap_err(), "bad-url", "{base}");
        }
    }

    #[test]
    fn auth_header_is_left_out_without_a_key() {
        assert!(auth_header("", "Authorization", Scheme::Bearer).unwrap().is_none());
        assert!(auth_header(" \r\n", "x-api-key", Scheme::Raw).unwrap().is_none());
    }

    #[test]
    fn auth_header_is_bearer_or_the_raw_key_under_the_chosen_name() {
        let (name, value) = auth_header("sk-test", "Authorization", Scheme::Bearer).unwrap().unwrap();
        assert_eq!((name.as_str(), value.to_str().unwrap()), ("authorization", "Bearer sk-test"));
        let (name, value) = auth_header("sk-test", "x-api-key", Scheme::Raw).unwrap().unwrap();
        assert_eq!((name.as_str(), value.to_str().unwrap()), ("x-api-key", "sk-test"));
    }

    #[test]
    fn auth_header_drops_control_characters_and_falls_back_to_authorization() {
        let (name, value) = auth_header("ab\r\ncd\n", "bad header", Scheme::Bearer).unwrap().unwrap();
        assert_eq!((name.as_str(), value.to_str().unwrap()), ("authorization", "Bearer abcd"));
    }

    #[test]
    fn status_codes_map_to_short_codes() {
        assert_eq!(status_error(200), None);
        assert_eq!(status_error(204), None);
        assert_eq!(status_error(401), Some("key-rejected"));
        assert_eq!(status_error(403), Some("key-rejected"));
        assert_eq!(status_error(404), Some("not-found"));
        assert_eq!(status_error(429), Some("rate-limited"));
        assert_eq!(status_error(500), Some("server-error"));
        assert_eq!(status_error(503), Some("server-error"));
        assert_eq!(status_error(302), Some("bad-response"));
        assert_eq!(status_error(400), Some("bad-response"));
    }

    #[test]
    fn reply_is_the_text_of_the_first_choice() {
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"Press Ctrl+S."}}]}"#;
        assert_eq!(parse_reply(body.as_bytes()).unwrap(), "Press Ctrl+S.");
    }

    #[test]
    fn reply_without_usable_text_is_a_bad_response() {
        for body in [
            "not json",
            "{}",
            r#"{"choices":[]}"#,
            r#"{"choices":[{"message":{"content":null}}]}"#,
            r#"{"choices":[{"message":{"content":"  "}}]}"#,
        ] {
            assert_eq!(parse_reply(body.as_bytes()).unwrap_err(), "bad-response", "{body}");
        }
    }

    #[test]
    fn request_body_has_model_messages_and_low_temperature() {
        let body = request_body("gemma2", &[message("system", "rules"), message("user", "hi")]);
        assert_eq!(body["model"].as_str(), Some("gemma2"));
        assert_eq!(body["messages"][1]["content"].as_str(), Some("hi"));
        assert_eq!(body["temperature"].as_f64(), Some(0.3));
    }

    #[test]
    fn text_and_data_image_parts_reach_the_endpoint_unchanged() {
        let content = json!([
            { "type": "text", "text": "What is this?" },
            { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,/9j/4AAQ" } }
        ]);
        let messages = vec![
            message("system", "rules"),
            ChatMessage { role: "user".into(), content: content.clone() },
        ];
        let sent: Value = serde_json::from_slice(&request_bytes("gemma2", &messages).unwrap()).unwrap();
        assert_eq!(sent["messages"][1]["content"], content);
    }

    #[test]
    fn only_text_and_data_image_parts_are_valid() {
        assert!(valid_content(&json!("plain")));
        assert!(valid_content(&json!([
            { "type": "text", "text": "hi" },
            { "type": "image_url", "image_url": { "url": "data:image/png;base64,AAAA" } }
        ])));
        let refused = [
            json!(null),
            json!(42),
            json!({ "type": "text", "text": "hi" }),
            json!(["just a string"]),
            json!([{ "type": "text" }]),
            json!([{ "type": "text", "text": 5 }]),
            json!([{ "type": "text", "text": "hi", "detail": "low" }]),
            json!([{ "type": "image_url", "image_url": { "url": "https://example.com/cat.png" } }]),
            json!([{ "type": "image_url", "image_url": { "url": "data:text/html;base64,PGgxPg==" } }]),
            json!([{ "type": "image_url", "image_url": "data:image/png;base64,AAAA" }]),
            json!([{ "type": "image_url", "image_url": { "url": "data:image/png;base64,AAAA", "detail": "low" } }]),
            json!([{ "type": "file", "file": { "file_data": "AAAA" } }]),
            json!([{ "type": "text", "text": "ok" }, { "type": "image_url", "image_url": { "url": "http://x" } }]),
        ];
        for content in refused {
            assert!(!valid_content(&content), "{content}");
        }
    }

    #[test]
    fn a_bad_part_is_refused_as_bad_request() {
        let messages = vec![ChatMessage { role: "user".into(), content: json!([{ "type": "file" }]) }];
        assert_eq!(request_bytes("m", &messages).unwrap_err(), "bad-request");
    }

    #[test]
    fn a_body_over_eight_mebibytes_is_too_large() {
        let big = "x".repeat(MAX_REQUEST_BYTES);
        assert_eq!(request_bytes("m", &[message("user", &big)]).unwrap_err(), "too-large");
        let fits = "x".repeat(1024 * 1024);
        assert!(request_bytes("m", &[message("user", &fits)]).is_ok());
    }

    #[test]
    fn endpoint_reads_the_page_shape_and_rejects_unknown_schemes() {
        let page = r#"{"base":"http://localhost:11434","model":"llama3","headerName":"x-api-key","scheme":"None","host":"localhost:11434"}"#;
        let endpoint: ChatEndpoint = serde_json::from_str(page).unwrap();
        assert_eq!(endpoint.base, "http://localhost:11434");
        assert_eq!(endpoint.header_name, "x-api-key");
        assert!(matches!(endpoint.scheme, Scheme::Raw));
        let bearer = r#"{"base":"https://a.example.com/v1","model":"m","headerName":"Authorization","scheme":"Bearer"}"#;
        assert!(matches!(serde_json::from_str::<ChatEndpoint>(bearer).unwrap().scheme, Scheme::Bearer));
        let basic = r#"{"base":"https://a.example.com/v1","model":"m","headerName":"Authorization","scheme":"Basic"}"#;
        assert!(serde_json::from_str::<ChatEndpoint>(basic).is_err());
    }
}
