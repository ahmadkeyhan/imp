import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './sheet.css';
import Sheet from './Sheet.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sheet />
  </StrictMode>,
);
