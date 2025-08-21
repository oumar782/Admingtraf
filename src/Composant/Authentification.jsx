import React, { useState, useEffect } from 'react';
import '../style/Authentification.css';
import Logo from '../assets/gt.webp';

// Composant Toast pour afficher les messages de notification
const AuthToast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`auth-toast auth-toast-${type}`}>
      <div className="auth-toast-message">{message}</div>
      <button className="auth-toast-close" onClick={onClose}>×</button>
    </div>
  );
};

const Authentification = ({ onLogin }) => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [redirectToDashboard, setRedirectToDashboard] = useState(false);

  // Fonction pour afficher les toasts
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
  };

  // Redirection vers le dashboard
  useEffect(() => {
    if (redirectToDashboard) {
      // Utilisation de window.location pour une redirection garantie
      window.location.href = '/dashboard';
    }
  }, [redirectToDashboard]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    // Effacer l'erreur du champ modifié
    if (errors[e.target.name]) {
      setErrors({
        ...errors,
        [e.target.name]: ''
      });
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.email) {
      newErrors.email = 'Email requis';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Format email invalide';
    }
    
    if (!formData.password) {
      newErrors.password = 'Mot de passe requis';
    } else if (formData.password.length < 6) {
      newErrors.password = 'Le mot de passe doit contenir au moins 6 caractères';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showToast('Veuillez corriger les erreurs du formulaire', 'error');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Utiliser l'endpoint de login de l'API
      const response = await fetch('https://gtrafplusbac.vercel.app/api/user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          mot_de_passe: formData.password
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur de connexion');
      }
      
      // Stocker les informations utilisateur
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('isAuthenticated', 'true');
      
      // Utiliser 'authToken' au lieu de 'token' pour la cohérence
      const authToken = data.token || Date.now().toString();
      localStorage.setItem('authToken', authToken);
      
      // Afficher le toast de succès
      showToast('Connexion réussie ! Redirection en cours...', 'success');
      
      // Appeler la fonction onLogin passée en prop
      if (onLogin) {
        onLogin(authToken);
      }
      
      // Déclencher la redirection
      setTimeout(() => {
        setRedirectToDashboard(true);
      }, 1500);
      
    } catch (error) {
      console.error('Erreur de connexion:', error);
      setErrors({ submit: error.message });
      showToast(error.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-container">
      {/* Affichage du toast */}
      {toast && (
        <AuthToast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      
      <div className="auth-page-card">
        <div className="auth-page-header">
          <div className="auth-page-logo-container">
            <img src={Logo} alt="G-TRAF+ Logo" className="auth-page-logo" />
            <h1>G-TRAF+</h1>
          </div>
          <p className="auth-page-description">
            Solutions pour les Guinéens en matière des travaux BTP et fournitures.
          </p>
        </div>

        <form className="auth-page-form" onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? 'auth-input-error' : ''}
              placeholder="Entrez votre email"
              disabled={isLoading}
            />
            {errors.email && <span className="auth-error-message">{errors.email}</span>}
          </div>

          <div className="auth-form-group">
            <label htmlFor="password">Mot de passe</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className={errors.password ? 'auth-input-error' : ''}
              placeholder="Entrez votre mot de passe"
              disabled={isLoading}
            />
            {errors.password && <span className="auth-error-message">{errors.password}</span>}
          </div>

          {errors.submit && <div className="auth-error-message auth-submit-error">{errors.submit}</div>}

          <button 
            type="submit" 
            className="auth-submit-btn"
            disabled={isLoading}
          >
            {isLoading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <div className="auth-page-footer">
          <p>© 2025 G-TRAF+. Tous droits réservés.</p>
        </div>
      </div>
    </div>
  );
};

export default Authentification;