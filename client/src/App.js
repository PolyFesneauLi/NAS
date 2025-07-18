import React, { useState, useEffect, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { setAuthToken, getCurrentUser } from './services/api';
import AuthForm from './components/AuthForm';
import Dashboard from './components/Dashboard';
import Navbar from './components/Navbar';
import TeamMembers from './components/TeamMembers';
import './App.css';

// 全局上传状态管理
window.uploadState = {
  isUploading: false,
  isAdmin: false
};

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
          // 更新全局上传状态中的用户角色
          window.uploadState.isAdmin = userData?.role === 'admin';
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
      // 检查是否是admin用户且正在上传
      if (window.uploadState.isAdmin && window.uploadState.isUploading) {
        // 重置闲置计时器，不上传期间不显示idle弹窗
        lastActivity = Date.now();
        setIdleSeconds(0);
        setShowIdleModal(false);
        return;
      }
      
      const diff = Math.floor((Date.now() - lastActivity) / 1000);
      setIdleSeconds(diff);
      if (diff >= idleLimit) {
        setShowIdleModal(true);
        handleLogout();
      }
    }, 1000);
    
    return () => {
      events.forEach(evt => window.removeEventListener(evt, resetIdle));
      if (idleTimer.current) {
        clearInterval(idleTimer.current);
      }
    };
  }, [isAuthenticated, idleLimit]); // 添加idleLimit到依赖数组

  const handleLogin = (token, userData) => {
    localStorage.setItem('token', token);
    setAuthToken(token);
    setIsAuthenticated(true);
    setUser(userData);
    // 更新全局上传状态中的用户角色
    window.uploadState.isAdmin = userData?.role === 'admin';
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setAuthToken(null);
    setIsAuthenticated(false);
    setUser(null);
    // 重置全局上传状态
    window.uploadState.isAdmin = false;
    window.uploadState.isUploading = false;
  };

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <div className="App">
      <Navbar 
        isAuthenticated={isAuthenticated} 
        onLogout={handleLogout}
        user={user}
      />
      {showIdleModal && (
        <div className="idle-modal-overlay">
          <div className="idle-modal">
            <h3>您已{idleLimit}秒无操作</h3>
            <p>请重新登录</p>
            <button className="btn" onClick={() => setShowIdleModal(false)}>重新登录</button>
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
          <Route
            path="/team"
            element={
              isAuthenticated && user?.role === 'admin' ? (
                <TeamMembers />
              ) : (
                <Navigate to="/dashboard" />
              )
            }
          />
        </Routes>
      </div>
    </div>
  );
}

export default App;