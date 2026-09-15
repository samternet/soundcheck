import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Fonts are bundled with the app rather than loaded from Google Fonts, so a
// visitor's browser never contacts a third party just to render the page.
// Each file covers every script subset; browsers download only the ranges a
// page actually uses (Noto Sans supplies Cyrillic, Greek and more for song titles).
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/dm-sans/800.css'
import '@fontsource/noto-sans/400.css'
import '@fontsource/noto-sans/500.css'
import '@fontsource/noto-sans/600.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
