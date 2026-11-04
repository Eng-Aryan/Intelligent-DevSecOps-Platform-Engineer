import React from 'react'; import ReactDOM from 'react-dom/client'; import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth'; import App from './App'; import './index.css';
document.documentElement.dataset.theme = localStorage.getItem('theme') || 'dark';
ReactDOM.createRoot(document.getElementById('root')).render(<BrowserRouter><AuthProvider><App /></AuthProvider></BrowserRouter>);
