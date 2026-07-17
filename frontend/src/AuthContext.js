import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [commanderName, setCommanderNameState] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('aos_token');
    const username = localStorage.getItem('aos_username');
    if (token && username) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser({ username, token });
      // Account-level Commander-name preference — server-side so it's the
      // same across every device, not just this browser.
      axios.get('/api/auth/me')
        .then(res => setCommanderNameState(res.data.commander_name ?? null))
        .catch(err => console.error('Failed to load commander name:', err));
    }
    setLoading(false);
  }, []);

  const setCommanderName = async (name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setCommanderNameState(trimmed); // optimistic
    try {
      await axios.put('/api/auth/commander-name', { commander_name: trimmed });
    } catch (err) {
      console.error('Failed to save commander name:', err);
    }
  };

  const login = async (login, password) => {
    const res = await axios.post('/api/auth/login', { login, password });
    const { token, username } = res.data;
    localStorage.setItem('aos_token', token);
    localStorage.setItem('aos_username', username);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser({ username, token });
    try {
      const me = await axios.get('/api/auth/me');
      setCommanderNameState(me.data.commander_name ?? null);
    } catch (err) {
      console.error('Failed to load commander name:', err);
    }
    return res.data;
  };

  const register = async (username, email, password) => {
    const res = await axios.post('/api/auth/register', { username, email, password });
    const { token } = res.data;
    localStorage.setItem('aos_token', token);
    localStorage.setItem('aos_username', username);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser({ username, token });
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('aos_token');
    localStorage.removeItem('aos_username');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setCommanderNameState(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading, commanderName, setCommanderName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
