import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import WarscrollsPage from './pages/WarscrollsPage';
import SimulacrumPage from './pages/SimulacrumPage';
import './styles.css';

const NAV_PAGES = [
  { label: 'Warscrolls',         path: '/warscrolls' },
  { label: 'Army Builder',       path: '/army-builder',    soon: true },
  { label: 'Simulacrum',         path: '/simulacrum' },
  { label: 'Spearhead',          path: '/spearhead',       soon: true },
  { label: 'Path to Glory',      path: '/path-to-glory',   soon: true },
  { label: 'Consult the Oracle', path: '/consult-oracle',  soon: true },
];

function Navbar({ headerCollapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const isWarscrolls = location.pathname === '/warscrolls' || location.pathname === '/simulacrum';
  if (!user) return null;
  return (
    <>
      <nav className="navbar">
        <span className="navbar-brand">
          {isWarscrolls && (
            <button className="collapse-toggle" onClick={onToggleCollapse} title={headerCollapsed ? 'Expand filters' : 'Collapse filters'}>
              {headerCollapsed ? '▶' : '▼'}
            </button>
          )}
          ⚔ <span>AoS</span> Warscrolls
          {isWarscrolls && headerCollapsed && <span id="navbar-extras" />}
        </span>
        <div className="navbar-nav">
          {NAV_PAGES.map(p => (
            <NavLink key={p.path} to={p.path} className={({ isActive }) => 'nav-link' + (p.soon ? ' nav-link-soon' : '') + (isActive ? ' nav-link-active' : '')}>
              {p.label}
            </NavLink>
          ))}
        </div>
        <div className="navbar-right">
          <button className="hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
            <span /><span /><span />
          </button>
          <span className="navbar-username">{user.username}</span>
          <button className="btn-logout" onClick={logout}>Sign Out</button>
        </div>
      </nav>
      {menuOpen && (
        <div className="mobile-menu">
          {NAV_PAGES.map(p => (
            <NavLink key={p.path} to={p.path} className={({ isActive }) => 'mobile-nav-link' + (p.soon ? ' nav-link-soon' : '') + (isActive ? ' nav-link-active' : '')}
              onClick={() => setMenuOpen(false)}>
              {p.label}
            </NavLink>
          ))}
          <button className="mobile-signout" onClick={() => { setMenuOpen(false); logout(); }}>Sign Out</button>
        </div>
      )}
    </>
  );
}

function ComingSoon({ title }) {
  return (
    <div className="coming-soon">
      <h2>{title}</h2>
      <p>Preparing for Ambush</p>
    </div>
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
        <Route path="/army-builder"  element={<ProtectedRoute><ComingSoon title="Army Builder" /></ProtectedRoute>} />
        <Route path="/simulacrum"    element={<ProtectedRoute><SimulacrumPage headerCollapsed={headerCollapsed} /></ProtectedRoute>} />
        <Route path="/spearhead"     element={<ProtectedRoute><ComingSoon title="Spearhead" /></ProtectedRoute>} />
        <Route path="/path-to-glory"  element={<ProtectedRoute><ComingSoon title="Path to Glory" /></ProtectedRoute>} />
        <Route path="/consult-oracle" element={<ProtectedRoute><ComingSoon title="Consult the Oracle" /></ProtectedRoute>} />
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
