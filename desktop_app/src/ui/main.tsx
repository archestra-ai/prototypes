import React from 'react';
import ReactDOM from 'react-dom/client';

import websocketService from '@ui/lib/websocket';

import App from './App';

import './index.css';

/**
 * Open a single websocket connection to WebSocket server when the app is loaded
 */
websocketService.connect().catch(console.error);

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
