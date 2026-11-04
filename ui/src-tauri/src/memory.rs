//! Long-term memory: the lessons Dalil keeps about the person. They live in `memory.json` in the app
//! data dir and never leave the machine. A lesson belongs to one project, or to none (global, shown in
//! every project). The webview reads and writes them through the commands near the end of this file,
//! and `lib/memory.ts` wraps those.

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const STORE_FILE: &str = "memory.json";
const MAX_LESSONS: usize = 500;

/// Serialises the read-modify-write cycles on the store file.
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// One thing Dalil remembers about the person. Matches `Lesson` in `lib/contracts.ts`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Lesson {
    pub id: String,
    pub topic: String,
    pub note: String,
    /// "learned", "struggled" or "asked".
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app: Option<String>,
    pub created_at: String,
    pub seen: u32,
    /// The project the lesson belongs to. None = global, shown in every project.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    /// The labelled points of the explanation, kept as the `Mark[]` JSON of `lib/contracts.ts`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub marks: Option<serde_json::Value>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(STORE_FILE))
}

/// A missing file is an empty store. Any other read or parse failure is an error, so a damaged file
/// is never silently overwritten. `memory_clear` still works, which is the way out.
fn read_store(path: &Path) -> Result<Vec<Lesson>, String> {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes a temporary file and renames it over the store, so a crash never leaves a half-written file.
fn write_store(path: &Path, lessons: &[Lesson]) -> Result<(), String> {
    let json = serde_json::to_string_pretty(lessons).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Loads the store, applies `change` and saves it. When `change` fails, nothing is saved.
fn update<T>(app: &AppHandle, change: impl FnOnce(&mut Vec<Lesson>) -> Result<T, String>) -> Result<T, String> {
    let path = store_path(app)?;
    let _guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut lessons = read_store(&path)?;
    let out = change(&mut lessons)?;
    write_store(&path, &lessons)?;
    Ok(out)
}

/// Adds a lesson, or refreshes the one on the same topic in the same project (trimmed, case-insensitive).
/// Its note and kind are replaced and `seen` goes up by one. The newest marks replace the stored ones; a
/// call without marks keeps them. `id` and `created_at` come from the caller so tests can fix them.
#[allow(clippy::too_many_arguments)]
fn add_lesson(
    lessons: &mut Vec<Lesson>,
    topic: &str,
    note: &str,
    kind: &str,
    app: Option<String>,
    project_id: Option<String>,
    marks: Option<serde_json::Value>,
    id: String,
    created_at: String,
) -> Result<Lesson, String> {
    let (topic, note) = (topic.trim(), note.trim());
    let project_id = project_id.filter(|p| !p.trim().is_empty());
    if topic.is_empty() {
        return Err("empty-topic".into());
    }
    if note.is_empty() {
        return Err("empty-note".into());
    }
    if !matches!(kind, "learned" | "struggled" | "asked") {
        return Err("bad-kind".into());
    }
    let key = topic.to_lowercase();
    if let Some(existing) = lessons
        .iter_mut()
        .find(|l| l.topic.trim().to_lowercase() == key && l.project_id == project_id)
    {
        existing.note = note.into();
        existing.kind = kind.into();
        existing.seen = existing.seen.saturating_add(1);
        if marks.is_some() {
            existing.marks = marks;
        }
        return Ok(existing.clone());
    }
    let lesson = Lesson {
        id,
        topic: topic.into(),
        note: note.into(),
        kind: kind.into(),
        app,
        created_at,
        seen: 1,
        project_id,
        marks,
    };
    lessons.push(lesson.clone());
    enforce_cap(lessons, &lesson.id);
    Ok(lesson)
}

/// Drops the lowest-`seen` lesson, oldest first among equals, until the store fits the cap. The lesson
/// with id `keep` (the one just written) is never the one dropped.
fn enforce_cap(lessons: &mut Vec<Lesson>, keep: &str) {
    while lessons.len() > MAX_LESSONS {
        let victim = lessons
            .iter()
            .enumerate()
            .filter(|(_, l)| l.id != keep)
            .min_by(|(_, a), (_, b)| a.seen.cmp(&b.seen).then_with(|| a.created_at.cmp(&b.created_at)))
            .map(|(i, _)| i);
        let Some(i) = victim else { break };
        lessons.remove(i);
    }
}

/// Removes the lesson with this id. An unknown id changes nothing.
fn remove_lesson(lessons: &mut Vec<Lesson>, id: &str) {
    lessons.retain(|l| l.id != id);
}

/// The lessons shown for a project: its own and the global ones. With no project, every lesson.
fn visible(lessons: Vec<Lesson>, project_id: Option<&str>) -> Vec<Lesson> {
    let Some(id) = project_id.filter(|id| !id.is_empty()) else { return lessons };
    lessons
        .into_iter()
        .filter(|lesson| match &lesson.project_id {
            Some(owner) => owner == id,
            None => true,
        })
        .collect()
}

/// Clears the project of every lesson that belongs to `id`, so they become global. Nothing else changes.
fn detach(lessons: &mut [Lesson], id: &str) {
    for lesson in lessons.iter_mut().filter(|l| l.project_id.as_deref() == Some(id)) {
        lesson.project_id = None;
    }
}

/// Called when a project is deleted: its lessons are kept, as global lessons.
pub(crate) fn detach_project(app: &AppHandle, id: &str) -> Result<(), String> {
    update(app, |lessons| {
        detach(lessons, id);
        Ok(())
    })
}

/// ISO 8601 UTC for whole Unix seconds, e.g. "2009-02-13T23:31:30Z". The civil date comes from the
/// day count by Howard Hinnant's algorithm, so no date crate is needed.
fn iso_from_unix(secs: u64) -> String {
    let z = (secs / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    let rem = secs % 86_400;
    format!("{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z", rem / 3_600, rem % 3_600 / 60, rem % 60)
}

/// The current time as ISO 8601 UTC. Shared with `projects.rs`.
pub(crate) fn now_iso() -> String {
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
    iso_from_unix(secs)
}

/// Nanoseconds since the epoch plus a counter, so two adds in the same tick still get different ids.
/// Shared with `projects.rs`.
pub(crate) fn new_id() -> String {
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_nanos());
    format!("{nanos:x}-{}", SEQ.fetch_add(1, Ordering::Relaxed))
}

/// Lessons newest first. With a project id: that project's lessons and the global ones. Without one, all.
#[tauri::command]
pub fn memory_list(app: AppHandle, project_id: Option<String>) -> Result<Vec<Lesson>, String> {
    let path = store_path(&app)?;
    let lessons = visible(read_store(&path)?, project_id.as_deref());
    Ok(lessons.into_iter().rev().collect())
}

/// Saves a lesson, or refreshes the one on the same topic in the same project. Returns the stored lesson.
#[tauri::command]
pub fn memory_add(
    app: AppHandle,
    topic: String,
    note: String,
    kind: String,
    app_name: Option<String>,
    project_id: Option<String>,
    marks: Option<serde_json::Value>,
) -> Result<Lesson, String> {
    let (id, created_at) = (new_id(), now_iso());
    update(&app, |lessons| {
        add_lesson(lessons, &topic, &note, &kind, app_name, project_id, marks, id, created_at)
    })
}

/// Deletes one lesson. An unknown id is not an error.
#[tauri::command]
pub fn memory_delete(app: AppHandle, id: String) -> Result<(), String> {
    update(&app, |lessons| {
        remove_lesson(lessons, &id);
        Ok(())
    })
}

/// Empties the store. It does not read the file first, so it also clears a damaged one.
#[tauri::command]
pub fn memory_clear(app: AppHandle) -> Result<(), String> {
    let path = store_path(&app)?;
    let _guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    write_store(&path, &[])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lesson(id: &str, seen: u32, created_at: &str) -> Lesson {
        Lesson {
            id: id.into(),
            topic: format!("topic {id}"),
            note: "note".into(),
            kind: "asked".into(),
            app: None,
            created_at: created_at.into(),
            seen,
            project_id: None,
            marks: None,
        }
    }

    fn in_project(id: &str, topic: &str, project: Option<&str>) -> Lesson {
        Lesson {
            topic: topic.into(),
            project_id: project.map(str::to_string),
            ..lesson(id, 1, "2026-01-01T00:00:00Z")
        }
    }

    fn add(lessons: &mut Vec<Lesson>, topic: &str, note: &str, kind: &str, id: &str, at: &str) -> Result<Lesson, String> {
        add_lesson(lessons, topic, note, kind, None, None, None, id.into(), at.into())
    }

    fn add_in(
        lessons: &mut Vec<Lesson>,
        topic: &str,
        project: Option<&str>,
        marks: Option<serde_json::Value>,
        id: &str,
    ) -> Result<Lesson, String> {
        let project = project.map(str::to_string);
        add_lesson(lessons, topic, "note", "learned", None, project, marks, id.into(), "2026-01-01T00:00:00Z".into())
    }

    #[test]
    fn merge_refreshes_the_same_topic_and_keeps_its_id() {
        let mut lessons = Vec::new();
        let first = add(&mut lessons, "  Figma auto layout ", "Padding and spacing differ.", "struggled", "a", "2026-01-01T09:00:00Z")
            .unwrap();
        assert_eq!(first.seen, 1);
        let again = add(&mut lessons, "figma AUTO layout", "Set spacing first.", "learned", "b", "2026-01-02T09:00:00Z")
            .unwrap();
        assert_eq!(lessons.len(), 1);
        assert_eq!(again.id, "a");
        assert_eq!(again.topic, "Figma auto layout");
        assert_eq!(again.note, "Set spacing first.");
        assert_eq!(again.kind, "learned");
        assert_eq!(again.seen, 2);
        assert_eq!(again.created_at, "2026-01-01T09:00:00Z");
    }

    #[test]
    fn empty_topic_or_note_and_unknown_kind_are_rejected_without_change() {
        let mut lessons = Vec::new();
        assert_eq!(add(&mut lessons, "   ", "note", "asked", "a", "t"), Err("empty-topic".to_string()));
        assert_eq!(add(&mut lessons, "topic", " \n ", "asked", "a", "t"), Err("empty-note".to_string()));
        assert_eq!(add(&mut lessons, "topic", "note", "guessed", "a", "t"), Err("bad-kind".to_string()));
        assert!(lessons.is_empty());
    }

    #[test]
    fn cap_drops_the_oldest_of_the_lowest_seen_lessons() {
        let mut lessons: Vec<Lesson> =
            (0..MAX_LESSONS).map(|i| lesson(&i.to_string(), 2, &iso_from_unix(i as u64))).collect();
        lessons[0].seen = 1; // oldest and lowest seen
        lessons[5].seen = 1; // lowest seen, but newer
        add(&mut lessons, "fresh topic", "fresh note", "learned", "new", &iso_from_unix(1_000)).unwrap();
        assert_eq!(lessons.len(), MAX_LESSONS);
        assert!(lessons.iter().all(|l| l.id != "0"));
        assert!(lessons.iter().any(|l| l.id == "5"));
        assert!(lessons.iter().any(|l| l.id == "new"));
    }

    #[test]
    fn cap_never_drops_the_lesson_just_written() {
        let mut lessons: Vec<Lesson> =
            (0..MAX_LESSONS).map(|i| lesson(&i.to_string(), 3, &iso_from_unix(i as u64))).collect();
        let added = add(&mut lessons, "fresh topic", "fresh note", "asked", "new", &iso_from_unix(1_000)).unwrap();
        assert_eq!(lessons.len(), MAX_LESSONS);
        assert!(lessons.contains(&added));
        assert!(lessons.iter().all(|l| l.id != "0"));
    }

    #[test]
    fn delete_removes_one_lesson_and_ignores_unknown_ids() {
        let mut lessons = vec![lesson("a", 1, "t1"), lesson("b", 1, "t2")];
        remove_lesson(&mut lessons, "a");
        remove_lesson(&mut lessons, "missing");
        assert_eq!(lessons.iter().map(|l| l.id.as_str()).collect::<Vec<_>>(), ["b"]);
    }

    #[test]
    fn dates_are_iso_8601_utc() {
        assert_eq!(iso_from_unix(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_from_unix(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(iso_from_unix(1_234_567_890), "2009-02-13T23:31:30Z");
    }

    #[test]
    fn json_uses_the_shared_field_names_and_omits_a_missing_app() {
        let value = serde_json::to_value(lesson("a", 1, "2026-01-01T00:00:00Z")).unwrap();
        assert_eq!(value["createdAt"], "2026-01-01T00:00:00Z");
        assert_eq!(value["seen"], 1);
        assert!(value.get("app").is_none());
        assert!(value.get("created_at").is_none());
    }

    #[test]
    fn the_same_topic_in_another_project_is_a_separate_lesson() {
        let mut lessons = Vec::new();
        add_in(&mut lessons, "Frames", None, None, "g").unwrap();
        add_in(&mut lessons, "frames", Some("p1"), None, "a").unwrap();
        add_in(&mut lessons, "Frames", Some("p2"), None, "b").unwrap();
        assert_eq!(lessons.len(), 3);
        assert!(lessons.iter().all(|l| l.seen == 1));

        let again = add_in(&mut lessons, " FRAMES ", Some("p1"), None, "x").unwrap();
        assert_eq!(lessons.len(), 3);
        assert_eq!(again.id, "a");
        assert_eq!(again.seen, 2);
    }

    #[test]
    fn a_refresh_keeps_the_newest_marks_and_a_call_without_marks_keeps_them() {
        let mut lessons = Vec::new();
        let first = add_in(&mut lessons, "Pen tool", None, Some(serde_json::json!([{"n": 1, "label": "Anchor"}])), "a")
            .unwrap();
        let newer = add_in(&mut lessons, "pen tool", None, Some(serde_json::json!([{"n": 1, "label": "Corner"}])), "b")
            .unwrap();
        assert_eq!(newer.id, first.id);
        assert_eq!(newer.marks, Some(serde_json::json!([{"n": 1, "label": "Corner"}])));
        let kept = add_in(&mut lessons, "Pen tool", None, None, "c").unwrap();
        assert_eq!(kept.marks, Some(serde_json::json!([{"n": 1, "label": "Corner"}])));
    }

    #[test]
    fn a_project_lists_its_own_lessons_and_the_global_ones() {
        let all = vec![
            in_project("g", "Global", None),
            in_project("a", "Alpha", Some("p1")),
            in_project("b", "Beta", Some("p2")),
        ];
        let ids = |lessons: Vec<Lesson>| lessons.into_iter().map(|l| l.id).collect::<Vec<_>>();
        assert_eq!(ids(visible(all.clone(), Some("p1"))), ["g", "a"]);
        assert_eq!(ids(visible(all.clone(), None)), ["g", "a", "b"]);
        assert_eq!(ids(visible(all, Some(""))), ["g", "a", "b"]);
    }

    #[test]
    fn deleting_a_project_makes_its_lessons_global() {
        let mut lessons = vec![in_project("a", "Alpha", Some("p1")), in_project("b", "Beta", Some("p2"))];
        detach(&mut lessons, "p1");
        assert_eq!(lessons[0].project_id, None);
        assert_eq!(lessons[1].project_id.as_deref(), Some("p2"));
    }

    #[test]
    fn old_files_without_project_or_marks_still_load() {
        let text = r#"[{"id":"a","topic":"Frames","note":"Group first.","kind":"learned","createdAt":"2026-01-01T00:00:00Z","seen":2}]"#;
        let loaded: Vec<Lesson> = serde_json::from_str(text).unwrap();
        assert_eq!(loaded[0].project_id, None);
        assert_eq!(loaded[0].marks, None);
        assert_eq!(loaded[0].seen, 2);
    }

    #[test]
    fn project_and_marks_use_camel_case_and_are_omitted_when_missing() {
        let mut with = lesson("a", 1, "2026-01-01T00:00:00Z");
        with.project_id = Some("p1".into());
        with.marks = Some(serde_json::json!([{"n": 1, "label": "Anchor", "x": 10, "y": 20}]));
        let value = serde_json::to_value(&with).unwrap();
        assert_eq!(value["projectId"], "p1");
        assert_eq!(value["marks"][0]["label"], "Anchor");
        let bare = serde_json::to_value(lesson("b", 1, "2026-01-01T00:00:00Z")).unwrap();
        assert!(bare.get("projectId").is_none());
        assert!(bare.get("marks").is_none());
    }
}
