import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './config/index.js';
import { buildApp } from './app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function start() {
  // Validate configuration
  validateConfig();

  // Build the Fastify app
  const app = await buildApp();

  try {
    let serverOptions = {
      port: config.server.port,
      host: config.server.host,
    };

    // Check if we should use HTTPS
    if (config.server.useHttps) {
      const certPath = path.join(__dirname, '..', 'localhost.pem');
      const keyPath = path.join(__dirname, '..', 'localhost-key.pem');
      
      // Check for mkcert certificates
      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        serverOptions = {
          ...serverOptions,
          https: {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          },
        };
        
        console.log('🔒 HTTPS enabled with local certificates');
      } else {
        console.warn('⚠️  HTTPS certificates not found. To enable HTTPS:');
        console.warn('   1. Install mkcert: brew install mkcert');
        console.warn('   2. Install CA: mkcert -install');
        console.warn('   3. Generate certs: mkcert localhost');
        console.warn('   Falling back to HTTP...\n');
      }
    }

    // Start the server
    await app.listen(serverOptions);
    
    const protocol = serverOptions.https ? 'https' : 'http';
    const baseUrl = `${protocol}://localhost:${config.server.port}`;
    
    console.log('\n🚀 OAuth Proxy Server is running');
    console.log(`📍 ${baseUrl}`);
    console.log(`📍 Health check: ${baseUrl}/health`);
    console.log(`📍 API docs: ${baseUrl}/`);
    
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start the server
start();