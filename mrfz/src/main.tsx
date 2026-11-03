import { createRoot } from 'react-dom/client';
import { App } from './client/App';
import './client/ui.css';

const container = document.getElementById('root');
if (!container) throw new Error('找不到 #root 挂载点。');
createRoot(container).render(<App />);
