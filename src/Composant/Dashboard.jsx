import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import '../style/Dashboard.css';

// Storage key
const STORAGE_KEY = 'gtraf_dashboard_v1';

// Initial data with examples
const initialData = {
  devis: [],
  reservations: [],
  portfolio: []
};

// Utility functions
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('fr-FR');
};

const formatDateTime = (date) => {
  return new Date(date).toLocaleString('fr-FR');
};

const downloadJSON = (filename, data) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

const downloadCSV = (filename, data) => {
  if (!data || data.length === 0) return;
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(header => {
      const value = row[header];
      return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
    }).join(','))
  ].join('\n');
  
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const calcCarPrice = (reservation) => {
  if (!reservation.startDate || !reservation.endDate || !reservation.startTime || !reservation.endTime) return 0;
  
  const start = new Date(`${reservation.startDate}T${reservation.startTime}`);
  const end = new Date(`${reservation.endDate}T${reservation.endTime}`);
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  
  let basePrice = 120; // Base price per day
  
  // Vehicle type pricing
  const vehiclePricing = {
    'Citadine': 80,
    'Berline': 120,
    'SUV/4x4': 180,
    'Utilitaire': 100,
    'Minibus': 200
  };
  
  basePrice = vehiclePricing[reservation.vehicleType] || 120;
  
  let totalPrice = basePrice * days;
  
  // Options pricing
  if (reservation.driver) totalPrice += 50 * days;
  if (reservation.unlimitedKm) totalPrice += 30 * days;
  if (reservation.insurances?.includes('Tous risques')) totalPrice += 25 * days;
  if (reservation.equipments?.length > 0) totalPrice += 10 * reservation.equipments.length * days;
  
  return totalPrice;
};

// Toast component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' ? '✓' : '✕'}
        </span>
        <span className="toast-message">{message}</span>
        <button className="toast-close" onClick={onClose}>×</button>
      </div>
    </div>
  );
};

// Confirm Dialog component
const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" role="dialog" aria-labelledby="confirm-title">
      <div className="modal-content confirm-dialog">
        <h3 id="confirm-title">{title}</h3>
        <p>{message}</p>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
};

// DataTable component
const DataTable = ({ columns, data, onEdit, onDelete, onView, searchTerm, sortField, sortDirection, onSort }) => {
  const sortedData = useMemo(() => {
    if (!sortField) return data;
    
    return [...data].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortField, sortDirection]);

  const filteredData = useMemo(() => {
    if (!searchTerm) return sortedData;
    
    return sortedData.filter(item =>
      Object.values(item).some(value =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [sortedData, searchTerm]);

  return (
    <div className="table-container">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map(column => (
              <th key={column.key} 
                  className={column.sortable ? 'sortable' : ''}
                  onClick={() => column.sortable && onSort(column.key)}>
                {column.label}
                {column.sortable && sortField === column.key && (
                  <span className="sort-indicator">
                    {sortDirection === 'asc' ? '↑' : '↓'}
                  </span>
                )}
              </th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredData.map((item, index) => (
            <tr key={index}>
              {columns.map(column => (
                <td key={column.key}>
                  {column.render ? column.render(item[column.key], item) : item[column.key]}
                </td>
              ))}
              <td className="actions-cell">
                {onView && (
                  <button className="btn-icon" onClick={() => onView(item)} aria-label="Voir">
                    👁️
                  </button>
                )}
                {onEdit && (
                  <button className="btn-icon" onClick={() => onEdit(item)} aria-label="Éditer">
                    ✏️
                  </button>
                )}
                {onDelete && (
                  <button className="btn-icon btn-danger-icon" onClick={() => onDelete(item)} aria-label="Supprimer">
                    🗑️
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {filteredData.length === 0 && (
        <div className="empty-state">
          <p>Aucune donnée trouvée</p>
        </div>
      )}
    </div>
  );
};

// Home Tab component
const HomeTab = ({ data, searchTerm, formatDate }) => {
  const [stats, setStats] = useState({
    devis: 0,
    reservations: 0,
    portfolio: 0,
    loading: true,
    error: null
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Récupérer les stats en parallèle
        const [devisRes, reservationsRes, portfolioRes] = await Promise.all([
          axios.get('http://localhost:5000/api/contact/count'),
          axios.get('http://localhost:5000/api/reservation/count'),
          axios.get('http://localhost:5000/api/portfolio/count')
        ]);

        setStats({
          devis: devisRes.data.count || 0,
          reservations: reservationsRes.data.count || 0,
          portfolio: portfolioRes.data.count || 0,
          loading: false,
          error: null
        });
      } catch (error) {
        console.error('Erreur lors de la récupération des stats:', error);
        setStats(prev => ({
          ...prev,
          loading: false,
          error: 'Erreur lors du chargement des statistiques'
        }));
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Total Devis',
      value: stats.loading ? '...' : stats.devis,
      icon: '📋',
      color: 'primary'
    },
    {
      title: 'Réservations',
      value: stats.loading ? '...' : stats.reservations,
      icon: '🚗',
      color: 'success'
    },
    {
      title: 'Projets Portfolio',
      value: stats.loading ? '...' : stats.portfolio,
      icon: '💼',
      color: 'info'
    }
  ];

  return (
    <div className="home-tab">
      {stats.error && (
        <div className="alert alert-danger">
          {stats.error}
        </div>
      )}
      
      <div className="stats-grid">
        {statCards.map((stat, index) => (
          <div key={index} className={`stat-card stat-${stat.color}`}>
            <div className="stat-icon">{stat.icon}</div>
            <div className="stat-content">
              <div className="stat-value">{stat.value}</div>
              <div className="stat-title">{stat.title}</div>
            </div>
          </div>
        ))}
      </div>

      <RecentActivity />
    </div>
  );
};


const RecentActivity = () => {
  const [data, setData] = useState({ devis: [], reservations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fonction de formatage de date
  const formatDate = (dateString) => {
    if (!dateString) return 'Date inconnue';
    try {
      return new Date(dateString).toLocaleString('fr-FR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (err) {
      console.error('Invalid date:', dateString);
      return 'Date invalide';
    }
  };

  // Récupérer les données
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const [devisRes, reservationsRes] = await Promise.all([
          fetch('http://localhost:5000/api/contact?limit=5&sortBy=date_creation&order=DESC'),
          fetch('http://localhost:5000/api/reservation?limit=5&sortBy=date_heure_depart&order=DESC')
        ]);

        if (!devisRes.ok) throw new Error('Échec du chargement des devis');
        if (!reservationsRes.ok) throw new Error('Échec du chargement des réservations');

        const devisData = await devisRes.json();
        const reservationsData = await reservationsRes.json();

        // Extraire les listes depuis .data ou utiliser directement
        const devisList = Array.isArray(devisData.data) ? devisData.data : devisData;
        const reservationsList = Array.isArray(reservationsData.data) ? reservationsData.data : reservationsData;

        setData({
          devis: devisList.slice(0, 3), // Garder les 3 plus récents
          reservations: reservationsList.slice(0, 3)
        });
      } catch (err) {
        console.error('Erreur dans RecentActivity:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div className="loading">Chargement de l'activité récente...</div>;
  if (error) return <div className="error">Erreur: {error}</div>;

  return (
    <div className="recent-activity">
      <h3>Activité récente</h3>
      <div className="activity-grid">
        
        {/* Dernières demandes de devis */}
        <div className="activity-card">
          <h4>Dernières demandes de devis</h4>
          <div className="activity-list">
            {data.devis.length > 0 ? (
              data.devis.map((devis, index) => (
                <div key={devis.id || index} className="activity-item">
                  <div className="activity-content">
                    <strong>{devis.nom || 'Nom inconnu'}</strong>
                    <span>{devis.project_type || 'Type de projet non spécifié'}</span>
                    {devis.budget && <small>Budget: {devis.budget}</small>}
                  </div>
                  <span className="activity-date">
                    {formatDate(devis.date_creation)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-message">Aucune demande de devis</p>
            )}
          </div>
        </div>

        {/* Dernières réservations */}
        <div className="activity-card">
          <h4>Dernières réservations</h4>
          <div className="activity-list">
            {data.reservations.length > 0 ? (
              data.reservations.map((reservation, index) => (
                <div key={reservation.id || index} className="activity-item">
                  <div className="activity-content">
                    <strong>{reservation.nom_client || 'Client inconnu'}</strong>
                    <span>{reservation.type_modele_voiture || 'Modèle non spécifié'}</span>
                    <p><span className="detail-label">Départ:</span> {formatDate(reservation.date_heure_depart)}</p>
                    <p><span className="detail-label">Retour:</span> {formatDate(reservation.date_heure_retour)}</p>
                    <p><span className="detail-label">Prise:</span> {reservation.lieu_prise_en_charge}</p>
                    <p><span className="detail-label">Retour:</span> {reservation.lieu_restitution}</p>
                    {reservation.options && reservation.options.length > 0 && (
                      <p><span className="detail-label">Options:</span> {reservation.options.join(', ')}</p>
                    )}
                    {reservation.commentaires && (
                      <p><span className="detail-label">Commentaire:</span> {reservation.commentaires}</p>
                    )}
                  </div>
                  <span className="activity-date">
                    {formatDate(reservation.date_heure_depart)}
                  </span>
                </div>
              ))
            ) : (
              <p className="empty-message">Aucune réservation</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const DevisTab = ({ showToast, modal, openModal, closeModal, searchTerm, sortConfig, handleSort, exportDevisCSV, setConfirmDialog }) => {
  const API_URL = 'http://localhost:5000/api/contact';

  const [data, setData] = useState({ devis: [] });
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    projectType: '',
    budget: '',
    message: ''
  });

  const [filters, setFilters] = useState({
    projectType: '',
    budget: ''
  });

  const projectTypes = [
    'Construction neuve', 'Rénovation complète', 'Extension/Agrandissement',
    'Aménagement commercial', 'Autre projet'
  ];

  const budgets = [
    'Moins de 100k€', '100k€ - 500k€', '500k€ - 1M€', '1M€ - 5M€', 'Plus de 5M€'
  ];

  // Charger tous les devis au montage
  useEffect(() => {
    fetchDevis();
  }, []);

  const fetchDevis = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}?sortBy=date_creation&order=DESC`);
      const result = await response.json();

      if (response.ok) {
        const mappedData = result.data.map(item => ({
          id: item.id.toString(),
          name: item.nom,
          email: item.email,
          phone: item.telephone,
          projectType: item.project_type,
          budget: item.budget,
          message: item.message,
          createdAt: item.date_creation
        }));
        setData({ devis: mappedData });
      } else {
        throw new Error(result.error || 'Échec du chargement des devis');
      }
    } catch (error) {
      console.error('Erreur lors du chargement des devis:', error);
      showToast('error', 'Impossible de charger les demandes de devis');
    } finally {
      setLoading(false);
    }
  };

  // Soumettre (créer ou modifier)
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.projectType || !formData.message) {
      showToast('error', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(formData.email)) {
      showToast('error', 'Email invalide');
      return;
    }

    const payload = {
      nom: formData.name.trim(),
      email: formData.email.trim(),
      telephone: formData.phone?.trim() || null,
      project_type: formData.projectType,
      budget: formData.budget || null,
      message: formData.message.trim()
    };

    try {
      let response;
      if (modal.data) {
        response = await fetch(`${API_URL}/${modal.data.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        response = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const result = await response.json();

      if (response.ok) {
        showToast('success', modal.data ? 'Devis modifié avec succès' : 'Demande de devis enregistrée');
        fetchDevis();
        setFormData({ name: '', email: '', phone: '', projectType: '', budget: '', message: '' });
        closeModal();
      } else {
        throw new Error(result.error || 'Échec de l\'enregistrement');
      }
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement:', error);
      showToast('error', error.message || 'Erreur réseau');
    }
  };

  const handleEdit = (devis) => {
    setFormData(devis);
    openModal('edit-devis', devis);
  };

  const handleView = (devis) => {
    setFormData(devis);
    openModal('view-devis', devis);
  };

  const handleDelete = (devis) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Supprimer le devis',
      message: `Êtes-vous sûr de vouloir supprimer le devis de ${devis.name} ?`,
      onConfirm: async () => {
        try {
          const response = await fetch(`${API_URL}/${devis.id}`, { method: 'DELETE' });
          const result = await response.json();

          if (response.ok) {
            showToast('success', 'Devis supprimé');
            fetchDevis();
          } else {
            throw new Error(result.error || 'Échec de la suppression');
          }
        } catch (error) {
          console.error('Erreur suppression:', error);
          showToast('error', error.message || 'Erreur réseau');
        } finally {
          setConfirmDialog({ isOpen: false });
        }
      },
      onCancel: () => setConfirmDialog({ isOpen: false })
    });
  };

  const filteredDevis = data.devis.filter(devis => {
    return (!filters.projectType || devis.projectType === filters.projectType) &&
           (!filters.budget || devis.budget === filters.budget);
  });

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString('fr-FR');
  };

  const columns = [
    { key: 'name', label: 'Nom', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'phone', label: 'Téléphone' },
    { key: 'projectType', label: 'Type', sortable: true },
    { key: 'budget', label: 'Budget', sortable: true },
    {
      key: 'message',
      label: 'Message',
      render: (value) => value.length > 50 ? value.substring(0, 50) + '...' : value
    },
    {
      key: 'createdAt',
      label: 'Date',
      sortable: true,
      render: (value) => formatDate(value)
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="action-buttons">
          <button className="btn btn-sm btn-view" onClick={() => handleView(row)} title="Voir">
            <i className="fa fa-eye"></i>
          </button>
          <button className="btn btn-sm btn-edit" onClick={() => handleEdit(row)} title="Modifier">
            <i className="fa fa-edit"></i>
          </button>
          <button className="btn btn-sm btn-delete" onClick={() => handleDelete(row)} title="Supprimer">
            <i className="fa fa-trash"></i>
          </button>
        </div>
      )
    }
  ];

  if (loading) {
    return <div className="loading">Chargement des demandes de devis...</div>;
  }

  return (
    <div className="devis-tab">
      <div className="tab-header">
        <h2>Demandes de Devis</h2>
        <button className="btn btn-primary" onClick={() => openModal('create-devis')}>
          <i className="fa fa-plus"></i> Nouvelle demande
        </button>
      </div>

      <div className="filters-bar">
        <select
          value={filters.projectType}
          onChange={(e) => setFilters(prev => ({ ...prev, projectType: e.target.value }))}
          className="form-select"
        >
          <option value="">Tous les types</option>
          {projectTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={filters.budget}
          onChange={(e) => setFilters(prev => ({ ...prev, budget: e.target.value }))}
          className="form-select"
        >
          <option value="">Tous les budgets</option>
          {budgets.map(budget => (
            <option key={budget} value={budget}>{budget}</option>
          ))}
        </select>

        <button className="btn btn-secondary" onClick={exportDevisCSV}>
          <i className="fa fa-download"></i> Exporter CSV
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filteredDevis}
        searchTerm={searchTerm}
        sortField={sortConfig.field}
        sortDirection={sortConfig.direction}
        onSort={handleSort}
      />

      {/* Modal création/modification */}
      {(modal.isOpen && (modal.type === 'create-devis' || modal.type === 'edit-devis')) && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>{modal.type === 'create-devis' ? 'Nouvelle demande' : 'Modifier la demande'}</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label htmlFor="name">Nom *</label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="phone">Téléphone</label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="projectType">Type de projet *</label>
                  <select
                    id="projectType"
                    value={formData.projectType}
                    onChange={(e) => setFormData(prev => ({ ...prev, projectType: e.target.value }))}
                    required
                  >
                    <option value="">Sélectionnez un type</option>
                    {projectTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="budget">Budget</label>
                  <select
                    id="budget"
                    value={formData.budget}
                    onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                  >
                    <option value="">Budget estimé</option>
                    {budgets.map(budget => (
                      <option key={budget} value={budget}>{budget}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label htmlFor="message">Message *</label>
                <textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Décrivez votre projet..."
                    rows="4"
                    required
                  />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {modal.type === 'create-devis' ? 'Enregistrer' : 'Modifier'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal visualisation */}
        {modal.isOpen && modal.type === 'view-devis' && (
          <div className="modal-overlay">
            <div className="modal-content">
              <h3>Détails du devis</h3>
              <div className="view-details">
                <div className="detail-row">
                  <span className="detail-label">Nom:</span>
                  <span className="detail-value">{formData.name}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Email:</span>
                  <span className="detail-value">{formData.email}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Téléphone:</span>
                  <span className="detail-value">{formData.phone || 'Non spécifié'}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Type de projet:</span>
                  <span className="detail-value">{formData.projectType}</span>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Budget:</span>
                  <span className="detail-value">{formData.budget || 'Non spécifié'}</span>
                </div>
                <div className="detail-row full-width">
                  <span className="detail-label">Message:</span>
                  <div className="detail-value message-content">{formData.message}</div>
                </div>
                <div className="detail-row">
                  <span className="detail-label">Date de création:</span>
                  <span className="detail-value">{new Date(formData.createdAt).toLocaleString('fr-FR')}</span>
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Reservations Tab component
  const ReservationsTab = ({
    showToast,
    modal,
    openModal,
    closeModal,
    searchTerm,
    sortConfig,
    handleSort,
    exportReservationsCSV,
    setConfirmDialog,
    calcCarPrice,
    formatDate
  }) => {
    const API_URL = 'http://localhost:5000/api/reservation';

    const [data, setData] = useState({ reservations: [] });
    const [loading, setLoading] = useState(true);

    const [formData, setFormData] = useState({
      name: '',
      email: '',
      phone: '',
      address: '',
      idNumber: '',
      vehicleType: '',
      model: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      pickupLocation: '',
      dropoffLocation: '',
      driver: false,
      unlimitedKm: false,
      insurances: [],
      equipments: [],
      paymentMethod: '',
      deposit: '',
      notes: ''
    });

    const [filters, setFilters] = useState({ vehicleType: '', paymentMethod: '' });
    const [viewReservation, setViewReservation] = useState(null);

    const vehicleTypes = ['Citadine', 'Berline', 'SUV/4x4', 'Utilitaire', 'Minibus'];
    const insuranceOptions = ['Tiers', 'Tous risques', 'Vol/Incendie'];
    const equipmentOptions = ['GPS', 'Siège bébé', 'Wi-Fi'];
    const paymentMethods = ['Espèces', 'Carte', 'Virement'];

    // Charger les réservations
    useEffect(() => {
      fetchReservations();
    }, []);

    const fetchReservations = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${API_URL}?sortBy=date_heure_depart&order=DESC`);
        const result = await response.json();

        if (response.ok) {
          const mapped = result.data.map(item => ({
            id: item.id.toString(),
            name: item.nom_client,
            email: item.email,
            phone: item.telephone,
            address: '', // non stocké dans API
            idNumber: '',
            vehicleType: item.type_modele_voiture,
            model: '',
            startDate: item.date_heure_depart?.split('T')[0] || '',
            startTime: item.date_heure_depart?.split('T')[1]?.substring(0, 5) || '',
            endDate: item.date_heure_retour?.split('T')[0] || '',
            endTime: item.date_heure_retour?.split('T')[1]?.substring(0, 5) || '',
            pickupLocation: item.lieu_prise_en_charge,
            dropoffLocation: item.lieu_restitution,
            driver: false,
            unlimitedKm: false,
            insurances: Array.isArray(item.options) ? item.options.filter(opt => ['Tiers', 'Tous risques', 'Vol/Incendie'].includes(opt)) : [],
            equipments: Array.isArray(item.options) ? item.options.filter(opt => equipmentOptions.includes(opt)) : [],
            paymentMethod: '',
            deposit: '',
            notes: item.commentaires || '',
            createdAt: item.date_heure_depart
          }));
          setData({ reservations: mapped });
        } else {
          throw new Error(result.error || 'Échec du chargement des réservations');
        }
      } catch (error) {
        console.error('Erreur chargement réservations:', error);
        showToast('error', 'Impossible de charger les réservations');
      } finally {
        setLoading(false);
      }
    };

    // Soumettre (créer ou modifier)
    const handleSubmit = async (e) => {
      e.preventDefault();

      const { name, email, phone, vehicleType, startDate, startTime, endDate, endTime, pickupLocation, dropoffLocation } = formData;
      if (!name || !email || !vehicleType || !startDate || !startTime || !endDate || !endTime || !pickupLocation || !dropoffLocation) {
        showToast('error', 'Veuillez remplir tous les champs obligatoires');
        return;
      }

      const startDateTime = new Date(`${startDate}T${startTime}`);
      const endDateTime = new Date(`${endDate}T${endTime}`);
      if (endDateTime <= startDateTime) {
        showToast('error', 'La date de fin doit être après la date de début');
        return;
      }

      // Fusionner toutes les options
      const allOptions = [
        ...formData.insurances,
        ...formData.equipments
      ];
      if (formData.driver) allOptions.push('Avec chauffeur');
      if (formData.unlimitedKm) allOptions.push('Kilométrage illimité');

      const payload = {
        nom_client: formData.name,
        email: formData.email,
        telephone: formData.phone || null,
        type_modele_voiture: formData.vehicleType,
        date_heure_depart: `${formData.startDate}T${formData.startTime}:00`,
        date_heure_retour: `${formData.endDate}T${formData.endTime}:00`,
        lieu_prise_en_charge: formData.pickupLocation,
        lieu_restitution: formData.dropoffLocation,
        options: allOptions,
        commentaires: formData.notes || null
      };

      try {
        let response;
        if (modal.data) {
          // Modification
          response = await fetch(`${API_URL}/${modal.data.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          // Création
          response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        const result = await response.json();

        if (response.ok) {
          showToast('success', modal.data ? 'Réservation modifiée' : 'Réservation enregistrée');
          fetchReservations(); // Recharger
          setFormData({
            name: '', email: '', phone: '', address: '', idNumber: '',
            vehicleType: '', model: '', startDate: '', startTime: '', endDate: '', endTime: '',
            pickupLocation: '', dropoffLocation: '',
            driver: false, unlimitedKm: false, insurances: [], equipments: [],
            paymentMethod: '', deposit: '', notes: ''
          });
          closeModal();
        } else {
          throw new Error(result.error || 'Échec de l\'enregistrement');
        }
      } catch (error) {
        console.error('Erreur soumission réservation:', error);
        showToast('error', error.message || 'Erreur réseau');
      }
    };

    const handleCheckboxChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: prev[field].includes(value)
          ? prev[field].filter(item => item !== value)
          : [...prev[field], value]
      }));
    };

    const handleEdit = (reservation) => {
      setFormData(reservation);
      openModal('edit-reservation', reservation);
    };

    const handleView = (reservation) => {
      setViewReservation(reservation);
      openModal('view-reservation', reservation);
    };

    const handleDelete = (reservation) => {
      setConfirmDialog({
        isOpen: true,
        title: 'Supprimer la réservation',
        message: `Supprimer la réservation de ${reservation.name} ?`,
        onConfirm: async () => {
          try {
            const response = await fetch(`${API_URL}/${reservation.id}`, { method: 'DELETE' });
            const result = await response.json();

            if (response.ok) {
              showToast('success', 'Réservation supprimée');
              fetchReservations();
            } else {
              throw new Error(result.error || 'Échec de la suppression');
            }
          } catch (error) {
            console.error('Erreur suppression:', error);
            showToast('error', error.message || 'Erreur réseau');
          } finally {
            setConfirmDialog({ isOpen: false });
          }
        },
        onCancel: () => setConfirmDialog({ isOpen: false })
      });
    };

    const filteredReservations = data.reservations.filter(reservation => {
      return (!filters.vehicleType || reservation.vehicleType === filters.vehicleType) &&
             (!filters.paymentMethod || reservation.paymentMethod === filters.paymentMethod);
    });

    const columns = [
      { key: 'name', label: 'Client', sortable: true },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Tel' },
      {
        key: 'vehicleType',
        label: 'Véhicule',
        sortable: true,
        render: (value, item) => `${value}${item.model ? ` (${item.model})` : ''}`
      },
      {
        key: 'startDate',
        label: 'Départ',
        sortable: true,
        render: (value, item) => `${formatDate(value)} ${item.startTime}`
      },
      {
        key: 'endDate',
        label: 'Retour',
        render: (value, item) => `${formatDate(value)} ${item.endTime}`
      },
      { key: 'pickupLocation', label: 'Prise' },
      { key: 'dropoffLocation', label: 'Retour' },
      {
        key: 'options',
        label: 'Options',
        render: (_, item) => {
          const options = [];
          if (item.driver) options.push('👨‍✈️');
          if (item.unlimitedKm) options.push('∞km');
          if (item.insurances?.length) options.push('🛡️');
          if (item.equipments?.length) options.push('🔧');
          return options.join(' ');
        }
      },
      {
        key: 'paymentMethod',
        label: 'Paiement',
        render: (value, item) => `${value}${item.deposit ? ` (${item.deposit}€)` : ''}`
      },
      {
        key: 'estimatedPrice',
        label: 'Prix estimé',
        render: (_, item) => `${calcCarPrice(item)}€`
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_, item) => (
          <div className="action-buttons">
            <button
              className="btn-icon view"
              onClick={() => handleView(item)}
              title="Voir les détails"
            >
              👁️
            </button>
            <button
              className="btn-icon edit"
              onClick={() => handleEdit(item)}
              title="Modifier"
            >
              ✏️
            </button>
            <button
              className="btn-icon delete"
              onClick={() => handleDelete(item)}
              title="Supprimer"
            >
              🗑️
            </button>
          </div>
        )
      }
    ];

    if (loading) return <div>Chargement des réservations...</div>;

    return (
      <div className="reservations-tab">
        <div className="tab-header">
          <h2>Réservations de Voiture</h2>
          <button className="btn btn-primary" onClick={() => openModal('create-reservation')}>
            Nouvelle réservation
          </button>
        </div>

        <div className="filters-bar">
          <select
            value={filters.vehicleType}
            onChange={(e) => setFilters(prev => ({ ...prev, vehicleType: e.target.value }))}
          >
            <option value="">Tous les véhicules</option>
            {vehicleTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>

          <select
            value={filters.paymentMethod}
            onChange={(e) => setFilters(prev => ({ ...prev, paymentMethod: e.target.value }))}
          >
            <option value="">Tous paiements</option>
            {paymentMethods.map(method => (
              <option key={method} value={method}>{method}</option>
            ))}
          </select>

          <button className="btn btn-secondary" onClick={exportReservationsCSV}>
            Exporter CSV
          </button>
        </div>

        <DataTable
          columns={columns}
          data={filteredReservations}
          searchTerm={searchTerm}
          sortField={sortConfig.field}
          sortDirection={sortConfig.direction}
          onSort={handleSort}
        />

        {/* Modal création/modification */}
        {modal.isOpen && (modal.type === 'create-reservation' || modal.type === 'edit-reservation') && (
          <div className="modal-overlay">
            <div className="modal-content modal-large">
              <h3>{modal.type === 'create-reservation' ? 'Nouvelle réservation' : 'Modifier réservation'}</h3>
              <form onSubmit={handleSubmit}>
                {/* Sections identiques à ton code existant */}
                {/* (Je les mets ici pour complétude) */}
                <div className="form-sections">
                  {/* Informations client */}
                  <section className="form-section">
                    <h4>Informations client</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="res-name">Nom *</label>
                        <input
                          id="res-name"
                          type="text"
                          value={formData.name}
                          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-email">Email *</label>
                        <input
                          id="res-email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-phone">Téléphone</label>
                        <input
                          id="res-phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-idNumber">N° Pièce/Passeport</label>
                        <input
                          id="res-idNumber"
                          type="text"
                          value={formData.idNumber}
                          onChange={(e) => setFormData(prev => ({ ...prev, idNumber: e.target.value }))}
                        />
                      </div>
                      <div className="form-group form-group-full">
                        <label htmlFor="res-address">Adresse</label>
                        <input
                          id="res-address"
                          type="text"
                          value={formData.address}
                          onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Détails réservation */}
                  <section className="form-section">
                    <h4>Détails de la réservation</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="res-vehicleType">Type de véhicule *</label>
                        <select
                          id="res-vehicleType"
                          value={formData.vehicleType}
                          onChange={(e) => setFormData(prev => ({ ...prev, vehicleType: e.target.value }))}
                          required
                        >
                          <option value="">Sélectionner</option>
                          {vehicleTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-model">Modèle souhaité</label>
                        <input
                          id="res-model"
                          type="text"
                          value={formData.model}
                          onChange={(e) => setFormData(prev => ({ ...prev, model: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-startDate">Date début *</label>
                        <input
                          id="res-startDate"
                          type="date"
                          value={formData.startDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-startTime">Heure début *</label>
                        <input
                          id="res-startTime"
                          type="time"
                          value={formData.startTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-endDate">Date fin *</label>
                        <input
                          id="res-endDate"
                          type="date"
                          value={formData.endDate}
                          onChange={(e) => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-endTime">Heure fin *</label>
                        <input
                          id="res-endTime"
                          type="time"
                          value={formData.endTime}
                          onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-pickup">Lieu de prise en charge *</label>
                        <input
                          id="res-pickup"
                          type="text"
                          value={formData.pickupLocation}
                          onChange={(e) => setFormData(prev => ({ ...prev, pickupLocation: e.target.value }))}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-dropoff">Lieu de restitution *</label>
                        <input
                          id="res-dropoff"
                          type="text"
                          value={formData.dropoffLocation}
                          onChange={(e) => setFormData(prev => ({ ...prev, dropoffLocation: e.target.value }))}
                          required
                        />
                      </div>
                    </div>
                  </section>

                  {/* Options */}
                  <section className="form-section">
                    <h4>Options</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label className="checkbox-group">
                          <input
                            type="checkbox"
                            checked={formData.driver}
                            onChange={(e) => setFormData(prev => ({ ...prev, driver: e.target.checked }))}
                          />
                          Avec chauffeur (+50€/jour)
                        </label>
                      </div>
                      <div className="form-group">
                        <label className="checkbox-group">
                          <input
                            type="checkbox"
                            checked={formData.unlimitedKm}
                            onChange={(e) => setFormData(prev => ({ ...prev, unlimitedKm: e.target.checked }))}
                          />
                          Kilométrage illimité (+30€/jour)
                        </label>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Assurances</label>
                      <div className="checkbox-list">
                        {insuranceOptions.map(insurance => (
                          <label key={insurance} className="checkbox-group">
                            <input
                              type="checkbox"
                              checked={formData.insurances.includes(insurance)}
                              onChange={() => handleCheckboxChange('insurances', insurance)}
                            />
                            {insurance}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Équipements</label>
                      <div className="checkbox-list">
                        {equipmentOptions.map(equipment => (
                          <label key={equipment} className="checkbox-group">
                            <input
                              type="checkbox"
                              checked={formData.equipments.includes(equipment)}
                              onChange={() => handleCheckboxChange('equipments', equipment)}
                            />
                            {equipment} (+10€/jour)
                          </label>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Paiement */}
                  <section className="form-section">
                    <h4>Paiement</h4>
                    <div className="form-grid">
                      <div className="form-group">
                        <label htmlFor="res-payment">Mode de paiement</label>
                        <select
                          id="res-payment"
                          value={formData.paymentMethod}
                          onChange={(e) => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}
                        >
                          <option value="">Sélectionner</option>
                          {paymentMethods.map(method => (
                            <option key={method} value={method}>{method}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="res-deposit">Acompte (€)</label>
                        <input
                          id="res-deposit"
                          type="number"
                          value={formData.deposit}
                          onChange={(e) => setFormData(prev => ({ ...prev, deposit: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="form-group">
                      <label htmlFor="res-notes">Notes</label>
                      <textarea
                        id="res-notes"
                        value={formData.notes}
                        onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                        rows="3"
                      />
                    </div>
                  </section>

                  {/* Prix estimé */}
                  {formData.vehicleType && formData.startDate && formData.endDate && (
                    <section className="form-section">
                      <div className="price-estimate">
                        <h4>Prix estimatif: {calcCarPrice(formData)}€</h4>
                      </div>
                    </section>
                  )}
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Annuler
                  </button>
                  <button type="submit" className="btn btn-primary">
                    {modal.type === 'create-reservation' ? 'Enregistrer' : 'Modifier'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal vue détaillée */}
        {modal.isOpen && modal.type === 'view-reservation' && (
          <div className="modal-overlay">
            <div className="modal-content modal-large">
              <h3>Détails de la réservation</h3>
              <div className="reservation-details">
                <div className="detail-section">
                  <h4>Informations client</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Nom:</span>
                      <span className="detail-value">{viewReservation?.name}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Email:</span>
                      <span className="detail-value">{viewReservation?.email}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Téléphone:</span>
                      <span className="detail-value">{viewReservation?.phone || 'Non renseigné'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">N° Pièce/Passeport:</span>
                      <span className="detail-value">{viewReservation?.idNumber || 'Non renseigné'}</span>
                    </div>
                    <div className="detail-item full-width">
                      <span className="detail-label">Adresse:</span>
                      <span className="detail-value">{viewReservation?.address || 'Non renseignée'}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Détails de la réservation</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Type de véhicule:</span>
                      <span className="detail-value">{viewReservation?.vehicleType}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Modèle:</span>
                      <span className="detail-value">{viewReservation?.model || 'Non spécifié'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Départ:</span>
                      <span className="detail-value">{viewReservation?.startDate} {viewReservation?.startTime}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Retour:</span>
                      <span className="detail-value">{viewReservation?.endDate} {viewReservation?.endTime}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Lieu de prise en charge:</span>
                      <span className="detail-value">{viewReservation?.pickupLocation}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Lieu de restitution:</span>
                      <span className="detail-value">{viewReservation?.dropoffLocation}</span>
                    </div>
                  </div>
                </div>

                <div className="detail-section">
                  <h4>Options sélectionnées</h4>
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Avec chauffeur:</span>
                      <span className="detail-value">{viewReservation?.driver ? 'Oui' : 'Non'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Kilométrage illimité:</span>
                      <span className="detail-value">{viewReservation?.unlimitedKm ? 'Oui' : 'Non'}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Assurances:</span>
                      <span className="detail-value">
                        {viewReservation?.insurances?.length > 0 ? viewReservation.insurances.join(', ') : 'Aucune'}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Équipements:</span>
                      <span className="detail-value">
                        {viewReservation?.equipments?.length > 0 ? viewReservation.equipments.join(', ') : 'Aucun'}
                      </span>
                    </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4>Paiement</h4>
                    <div className="detail-grid">
                      <div className="detail-item">
                        <span className="detail-label">Mode de paiement:</span>
                        <span className="detail-value">{viewReservation?.paymentMethod || 'Non spécifié'}</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Acompte:</span>
                        <span className="detail-value">{viewReservation?.deposit ? `${viewReservation.deposit}€` : 'Aucun'}</span>
                      </div>
                      <div className="detail-item full-width">
                        <span className="detail-label">Notes:</span>
                        <span className="detail-value">{viewReservation?.notes || 'Aucune note'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <h4>Prix estimatif: {calcCarPrice(viewReservation)}€</h4>
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Portfolio Tab component
    const PortfolioTab = ({
      showToast,
      modal,
      openModal,
      closeModal,
      searchTerm,
      sortConfig,
      handleSort,
      setConfirmDialog,
      data,
      saveData
    }) => {
      const [formData, setFormData] = useState({
        titre: '',
        categorie: '',
        localisation: '',
        budget: '',
        annee: '',
        image_principale: '',
        description: '',
        technologies: '',
        stats_surface: '',
        stats_duree: '',
        stats_equipe: '',
        gallery_images: []
      });
      const [filters, setFilters] = useState({ 
        categorie: ''
      });
      const [imagePreview, setImagePreview] = useState(null);
      const [galleryPreviews, setGalleryPreviews] = useState([]);

      const categories = [
        'Résidentiel', 'Commercial', 'Institutionnel', 'Industriel', 'Paysager'
      ];

      const handleEdit = (portfolio) => {
        setFormData({
          ...portfolio,
          gallery_images: Array.isArray(portfolio.gallery_images) ? portfolio.gallery_images : []
        });
        setImagePreview(portfolio.image_principale || null);
        setGalleryPreviews(Array.isArray(portfolio.gallery_images) ? portfolio.gallery_images : []);
        openModal('edit-portfolio', portfolio);
      };

      const handleView = (portfolio) => {
        setFormData({
          ...portfolio,
          gallery_images: Array.isArray(portfolio.gallery_images) ? portfolio.gallery_images : []
        });
        setImagePreview(portfolio.image_principale || null);
        setGalleryPreviews(Array.isArray(portfolio.gallery_images) ? portfolio.gallery_images : []);
        openModal('view-portfolio', portfolio);
      };

      const handleDelete = (portfolio) => {
        setConfirmDialog({
          isOpen: true,
          title: 'Supprimer le projet',
          message: `Êtes-vous sûr de vouloir supprimer le projet "${portfolio.titre}" ?`,
          onConfirm: () => {
            const updatedPortfolios = data.portfolio.filter(p => p.id !== portfolio.id);
            saveData({ ...data, portfolio: updatedPortfolios });
            showToast('success', 'Projet supprimé');
            setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null });
          },
          onCancel: () => setConfirmDialog({ isOpen: false, title: '', message: '', onConfirm: null, onCancel: null })
        });
      };

      // Gérer l'upload d'image (simulé)
      const handleImageUpload = (e, type) => {
        const file = e.target.files[0];
        if (!file) return;

        // Simuler l'upload en créant une URL locale
        const imageUrl = URL.createObjectURL(file);
        
        if (type === 'main') {
          setFormData(prev => ({ ...prev, image_principale: imageUrl }));
          setImagePreview(imageUrl);
        } else if (type === 'gallery') {
          setFormData(prev => ({ 
            ...prev, 
            gallery_images: [...prev.gallery_images, imageUrl]
          }));
          setGalleryPreviews(prev => [...prev, imageUrl]);
        }
      };

      // Gérer la soumission du formulaire
      const handleSubmit = (e) => {
        e.preventDefault();
        
        // Validation
        if (!formData.titre || !formData.categorie || !formData.description) {
          showToast('error', 'Veuillez remplir tous les champs obligatoires');
          return;
        }
        
        if (!formData.image_principale) {
          showToast('error', 'L\'image principale est obligatoire');
          return;
        }

        if (modal.type === 'edit-portfolio' && modal.data) {
          // Mode édition
          const updatedPortfolios = data.portfolio.map(p => 
            p.id === modal.data.id 
              ? { ...formData, id: modal.data.id, date_creation: modal.data.date_creation }
              : p
          );
          saveData({ ...data, portfolio: updatedPortfolios });
          showToast('success', 'Portfolio modifié avec succès');
        } else {
          // Mode création
          const newPortfolio = {
            ...formData,
            date_creation: new Date().toISOString(),
            id: Date.now().toString()
          };
          saveData({ ...data, portfolio: [...data.portfolio, newPortfolio] });
          showToast('success', 'Projet portfolio enregistré');
        }

        closeModal();
      };

      // Filtrer et trier les données
      const filteredPortfolios = data.portfolio.filter(portfolio => {
        const matchesSearch = searchTerm === '' || 
          portfolio.titre.toLowerCase().includes(searchTerm.toLowerCase()) ||
          portfolio.categorie.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (portfolio.localisation && portfolio.localisation.toLowerCase().includes(searchTerm.toLowerCase())) ||
          portfolio.description.toLowerCase().includes(searchTerm.toLowerCase());
        
        return matchesSearch && 
          (!filters.categorie || portfolio.categorie === filters.categorie);
      }).sort((a, b) => {
        if (a[sortConfig.field] < b[sortConfig.field]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.field] > b[sortConfig.field]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });

      // Colonnes du tableau
      const columns = [
        { 
          key: 'image_principale', 
          label: 'Image', 
          render: (value) => value ? (
            <img 
              src={value} 
              alt="Projet" 
              style={{ width: '80px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} 
            />
          ) : (
            <div style={{ 
              width: '80px', 
              height: '60px', 
              backgroundColor: '#f0f0f0', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              borderRadius: '4px'
            }}>
              <i className="fa fa-image" style={{ color: '#ccc' }}></i>
            </div>
          )
        },
        { key: 'titre', label: 'Titre', sortable: true },
        { key: 'categorie', label: 'Catégorie', sortable: true },
        { key: 'localisation', label: 'Localisation' },
        { key: 'budget', label: 'Budget', sortable: true },
        { key: 'annee', label: 'Année', sortable: true },
        {
      
       
          
        }
      ];

      return (
        <div className="portfolio-tab">
          <div className="tab-header">
            <h2>Gestion du Portfolio</h2>
            <button className="btn btn-primary" onClick={() => openModal('create-portfolio')}>
              <i className="fa fa-plus"></i> Nouveau projet
            </button>
          </div>

          <div className="filters-bar">
            <select 
              value={filters.categorie} 
              onChange={(e) => setFilters(prev => ({ ...prev, categorie: e.target.value }))}
              className="form-select"
            >
              <option value="">Toutes les catégories</option>
              {categories.map(categorie => (
                <option key={categorie} value={categorie}>{categorie}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Rechercher..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-select"
            />
          </div>

          <DataTable
            columns={columns}
            data={filteredPortfolios}
            searchTerm={searchTerm}
            sortField={sortConfig.field}
            sortDirection={sortConfig.direction}
            onSort={handleSort}
            onView={handleView}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />

          {/* Modal pour créer/modifier un portfolio */}
          {(modal.isOpen && (modal.type === 'create-portfolio' || modal.type === 'edit-portfolio')) && (
            <div className="modal-overlay">
              <div className="modal-content" style={{ maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto' }}>
                <h3>{modal.type === 'create-portfolio' ? 'Nouveau projet' : 'Modifier le projet'}</h3>
                <form onSubmit={handleSubmit}>
                  <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                    <div className="form-group">
                      <label htmlFor="titre">Titre *</label>
                      <input
                        id="titre"
                        type="text"
                        value={formData.titre}
                        onChange={(e) => setFormData(prev => ({ ...prev, titre: e.target.value }))}
                        required
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="categorie">Catégorie *</label>
                      <select
                        id="categorie"
                        value={formData.categorie}
                        onChange={(e) => setFormData(prev => ({ ...prev, categorie: e.target.value }))}
                        required
                      >
                        <option value="">Sélectionnez une catégorie</option>
                        {categories.map(categorie => (
                          <option key={categorie} value={categorie}>{categorie}</option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="localisation">Localisation</label>
                      <input
                        id="localisation"
                        type="text"
                        value={formData.localisation}
                        onChange={(e) => setFormData(prev => ({ ...prev, localisation: e.target.value }))}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="budget">Budget</label>
                      <input
                        id="budget"
                        type="text"
                        value={formData.budget}
                        onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))}
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="annee">Année</label>
                      <input
                        id="annee"
                        type="number"
                        value={formData.annee}
                        onChange={(e) => setFormData(prev => ({ ...prev, annee: e.target.value }))}
                        min="1900"
                        max="2100"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="stats_surface">Surface</label>
                      <input
                        id="stats_surface"
                        type="text"
                        value={formData.stats_surface}
                        onChange={(e) => setFormData(prev => ({ ...prev, stats_surface: e.target.value }))}
                        placeholder="ex: 120m²"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="stats_duree">Durée</label>
                      <input
                        id="stats_duree"
                        type="text"
                        value={formData.stats_duree}
                        onChange={(e) => setFormData(prev => ({ ...prev, stats_duree: e.target.value }))}
                        placeholder="ex: 6 mois"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="stats_equipe">Équipe</label>
                      <input
                        id="stats_equipe"
                        type="text"
                        value={formData.stats_equipe}
                        onChange={(e) => setFormData(prev => ({ ...prev, stats_equipe: e.target.value }))}
                        placeholder="ex: 5 personnes"
                      />
                    </div>
                    
                    <div className="form-group">
                      <label htmlFor="technologies">Technologies</label>
                      <input
                        id="technologies"
                        type="text"
                        value={formData.technologies}
                        onChange={(e) => setFormData(prev => ({ ...prev, technologies: e.target.value }))}
                        placeholder="Séparées par des virgules"
                      />
                    </div>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="image_principale">Image principale *</label>
                    <input
                      id="image_principale"
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'main')}
                    />
                    {imagePreview && (
                      <div style={{ marginTop: '10px' }}>
                        <img 
                          src={imagePreview} 
                          alt="Preview" 
                          style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px' }} 
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="gallery_images">Images de galerie</label>
                    <input
                      id="gallery_images"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleImageUpload(e, 'gallery')}
                    />
                    {galleryPreviews.length > 0 && (
                      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                        {galleryPreviews.map((preview, index) => (
                          <img 
                            key={index}
                            src={preview} 
                            alt={`Gallery preview ${index + 1}`} 
                            style={{ width: '100px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} 
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="description">Description *</label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Décrivez le projet..."
                      rows="4"
                      required
                    />
                  </div>

                  <div className="modal-actions">
                    <button type="button" className="btn btn-secondary" onClick={closeModal}>
                      Annuler
                    </button>
                    <button type="submit" className="btn btn-primary">
                      {modal.type === 'create-portfolio' ? 'Enregistrer' : 'Modifier'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Modal pour voir les détails d'un portfolio */}
          {modal.isOpen && modal.type === 'view-portfolio' && (
            <div className="modal-overlay">
              <div className="modal-content" style={{ maxWidth: '800px' }}>
                <h3>Détails du projet</h3>
                <div className="view-details">
                  <div className="detail-row">
                    <span className="detail-label">Titre:</span>
                    <span className="detail-value">{modal.data.titre}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Catégorie:</span>
                    <span className="detail-value">{modal.data.categorie}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Localisation:</span>
                    <span className="detail-value">{modal.data.localisation || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Budget:</span>
                    <span className="detail-value">{modal.data.budget || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Année:</span>
                    <span className="detail-value">{modal.data.annee || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Surface:</span>
                    <span className="detail-value">{modal.data.stats_surface || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Durée:</span>
                    <span className="detail-value">{modal.data.stats_duree || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Équipe:</span>
                    <span className="detail-value">{modal.data.stats_equipe || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Technologies:</span>
                    <span className="detail-value">{modal.data.technologies || 'Non spécifié'}</span>
                  </div>
                  <div className="detail-row full-width">
                    <span className="detail-label">Description:</span>
                    <div className="detail-value message-content">{modal.data.description}</div>
                  </div>
                  <div className="detail-row full-width">
                    <span className="detail-label">Image principale:</span>
                    <div className="detail-value">
                      {modal.data.image_principale ? (
                        <img 
                          src={modal.data.image_principale} 
                          alt="Projet" 
                          style={{ maxWidth: '100%', maxHeight: '300px', borderRadius: '4px' }} 
                        />
                      ) : (
                        <span>Aucune image</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-row full-width">
                    <span className="detail-label">Galerie d'images:</span>
                    <div className="detail-value">
                      {modal.data.gallery_images && modal.data.gallery_images.length > 0 ? (
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                          {modal.data.gallery_images.map((img, index) => (
                            <img 
                              key={index}
                              src={img} 
                              alt={`Galerie ${index + 1}`} 
                              style={{ width: '100px', height: '80px', objectFit: 'cover', borderRadius: '4px' }} 
                            />
                          ))}
                        </div>
                      ) : (
                        <span>Aucune image</span>
                      )}
                    </div>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">Date de création:</span>
                    <span className="detail-value">{new Date(modal.data.date_creation).toLocaleString()}</span>
                  </div>
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeModal}>
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
    };

    // Settings Tab component
    const SettingsTab = ({ exportGlobalJSON, handleFileImport, data, resetData }) => {
      return (
        <div className="settings-tab">
          <div className="tab-header">
            <h2>Paramètres</h2>
          </div>

          <div className="settings-sections">
            <section className="settings-section">
              <h3>Export / Import</h3>
              <div className="settings-actions">
                <button className="btn btn-secondary" onClick={exportGlobalJSON}>
                  Exporter toutes les données (JSON)
                </button>
                <div className="import-group">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileImport}
                    style={{ display: 'none' }}
                    id="global-import"
                  />
                  <label htmlFor="global-import" className="btn btn-secondary">
                    Importer des données (JSON)
                  </label>
                </div>
              </div>
            </section>

            <section className="settings-section">
              <h3>Données</h3>
              <div className="settings-stats">
                <div className="stat-item">
                  <span>Demandes de devis:</span>
                  <strong>{data.devis.length}</strong>
                </div>
                <div className="stat-item">
                  <span>Réservations:</span>
                  <strong>{data.reservations.length}</strong>
                </div>
                <div className="stat-item">
                  <span>Projets portfolio:</span>
                  <strong>{data.portfolio.length}</strong>
                </div>
              </div>
              <button className="btn btn-danger" onClick={resetData}>
                Réinitialiser toutes les données
              </button>
            </section>

            <section className="settings-section">
              <h3>Informations système</h3>
              <div className="system-info">
                <div className="info-item">
                  <span>Version:</span>
                  <strong>G-TRAF+ Admin v1.0</strong>
                </div>
                <div className="info-item">
                  <span>Stockage:</span>
                  <strong>Local Storage</strong>
                </div>
                <div className="info-item">
                  <span>Réponse garantie:</span>
                  <strong>24 heures</strong>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    };

    // Dashboard main component
    const Dashboard = () => {
      // State
      const [currentTab, setCurrentTab] = useState('accueil');
      const [data, setData] = useState(initialData);
      const [sidebarOpen, setSidebarOpen] = useState(true);
      const [searchTerm, setSearchTerm] = useState('');
      const [toast, setToast] = useState(null);
      const [confirmDialog, setConfirmDialog] = useState({ isOpen: false });
      const [modal, setModal] = useState({ isOpen: false, type: '', data: null });
      const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });

      // Load data from localStorage
      useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            setData(JSON.parse(saved));
          } catch (error) {
            console.error('Error loading data:', error);
            setToast({ type: 'error', message: 'Erreur lors du chargement des données' });
          }
        }
      }, []);

      // Save data to localStorage
      const saveData = (newData) => {
        setData(newData);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
      };

      // Toast management
      const showToast = (type, message) => {
        setToast({ type, message });
      };

      // Modal management
      const openModal = (type, data = null) => {
        setModal({ isOpen: true, type, data });
      };

      const closeModal = () => {
        setModal({ isOpen: false, type: '', data: null });
      };

      // Sorting
      const handleSort = (field) => {
        setSortConfig(prev => ({
          field,
          direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
      };

      // Export functions
      const exportGlobalJSON = () => {
        downloadJSON('gtraf-dashboard-complete', data);
        showToast('success', 'Export JSON global terminé');
      };

      const exportDevisCSV = () => {
        downloadCSV('devis', data.devis);
        showToast('success', 'Export CSV devis terminé');
      };

      const exportReservationsCSV = () => {
        downloadCSV('reservations', data.reservations);
        showToast('success', 'Export CSV réservations terminé');
      };

      // Import function
      const handleFileImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const importedData = JSON.parse(e.target.result);
            saveData({ ...data, ...importedData });
            showToast('success', 'Import réussi');
          } catch (error) {
            showToast('error', 'Erreur lors de l\'import');
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      };

      // Reset data
      const resetData = () => {
        setConfirmDialog({
          isOpen: true,
          title: 'Réinitialiser les données',
          message: 'Êtes-vous sûr de vouloir supprimer toutes les données ? Cette action est irréversible.',
          onConfirm: () => {
            saveData(initialData);
            showToast('success', 'Données réinitialisées');
            setConfirmDialog({ isOpen: false });
          },
          onCancel: () => setConfirmDialog({ isOpen: false })
        });
      };

      // Navigation tabs
      const tabs = [
        { id: 'accueil', label: 'Accueil', icon: '🏠' },
        { id: 'devis', label: 'Demande de Devis', icon: '📋' },
        { id: 'reservations', label: 'Réservations', icon: '🚗' },
        { id: 'portfolio', label: 'Portfolio', icon: '💼' },
        { id: 'parametres', label: 'Paramètres', icon: '⚙️' }
      ];

      // Render current tab content
      const renderTabContent = () => {
        switch (currentTab) {
          case 'accueil':
            return <HomeTab data={data} searchTerm={searchTerm} formatDate={formatDate} />;
          case 'devis':
            return (
              <DevisTab 
                data={data} 
                saveData={saveData} 
                showToast={showToast} 
                modal={modal} 
                openModal={openModal} 
                closeModal={closeModal} 
                searchTerm={searchTerm} 
                sortConfig={sortConfig} 
                handleSort={handleSort} 
                exportDevisCSV={exportDevisCSV}
                setConfirmDialog={setConfirmDialog}
              />
            );
          case 'reservations':
            return (
              <ReservationsTab 
                data={data} 
                saveData={saveData} 
                showToast={showToast} 
                modal={modal} 
                openModal={openModal} 
                closeModal={closeModal} 
                searchTerm={searchTerm} 
                sortConfig={sortConfig} 
                handleSort={handleSort} 
                exportReservationsCSV={exportReservationsCSV}
                setConfirmDialog={setConfirmDialog}
                calcCarPrice={calcCarPrice}
                formatDate={formatDate}
              />
            );
          case 'portfolio':
            return (
              <PortfolioTab 
                data={data}
                saveData={saveData}
                showToast={showToast} 
                modal={modal} 
                openModal={openModal} 
                closeModal={closeModal} 
                searchTerm={searchTerm} 
                sortConfig={sortConfig} 
                handleSort={handleSort}
                setConfirmDialog={setConfirmDialog}
              />
            );
          case 'parametres':
            return (
              <SettingsTab 
                exportGlobalJSON={exportGlobalJSON} 
                handleFileImport={handleFileImport} 
                data={data} 
                resetData={resetData}
              />
            );
          default:
            return <HomeTab data={data} searchTerm={searchTerm} formatDate={formatDate} />;
        }
      };

      return (
        <div className="dashboard">
          {/* Sidebar */}
          <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
            <div className="sidebar-header">
              <h1>G-TRAF+ Admin</h1>
              <button 
                className="sidebar-toggle"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                aria-label="Toggle sidebar"
              >
                ☰
              </button>
            </div>
            <nav className="sidebar-nav">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  className={`nav-item ${currentTab === tab.id ? 'active' : ''}`}
                  onClick={() => setCurrentTab(tab.id)}
                >
                  <span className="nav-icon">{tab.icon}</span>
                  <span className="nav-label">{tab.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          {/* Main Content */}
          <main className="main-content">
            {/* Header */}
            <header className="header">
              <div className="header-search">
                <input
                  type="text"
                  placeholder="Recherche globale..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="header-actions">
                <button className="btn btn-secondary" onClick={exportGlobalJSON}>
                  Exporter JSON global
                </button>
                <div className="badge">Réponse 24h</div>
                <div className="avatar">👤</div>
              </div>
            </header>

            {/* Content */}
            <div className="content">
              {renderTabContent()}
            </div>
          </main>

          {/* Toast */}
          {toast && (
            <Toast
              message={toast.message}
              type={toast.type}
              onClose={() => setToast(null)}
            />
          )}

          {/* Confirm Dialog */}
          <ConfirmDialog
            isOpen={confirmDialog.isOpen}
            title={confirmDialog.title}
            message={confirmDialog.message}
            onConfirm={confirmDialog.onConfirm}
            onCancel={confirmDialog.onCancel}
          />
        </div>
      );
    };

    export default Dashboard;