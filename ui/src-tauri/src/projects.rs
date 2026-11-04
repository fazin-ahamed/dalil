//! Projects: the folders or pieces of work that lessons are kept apart by. They live in `projects.json`
//! in the app data dir and are written the same way as `memory.json`. The webview reads and writes them
//! through the commands near the end of this file, and `lib/projects.ts` wraps those.

use std::{
    fs,
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::Mutex,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::memory::{detach_project, new_id, now_iso};

const STORE_FILE: &str = "projects.json";
const MAX_PROJECTS: usize = 50;
const MAX_NAME_CHARS: usize = 60;

/// Serialises the read-modify-write cycles on the store file.
static STORE_LOCK: Mutex<()> = Mutex::new(());

/// A folder or piece of work. Matches `Project` in `lib/contracts.ts`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    /// The folder, if the project is tied to one. Stored and shown, never read.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    pub created_at: String,
}

/// Every project and the one in use. `active` is null when no project is.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Projects {
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub active: Option<String>,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(STORE_FILE))
}

/// A missing file is an empty store. Any other read or parse failure is an error, so a damaged file is
/// never silently overwritten.
fn read_store(path: &Path) -> Result<Projects, String> {
    match fs::read_to_string(path) {
        Ok(text) => serde_json::from_str(&text).map_err(|e| e.to_string()),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(Projects::default()),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes a temporary file and renames it over the store, so a crash never leaves a half-written file.
fn write_store(path: &Path, store: &Projects) -> Result<(), String> {
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Loads the store, applies `change` and saves it. When `change` fails, nothing is saved.
fn update<T>(app: &AppHandle, change: impl FnOnce(&mut Projects) -> Result<T, String>) -> Result<T, String> {
    let path = store_path(app)?;
    let _guard = STORE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut store = read_store(&path)?;
    let out = change(&mut store)?;
    write_store(&path, &store)?;
    Ok(out)
}

/// The trimmed name, 1 to 60 characters.
fn clean_name(name: &str) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("empty-name".into());
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err("name-too-long".into());
    }
    Ok(name.into())
}

/// True when a project other than `except` already has this name, in any case.
fn is_taken(projects: &[Project], name: &str, except: Option<&str>) -> bool {
    let key = name.to_lowercase();
    projects.iter().any(|p| Some(p.id.as_str()) != except && p.name.to_lowercase() == key)
}

/// The trimmed folder, or None when it is blank.
fn clean_folder(folder: Option<String>) -> Option<String> {
    folder.map(|f| f.trim().to_string()).filter(|f| !f.is_empty())
}

/// Adds a project and makes it the active one. `id` and `created_at` come from the caller so tests can
/// fix them.
fn add_project(
    store: &mut Projects,
    name: &str,
    folder: Option<String>,
    id: String,
    created_at: String,
) -> Result<Project, String> {
    let name = clean_name(name)?;
    if is_taken(&store.projects, &name, None) {
        return Err("duplicate".into());
    }
    if store.projects.len() >= MAX_PROJECTS {
        return Err("too-many-projects".into());
    }
    let project = Project { id: id.clone(), name, folder: clean_folder(folder), created_at };
    store.projects.push(project.clone());
    store.active = Some(id);
    Ok(project)
}

/// Makes `id` the active project, or no project for None. An unknown id is an error and changes nothing.
fn set_active(store: &mut Projects, id: Option<String>) -> Result<(), String> {
    if let Some(wanted) = &id {
        if !store.projects.iter().any(|p| &p.id == wanted) {
            return Err("not-found".into());
        }
    }
    store.active = id;
    Ok(())
}

/// Removes a project. If it was the active one, no project is active afterwards. An unknown id changes
/// nothing.
fn remove_project(store: &mut Projects, id: &str) {
    store.projects.retain(|p| p.id != id);
    if store.active.as_deref() == Some(id) {
        store.active = None;
    }
}

/// Renames a project. The new name follows the rules for a new one, and may be the project's own name in
/// another case.
fn rename_project(store: &mut Projects, id: &str, name: &str) -> Result<Project, String> {
    if !store.projects.iter().any(|p| p.id == id) {
        return Err("not-found".into());
    }
    let name = clean_name(name)?;
    if is_taken(&store.projects, &name, Some(id)) {
        return Err("duplicate".into());
    }
    let project = store.projects.iter_mut().find(|p| p.id == id).ok_or("not-found")?;
    project.name = name;
    Ok(project.clone())
}

/// Every project and the active one.
#[tauri::command]
pub fn project_list(app: AppHandle) -> Result<Projects, String> {
    read_store(&store_path(&app)?)
}

/// Adds a project and makes it the active one. Returns the stored project.
#[tauri::command]
pub fn project_add(app: AppHandle, name: String, folder: Option<String>) -> Result<Project, String> {
    let (id, created_at) = (new_id(), now_iso());
    update(&app, |store| add_project(store, &name, folder, id, created_at))
}

/// Makes a project the active one, or no project for null.
#[tauri::command]
pub fn project_set_active(app: AppHandle, id: Option<String>) -> Result<(), String> {
    update(&app, |store| set_active(store, id))
}

/// Deletes a project. Its lessons are kept and become global. An unknown id is not an error.
#[tauri::command]
pub fn project_delete(app: AppHandle, id: String) -> Result<(), String> {
    detach_project(&app, &id)?;
    update(&app, |store| {
        remove_project(store, &id);
        Ok(())
    })
}

/// Renames a project. Returns the stored project.
#[tauri::command]
pub fn project_rename(app: AppHandle, id: String, name: String) -> Result<Project, String> {
    update(&app, |store| rename_project(store, &id, &name))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn project(id: &str, name: &str) -> Project {
        Project { id: id.into(), name: name.into(), folder: None, created_at: "2026-01-01T00:00:00Z".into() }
    }

    fn store(projects: Vec<Project>, active: Option<&str>) -> Projects {
        Projects { projects, active: active.map(str::to_string) }
    }

    fn add(store: &mut Projects, name: &str, folder: Option<&str>, id: &str) -> Result<Project, String> {
        add_project(store, name, folder.map(str::to_string), id.into(), "2026-01-02T00:00:00Z".into())
    }

    #[test]
    fn add_trims_the_name_stores_the_folder_and_makes_the_project_active() {
        let mut s = Projects::default();
        let made = add(&mut s, "  Physics homework ", Some("  /home/x/physics  "), "p1").unwrap();
        assert_eq!(made.name, "Physics homework");
        assert_eq!(made.folder.as_deref(), Some("/home/x/physics"));
        assert_eq!(s.active.as_deref(), Some("p1"));
        assert_eq!(s.projects, vec![made]);
    }

    #[test]
    fn a_blank_folder_is_no_folder() {
        let mut s = Projects::default();
        assert_eq!(add(&mut s, "Essay", Some("   "), "p1").unwrap().folder, None);
        assert_eq!(add(&mut s, "Notes", None, "p2").unwrap().folder, None);
    }

    #[test]
    fn names_must_have_one_to_sixty_characters() {
        let mut s = Projects::default();
        assert_eq!(add(&mut s, "   ", None, "a"), Err("empty-name".to_string()));
        assert_eq!(add(&mut s, &"é".repeat(61), None, "b"), Err("name-too-long".to_string()));
        assert!(add(&mut s, &"é".repeat(60), None, "c").is_ok());
        assert_eq!(s.projects.len(), 1);
    }

    #[test]
    fn duplicate_names_are_rejected_whatever_the_case() {
        let mut s = Projects::default();
        add(&mut s, "my-app", None, "a").unwrap();
        assert_eq!(add(&mut s, "  MY-APP ", None, "b"), Err("duplicate".to_string()));
        assert_eq!(s.projects.len(), 1);
        assert_eq!(s.active.as_deref(), Some("a"));
    }

    #[test]
    fn the_store_holds_at_most_fifty_projects() {
        let projects = (0..MAX_PROJECTS).map(|i| project(&i.to_string(), &format!("p{i}"))).collect();
        let mut s = store(projects, None);
        assert_eq!(add(&mut s, "one more", None, "new"), Err("too-many-projects".to_string()));
        assert_eq!(s.projects.len(), MAX_PROJECTS);
    }

    #[test]
    fn set_active_accepts_known_ids_and_none_and_refuses_unknown_ids() {
        let mut s = store(vec![project("a", "Alpha"), project("b", "Beta")], Some("a"));
        set_active(&mut s, Some("b".into())).unwrap();
        assert_eq!(s.active.as_deref(), Some("b"));
        assert_eq!(set_active(&mut s, Some("zzz".into())), Err("not-found".to_string()));
        assert_eq!(s.active.as_deref(), Some("b"));
        set_active(&mut s, None).unwrap();
        assert_eq!(s.active, None);
    }

    #[test]
    fn deleting_the_active_project_clears_it_and_other_deletes_keep_it() {
        let mut s = store(vec![project("a", "Alpha"), project("b", "Beta")], Some("a"));
        remove_project(&mut s, "b");
        assert_eq!(s.active.as_deref(), Some("a"));
        remove_project(&mut s, "a");
        assert_eq!(s.active, None);
        assert!(s.projects.is_empty());
        remove_project(&mut s, "missing");
        assert_eq!(s, Projects::default());
    }

    #[test]
    fn rename_trims_checks_duplicates_and_allows_its_own_name_in_another_case() {
        let mut s = store(vec![project("a", "Alpha"), project("b", "Beta")], None);
        assert_eq!(rename_project(&mut s, "a", "  alpha ").unwrap().name, "alpha");
        assert_eq!(rename_project(&mut s, "a", "BETA"), Err("duplicate".to_string()));
        assert_eq!(rename_project(&mut s, "a", " "), Err("empty-name".to_string()));
        assert_eq!(rename_project(&mut s, "zzz", "Gamma"), Err("not-found".to_string()));
        assert_eq!(s.projects[0].name, "alpha");
    }

    #[test]
    fn json_uses_camel_case_and_omits_a_missing_folder() {
        let value = serde_json::to_value(store(vec![project("a", "Alpha")], None)).unwrap();
        assert_eq!(value["projects"][0]["createdAt"], "2026-01-01T00:00:00Z");
        assert!(value["projects"][0].get("folder").is_none());
        assert!(value["active"].is_null());
    }

    #[test]
    fn an_old_or_partial_file_still_loads() {
        let text = r#"{"projects":[{"id":"a","name":"Alpha","createdAt":"2026-01-01T00:00:00Z"}]}"#;
        let loaded: Projects = serde_json::from_str(text).unwrap();
        assert_eq!(loaded.active, None);
        assert_eq!(loaded.projects[0].folder, None);
    }
}
