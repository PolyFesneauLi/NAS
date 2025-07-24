import React, { useState, useEffect } from 'react';
import { formatBytes } from '../utils';
import { getAdminStorageUsage } from '../services/api';

const StorageMeter = () => {
  const [storageData, setStorageData] = useState({
    totalUsedStorage: 0,
    totalQuota: 1024 * 1024 * 1024 * 500, // 默认500GB
    percentage: 0,
    adminCount: 0,
    adminUsers: []
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStorageData = async () => {
      try {
        setLoading(true);
        const data = await getAdminStorageUsage();
        setStorageData(data);
      } catch (err) {
        setError('获取存储信息失败: ' + (err.message || '未知错误'));
        console.error('获取存储信息失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStorageData();
  }, []);

  if (loading) {
    return (
      <div className="storage-meter">
        <div style={{ textAlign: 'center', padding: '20px' }}>
          加载存储信息中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="storage-meter">
        <div style={{ color: 'red', textAlign: 'center', padding: '20px' }}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="storage-meter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: '16px' }}>
          云空间使用情况 (共{storageData.adminCount}个管理员)
        </div>
        <div style={{ fontWeight: 600, color: '#667eea', fontSize: '14px' }}>
          {storageData.percentage}%
        </div>
      </div>
      
      <div className="meter-bar">
        <div 
          className="meter-fill" 
          style={{ width: `${storageData.percentage}%` }}
        ></div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '14px', color: '#666' }}>
        <span>已使用: {formatBytes(storageData.totalUsedStorage)}</span>
        <span>总容量: {formatBytes(storageData.totalQuota)}</span>
      </div>
      
      {/* 显示各个admin用户的使用情况 */}
      {/* {storageData.adminUsers.length > 0 && (
        <div style={{ marginTop: '16px', fontSize: '12px', color: '#888' }}>
          <div style={{ marginBottom: '8px', fontWeight: 600 }}>各管理员使用情况:</div>
          {storageData.adminUsers.map(user => (
            <div key={user.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>{user.username}:</span>
              <span>{formatBytes(user.usedStorage)}</span>
            </div>
          ))}
        </div>
      )} */}
    </div>
  );
};

export default StorageMeter;