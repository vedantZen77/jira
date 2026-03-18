import React, { createContext, useState, useEffect } from 'react';
import api from '../utils/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userInfo = localStorage.getItem('userInfo');
    if (userInfo) {
      setUser(JSON.parse(userInfo));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      setUser(response.data);
      localStorage.setItem('userInfo', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Login failed';
    }
  };

  const register = async (name, email, password, role) => {
    try {
      const response = await api.post('/auth/register', { name, email, password, role });
      setUser(response.data);
      localStorage.setItem('userInfo', JSON.stringify(response.data));
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Registration failed';
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('userInfo');
  };

  const updateProfile = async (updates) => {
    try {
      const response = await api.put('/auth/me', updates);
      const updated = {
        ...user,
        ...response.data,
      };
      setUser(updated);
      localStorage.setItem('userInfo', JSON.stringify(updated));
      return updated;
    } catch (error) {
      throw error.response?.data?.message || 'Profile update failed';
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await api.put('/auth/change-password', { currentPassword, newPassword });
      return response.data;
    } catch (error) {
      throw error.response?.data?.message || 'Password change failed';
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, updateProfile, changePassword, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
