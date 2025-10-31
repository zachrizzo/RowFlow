// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rowflow_lib::state::AppState;
use tauri::Manager;

fn main() {
    // Initialize logging
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("Starting RowFlow application");

    tauri::Builder::default()
        // Initialize application state
        .setup(|app| {
            let state = AppState::new();
            app.manage(state);
            log::info!("Application state initialized");
            Ok(())
        })
        // Register plugins
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        // Register database commands
        .invoke_handler(tauri::generate_handler![
            // Database connection commands
            rowflow_lib::commands::database::connect_database,
            rowflow_lib::commands::database::disconnect_database,
            rowflow_lib::commands::database::test_connection,
            rowflow_lib::commands::database::execute_query,
            rowflow_lib::commands::database::execute_query_stream,
            rowflow_lib::commands::database::cancel_query,
            rowflow_lib::commands::database::get_backend_pid,
            rowflow_lib::commands::database::list_mcp_profiles,
            // Schema introspection commands
            rowflow_lib::commands::schema::list_schemas,
            rowflow_lib::commands::schema::list_tables,
            rowflow_lib::commands::schema::get_table_columns,
            rowflow_lib::commands::schema::get_primary_keys,
            rowflow_lib::commands::schema::get_indexes,
            rowflow_lib::commands::schema::get_table_stats,
            rowflow_lib::commands::schema::get_foreign_keys,
            rowflow_lib::commands::schema::get_constraints,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
