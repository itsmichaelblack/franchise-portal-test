import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import FindACentre from './FindACentre.jsx'

const path = window.location.pathname;

function Root() {
  if (path === '/find-a-centre' || path === '/find-a-center') {
    return <FindACentre />;
  }
  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
