import React, { useState, useEffect, useRef } from 'react';
import FileUpload from './FileUpload';
import FileList from './FileList';
import StorageMeter from './StorageMeter';
import { getCurrentUser } from '../services/api';
import { formatBytes } from '../utils';

const Dashboard = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const fileListRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await getCurrentUser();
        setCurrentUser(response);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleUploadSuccess = () => {
    // Refresh both user data and file list
    getCurrentUser().then(setCurrentUser);
    fileListRef.current?.refresh();
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="dashboard">
      <div className="user-info mb-6">
        <h2 className="text-xl font-semibold">
          欢迎使用, {currentUser?.username || 'User'}!
        </h2>
        {isAdmin && (
          <div className="storage-info">
            <StorageMeter 
              used={currentUser?.storageUsage?.used || 0}
              total={currentUser?.storageUsage?.quota || 0}
              percentage={currentUser?.storageUsage?.percentage || 0}
            />
          </div>
        )}
      </div>
      
      {/* 文件上传和列表组件 */}
      <div className="file-management">
        {/* 只有管理员可以看到上传组件 */}
        {isAdmin && (
          <FileUpload 
            onUploadSuccess={handleUploadSuccess}
          />
        )}
        <FileList 
          ref={fileListRef}
          userRole={currentUser?.role}
          onDeleteSuccess={() => {
            getCurrentUser().then(setCurrentUser);
            fileListRef.current?.refresh();
          }}
        />
      </div>
    </div>
  );
};

export default Dashboard;