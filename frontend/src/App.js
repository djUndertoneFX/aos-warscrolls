import React, { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { SettingsProvider, useSettings } from './SettingsContext';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import WarscrollsPage from './pages/WarscrollsPage';
import SimulacrumPage from './pages/SimulacrumPage';
import SpearheadPage from './pages/SpearheadPage';
import PathToGloryPage from './pages/PathToGloryPage';
import './styles.css';

const NAV_PAGES = [
  { label: 'Warscrolls',         path: '/warscrolls' },
  { label: 'Army Builder',       path: '/army-builder',    soon: true },
  { label: 'Simulacrum',         path: '/simulacrum' },
  { label: 'Spearhead',          path: '/spearhead' },
  { label: 'Path to Glory',      path: '/path-to-glory' },
  { label: 'Consult the Oracle', path: '/consult-oracle',  soon: true },
  { label: 'Comparitator',       path: '/comparitator',    soon: true },
];

const SAVE_OPTIONS  = ['-', 2, 3, 4, 5, 6];
const WARD_OPTIONS  = ['-', 4, 5, 6];

function SettingsPanel({ onClose }) {
  const {
    showFlavorText, presumedSave, presumedWard, roundingMode, includeSaveWardInADO,
    showBattleTraits, showBattleFormations, showHeroicTraits, showArtefacts, showSpellLore, showManifestationLore,
    linkPageSelections, useSpearheadAbilities,
    setSetting,
  } = useSettings();
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div className="settings-panel" ref={ref}>
      <div className="settings-panel-title">Display Settings</div>
      <label className="settings-cb-row">
        <input type="checkbox" checked={showFlavorText}
          onChange={e => setSetting('showFlavorText', e.target.checked)} />
        <span>Flavor Text</span>
      </label>
      <label className="settings-cb-row">
        <input type="checkbox" checked={linkPageSelections}
          onChange={e => setSetting('linkPageSelections', e.target.checked)} />
        <span>Link Page Selections</span>
      </label>
      <div className="settings-panel-title settings-panel-title--sub">Faction Info</div>
      {[
        ['showBattleTraits',      showBattleTraits,      'Battle Traits'],
        ['showBattleFormations',  showBattleFormations,  'Battle Formations'],
        ['showHeroicTraits',      showHeroicTraits,      'Heroic Traits'],
        ['showArtefacts',         showArtefacts,         'Artefacts of Power'],
        ['showSpellLore',         showSpellLore,         'Spell / Prayer Lore'],
        ['showManifestationLore', showManifestationLore, 'Manifestation Lore'],
      ].map(([key, val, label]) => (
        <label key={key} className="settings-cb-row">
          <input type="checkbox" checked={val} onChange={e => setSetting(key, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
      <div className="settings-panel-title settings-panel-title--sub">ADO Settings</div>
      <label className="settings-cb-row">
        <input type="checkbox" checked={includeSaveWardInADO}
          onChange={e => setSetting('includeSaveWardInADO', e.target.checked)} />
        <span>Include save/ward in ADO</span>
      </label>
      <div className="settings-field-row">
        <span className="settings-field-lbl">ADO Save</span>
        <select className="settings-select"
          value={presumedSave ?? '-'}
          onChange={e => setSetting('presumedSave', e.target.value === '-' ? null : parseInt(e.target.value, 10))}>
          {SAVE_OPTIONS.map(v => <option key={v} value={v}>{v === '-' ? '—' : `${v}+`}</option>)}
        </select>
      </div>
      <div className="settings-field-row">
        <span className="settings-field-lbl">ADO Ward</span>
        <select className="settings-select"
          value={presumedWard ?? '-'}
          onChange={e => setSetting('presumedWard', e.target.value === '-' ? null : parseInt(e.target.value, 10))}>
          {WARD_OPTIONS.map(v => <option key={v} value={v}>{v === '-' ? '—' : `${v}+`}</option>)}
        </select>
      </div>
      <div className="settings-panel-title settings-panel-title--sub">Spearhead</div>
      <label className="settings-cb-row">
        <input type="checkbox" checked={useSpearheadAbilities}
          onChange={e => setSetting('useSpearheadAbilities', e.target.checked)} />
        <span>PDF Scraped Spearhead Warscroll</span>
      </label>
      <div className="settings-field-row settings-field-row--col">
        <span className="settings-field-lbl">ADO Rounding</span>
        <label className="settings-radio-row" title="Each phase (hits, wounds, saves) rounds to a whole number before feeding the next. Mirrors how dice actually work at the table — discrete results, not fractions.">
          <input type="radio" name="roundingMode" value="discrete"
            checked={roundingMode === 'discrete'}
            onChange={() => setSetting('roundingMode', 'discrete')} />
          <span>Discrete <span className="settings-radio-sub">(per-step)</span></span>
        </label>
        <label className="settings-radio-row" title="Full calculation runs in floating-point, rounding only at the final result. Closest to the true statistical expected value — minimises rounding error.">
          <input type="radio" name="roundingMode" value="overall"
            checked={roundingMode === 'overall'}
            onChange={() => setSetting('roundingMode', 'overall')} />
          <span>Overall <span className="settings-radio-sub">(end only)</span></span>
        </label>
      </div>
    </div>
  );
}

function Navbar({ headerCollapsed, onToggleCollapse }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isWarscrolls = location.pathname === '/warscrolls' || location.pathname === '/simulacrum' || location.pathname === '/spearhead';
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
          <div className="settings-gear-wrap">
            <button
              className="btn-settings-gear"
              onClick={() => setSettingsOpen(o => !o)}
              title="Display Settings"
            >
              ⚙
            </button>
            {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
          </div>
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
        <Route path="/spearhead"     element={<ProtectedRoute><SpearheadPage headerCollapsed={headerCollapsed} /></ProtectedRoute>} />
        <Route path="/path-to-glory"  element={<ProtectedRoute><PathToGloryPage headerCollapsed={headerCollapsed} /></ProtectedRoute>} />
        <Route path="/consult-oracle" element={<ProtectedRoute><ComingSoon title="Consult the Oracle" /></ProtectedRoute>} />
        <Route path="/comparitator"   element={<ProtectedRoute><ComingSoon title="Comparitator" /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to={user ? "/warscrolls" : "/login"} />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  );
}
