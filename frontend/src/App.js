import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import WarscrollsPage from './pages/WarscrollsPage';
import './styles.css';

function Navbar() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <nav className="navbar">
      <span className="navbar-brand">⚔ <span>AoS</span> Warscrolls</span>
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
  if (loading) return null;

  return (
    <div className="app-layout">
      <Navbar />
      <Routes>
        <Route path="/login"    element={user ? <Navigate to="/warscrolls" /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/warscrolls" /> : <RegisterPage />} />
        <Route path="/warscrolls" element={
          <ProtectedRoute><WarscrollsPage /></ProtectedRoute>
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
