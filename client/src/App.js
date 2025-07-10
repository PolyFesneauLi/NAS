import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { setAuthToken, getCurrentUser } from './services/api';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [idleSeconds, setIdleSeconds] = useState(0);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const idleTimer = useRef(null);
  const idleLimit = 120; // 秒

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        setAuthToken(token);
        try {
          const userData = await getCurrentUser();
          setUser(userData);
          setIsAuthenticated(true);
        } catch (error) {
          console.error('Failed to load user:', error);
          localStorage.removeItem('token');
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // 闲置检测
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastActivity = Date.now();
    const resetIdle = () => {
      lastActivity = Date.now();
      setIdleSeconds(0);
      setShowIdleModal(false);
    };
    const events = ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'];
    events.forEach(evt => window.addEventListener(evt, resetIdle));
    idleTimer.current = setInterval(() => {
      const diff = Math.floor((Date.now() - lastActivity) / 1000);
      setIdleSeconds(diff);
      if (diff >= idleLimit) {
        setShowIdleModal(true);
        handleLogout();
      }
    }, 1000);
    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetIdle));
      clearInterval(idleTimer.current);
    };
  }, [isAuthenticated]);

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="App">
      <Navbar isAuthenticated={isAuthenticated} onLogout={handleLogout} />
      {showIdleModal && (
        <div className="idle-modal-overlay">
          <div className="idle-modal">
            <h3>您已{idleLimit}秒无操作</h3>
            <p>请重新登录</p>
            <button className="btn" onClick={() => setShowIdleModal(false)}>关闭</button>
          </div>
        </div>
      )}
      <div className="container">
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Dashboard user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/login"
            element={
              !isAuthenticated ? (
                <AuthForm type="login" onSuccess={handleLogin} />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="/register"
            element={
              !isAuthenticated ? (
                <AuthForm type="register" onSuccess={handleLogin} />
              ) : (
                <Navigate to="/" />
              )
            }
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                <Dashboard user={user} />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default App;