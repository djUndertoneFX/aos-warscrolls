import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('aos_token');
    const username = localStorage.getItem('aos_username');
    if (token && username) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      setUser({ username, token });
    }
    setLoading(false);
  }, []);

  const login = async (login, password) => {
    const res = await axios.post('/api/auth/login', { login, password });
    const { token, username } = res.data;
    localStorage.setItem('aos_token', token);
    localStorage.setItem('aos_username', username);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser({ username, token });
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
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
