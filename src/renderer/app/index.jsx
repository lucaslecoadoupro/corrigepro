import './fonts.css';
import './styles.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider, ToastProvider, useStore } from './store.jsx';
import { ConfirmProvider } from './ui.jsx';
import { Logo } from './icons.jsx';
import { App } from './App.jsx';

function Gate() {
  const { data } = useStore();
  if (!data) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <Logo size={56} />
        <div className="faint" style={{ fontSize: '.8rem' }}>Chargement…</div>
      </div>
    );
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <ToastProvider>
      <ConfirmProvider>
        <Gate />
      </ConfirmProvider>
    </ToastProvider>
  </StoreProvider>,
);
