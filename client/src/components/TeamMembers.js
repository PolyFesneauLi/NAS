import React, { useState, useEffect } from 'react';
import { getAllUsers, approveUser, deleteUser, changeUserRole, getCurrentUser } from '../services/api';
import { formatDate } from '../utils';

const TeamMembers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState(null);

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

  const fetchCurrentUser = async () => {
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
    } catch (err) {
      console.error('获取当前用户信息失败:', err);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
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

  const handleDelete = async (userId, username) => {
    if (window.confirm(`确定要删除用户 ${username} 吗？`)) {
      try {
        await deleteUser(userId);
        fetchUsers();
      } catch (err) {
        setError('删除用户失败');
        console.error('删除用户错误:', err);
      }
    }
  };

  const handleChangeRole = async (userId, username, currentRole) => {
    const newRole = currentRole === 'admin' ? 'normal' : 'admin';
    if (window.confirm(`确定要将用户 ${username} 的权限改为 ${newRole === 'admin' ? '管理员' : '普通用户'} 吗？`)) {
      try {
        await changeUserRole(userId, newRole);
        fetchUsers();
      } catch (err) {
        setError('修改权限失败');
        console.error('修改权限错误:', err);
      }
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

  const getRoleText = (role) => {
    return role === 'admin' ? '管理员' : '普通用户';
  };

  if (loading || !currentUser) return <div className="loading">加载中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="team-members">
      <div className="title-container">
        <h2>团队成员</h2>
      </div>
      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>用户名</th>
              <th style={{ textAlign: 'center' }}>用户状态</th>
              <th style={{ textAlign: 'center' }}>用户权限</th>
              <th style={{ textAlign: 'center' }}>申请时间</th>
              {/* <th>批准时间</th> */}
              <th style={{ textAlign: 'center' }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user._id}>
                <td style={{ textAlign: 'center' }}>{user.username}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`status-badge ${user.status}`}>
                    {getStatusText(user.status)}
                  </span>
                </td>
                <td style={{ textAlign: 'center' }}>{getRoleText(user.role)}</td>
                <td style={{ textAlign: 'center' }}>{formatDate(user.createdAt)}</td>
                {/* <td>{user.approvedAt ? formatDate(user.approvedAt) : '-'}</td> */}
                <td style={{ textAlign: 'center' }}>
                  {user.status === 'pending' ? (
                    <div className="action-buttons">
                      <button
                        className="reject-button"
                        onClick={() => handleReject(user._id)}
                      >
                        拒绝申请
                      </button>
                      <button
                        className="approve-button"
                        onClick={() => handleApprove(user._id)}
                      >
                        同意申请
                      </button>
                    </div>
                  ) : user.status === 'approved' && user.username !== currentUser.username && user.username !== 'admin' && (
                    <div className="action-buttons">
                      <button
                        className="delete-button"
                        onClick={() => handleDelete(user._id, user.username)}
                      >
                        删除用户
                      </button>
                      {user.role === 'normal' && (
                        <button
                          className="role-button"
                          onClick={() => handleChangeRole(user._id, user.username, user.role)}
                        >
                          提升权限
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style jsx="true">{`
        .team-members {
          padding: 0;
        }
        .title-container {
          background-color: white;
          width: 100%;
          height: 70px;
          padding: 15px 0;
          margin-bottom: -10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .title-container h2 {
          margin: 0;
          text-align: center;
          font-size: 1.5em;
          color: #333;
        }
        .table-container {
          padding: 0 20px;
          margin-top: 0;
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 auto;  /* 表格居中 */
        }
        th, td {
          padding: 12px;
          text-align: center;  /* 单元格内容居中 */
          border-bottom: 1px solid #ddd;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
          text-align: center;  /* 表头居中 */
        }
        .status-badge {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.9em;
          display: inline-block;  /* 确保徽章居中 */
        }
        .status-badge.approved {
          background-color: #e6f4ea;
          color: #1e7e34;
        }
        .status-badge.pending {
          background-color: #fff3e0;
          color: #f57c00;
        }
        .action-buttons {
          display: flex;
          gap: 8px;
          justify-content: center;  /* 按钮居中 */
        }
        .action-buttons button {
          padding: 6px 12px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: bold;
          transition: background-color 0.2s;
        }
        .delete-button {
          background-color: #ffeb3b;
          color: #000;
        }
        .delete-button:hover {
          background-color: #fdd835;
        }
        .role-button {
          background-color: #f44336;
          color: white;
        }
        .role-button:hover {
          background-color: #e53935;
        }
      `}</style>
    </div>
  );
};

export default TeamMembers; 