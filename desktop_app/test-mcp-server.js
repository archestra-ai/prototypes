// Test if the MCP server is properly configured
// Run with: node test-mcp-server.js

async function testMCPServer() {
  const url = 'http://localhost:3001';
  
  console.log(`Testing MCP server at ${url}...`);
  
  // MCP uses JSON-RPC 2.0 protocol
  const request = {
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '1.0.0',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: 1
  };
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request)
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', response.headers);
    
    const text = await response.text();
    console.log('Response body:', text);
    
    if (response.ok) {
      try {
        const json = JSON.parse(text);
        console.log('Parsed response:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Could not parse as JSON');
      }
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testMCPServer();