use archestra_ai_lib::openapi::ApiDoc;
use std::fs;
use std::path::Path;
use std::process::Command;
use utoipa::OpenApi;

fn main() {
    let openapi = ApiDoc::openapi();
    let json = serde_json::to_string_pretty(&openapi).expect("Failed to serialize OpenAPI schema");
    let output_path = Path::new("../openapi.json");
    fs::write(output_path, json).expect("Failed to write OpenAPI schema to file");

    println!("OpenAPI schema written to openapi.json");

    // Run frontend codegen command
    println!("Running frontend codegen command...");
    let frontend_codegen_result = Command::new("pnpm")
        .args(["codegen"])
        .current_dir("..")
        .output();

    match frontend_codegen_result {
        Ok(output) => {
            if output.status.success() {
                println!("Successfully ran frontend codegen command");
            } else {
                eprintln!("Frontend codegen failed with status: {}", output.status);
                eprintln!("stdout: {}", String::from_utf8_lossy(&output.stdout));
                eprintln!("stderr: {}", String::from_utf8_lossy(&output.stderr));
                std::process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("Failed to run frontend codegen command: {e}");
            eprintln!("Make sure to run 'pnpm install' in the desktop directory");
            std::process::exit(1);
        }
    }

    println!("Running prettier...");
    let prettier_result = Command::new("pnpm")
        .args(["prettier", "--write"])
        .current_dir("..")
        .output();

    match prettier_result {
        Ok(output) => {
            if output.status.success() {
                println!("Successfully formatted with prettier");
            } else {
                eprintln!("Prettier failed with status: {}", output.status);
                eprintln!("stdout: {}", String::from_utf8_lossy(&output.stdout));
                eprintln!("stderr: {}", String::from_utf8_lossy(&output.stderr));
                std::process::exit(1);
            }
        }
        Err(e) => {
            eprintln!("Failed to run prettier: {e}");
            eprintln!("Make sure to run 'pnpm install' in the desktop directory");
            std::process::exit(1);
        }
    }
}
