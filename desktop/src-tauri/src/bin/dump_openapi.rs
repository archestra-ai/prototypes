use archestra_ai_lib::openapi::ApiDoc;
use utoipa::OpenApi;
use std::fs;
use std::path::Path;

fn main() {
    let openapi = ApiDoc::openapi();
    let json = serde_json::to_string_pretty(&openapi).expect("Failed to serialize OpenAPI schema");
    let output_path = Path::new("../openapi.json");
    fs::write(output_path, json).expect("Failed to write OpenAPI schema to file");
    
    println!("OpenAPI schema written to openapi.json");
}
