import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/global.css';

// Dev only: darken the page behind the app so its 560px column has a visible edge.
// Never runs in a production build.
if (import.meta.env.DEV) document.body.classList.add('ct-dev');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
