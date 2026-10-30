import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../tokens.css';
import '../styles/base.css';
import '../styles/typography.css';
import { App } from './App.tsx';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
