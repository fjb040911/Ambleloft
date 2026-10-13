import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {ConfirmationProvider} from './Confirmation';
import './shadcn.css';
import './shimmer.css';
import './styles.css';
import './workspace-polish.css';
import './windows-layout.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><ConfirmationProvider><App /></ConfirmationProvider></React.StrictMode>);
