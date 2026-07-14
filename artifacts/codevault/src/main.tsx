import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

// CodeVault is always dark — add the class at boot
document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')!).render(<App />);
