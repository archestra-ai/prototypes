import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './App';

import './index.css';

console.log('👋 This message is being logged by "renderer.ts", included via Vite');

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
