import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from '../src/Composant/Dashboard';
import Authentification from '../src/Composant/Authentification';

function App() {
  return (
    <Router>
      <Routes>
        {/* Redirection vers la page de connexion par défaut */}
        <Route path="/" element={<Navigate to="/connexion" replace />} />
        
        {/* Route de connexion avec son composant */}
        <Route path="/connexion" element={<Authentification />} />
        
        {/* Route pour le dashboard */}
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </Router>
  );
}

export default App;