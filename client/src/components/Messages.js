import React, { useState, useEffect } from 'react';
import { getPendingUsers, approveUser, rejectUser } from '../services/api';
import { formatDate } from '../utils';

const Messages = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 获取待审核用户列表
  const fetchPendingUsers = async () => {
    try {
      setLoading(true);
      const response = await getPendingUsers();
      setPendingUsers(response.users);
    } catch (err) {
      setError('获取待审核用户失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingUsers();
  }, []);

  // 处理审核
  const handleApproval = async (userId, isApproved) => {
    try {
      if (isApproved) {
        await approveUser(userId);
      } else {
        await rejectUser(userId);
      }
      // 刷新列表
      fetchPendingUsers();
    } catch (err) {
      setError(isApproved ? '审核通过失败' : '拒绝注册失败');
    }
  };

  if (loading) return <div>加载中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="messages-container">
      <h2>注册审核</h2>
      {pendingUsers.length === 0 ? (
        <p>暂无待审核的注册请求</p>
      ) : (
        <div className="requests-list">
          {pendingUsers.map(user => (
            <div key={user._id} className="request-item">
              <div className="user-info">
                <h3>{user.username}</h3>
                <p>注册时间：{formatDate(user.createdAt)}</p>
              </div>
              <div className="actions">
                <button
                  className="approve-btn"
                  onClick={() => handleApproval(user._id, true)}
                >
                  通过
                </button>
                <button
                  className="reject-btn"
                  onClick={() => handleApproval(user._id, false)}
                >
                  拒绝
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Messages; 