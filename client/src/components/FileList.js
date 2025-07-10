import React, { useState, useEffect } from 'react';
import { getUserFiles, downloadFile, deleteFile } from '../services/api';
import { formatBytes } from '../utils';



// 修复编码问题的工具函数
const fixEncoding = (str) => {
  try {
    // 处理常见的乱码情况
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str; // 如果解码失败返回原字符串
  }
};

const FileList = ({ userRole, onDeleteSuccess }) => {
  //debug
  console.log('FileList get userRole:', userRole);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const data = await getUserFiles();
        const filesArray = Array.isArray(data.files) ? data.files : [];
        setFiles(filesArray);
      } catch (err) {
        setError('Failed to load files');
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []);

  const handleDownload = async (id, filename) => {
    try {
      const response = await downloadFile(id);
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename); // 直接用原始文件名
      document.body.appendChild(link);
      link.click(); // 触发下载，浏览器会弹出另存为对话框
      link.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (err) {
      alert('下载失败: ' + (err.message || '未知错误'));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('确定要删除这个文件吗？')) {
      try {
        await deleteFile(id);
        setFiles(prevFiles => prevFiles.filter(file => file._id !== id));
        // 删除成功后通知父组件刷新空间数据
        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
      } catch (err) {
        alert('删除失败: ' + (err.message || '未知错误'));
      }
    }
  };

  if (loading) return <div className="loading">加载文件中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="file-list">
      <h3>您的文件</h3>
      {files.length === 0 ? (
        <p>暂无上传文件</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>文件名</th>
              <th>大小</th>
              <th>类型</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {files.map(file => (
              <tr key={file._id}>
                <td>{fixEncoding(file.originalName || file.filename)}</td>
                <td>{formatBytes(file.size)}</td>
                <td>{file.fileType || '普通文件'}</td>
                <td className="action-buttons">
                  <button 
                    className="download-btn"
                    onClick={() => handleDownload(file._id, file.originalName || file.filename)}
                  >
                    下载
                  </button>
                  {userRole === 'admin' && (
                    <button 
                      className="delete-btn"
                      onClick={() => handleDelete(file._id)}
                    >
                      删除
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default FileList;