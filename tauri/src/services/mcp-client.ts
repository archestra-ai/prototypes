import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { 
  Tool,
  Resource
} from "@modelcontextprotocol/sdk/types.js";

export interface McpTool extends Tool {}
export interface McpResource extends Resource {}

export interface McpServerConfig {
  name: string;
  url: string;
  transport: 'http' | 'stdio' | 'websocket';
  headers?: Record<string, string>;
}

// Custom transport for communicating via Archestra MCP server proxy
class ArchestraProxyTransport implements Transport {
  private serverName: string;
  private archestraServerUrl: string;
  private pendingRequests: Map<string | number, (response: any) => void> = new Map();

  constructor(serverName: string, archestraServerUrl = 'http://localhost:54587') {
    this.serverName = serverName;
    this.archestraServerUrl = archestraServerUrl;
  }

  async start(): Promise<void> {
    // No persistent connection needed for HTTP proxy
  }

  async close(): Promise<void> {
    // No cleanup needed for HTTP proxy
    this.pendingRequests.clear();
  }

  async send(message: any): Promise<void> {
    // Send the message to the server and wait for response
    const response = await fetch(`${this.archestraServerUrl}/proxy/${this.serverName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message)
    });

    if (!response.ok) {
      const error = new Error(`HTTP error! status: ${response.status}`);
      if (this.onerror) {
        this.onerror(error);
      }
      throw error;
    }

    const data = await response.json();
    
    // Notify the client of the response
    if (this.onmessage) {
      this.onmessage(data);
    }
  }

  onmessage?: (message: any) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;
}

class ArchestraMcpClient {
  private clients: Map<string, Client> = new Map();
  private tools: Map<string, Tool[]> = new Map();
  private resources: Map<string, Resource[]> = new Map();
  private archestraServerUrl = 'http://localhost:54587';

  async connectToArchestraServer(serverName: string): Promise<void> {
    try {
      // Create a custom transport for the Archestra proxy
      const transport = new ArchestraProxyTransport(serverName, this.archestraServerUrl);
      
      // Create MCP client
      const client = new Client(
        {
          name: 'archestra-frontend',
          version: '1.0.0',
        },
        {
          capabilities: {}
        }
      );

      // Connect to the server
      await client.connect(transport);

      // Send initialized notification
      await transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      });

      // Discover tools
      const toolsResponse = await client.listTools();
      if (toolsResponse.tools) {
        this.tools.set(serverName, toolsResponse.tools);
      }

      // Discover resources
      try {
        const resourcesResponse = await client.listResources();
        if (resourcesResponse.resources) {
          this.resources.set(serverName, resourcesResponse.resources);
        }
      } catch (error) {
        // Resources might not be supported
        console.log(`Resources not supported by server ${serverName}`);
      }

      this.clients.set(serverName, client);
      console.log(`Connected to MCP server: ${serverName}`);
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverName}:`, error);
      throw error;
    }
  }

  async disconnectFromServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.close();
      this.clients.delete(serverName);
      this.tools.delete(serverName);
      this.resources.delete(serverName);
      console.log(`Disconnected from MCP server: ${serverName}`);
    }
  }

  getAllTools(): Array<[string, McpTool]> {
    const allTools: Array<[string, McpTool]> = [];
    
    for (const [serverName, tools] of this.tools.entries()) {
      for (const tool of tools) {
        allTools.push([serverName, tool]);
      }
    }
    
    return allTools;
  }

  getAllResources(): Array<[string, McpResource]> {
    const allResources: Array<[string, McpResource]> = [];
    
    for (const [serverName, resources] of this.resources.entries()) {
      for (const resource of resources) {
        allResources.push([serverName, resource]);
      }
    }
    
    return allResources;
  }

  async executeTool(
    serverName: string, 
    toolName: string, 
    args: any
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No connection to server: ${serverName}`);
    }

    try {
      const result = await client.callTool({
        name: toolName,
        arguments: args
      });
      
      return result.content;
    } catch (error) {
      console.error(`Failed to execute tool ${toolName} on server ${serverName}:`, error);
      throw error;
    }
  }

  async readResource(
    serverName: string,
    uri: string
  ): Promise<any> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No connection to server: ${serverName}`);
    }

    try {
      const result = await client.readResource({
        uri
      });
      
      return result;
    } catch (error) {
      console.error(`Failed to read resource ${uri} from server ${serverName}:`, error);
      throw error;
    }
  }

  getServerStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    
    for (const serverName of this.clients.keys()) {
      // Check if client exists (assumes connected if it does)
      status[serverName] = true;
    }
    
    return status;
  }

  isConnected(serverName: string): boolean {
    return this.clients.has(serverName);
  }

  async refreshServerTools(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (!client) {
      throw new Error(`No connection to server: ${serverName}`);
    }

    try {
      const toolsResponse = await client.listTools();
      if (toolsResponse.tools) {
        this.tools.set(serverName, toolsResponse.tools);
      }
    } catch (error) {
      console.error(`Failed to refresh tools for server ${serverName}:`, error);
      throw error;
    }
  }

  // Connect to all available MCP servers
  async connectToAllServers(serverNames: string[]): Promise<void> {
    const connectionPromises = serverNames.map(name => 
      this.connectToArchestraServer(name).catch(error => {
        console.error(`Failed to connect to ${name}:`, error);
      })
    );

    await Promise.all(connectionPromises);
  }
}

// Create singleton instance
export const mcpClient = new ArchestraMcpClient();
