use std::env;
use std::path::PathBuf;
use std::process::Command;

#[derive(Debug, Clone)]
pub struct NodeInfo {
    pub node_path: Option<PathBuf>,
    pub npm_path: Option<PathBuf>,
    pub npx_path: Option<PathBuf>,
}

impl NodeInfo {
    pub fn is_available(&self) -> bool {
        self.node_path.is_some()
    }

    pub fn has_npx(&self) -> bool {
        self.npx_path.is_some()
    }
}

/// Detect Node.js installation on the system
pub fn detect_node_installation() -> NodeInfo {
    let mut info = NodeInfo {
        node_path: None,
        npm_path: None,
        npx_path: None,
    };

    // First check if commands are in PATH
    if let Some(path) = find_in_path("node") {
        info.node_path = Some(path);
    }
    if let Some(path) = find_in_path("npm") {
        info.npm_path = Some(path);
    }
    if let Some(path) = find_in_path("npx") {
        info.npx_path = Some(path);
    }

    // If not found in PATH, check common installation directories
    if info.node_path.is_none() {
        info.node_path = find_node_in_common_locations();
    }
    if info.npm_path.is_none() {
        info.npm_path = find_npm_in_common_locations();
    }
    if info.npx_path.is_none() {
        info.npx_path = find_npx_in_common_locations();
    }

    info
}

/// Find a command in PATH
fn find_in_path(command: &str) -> Option<PathBuf> {
    if let Ok(output) = Command::new("which").arg(command).output() {
        if output.status.success() {
            let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path_str.is_empty() {
                return Some(PathBuf::from(path_str));
            }
        }
    }

    // Fallback to Windows where command
    if cfg!(target_os = "windows") {
        if let Ok(output) = Command::new("where").arg(command).output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if let Some(first_line) = path_str.lines().next() {
                    return Some(PathBuf::from(first_line));
                }
            }
        }
    }

    None
}

/// Common locations where Node.js might be installed
fn get_common_node_locations() -> Vec<PathBuf> {
    let mut locations = vec![
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/usr/bin/node"),
        PathBuf::from("/opt/homebrew/bin/node"),
    ];

    // Add NVM paths
    if let Ok(home) = env::var("HOME") {
        let home_path = PathBuf::from(&home);

        // Check for .nvm directory
        let nvm_path = home_path.join(".nvm/versions/node");
        if nvm_path.exists() {
            // Look for the latest version
            if let Ok(entries) = std::fs::read_dir(&nvm_path) {
                for entry in entries.flatten() {
                    let version_path = entry.path().join("bin/node");
                    if version_path.exists() {
                        locations.push(version_path);
                    }
                }
            }
        }
    }

    // Windows locations
    if cfg!(target_os = "windows") {
        locations.extend(vec![
            PathBuf::from("C:\\Program Files\\nodejs\\node.exe"),
            PathBuf::from("C:\\Program Files (x86)\\nodejs\\node.exe"),
        ]);

        if let Ok(appdata) = env::var("APPDATA") {
            locations.push(PathBuf::from(&appdata).join("npm\\node.exe"));
        }
    }

    locations
}

/// Find Node.js in common installation locations
fn find_node_in_common_locations() -> Option<PathBuf> {
    for path in get_common_node_locations() {
        if path.exists() && path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Find npm in common installation locations
fn find_npm_in_common_locations() -> Option<PathBuf> {
    let locations = vec![
        PathBuf::from("/usr/local/bin/npm"),
        PathBuf::from("/usr/bin/npm"),
        PathBuf::from("/opt/homebrew/bin/npm"),
    ];

    for path in locations {
        if path.exists() && path.is_file() {
            return Some(path);
        }
    }

    // If we found node, npm is usually in the same directory
    if let Some(node_path) = find_node_in_common_locations() {
        if let Some(parent) = node_path.parent() {
            let npm_path = parent.join("npm");
            if npm_path.exists() {
                return Some(npm_path);
            }
        }
    }

    None
}

/// Find npx in common installation locations
fn find_npx_in_common_locations() -> Option<PathBuf> {
    let locations = vec![
        PathBuf::from("/usr/local/bin/npx"),
        PathBuf::from("/usr/bin/npx"),
        PathBuf::from("/opt/homebrew/bin/npx"),
    ];

    for path in locations {
        if path.exists() && path.is_file() {
            return Some(path);
        }
    }

    // If we found node, npx is usually in the same directory
    if let Some(node_path) = find_node_in_common_locations() {
        if let Some(parent) = node_path.parent() {
            let npx_path = parent.join("npx");
            if npx_path.exists() {
                return Some(npx_path);
            }
        }
    }

    None
}

/// Get the command to execute an npm package
pub fn get_npm_execution_command(
    package_name: &str,
    node_info: &NodeInfo,
) -> Result<(String, Vec<String>), String> {
    // First try npx if available
    if let Some(npx_path) = &node_info.npx_path {
        return Ok((
            npx_path.to_string_lossy().to_string(),
            vec![package_name.to_string()],
        ));
    }

    // If npx is not available but node is, we can try to run the package directly
    // if it's installed globally
    if let Some(node_path) = &node_info.node_path {
        // Check if the package is installed globally
        if let Some(npm_path) = &node_info.npm_path {
            let output = Command::new(npm_path)
                .args(&["list", "-g", package_name])
                .output();

            if let Ok(output) = output {
                if output.status.success() {
                    // Package is installed globally, try to find its binary
                    if let Some(global_bin) = find_global_npm_binary(package_name) {
                        return Ok((global_bin.to_string_lossy().to_string(), vec![]));
                    }
                }
            }
        }

        // As a last resort, try to use node to execute npx
        // This might work if npm is installed but npx wasn't found in our search
        return Ok((
            node_path.to_string_lossy().to_string(),
            vec![
                "-e".to_string(),
                format!(
                    "require('child_process').execFileSync('npx', ['{}'], {{stdio: 'inherit'}})",
                    package_name
                ),
            ],
        ));
    }

    Err("Neither npx nor node.js is available on the system".to_string())
}

/// Find a globally installed npm package binary
fn find_global_npm_binary(package_name: &str) -> Option<PathBuf> {
    // Common global npm binary locations
    let potential_paths = vec![
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/opt/homebrew/bin"),
    ];

    // Extract the binary name from the package name
    // e.g., "@org/package-name" -> "package-name"
    let binary_name = if package_name.contains('/') {
        package_name.split('/').last().unwrap_or(package_name)
    } else {
        package_name
    };

    for dir in potential_paths {
        let binary_path = dir.join(binary_name);
        if binary_path.exists() && binary_path.is_file() {
            return Some(binary_path);
        }
    }

    None
}

/// Check if we can execute npm packages
pub fn can_execute_npm_packages() -> bool {
    let node_info = detect_node_installation();
    node_info.has_npx() || node_info.is_available()
}

/// Get a user-friendly error message for missing Node.js
pub fn get_node_installation_instructions() -> String {
    let os = env::consts::OS;

    match os {
        "macos" => {
            "Node.js is not installed on your system. Please install it using one of these methods:\n\n\
             1. Using Homebrew: brew install node\n\
             2. Download from: https://nodejs.org/\n\
             3. Using MacPorts: sudo port install nodejs18".to_string()
        }
        "linux" => {
            "Node.js is not installed on your system. Please install it using your package manager:\n\n\
             Ubuntu/Debian: sudo apt-get install nodejs npm\n\
             Fedora: sudo dnf install nodejs npm\n\
             Arch: sudo pacman -S nodejs npm\n\
             Or download from: https://nodejs.org/".to_string()
        }
        "windows" => {
            "Node.js is not installed on your system. Please:\n\n\
             1. Download the installer from: https://nodejs.org/\n\
             2. Run the installer and follow the instructions\n\
             3. Restart this application after installation".to_string()
        }
        _ => {
            "Node.js is not installed on your system. Please download and install it from: https://nodejs.org/".to_string()
        }
    }
}

/// Generate a dynamic sandbox profile based on detected Node.js paths
pub fn generate_sandbox_profile(node_info: &NodeInfo, profile_type: &str) -> String {
    match profile_type {
        "permissive" => generate_permissive_sandbox_profile(node_info),
        "restrictive" => generate_restrictive_sandbox_profile(node_info),
        _ => {
            // Default to everything allowed
            "(version 1)\n(allow default)\n".to_string()
        }
    }
}

fn generate_permissive_sandbox_profile(node_info: &NodeInfo) -> String {
    let mut profile = String::from("(version 1)\n(deny default)\n\n");

    // Add Node.js paths if detected
    if let Some(node_path) = &node_info.node_path {
        profile.push_str(&format!(
            ";; Allow detected Node.js\n(allow process-exec (literal \"{}\"))\n",
            node_path.display()
        ));
    }
    if let Some(npm_path) = &node_info.npm_path {
        profile.push_str(&format!(
            "(allow process-exec (literal \"{}\"))\n",
            npm_path.display()
        ));
    }
    if let Some(npx_path) = &node_info.npx_path {
        profile.push_str(&format!(
            "(allow process-exec (literal \"{}\"))\n",
            npx_path.display()
        ));
    }

    // Add common Node.js paths as fallback
    profile.push_str("\n;; Common Node.js paths\n");
    profile.push_str("(allow process-exec (literal \"/usr/local/bin/node\"))\n");
    profile.push_str("(allow process-exec (literal \"/usr/local/bin/npm\"))\n");
    profile.push_str("(allow process-exec (literal \"/usr/local/bin/npx\"))\n");
    profile.push_str("(allow process-exec (literal \"/opt/homebrew/bin/node\"))\n");
    profile.push_str("(allow process-exec (literal \"/opt/homebrew/bin/npm\"))\n");
    profile.push_str("(allow process-exec (literal \"/opt/homebrew/bin/npx\"))\n");
    profile.push_str(
        "(allow process-exec (regex \"^/Users/.*/\\.nvm/versions/node/.*/bin/(node|npm|npx)\"))\n",
    );

    // Add file system permissions
    profile.push_str("\n;; File system access\n");
    profile.push_str("(allow file-read-data (regex \"^/Users/.*/\\.npm/\"))\n");
    profile.push_str("(allow file-read-data (regex \"^/Users/.*/\\.nvm/\"))\n");
    profile.push_str("(allow file-write-data (regex \"^/Users/.*/\\.npm/\"))\n");
    profile.push_str("(allow file-read-data (regex \"^/usr/local/lib/node_modules/\"))\n");
    profile.push_str("(allow file-read-data (regex \"^/opt/homebrew/lib/node_modules/\"))\n");

    // System libraries and network
    profile.push_str("\n;; System access\n");
    profile.push_str("(allow file-read-data (regex \"^/usr/lib/\"))\n");
    profile.push_str("(allow file-read-data (regex \"^/System/Library/\"))\n");
    profile.push_str("(allow file-read-data (regex \"^/tmp/\"))\n");
    profile.push_str("(allow file-write-data (regex \"^/tmp/\"))\n");
    profile.push_str("(allow network-outbound)\n");

    profile
}

fn generate_restrictive_sandbox_profile(node_info: &NodeInfo) -> String {
    // Similar to permissive but with more restrictions
    let mut profile = String::from("(version 1)\n(deny default)\n\n");

    // Only allow detected paths
    if let Some(node_path) = &node_info.node_path {
        profile.push_str(&format!(
            ";; Allow only detected Node.js\n(allow process-exec (literal \"{}\"))\n",
            node_path.display()
        ));
    }
    if let Some(npm_path) = &node_info.npm_path {
        profile.push_str(&format!(
            "(allow process-exec (literal \"{}\"))\n",
            npm_path.display()
        ));
    }
    if let Some(npx_path) = &node_info.npx_path {
        profile.push_str(&format!(
            "(allow process-exec (literal \"{}\"))\n",
            npx_path.display()
        ));
    }

    // Minimal file system access
    profile.push_str("\n;; Minimal file system access\n");
    profile.push_str("(allow file-read-data (regex \"^/Users/.*/\\.npm/\"))\n");
    profile.push_str("(allow file-write-data (regex \"^/tmp/\"))\n");
    profile.push_str("(allow network-outbound (remote ip \"registry.npmjs.org\"))\n");

    profile
}
