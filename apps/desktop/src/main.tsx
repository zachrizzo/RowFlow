import React from 'react';
import ReactDOM from 'react-dom/client';
import { loader } from '@monaco-editor/react';
import App from './App';
import './index.css';

// Configure Monaco Editor to use CDN workers for production builds
// This ensures workers load correctly in Tauri production builds
// Using jsDelivr CDN which provides reliable access to Monaco Editor files
// Version 0.54.0 matches the bundled monaco-editor version
loader.config({ 
  paths: { 
    vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.54.0/min/vs' 
  } 
});

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
