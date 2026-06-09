import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import axios from 'axios';

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await axios.post('/api/auth/reset-password', { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1 className="auth-title">⚔ Warscrolls</h1>
          <div className="error-msg">Invalid reset link. Please request a new one.</div>
          <p className="auth-switch"><Link to="/forgot-password">Request reset</Link></p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">⚔ Warscrolls</h1>
        <p className="auth-subtitle">Choose a new password</p>

        {done ? (
          <div className="auth-success">
            <p>Password updated successfully.</p>
            <p style={{ marginTop: '0.75rem' }}>
              <Link to="/login" className="btn-primary" style={{ display: 'inline-block' }}>
                Sign in
              </Link>
            </p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="error-msg">{error}</div>}
            <div className="form-group">
              <label>New password</label>
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
              />
            </div>
            <div className="form-group">
              <label>Confirm password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Updating…' : 'Set New Password'}
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/login">← Back to login</Link>
        </p>
      </div>
    </div>
  );
}
