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

    // Run prettier to format the JSON file
    println!("Running prettier on openapi.json...");
    let prettier_result = Command::new("pnpm")
        .args(["prettier", "--write", "openapi.json"])
        .current_dir("..")
        .output();

    match prettier_result {
        Ok(output) => {
            if output.status.success() {
                println!("Successfully formatted openapi.json with prettier");
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
