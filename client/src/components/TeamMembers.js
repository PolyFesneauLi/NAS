import React, { useState, useEffect } from 'react';
import { getAllUsers, approveUser, deleteUser } from '../services/api';
import { formatDate } from '../utils';

const TeamMembers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await getAllUsers();
      setUsers(response.users);
    } catch (err) {
      setError('获取用户列表失败');
      console.error('获取用户列表错误:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApprove = async (userId) => {
    try {
      await approveUser(userId);
      // 刷新用户列表
      fetchUsers();
    } catch (err) {
      setError('审批操作失败');
      console.error('审批错误:', err);
    }
  };

  const handleReject = async (userId) => {
    try {
      await deleteUser(userId);
      // 刷新用户列表
      fetchUsers();
    } catch (err) {
      setError('拒绝操作失败');
      console.error('拒绝错误:', err);
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'approved':
        return '已加入';
      case 'pending':
        return '待批准';
      default:
        return status;
    }
  };

  if (loading) return <div className="loading">加载中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="team-members">
      <h2>团队成员</h2>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>用户名</th>
              <th>用户状态</th>
              <th>申请时间</th>
              <th>批准时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user._id}>
                <td>{user.username}</td>
                <td>
                  <span className={`status-badge ${user.status}`}>
                    {getStatusText(user.status)}
                  </span>
                </td>
                <td>{formatDate(user.createdAt)}</td>
                <td>{user.approvedAt ? formatDate(user.approvedAt) : '-'}</td>
                <td>
                  {user.status === 'pending' && (
                    <div className="action-buttons">
                      <button
                        className="reject-button"
                        onClick={() => handleReject(user._id)}
                      >
                        拒绝
                      </button>
                      <button
                        className="approve-button"
                        onClick={() => handleApprove(user._id)}
                      >
                        同意
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamMembers; 