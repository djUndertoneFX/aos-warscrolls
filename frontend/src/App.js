import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import WarscrollsPage from './pages/WarscrollsPage';
import './styles.css';

function Navbar({ headerCollapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <nav className="navbar">
      <span className="navbar-brand">
        <button className="collapse-toggle" onClick={onToggleCollapse} title={headerCollapsed ? 'Expand filters' : 'Collapse filters'}>
          {headerCollapsed ? '▶' : '▼'}
        </button>
        ⚔ <span>AoS</span> Warscrolls
      </span>
      {headerCollapsed && <span id="navbar-extras" />}
      <div className="navbar-right">
        <span className="navbar-username">{user.username}</span>
        <button className="btn-logout" onClick={logout}>Sign Out</button>
      </div>
    </nav>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const [headerCollapsed, setHeaderCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('aos-header-collapsed')) ?? false; } catch { return false; }
  });

  const toggleCollapsed = () => setHeaderCollapsed(v => {
    const next = !v;
    localStorage.setItem('aos-header-collapsed', JSON.stringify(next));
    return next;
  });

  if (loading) return null;

  return (
    <div className="app-layout">
      <Navbar headerCollapsed={headerCollapsed} onToggleCollapse={toggleCollapsed} />
      <Routes>
        <Route path="/login"            element={user ? <Navigate to="/warscrolls" /> : <LoginPage />} />
        <Route path="/register"         element={user ? <Navigate to="/warscrolls" /> : <RegisterPage />} />
        <Route path="/forgot-password"  element={user ? <Navigate to="/warscrolls" /> : <ForgotPasswordPage />} />
        <Route path="/reset-password"   element={<ResetPasswordPage />} />
        <Route path="/warscrolls" element={
          <ProtectedRoute><WarscrollsPage headerCollapsed={headerCollapsed} /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to={user ? "/warscrolls" : "/login"} />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
