//! Public web search. Only the query is sent; no endpoint credentials or cookies are attached.

use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize, Serialize)]
pub struct WebSource {
    title: String,
    #[serde(rename(deserialize = "link"))]
    url: String,
    #[serde(rename(deserialize = "description"), default)]
    snippet: String,
}

#[derive(Deserialize)]
struct Rss {
    channel: Channel,
}

#[derive(Deserialize)]
struct Channel {
    #[serde(rename = "item", default)]
    items: Vec<WebSource>,
}

fn parse_results(xml: &str) -> Result<Vec<WebSource>, String> {
    let rss: Rss = quick_xml::de::from_str(xml).map_err(|_| "search-unavailable")?;
    let sources: Vec<_> = rss.channel.items.into_iter().filter_map(|mut item| {
        let url = url::Url::parse(&item.url).ok()?;
        if !matches!(url.scheme(), "https" | "http") || !url.username().is_empty() || url.password().is_some() {
            return None;
        }
        item.title = item.title.chars().take(240).collect();
        item.snippet = item.snippet.chars().take(1600).collect();
        Some(item)
    }).take(6).collect();
    if sources.is_empty() { return Err("search-empty".into()); }
    Ok(sources)
}

#[tauri::command]
pub async fn web_search(query: String) -> Result<Vec<WebSource>, String> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 500 || query.contains('\0') {
        return Err("bad-search".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent("Mozilla/5.0 (compatible; Dalil/0.1)")
        .build().map_err(|_| "search-unavailable")?;
    // shortcut: public RSS can be throttled, use a search API if sustained usage needs it.
    let mut response = client.get("https://www.bing.com/search")
        .query(&[("format", "rss"), ("q", query)])
        .send().await.map_err(|_| "search-unavailable")?;
    if !response.status().is_success() { return Err("search-unavailable".into()); }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "search-unavailable")? {
        if body.len() + chunk.len() > 1024 * 1024 { return Err("search-unavailable".into()); }
        body.extend_from_slice(&chunk);
    }
    parse_results(std::str::from_utf8(&body).map_err(|_| "search-unavailable")?)
}

#[tauri::command]
pub fn open_web_url(url: String) -> Result<(), String> {
    let url = url::Url::parse(&url).map_err(|_| "bad-url")?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err("bad-url".into());
    }
    #[cfg(windows)]
    let mut command = { let mut cmd = std::process::Command::new("rundll32.exe"); cmd.arg("url.dll,FileProtocolHandler"); cmd };
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(not(any(windows, target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command.arg(url.as_str()).stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
        .spawn().map_err(|_| "open-unavailable")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_real_results_and_decodes_xml_entities() {
        let results = parse_results(r#"<rss><channel><title>Search</title><item><title>A &amp; B</title><link>https://example.com/?a=1&amp;b=2</link><description><![CDATA[A useful result.]]></description></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>"#).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].title, "A & B");
        assert_eq!(results[0].url, "https://example.com/?a=1&b=2");
        assert_eq!(results[0].snippet, "A useful result.");
        assert_eq!(serde_json::to_value(&results[0]).unwrap()["url"], "https://example.com/?a=1&b=2");
    }

    #[test]
    fn fails_honestly_for_empty_or_invalid_results() {
        assert!(parse_results("<html>Blocked</html>").is_err());
        assert_eq!(parse_results("<rss><channel/></rss>").err().as_deref(), Some("search-empty"));
        assert!(parse_results("<rss><channel><item><title>x</title><link>https://user:pass@example.com</link></item></channel></rss>").is_err());
    }
}
