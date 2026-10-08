import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './shadcn.css';
import './shimmer.css';
import './styles.css';
import './workspace-polish.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
