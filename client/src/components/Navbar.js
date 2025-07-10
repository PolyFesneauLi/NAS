import React from 'react';
import { Link } from 'react-router-dom';

const Navbar = ({ isAuthenticated, onLogout }) => {
  return (
    <nav className="navbar">
      <div className="container">
        <Link to="/" className="logo">NAS 系统</Link>
        <div className="nav-links">
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" style={{ fontWeight: 'bold' }}>仪表盘</Link>
              <button onClick={onLogout} style={{ fontWeight: 'bold' }}>登出</button>
            </>
          ) : (
            <>
              <Link to="/login" style={{ fontWeight: 'bold' }}>登陆</Link>
              <Link to="/register" style={{ fontWeight: 'bold' }}>注册</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;