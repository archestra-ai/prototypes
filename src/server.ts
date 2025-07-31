import express from 'express';
import cors from 'cors';
import { Server } from 'http';
import net from 'net';

const app = express();
let server: Server | null = null;

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174'],
  credentials: true
}));
app.use(express.json());

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express server!', timestamp: new Date().toISOString() });
});

app.get('/api/data', (req, res) => {
  res.json({ 
    users: [
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Smith' }
    ],
    status: 'ok'
  });
});

async function getAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(getAvailablePort(startPort + 1));
    });
  });
}

export async function startServer(): Promise<number> {
  const port = await getAvailablePort(3000);
  
  return new Promise((resolve, reject) => {
    server = app.listen(port, '127.0.0.1', () => {
      console.log(`Express server running at http://127.0.0.1:${port}`);
      resolve(port);
    });
    
    server.on('error', reject);
  });
}

export function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('Express server stopped');
        server = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}