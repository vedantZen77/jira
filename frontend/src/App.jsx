import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import ProjectBoard from './pages/ProjectBoard';
import Projects from './pages/Projects';
import MyIssues from './pages/MyIssues';
import Settings from './pages/Settings';

// Simple protected route wrapper
const ProtectedRoute = ({ children }) => {
  const userInfo = localStorage.getItem('userInfo');
  if (!userInfo) {
    return <Login />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
        <Router>
          <div className="min-h-screen font-sans">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
              <Route path="/issues/me" element={<ProtectedRoute><MyIssues /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/project/:id" element={<ProtectedRoute><ProjectBoard /></ProtectedRoute>} />
              <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            </Routes>
          </div>
        </Router>
    </AuthProvider>
  );
}

export default App;
