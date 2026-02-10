import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './App.css'

// Intentionally NOT using StrictMode to avoid double-mounting webview elements
ReactDOM.createRoot(document.getElementById('root')).render(<App />)
