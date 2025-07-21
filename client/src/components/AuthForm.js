import React, { useState } from 'react';
import { login, register } from '../services/api';
import { useNavigate } from 'react-router-dom';

const AuthForm = ({ type, onSuccess }) => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [registrationStatus, setRegistrationStatus] = useState(null);
  const navigate = useNavigate();

  // 处理输入变化的模块函数
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    setError('');
  };

  // 处理表单提交
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (type === 'register' && formData.password !== formData.confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    try {
      setLoading(true);
      const submitData = {
        username: formData.username,
        password: formData.password
      };

      if (type === 'login') {
        const response = await login(submitData);
        onSuccess(response.token, response.user);
        navigate('/dashboard');
      } else {
        // 注册流程
        const response = await register(submitData);
        // console.log('注册响应:', response); // 添加调试日志

        if (response.user.status === 'pending') {
          // console.log('用户状态为pending，显示等待审核信息'); // 添加调试日志
          setRegistrationStatus('pending');
          // 清空表单
          setFormData({
            username: '',
            password: '',
            confirmPassword: ''
          });
        }
        else if (response.user.status === 'approved') {
          return (
            <div className="auth-form">
              <div className="registration-pending">
                <h2>最高管理员注册成功</h2>
                <p>请登录使用</p>
                <button onClick={() => navigate('/login')} className="btn">
                  返回登录
                </button>
              </div>
            </div>
          );
        }
      }
    } catch (err) {
      console.error('操作错误:', err); // 添加错误日志
      setError(err.response?.data?.error || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  // 如果是注册页面且状态为pending，显示等待审核信息
  if (type === 'register' && registrationStatus === 'pending') {
    // console.log('渲染等待审核界面'); // 添加调试日志
    return (
      <div className="auth-form">
        <div className="registration-pending">
          <h2>注册申请已提交</h2>
          <p>您的账号正在等待管理员审核，请耐心等待。</p>
          <p>审核通过后即可登录使用。</p>
          <button onClick={() => navigate('/login')} className="btn">
            返回登录
          </button>
        </div>
      </div>
    );
  }

  // 最高管理员注册成功
  // if (type === 'register' && formData.username === 'admin' && formData.password == formData.confirmPassword) {
  //   return (
  //     <div className="auth-form">
  //       <div className="registration-pending">
  //         <h2>最高管理员注册成功</h2>
  //         <p>请登录使用</p>
  //         <button onClick={() => navigate('/login')} className="btn">
  //           返回登录
  //         </button>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="auth-form">
      <h2>{type === 'login' ? '登录' : '注册'}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>用户名</label>
          <input
            type="text"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
          />
        </div>
        <div className="form-group">
          <label>密码</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            required
          />
        </div>
        {type === 'register' && (
          <div className="form-group">
            <label>确认密码</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>
        )}
        <button type="submit" disabled={loading}>
          {loading ? '处理中...' : type === 'login' ? '登录' : '注册'}
        </button>
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </form>
    </div>
  );
};

export default AuthForm;