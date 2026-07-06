import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ login: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.login, form.password);
      navigate('/warscrolls');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">⚔ Warscrolls</h1>
        <p className="auth-subtitle">Enter the Mortal Realms</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>Username or Email</label>
            <input
              type="text"
              placeholder="Your commander's name"
              value={form.login}
              onChange={e => setForm(f => ({ ...f, login: e.target.value }))}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
              required
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <div className="input-with-eye">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
              <button type="button" className="eye-toggle" onClick={() => setShowPassword(s => !s)} tabIndex={-1} title={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Entering...' : 'Enter the Realms'}
          </button>
        </form>

        <p className="auth-switch">
          No account? <Link to="/register">Forge your legend</Link>
        </p>
        <p className="auth-switch" style={{ marginTop: '0.4rem' }}>
          <Link to="/forgot-password">Forgot your password?</Link>
        </p>

        <div className="login-disclaimer">
          <p className="login-disclaimer-heading">For personal use only, of a single individual and their immediate gaming group.</p>
          <p>This website was created for an individual person, getting into the game&hellip; to better learn the units, see how they compare against one another and have a very fast, live digital reference at matches. And run some simulations to see how various units stack up against one another.</p>
          <p>Some friends and family have been invited, for beta and kleenex testing only.</p>
          <p>This website is not designed for profit nor public consumption.</p>
          <p>Please do not log in, if you have not been invited. If there are any issues legally or otherwise here, please contact us and we will lock the site down to avoid unintended usage.</p>
        </div>
      </div>
    </div>
  );
}
