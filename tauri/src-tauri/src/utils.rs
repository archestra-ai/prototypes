pub fn get_free_port() -> Result<u16, String> {
    Ok(std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind to port: {}", e))?
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port())
}
