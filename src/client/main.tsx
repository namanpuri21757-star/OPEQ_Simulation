import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './styles.css';
import './ui/ui.css';
import './team/team.css';
import './instructor/instructor.css';
import './instructor/cards.css';
import './projector/projector.css';

const root = document.getElementById('root');
if (!root) throw new Error('The page is missing its #root element.');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
