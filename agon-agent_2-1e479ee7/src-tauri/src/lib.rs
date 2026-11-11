//! PharmaDesk desktop shell.
//!
//! The shell is intentionally thin: it opens the window, owns the local SQLite
//! database through `tauri-plugin-sql`, and applies the schema migrations.
//! All business logic lives in the TypeScript layer (`src/`).

use tauri_plugin_sql::{Migration, MigrationKind};

/// Connection string of the local database. The file is created inside the
/// operating system's per-user application data directory.
///
/// Keep in sync with `SQLITE_URL` in `src/data/runtime.ts` and with
/// `plugins.sql.preload` in `tauri.conf.json`.
const DATABASE_URL: &str = "sqlite:pharmadesk.db";

/// Schema migrations, applied in order the first time the database is opened.
///
/// Rules:
/// - never edit a migration that has been released; add a new one instead;
/// - versions must be unique and increasing.
fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create medicines and medicine_batches",
            sql: include_str!("../migrations/0001_create_inventory.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create sync outbox and sync state",
            sql: include_str!("../migrations/0002_create_sync_outbox.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(DATABASE_URL, migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running PharmaDesk");
}
