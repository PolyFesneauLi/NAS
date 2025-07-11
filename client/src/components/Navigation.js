// special navigation for admin
import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Navigation = ({ isAuthenticated, user, onLogout }) => {
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <nav className="navbar">
        <div className="nav-brand">
          <Link to="/">NAS文件管理系统</Link>
        </div>
        <div className="nav-links">
          <Link to="/login" className={location.pathname === '/login' ? 'active' : ''}>
            登录
          </Link>
          <Link to="/register" className={location.pathname === '/register' ? 'active' : ''}>
            注册
          </Link>
        </div>
      </nav>
    );
  }

  return (
    <nav className="navbar">
      <div className="nav-brand">
        <Link to="/">NAS文件管理系统</Link>
      </div>
      <div className="nav-links">
        <Link to="/dashboard" className={location.pathname === '/dashboard' ? 'active' : ''}>
          文件管理
        </Link>
        {user && user.role === 'admin' && (
          <>
            <Link to="/messages" className={location.pathname === '/messages' ? 'active' : ''}>
              消息中心
            </Link>
            <Link to="/team" className={location.pathname === '/team' ? 'active' : ''}>
              团队成员
            </Link>
          </>
        )}
        <button onClick={onLogout} className="logout-button">
          注销
        </button>
      </div>
    </nav>
  );
};

export default Navigation; 