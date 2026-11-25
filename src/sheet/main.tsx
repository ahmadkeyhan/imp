import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './sheet.css';
import Sheet from './Sheet.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sheet />
  </StrictMode>,
);
