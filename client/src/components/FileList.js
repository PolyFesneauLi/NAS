import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { getUserFiles, downloadFile, deleteFile, batchDeleteFiles, createFolder } from '../services/api';
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

const FileList = forwardRef(({ userRole, onDeleteSuccess }, ref) => {
  console.log('FileList get userRole:', userRole);

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [searchInput, setSearchInput] = useState(''); // 当前输入的搜索词
  const [searchTerm, setSearchTerm] = useState(''); // 实际用于搜索的词
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderName, setFolderName] = useState('');

  // Expose fetchFiles to parent component
  useImperativeHandle(ref, () => ({
    refresh: fetchFiles
  }));

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

  const handleFolderClick = async (folder) => {
    console.log('========== 开始处理文件夹点击 ==========');
    console.log('点击的文件夹信息:', {
      id: folder._id,
      name: folder.originalName || folder.filename,
      isFolder: folder.isFolder,
      parentFolder: folder.parentFolder
    });
    
    try {
      console.log('1. 设置加载状态为 true');
      setLoading(true);

      // 先更新当前文件夹和路径
      const newFolderPath = folderPath.length === 0 ? [folder] : [...folderPath, folder];
      console.log('更新文件夹路径:', newFolderPath.map(f => f.originalName || f.filename).join(' > '));
      setFolderPath(newFolderPath);
      setCurrentFolder(folder._id);
      
      console.log('4. 重置选择和搜索状态');
      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // 获取子文件夹内容
      console.log('5. 准备获取文件夹内容');
      const params = {
        folder: folder._id,
        sort: sortBy
      };
      console.log('请求参数:', params);
      
      console.log('6. 调用 API 获取文件夹内容');
      const data = await getUserFiles(params);
      console.log('API 返回数据:', {
        fileCount: data.files?.length || 0,
        currentFolder: params.folder
      });
      
      const filesArray = Array.isArray(data.files) ? data.files : [];
      console.log('7. 处理返回的文件列表');
      console.log('文件总数:', filesArray.length);
      console.log('文件类型统计:', {
        folders: filesArray.filter(f => f.isFolder).length,
        files: filesArray.filter(f => !f.isFolder).length
      });
      
      // 根据排序类型处理文件列表
      console.log('8. 应用排序规则:', sortBy);
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
      
      console.log('9. 更新文件列表状态');
      setFiles(sortedFiles);
      console.log('文件列表更新完成');
      
    } catch (err) {
      console.error('❌ 文件夹操作失败:', err);
      console.error('错误详情:', {
        message: err.message,
        response: err.response?.data
      });
      setError('进入文件夹失败: ' + (err.message || '未知错误'));
    } finally {
      console.log('10. 设置加载状态为 false');
      setLoading(false);
      console.log('========== 文件夹处理完成 ==========\n');
    }
  };

  const handlePathClick = async (index) => {
    console.log('========== 开始处理导航路径点击 ==========');
    console.log('点击的路径索引:', index);
    console.log('当前完整路径:', folderPath.map(f => f.originalName || f.filename).join(' > '));
    
    try {
      console.log('1. 设置加载状态为 true');
      setLoading(true);
      
      let targetFolder = null;
      let newPath = [];
      
      if (index === -1) {
        // 返回 home 目录
        console.log('2.1 返回 home 目录');
        setCurrentFolder(null);
        setFolderPath([]);
      } else {
        // 跳转到指定层级的文件夹
        console.log('2.2 跳转到指定层级的文件夹');
        targetFolder = folderPath[index];
        newPath = folderPath.slice(0, index + 1);
        console.log('目标文件夹:', {
          id: targetFolder._id,
          name: targetFolder.originalName || targetFolder.filename,
          path: newPath.map(f => f.originalName || f.filename).join('/')
        });
        setCurrentFolder(targetFolder._id);
        setFolderPath(newPath);
      }
      
      console.log('3. 重置选择和搜索状态');
      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // 获取目标文件夹的内容
      console.log('4. 准备获取文件夹内容');
      const params = {
        folder: targetFolder ? targetFolder._id : null,
        sort: sortBy
      };
      console.log('请求参数:', params);
      
      console.log('5. 调用 API 获取文件夹内容');
      const data = await getUserFiles(params);
      console.log('API 返回数据:', {
        fileCount: data.files?.length || 0,
        currentFolder: params.folder
      });
      
      const filesArray = Array.isArray(data.files) ? data.files : [];
      console.log('7. 处理返回的文件列表');
      console.log('文件总数:', filesArray.length);
      console.log('文件类型统计:', {
        folders: filesArray.filter(f => f.isFolder).length,
        files: filesArray.filter(f => !f.isFolder).length
      });
      
      // 根据排序类型处理文件列表
      console.log('8. 应用排序规则:', sortBy);
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
      
      console.log('9. 更新文件列表状态');
      setFiles(sortedFiles);
      console.log('文件列表更新完成');
      
    } catch (err) {
      console.error('❌ 导航操作失败:', err);
      console.error('错误详情:', {
        message: err.message,
        response: err.response?.data
      });
      setError('切换文件夹失败: ' + (err.message || '未知错误'));
    } finally {
      console.log('10. 设置加载状态为 false');
      setLoading(false);
      console.log('========== 导航处理完成 ==========\n');
    }
  };

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    if (!folderName.trim()) {
      setError('文件夹名称不能为空');
      return;
    }
    try {
      await createFolder(folderName, currentFolder);
      setFolderName('');
      setShowFolderInput(false);
      setError('');
      fetchFiles(); // 刷新文件列表
    } catch (err) {
      setError(err.response?.data?.error || `创建文件夹失败: ${err.message || '未知错误'}`);
    }
  };

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (sortBy) params.sort = sortBy;
      if (searchTerm) params.search = searchTerm;
      if (currentFolder) params.folder = currentFolder;
      
      console.log('Fetching files with params:', params);
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
      
      setFiles(sortedFiles);
    } catch (err) {
      setError('获取文件列表失败: ' + (err.message || '未知错误'));
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [sortBy, searchTerm]); // 移除 currentFolder，因为我们在 handleFolderClick 和 handlePathClick 中手动调用 fetchFiles

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
      // 先获取文件数据
      const response = await downloadFile(id);
      
      // 从响应头中获取文件名（如果后端设置了的话）
      const contentDisposition = response.headers['content-disposition'];
      let downloadFilename = fixEncoding(filename); // 使用修复编码后的原始文件名作为默认值
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      try {
        // 使用 showSaveFilePicker API 让用户选择保存位置
        const handle = await window.showSaveFilePicker({
          suggestedName: downloadFilename,
          types: [{
            description: 'All Files',
            accept: {'*/*': []}
          }],
        });

        // 创建 FileSystemWritableFileStream 来写入文件
        const writable = await handle.createWritable();
        
        // 写入文件内容
        await writable.write(response.data);
        await writable.close();
      } catch (err) {
        if (err.name === 'AbortError') {
          // 用户取消了选择，不做任何处理
          return;
        }
        throw err; // 其他错误则抛出
      }
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
    <div className={`file-list`}>
      <h3>云端文件</h3>
      
      {/* 文件夹导航 */}
      <div className="folder-navigation">
        <button 
          onClick={() => handlePathClick(-1)} 
          className="back-btn"
          style={{ visibility: currentFolder ? 'visible' : 'hidden' }}
        >
          返回上级
        </button>
        <div className="folder-path">
          <span
            onClick={() => handlePathClick(-1)}
            style={{ 
              cursor: 'pointer',
              color: !currentFolder ? 'inherit' : '#4361ee'
            }}
          >
            Home
          </span>
          {folderPath.map((folder, index) => (
            <React.Fragment key={folder._id}>
              <span className="folder-path-separator">/</span>
              <span
                onClick={() => handlePathClick(index)}
                style={{ 
                  cursor: 'pointer',
                  color: index === folderPath.length - 1 ? 'inherit' : '#4361ee'
                }}
              >
                {folder.originalName || folder.filename}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
      
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
        {userRole === 'admin' && (
          <div className="admin-controls">
            {selectedIds.length > 0 && (
              <button className="btn btn-danger" onClick={handleBatchDelete}>
                批量删除({selectedIds.length})
              </button>
            )}
            {!showFolderInput ? (
              <button 
                type="button"
                onClick={() => setShowFolderInput(true)}
                className="create-folder-btn"
              >
                新建文件夹
              </button>
            ) : (
              <form onSubmit={handleCreateFolder} className="folder-form">
                <input
                  type="text"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="输入文件夹名称"
                  className="folder-input"
                  autoFocus
                />
                <button type="submit" className="confirm-folder-btn">确认</button>
                <button 
                  type="button" 
                  onClick={() => {
                    setShowFolderInput(false);
                    setFolderName('');
                    setError('');
                  }}
                  className="cancel-folder-btn"
                >
                  取消
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {files.length === 0 ? (
        <p>暂无上传文件</p>
      ) : (
        <div className={needScroll ? 'table-scroll-container' : ''}>
          <table>
            <thead>
              <tr>
                {userRole === 'admin' && (
                  <th>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === files.length && files.length > 0} 
                      onChange={handleSelectAll}
                    />
                  </th>
                )}
                <th>名称</th>
                <th>类型</th>
                <th>大小</th>
                {userRole === 'admin' && <th>上传时间</th>}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map(file => (
                <tr key={file._id} className={file.isFolder ? 'folder-row' : ''}>
                  {userRole === 'admin' && (
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(file._id)} 
                        onChange={() => handleSelect(file._id)}
                      />
                    </td>
                  )}
                  <td>
                    {file.isFolder ? (
                      <button 
                        className="folder-name-btn"
                        onClick={() => handleFolderClick(file)}
                      >
                        <span className="folder-icon">📁</span>
                        {fixEncoding(file.originalName || file.filename)}
                      </button>
                    ) : (
                      <span style={{ marginLeft: '28px' }}>
                        {fixEncoding(file.originalName || file.filename)}
                      </span>
                    )}
                  </td>
                  <td>{file.isFolder ? '文件夹' : getFileExtension(file.originalName || file.filename)}</td>
                  <td>{file.isFolder ? '-' : formatBytes(file.size)}</td>
                  {userRole === 'admin' && <td>{formatBeijingTime(file.createdAt)}</td>}
                  <td className="action-buttons">
                    {!file.isFolder && (
                      <button 
                        className="btn btn-primary"
                        onClick={() => handleDownload(file._id, file.originalName || file.filename)}
                      >
                        下载
                      </button>
                    )}
                    {userRole === 'admin' && (
                      <button 
                        className="btn btn-danger"
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
});

export default FileList;