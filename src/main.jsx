import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';
import '@/index.css';
import { applyStoredTextSize } from '@/lib/textSize';

applyStoredTextSize();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
