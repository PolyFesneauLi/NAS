import React, { useState, useEffect, useCallback } from 'react';
import FileUpload from './FileUpload';
import FileList from './FileList';
import StorageMeter from './StorageMeter';
import { getCurrentUser } from '../services/api';
import { formatBytes } from '../utils';

const Dashboard = ({ user }) => {
  const [currentUser, setCurrentUser] = useState(() => {
    // 确保初始状态有完整的结构
    return user || { 
      username: '', 
      storageUsage: { used: 0, quota: 1024 } // 添加默认值
    };
  });
  
  const [loading, setLoading] = useState(!user);
  const [error, setError] = useState('');

  const fetchUser = useCallback(async () => {
    try {
      setLoading(true);
      const userData = await getCurrentUser();
      // 确保API返回的数据有完整的storageUsage结构
      const safeUserData = {
        ...userData,
        storageUsage: userData.storageUsage || { used: 0, quota: 1024 }
      };
      setCurrentUser(safeUserData);
      setError('');
    } catch (err) {
      setError('Failed to load user data');
      console.error('User data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 如果传入的user不完整，或者缺少storageUsage，则重新获取
    if (!user || !user.storageUsage) {
      fetchUser();
    } else {
      // 确保传入的用户数据有完整的结构
      setCurrentUser({
        ...user,
        storageUsage: user.storageUsage || { used: 0, quota: 1024 }
      });
      setLoading(false);
    }
  }, [user, fetchUser]);

  useEffect(() => {
    if (currentUser && currentUser.role) {
      console.log('当前用户角色:', currentUser.role);
    }
  }, [currentUser]);

  const handleUploadSuccess = () => {
    fetchUser();
  };

  const handleDeleteSuccess = () => {
    fetchUser();
  };

  if (loading) return <div className="loading">Loading user data...</div>;
  if (error) return <div className="error-message">{error}</div>;
  
  // 使用可选链操作符确保安全访问
  const storageUsed = currentUser?.storageUsage?.used || 0;
  const storageQuota = currentUser?.storageUsage?.quota || 1024;

  return (
    <div className="dashboard">
      <div className="user-info mb-6">
        <h2 className="text-xl font-semibold">
          Welcome, {currentUser?.username || 'User'}!
        </h2>
        {/* 只有 admin 用户显示空间百分比和进度条 */}
        {currentUser?.role === 'admin' && (
          <>
            {/* <div className="storage-percentage">
              已使用空间百分比: {currentUser?.storageUsage?.percentage || 0}%
            </div> */}
            <StorageMeter 
              used={storageUsed} 
              total={storageQuota} 
            />
          </>
        )}
      </div>
      
      {/* 只有 admin 用户显示上传组件 */}
      {console.log('FileUpload should render:', currentUser?.role)}
      {currentUser?.role === 'admin' && (
        <FileUpload onUploadSuccess={handleUploadSuccess} />
      )}
      {console.log('FileList userRole:', currentUser?.role)}
      <FileList userRole={currentUser?.role} onDeleteSuccess={handleDeleteSuccess} />
    </div>
  );
};

export default Dashboard;