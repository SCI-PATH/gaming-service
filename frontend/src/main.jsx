/**
 * Browser entry. Mounts App, which gates the farm on login and layers
 * quizzes, the shop, Sage, and the research overlay on the Phaser canvas.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './scipath-brand-theme.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
