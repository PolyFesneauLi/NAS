import React from 'react';
import { formatBytes } from '../utils';

const StorageMeter = ({ used = 0, total = 1024 * 1024 * 500 }) => {
  const percentage = Math.round((used / total) * 100);
  return (
    <div className="storage-meter">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontWeight: 600, color: '#2c3e50', fontSize: '16px' }}>
          存储空间使用情况
        </div>
        <div style={{ fontWeight: 600, color: '#667eea', fontSize: '14px' }}>
          {percentage}%
        </div>
      </div>
      
      <div className="meter-bar">
        <div 
          className="meter-fill" 
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '14px', color: '#666' }}>
        <span>已使用: {formatBytes(used)}</span>
        <span>总容量: {formatBytes(total)}</span>
      </div>
    </div>
  );
};

export default StorageMeter;