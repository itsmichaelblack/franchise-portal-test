import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import FindACentre from './FindACentre.jsx'
import BookAssessment from './BookAssessment.jsx'

const path = window.location.pathname;

function Root() {
  console.log('PATH:', path);
  if (path === '/find-a-centre' || path === '/find-a-center') {
    console.log('RENDERING: FindACentre');
    return <FindACentre />;
  }
  if (path === '/book-assessment' || path === '/book') {
    console.log('RENDERING: BookAssessment');
    return <BookAssessment />;
  }
  console.log('RENDERING: App (Portal)');
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
