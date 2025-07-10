import React, { useState, useEffect } from 'react';
import { getUserFiles, downloadFile, deleteFile, batchDeleteFiles } from '../services/api';
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

// 获取文件扩展名的函数
const getFileExtension = (filename) => {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
};

// 字符比较函数 - 字母/数字/符号 < 汉字
const compareChar = (charA, charB) => {
  // 检查是否为汉字（Unicode范围：\u4e00-\u9fff）
  const isChineseA = /[\u4e00-\u9fff]/.test(charA);
  const isChineseB = /[\u4e00-\u9fff]/.test(charB);
  
  // 如果都是汉字，按拼音排序
  if (isChineseA && isChineseB) {
    return charA.localeCompare(charB, 'zh-CN');
  }
  
  // 如果一个是汉字，一个是字母/数字/符号，字母排在前面
  if (isChineseA && !isChineseB) {
    return 1; // 汉字排在字母后面
  }
  if (!isChineseA && isChineseB) {
    return -1; // 字母排在汉字前面
  }
  
  // 都是字母/数字/符号，直接比较ASCII码     //important
  return charA.charCodeAt(0) - charB.charCodeAt(0);
  // bad logic
  // return charA.localeCompare(charB);

};

// 逐字符比较排序函数
const charByCharSort = (a, b) => {
  const lenA = a.length;
  const lenB = b.length;
  const maxLen = Math.max(lenA, lenB);
  
  for (let i = 0; i < maxLen; i++) {
    const charA = i < lenA ? a[i] : '';
    const charB = i < lenB ? b[i] : '';
    
    if (charA !== charB) {
      return compareChar(charA, charB);
    }
  }
  
  // 如果前面都相等，长度短的排在前面
  return lenA - lenB;
};

// 文件名排序函数（逐字符比较）
const sortFilesByName = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    // 使用原始文件名进行排序
    const nameA = a.originalName || a.filename;
    const nameB = b.originalName || b.filename;
    
    // 使用逐字符比较排序
    const result = charByCharSort(nameA, nameB);
    return ascending ? result : -result;
  });
};

// 按扩展名排序函数
const sortFilesByExtension = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    const extA = getFileExtension(a.originalName || a.filename);
    const extB = getFileExtension(b.originalName || b.filename);
    
    if (extA === extB) {
      // 扩展名相同时按文件名排序（使用逐字符比较）
      const nameA = a.originalName || a.filename;
      const nameB = b.originalName || b.filename;
      return ascending ? charByCharSort(nameA, nameB) : charByCharSort(nameB, nameA);
    }
    
    // 扩展名也使用逐字符比较
    const extResult = charByCharSort(extA, extB);
    return ascending ? extResult : -extResult;
  });
};

// 按文件大小排序函数
const sortFilesBySize = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    // 确保size字段存在且为数字
    const sizeA = Number(a.size) || 0;
    const sizeB = Number(b.size) || 0;
    
    if (sizeA === sizeB) {
      // 大小相同时按文件名排序（使用逐字符比较）
      const nameA = a.originalName || a.filename;
      const nameB = b.originalName || b.filename;
      return ascending ? charByCharSort(nameA, nameB) : charByCharSort(nameB, nameA);
    }
    
    return ascending ? sizeA - sizeB : sizeB - sizeA;
  });
};

// 格式化北京时间
const formatBeijingTime = (isoString) => {
  if (!isoString) return '';
  const date = new Date(isoString);
  // 转为东八区
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const beijing = new Date(utc + 8 * 3600000);
  const MM = String(beijing.getMonth() + 1).padStart(2, '0');
  const DD = String(beijing.getDate()).padStart(2, '0');
  const HH = String(beijing.getHours()).padStart(2, '0');
  const mm = String(beijing.getMinutes()).padStart(2, '0');
  return `${MM}/${DD} ${HH}:${mm}`;
};

const FileList = ({ userRole, onDeleteSuccess }) => {
  console.log('FileList get userRole:', userRole);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [searchInput, setSearchInput] = useState(''); // 当前输入的搜索词
  const [searchTerm, setSearchTerm] = useState(''); // 实际用于搜索的词
  const [selectedIds, setSelectedIds] = useState([]);

  // 全选/取消全选
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(files.map(f => f._id));
    } else {
      setSelectedIds([]);
    }
  };
  // 单个选择
  const handleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };
  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`确定要删除选中的${selectedIds.length}个文件吗？`)) return;
    try {
      await batchDeleteFiles(selectedIds);
      setFiles(prevFiles => prevFiles.filter(file => !selectedIds.includes(file._id)));
      setSelectedIds([]);
      if (onDeleteSuccess) onDeleteSuccess();
    } catch (err) {
      alert('批量删除失败: ' + (err.message || '未知错误'));
    }
  };

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const params = {};
      if (sortBy) params.sort = sortBy;
      if (searchTerm) params.search = searchTerm;
      
      const data = await getUserFiles(params);
      const filesArray = Array.isArray(data.files) ? data.files : [];
      
      // 根据排序类型处理文件列表
      let sortedFiles = filesArray;
      
      if (sortBy === 'name_asc') {
        sortedFiles = sortFilesByName(filesArray, true);
      } else if (sortBy === 'name_desc') {
        sortedFiles = sortFilesByName(filesArray, false);
      } else if (sortBy === 'extension_asc') {
        sortedFiles = sortFilesByExtension(filesArray, true);
      } else if (sortBy === 'extension_desc') {
        sortedFiles = sortFilesByExtension(filesArray, false);
      } else if (sortBy === 'size_asc') {
        sortedFiles = sortFilesBySize(filesArray, true);
      } else if (sortBy === 'size_desc') {
        sortedFiles = sortFilesBySize(filesArray, false);
      }
      // 时间排序由后端处理
      
      setFiles(sortedFiles);
    } catch (err) {
      setError('Failed to load files');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [sortBy, searchTerm]);

  // 搜索或排序后自动滚动到顶部
  useEffect(() => {
    if (!loading && (searchTerm || sortBy !== 'time_desc')) {
      // 滚动到"云端文件"标题位置，让框的上沿紧贴页面顶部
      const fileListElement = document.querySelector('.file-list');
      if (fileListElement) {
        const rect = fileListElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset + rect.top - 80; // 80px 是页眉高度，根据实际情况调整
        window.scrollTo({
          top: scrollTop,
          behavior: 'auto'
        });
      }
    }
  }, [files, loading, searchTerm, sortBy]);

  // 检测是否需要滚动容器
  const [needScroll, setNeedScroll] = useState(false);
  
  useEffect(() => {
    const checkScrollNeed = () => {
      const fileListElement = document.querySelector('.file-list');
      if (fileListElement) {
        const containerHeight = fileListElement.offsetHeight;
        const viewportHeight = window.innerHeight;
        const navbarHeight = 80; // 页眉高度
        const availableHeight = viewportHeight - navbarHeight - 100; // 100px 为其他元素预留空间
        
        setNeedScroll(containerHeight > availableHeight);
      }
    };
    
    checkScrollNeed();
    window.addEventListener('resize', checkScrollNeed);
    
    return () => window.removeEventListener('resize', checkScrollNeed);
  }, [files]);

  const handleDownload = async (id, filename) => {
    try {
      const response = await downloadFile(id);
      
      // 从响应头中获取文件名（如果后端设置了的话）
      const contentDisposition = response.headers['content-disposition'];
      let downloadFilename = filename;
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      
      // 处理中文文件名编码
      const decodedFilename = fixEncoding(downloadFilename);
      link.setAttribute('download', decodedFilename);
      
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

  const handleSortChange = (e) => {
    setSortBy(e.target.value);
  };

  // 搜索相关逻辑
  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };
  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput); // 直接用原始输入
    }
  };

  if (loading) return <div className="loading">加载文件中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="file-list">
      <h3>云端文件</h3>
      
      {/* 搜索和排序控制栏 */}
      <div className="file-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="搜索文件名... (按回车搜索)"
            value={searchInput}
            onChange={handleSearchChange}
            onKeyDown={handleSearchSubmit}
            className="search-input"
          />
        </div>
        <div className="sort-box">
          <select value={sortBy} onChange={handleSortChange} className="sort-select">
            <option value="time_desc">上传时间（最新）</option>
            <option value="time_asc">上传时间（最早）</option>
            <option value="size_desc">文件大小（从大到小）</option>
            <option value="size_asc">文件大小（从小到大）</option>
            <option value="name_asc">文件名（A-Z）</option>
            <option value="name_desc">文件名（Z-A）</option>
            <option value="extension_asc">文件后缀（A-Z）</option>
            <option value="extension_desc">文件后缀（Z-A）</option>
          </select>
        </div>
        {userRole === 'admin' && selectedIds.length > 0 && (
          <button className="btn btn-danger" style={{marginLeft: 16}} onClick={handleBatchDelete}>
            批量删除({selectedIds.length})
          </button>
        )}
      </div>

      {files.length === 0 ? (
        <p>暂无上传文件</p>
      ) : (
        <div className={needScroll ? 'table-scroll-container' : ''}>
          <table>
            <thead>
              <tr>
                {userRole === 'admin' && (
                  <th>
                    <input type="checkbox" checked={selectedIds.length === files.length && files.length > 0} onChange={handleSelectAll} />
                  </th>
                )}
                <th>文件名</th>
                <th>大小</th>
                {userRole === 'admin' && <th>上传时间</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr key={file._id}>
                  {userRole === 'admin' && (
                    <td>
                      <input type="checkbox" checked={selectedIds.includes(file._id)} onChange={() => handleSelect(file._id)} />
                    </td>
                  )}
                  <td>{fixEncoding(file.originalName || file.filename)}</td>
                  <td>{formatBytes(file.size)}</td>
                  {userRole === 'admin' && <td>{formatBeijingTime(file.createdAt)}</td>}
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
        </div>
      )}
    </div>
  );
};

export default FileList;