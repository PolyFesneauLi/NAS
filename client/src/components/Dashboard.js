import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { getCurrentUser, uploadFile, uploadCadFile, getUserFiles, downloadFile, deleteFile, batchDeleteFiles, createFolder } from '../services/api';
import { formatBytes } from '../utils';
import StorageMeter from './StorageMeter';
import '../components/Dashboard.css';

// 修复编码问题的工具函数
const fixEncoding = (str) => {
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
};

// 获取文件扩展名的函数
const getFileExtension = (filename) => {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : '';
};

// 字符比较函数 - 字母/数字/符号 < 汉字
const compareChar = (charA, charB) => {
  const isChineseA = /[\u4e00-\u9fff]/.test(charA);
  const isChineseB = /[\u4e00-\u9fff]/.test(charB);
  
  if (isChineseA && isChineseB) {
    return charA.localeCompare(charB, 'zh-CN');
  }
  
  if (isChineseA && !isChineseB) {
    return 1;
  }
  if (!isChineseA && isChineseB) {
    return -1;
  }
  
  return charA.charCodeAt(0) - charB.charCodeAt(0);
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
  
  return lenA - lenB;
};

// 文件名排序函数
const sortFilesByName = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    const nameA = a.originalName || a.filename;
    const nameB = b.originalName || b.filename;
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
      const nameA = a.originalName || a.filename;
      const nameB = b.originalName || b.filename;
      return ascending ? charByCharSort(nameA, nameB) : charByCharSort(nameB, nameA);
    }
    
    const extResult = charByCharSort(extA, extB);
    return ascending ? extResult : -extResult;
  });
};

// 按文件大小排序函数
const sortFilesBySize = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    const sizeA = Number(a.size) || 0;
    const sizeB = Number(b.size) || 0;
    
    if (sizeA === sizeB) {
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
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const beijing = new Date(utc + 8 * 3600000);
  const MM = String(beijing.getMonth() + 1).padStart(2, '0');
  const DD = String(beijing.getDate()).padStart(2, '0');
  const HH = String(beijing.getHours()).padStart(2, '0');
  const mm = String(beijing.getMinutes()).padStart(2, '0');
  return `${MM}/${DD} ${HH}:${mm}`;
};

// FileUpload 组件
const FileUpload = ({ onUploadSuccess, fileType = 'regular', userRole, currentFolder = null }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({});
  const [folderStructure, setFolderStructure] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(currentFolder);
  const [currentPath, setCurrentPath] = useState('Home');
  const [folderPaths, setFolderPaths] = useState(new Map());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 点击外部关闭下拉框
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 所有支持的文件类型定义
  const allAcceptedExtensions = {
    regular: ['.txt','.md','.pdf','.doc','.docx','.xls','.xlsx','.html','.json','.jpg','.jpeg','.png','.svg'],
    cad: ['.dwg','.dxf','.stp','.step','.igs','.iges','.sldprt','.sldasm','.dwl',".zip",".rar",".7z",".tar",".gz",".bz2"],
    code: ['.c','.cpp','.h','.java','.js','.py','.php','.sh','.css','.json','.xml']
  };

  // 递归构建文件夹树形结构和路径映射
  const buildFolderStructure = async (parentId = null, level = 0, parentPath = 'Home') => {
    try {
      const data = await getUserFiles({ folder: parentId });
      const foldersList = data.files.filter(f => f.isFolder);
      
      foldersList.sort((a, b) => {
        const nameA = (a.originalName || a.filename).toLowerCase();
        const nameB = (b.originalName || b.filename).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      const structure = await Promise.all(foldersList.map(async folder => {
        const currentPath = parentPath === 'Home' ? 
          `${parentPath}/${folder.originalName || folder.filename}` : 
          `${parentPath}/${folder.originalName || folder.filename}`;
        
        setFolderPaths(prev => new Map(prev).set(folder._id, currentPath));
        
        const children = await buildFolderStructure(folder._id, level + 1, currentPath);
        return {
          ...folder,
          children,
          level,
          path: currentPath
        };
      }));

      return structure;
    } catch (err) {
      console.error('获取文件夹结构失败:', err);
      return [];
    }
  };



  useEffect(() => {
    const fetchFoldersData = async () => {
      try {
        setFolderPaths(new Map().set(null, 'Home'));
        const structure = await buildFolderStructure();
        setFolderStructure(structure);
      } catch (err) {
        setError('获取文件夹列表失败: ' + (err.message || '未知错误'));
      }
    };
    fetchFoldersData();
  }, []);

  // 处理文件夹选择变化
  const handleFolderSelect = (folderId, path) => {
    setSelectedFolder(folderId);
    setCurrentPath(path);
    setIsDropdownOpen(false);
  };

  // 处理下拉框点击
  const handleDropdownClick = async () => {
    const newState = !isDropdownOpen;
    setIsDropdownOpen(newState);
    
    if (newState) {
      // console.log('[FOLDER] 刷新文件夹结构');
      try {
        setFolderPaths(new Map().set(null, 'Home'));
        const structure = await buildFolderStructure();
        setFolderStructure(structure);
      } catch (err) {
        setError('获取文件夹列表失败: ' + (err.message || '未知错误'));
      }
    }
  };

  // 递归生成文件夹选项
  const FolderOption = ({ folder, level = 0 }) => {
    return (
      <div className="cascading-option-wrapper">
        <div 
          className={`cascading-option ${selectedFolder === folder._id ? 'selected' : ''}`}
          onClick={() => handleFolderSelect(folder._id, folderPaths.get(folder._id))}
        >
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.originalName || folder.filename}</span>
          {folder.children && folder.children.length > 0 && (
            <span className="submenu-arrow">▶</span>
          )}
        </div>
        {folder.children && folder.children.length > 0 && (
          <div className="cascading-submenu">
            {folder.children.map(childFolder => (
              <FolderOption 
                key={childFolder._id} 
                folder={childFolder} 
                level={level + 1} 
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  // 合并所有文件类型为统一的accept属性
  const unifiedAccept = Object.values(allAcceptedExtensions)
    .flat()
    .join(',');

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    // console.log('[UPLOAD] 文件选择事件触发，选择的文件数量:', selectedFiles.length);
    
    const validFiles = [];
    for (const f of selectedFiles) {
      const fileExt = '.' + f.name.split('.').pop().toLowerCase();
      // console.log(`[UPLOAD] 检查文件 ${f.name} (${formatBytes(f.size)}) 的格式: ${fileExt}`);
      const isValidFile = Object.values(allAcceptedExtensions).flat().includes(fileExt);
      if (!isValidFile) {
        // console.log(`[UPLOAD] ❌ 文件 ${f.name} 格式不支持`);
        setError(`不支持的文件格式: ${fileExt}`);
        setFiles([]);
        return;
      }
      // console.log(`[UPLOAD] ✅ 文件 ${f.name} 验证通过`);
      validFiles.push(f);
    }
    // console.log('[UPLOAD] 所有文件验证完成，有效文件数量:', validFiles.length);
    setFiles(validFiles);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    // console.log('[UPLOAD] 开始上传文件，总数量:', files.length);
    // console.log('[UPLOAD] 当前选择的文件夹:', selectedFolder || 'Home');
    setIsUploading(true);
    setError('');
    setProgress({});
    try {
      await Promise.all(files.map(async (file) => {
        // console.log(`[UPLOAD] 开始处理文件: ${file.name}`);
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        const isCadFile = allAcceptedExtensions.cad.includes(fileExt);
        // console.log(`[UPLOAD] 文件类型: ${isCadFile ? 'CAD文件' : '普通文件'}`);
        const uploadApi = isCadFile ? uploadCadFile : uploadFile;
        
        const config = {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            // console.log(`[UPLOAD] ${file.name} 上传进度: ${percentCompleted}%`);
            setProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
          }
        };

        const formData = new FormData();
        formData.append('file', file);
        if (selectedFolder) {
          formData.append('folderId', selectedFolder);
          // console.log(`[UPLOAD] 文件 ${file.name} 将上传到文件夹: ${selectedFolder}`);
        }

        // console.log(`[UPLOAD] 开始上传文件 ${file.name} 到服务器...`);
        try {
          // console.log(`[UPLOAD] 正在准备上传请求...`);
          const response = await uploadApi(formData, {
            ...config,
            timeout: 0,
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              // console.log(`[UPLOAD] ${file.name} 上传进度: ${percentCompleted}%`);
              if (percentCompleted === 100) {
                // console.log(`[UPLOAD] ${file.name} 文件已完全上传，等待服务器处理...`);
              }
              setProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
            }
          });
          // console.log(`[UPLOAD] ✅ 文件 ${file.name} 上传成功! 服务器响应:`, response);
          return response;
        } catch (error) {
          // console.log(`[UPLOAD] ❌ 文件 ${file.name} 上传失败:`, error);
          // console.log(`[UPLOAD] 错误详情:`, {
          //   message: error.message,
          //   response: error.response?.data,
          //   status: error.response?.status
          // });
          throw error;
        }
      }));
      
      // console.log('[UPLOAD] 🎉 所有文件上传完成!');
      onUploadSuccess();
      setFiles([]);
      setProgress({});
    } catch (err) {
      // console.log('[UPLOAD] ❌ 上传过程中发生错误:', err);
      // console.log('[UPLOAD] 错误详情:', {
      //   message: err.message,
      //   response: err.response?.data,
      //   status: err.response?.status
      // });
      setError(err.response?.data?.error || `上传失败: ${err.message || '未知错误'}`);
    } finally {
      // console.log('[UPLOAD] 上传流程结束，重置上传状态');
      setIsUploading(false);
    }
  };

  return (
    <div className={`file-upload ${fileType}`}>
      <h3>上传文件</h3>
      
      <div className="folder-controls" ref={dropdownRef}>
        <label className="path-select-label">上传路径选择</label>
        <div className="custom-select">
          <div 
            className="selected-value"
            onClick={handleDropdownClick}
          >
            <span className="current-path">{currentPath}</span>
            <span className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
          </div>
          {isDropdownOpen && (
            <div className="cascading-container">
              <div 
                className="cascading-option"
                onClick={() => handleFolderSelect(null, 'Home')}
              >
                <span className="folder-icon">🏠</span>
                <span className="folder-name">Home</span>
              </div>
              {folderStructure.map(folder => (
                <FolderOption 
                  key={folder._id} 
                  folder={folder}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      
      <form onSubmit={handleSubmit}>
        <div className="file-input-container">
          <label className="file-label">
            {files.length ? files.map(f => f.name).join(', ') : '选择文件'}
            <input 
              type="file" 
              onChange={handleFileChange}
              accept={unifiedAccept}
              multiple
              disabled={isUploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {files.length > 0 && (
          <>
            <div className="file-info">
              {files.map(f => (
                <div key={f.name} className="file-item">
                  <span>{f.name} | <strong>{(f.size / 1024 / 1024).toFixed(2)} MB</strong></span>
                  {progress[f.name] > 0 && progress[f.name] < 100 && (
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar"
                        style={{ width: `${progress[f.name]}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button 
              type="submit" 
              disabled={isUploading}
              className="upload-button"
            >
              {isUploading ? '上传中...' : '开始上传'}
            </button>
          </>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </form>
    </div>
  );
};

// FileList 组件
const FileList = forwardRef(({ userRole, onDeleteSuccess, className = 'file-list' }, ref) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderName, setFolderName] = useState('');

  const refreshFiles = async () => {
    try {
      setLoading(true);
      setError('');
      const params = {};
      if (sortBy) params.sort = sortBy;
      if (searchTerm) params.search = searchTerm;
      if (currentFolder) params.folder = currentFolder;
      
      const data = await getUserFiles(params);
      
      const filesArray = Array.isArray(data.files) ? data.files : [];
      
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

  useImperativeHandle(ref, () => ({
    refresh: refreshFiles
  }));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(files.map(f => f._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;

    const selectedFiles = files.filter(file => selectedIds.includes(file._id));
    const hasFolders = selectedFiles.some(file => file.isFolder);
    const confirmMessage = hasFolders
      ? `确定要删除选中的${selectedIds.length}个文件/文件夹吗？这将删除所有选中的文件夹及其内容。`
      : `确定要删除选中的${selectedIds.length}个文件吗？`;

    if (!window.confirm(confirmMessage)) return;

    try {
      const deletedPathFolder = selectedFiles.find(file => 
        file.isFolder && folderPath.some(f => f._id === file._id)
      );

      if (deletedPathFolder) {
        const folderIndex = folderPath.findIndex(f => f._id === deletedPathFolder._id);
        if (folderIndex !== -1) {
          const parentFolder = folderPath[folderIndex - 1];
          setCurrentFolder(parentFolder ? parentFolder._id : null);
          setFolderPath(prev => prev.slice(0, folderIndex));
          
          setFiles(prevFiles => prevFiles.filter(file => !selectedIds.includes(file._id)));
          setSelectedIds([]);
          
          await batchDeleteFiles(selectedIds);
          
          const params = {
            folder: parentFolder ? parentFolder._id : null,
            sort: sortBy
          };
          const data = await getUserFiles(params);
          const filesArray = Array.isArray(data.files) ? data.files : [];
          setFiles(filesArray);
        }
      } else {
        await batchDeleteFiles(selectedIds);
        setFiles(prevFiles => prevFiles.filter(file => !selectedIds.includes(file._id)));
        setSelectedIds([]);
      }

      if (onDeleteSuccess) onDeleteSuccess();
    } catch (err) {
      console.error('批量删除错误:', err);
      const errorMessage = err.response?.data?.error || err.message || '未知错误';
      setError(`批量删除失败: ${errorMessage}`);
      refreshFiles();
    }
  };

  const handleFolderClick = async (folder) => {
    // console.log('========== 开始处理文件夹点击 ==========');
    // console.log('点击的文件夹信息:', {
    //   id: folder._id,
    //   name: folder.originalName || folder.filename,
    //   isFolder: folder.isFolder,
    //   parentFolder: folder.parentFolder
    // });
    
    try {
      // console.log('1. 设置加载状态为 true');
      setLoading(true);

      const newFolderPath = folderPath.length === 0 ? [folder] : [...folderPath, folder];
      // console.log('更新文件夹路径:', newFolderPath.map(f => f.originalName || f.filename).join(' > '));
      setFolderPath(newFolderPath);
      setCurrentFolder(folder._id);
      
      // console.log('4. 重置选择和搜索状态');
      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // console.log('5. 准备获取文件夹内容');
      const params = {
        folder: folder._id,
        sort: sortBy
      };
      // console.log('请求参数:', params);
      
      // console.log('6. 调用 API 获取文件夹内容');
      const data = await getUserFiles(params);
      // console.log('API 返回数据:', {
      //   fileCount: data.files?.length || 0,
      //   currentFolder: params.folder
      // });
      
      const filesArray = Array.isArray(data.files) ? data.files : [];
      // console.log('7. 处理返回的文件列表');
      // console.log('文件总数:', filesArray.length);
      // console.log('文件类型统计:', {
      //   folders: filesArray.filter(f => f.isFolder).length,
      //   files: filesArray.filter(f => !f.isFolder).length
      // });
      
      // console.log('8. 应用排序规则:', sortBy);
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
      
      // console.log('9. 更新文件列表状态');
      setFiles(sortedFiles);
      // console.log('文件列表更新完成');
      
    } catch (err) {
      // console.error('❌ 文件夹操作失败:', err);
      // console.error('错误详情:', {
      //   message: err.message,
      //   response: err.response?.data
      // });
      setError('进入文件夹失败: ' + (err.message || '未知错误'));
    } finally {
      // console.log('10. 设置加载状态为 false');
      setLoading(false);
      // console.log('========== 文件夹处理完成 ==========\n');
    }
  };

  const handlePathClick = async (index) => {
    // console.log('========== 开始处理导航路径点击 ==========');
    // console.log('点击的路径索引:', index);
    // console.log('当前完整路径:', folderPath.map(f => f.originalName || f.filename).join(' > '));
    
    try {
      // console.log('1. 设置加载状态为 true');
      setLoading(true);
      
      let targetFolder = null;
      let newPath = [];
      
      if (index === -1) {
        // console.log('2.1 返回 home 目录');
        setCurrentFolder(null);
        setFolderPath([]);
      } else {
        // console.log('2.2 跳转到指定层级的文件夹');
        targetFolder = folderPath[index];
        newPath = folderPath.slice(0, index + 1);
        // console.log('目标文件夹:', {
        //   id: targetFolder._id,
        //   name: targetFolder.originalName || targetFolder.filename,
        //   path: newPath.map(f => f.originalName || f.filename).join('/')
        // });
        setCurrentFolder(targetFolder._id);
        setFolderPath(newPath);
      }
      
      // console.log('3. 重置选择和搜索状态');
      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // console.log('4. 准备获取文件夹内容');
      const params = {
        folder: targetFolder ? targetFolder._id : null,
        sort: sortBy
      };
      // console.log('请求参数:', params);
      
      // console.log('5. 调用 API 获取文件夹内容');
      const data = await getUserFiles(params);
      // console.log('API 返回数据:', {
      //   fileCount: data.files?.length || 0,
      //   currentFolder: params.folder
      // });
      
      const filesArray = Array.isArray(data.files) ? data.files : [];
      // console.log('7. 处理返回的文件列表');
      // console.log('文件总数:', filesArray.length);
      // console.log('文件类型统计:', {
      //   folders: filesArray.filter(f => f.isFolder).length,
      //   files: filesArray.filter(f => !f.isFolder).length
      // });
      
      // console.log('8. 应用排序规则:', sortBy);
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
      
      // console.log('9. 更新文件列表状态');
      setFiles(sortedFiles);
      // console.log('文件列表更新完成');
      
    } catch (err) {
      // console.error('❌ 导航操作失败:', err);
      // console.error('错误详情:', {
      //   message: err.message,
      //   response: err.response?.data
      // });
      setError('切换文件夹失败: ' + (err.message || '未知错误'));
    } finally {
      // console.log('10. 设置加载状态为 false');
      setLoading(false);
      // console.log('========== 导航处理完成 ==========\n');
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
      refreshFiles();
    } catch (err) {
      setError(err.response?.data?.error || `创建文件夹失败: ${err.message || '未知错误'}`);
    }
  };



  useEffect(() => {
    const fetchFilesData = async () => {
      try {
        setLoading(true);
        setError('');
        const params = {};
        if (sortBy) params.sort = sortBy;
        if (searchTerm) params.search = searchTerm;
        if (currentFolder) params.folder = currentFolder;
        
        // console.log('Fetching files with params:', params);
        const data = await getUserFiles(params);
        
        const filesArray = Array.isArray(data.files) ? data.files : [];
        
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
    fetchFilesData();
  }, [sortBy, searchTerm, currentFolder]);

  useEffect(() => {
    if (!loading && (searchTerm || sortBy !== 'time_desc')) {
      const fileListElement = document.querySelector('.file-list');
      if (fileListElement) {
        const rect = fileListElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset + rect.top - 80;
        window.scrollTo({
          top: scrollTop,
          behavior: 'auto'
        });
      }
    }
  }, [files, loading, searchTerm, sortBy]);

  const handleDownload = async (id, filename) => {
    try {
      const response = await downloadFile(id);
      
      const contentDisposition = response.headers['content-disposition'];
      let downloadFilename = fixEncoding(filename);
      
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch && filenameMatch[1]) {
          downloadFilename = filenameMatch[1].replace(/['"]/g, '');
        }
      }

      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: downloadFilename,
          types: [{
            description: 'All Files',
            accept: {'*/*': []}
          }],
        });

        const writable = await handle.createWritable();
        await writable.write(response.data);
        await writable.close();
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        throw err;
      }
    } catch (err) {
      alert('下载失败: ' + (err.message || '未知错误'));
    }
  };

  const handleDelete = async (id) => {
    const fileToDelete = files.find(file => file._id === id);
    if (!fileToDelete) return;

    const confirmMessage = fileToDelete.isFolder ? 
      '确定要删除这个文件夹及其所有内容吗？' : 
      '确定要删除这个文件吗？';

    if (window.confirm(confirmMessage)) {
      try {
        await deleteFile(id);
        
        setFiles(prevFiles => prevFiles.filter(file => file._id !== id));
        
        if (fileToDelete.isFolder) {
          const folderIndex = folderPath.findIndex(f => f._id === id);
          if (folderIndex !== -1) {
            if (folderIndex === folderPath.length - 1) {
              const parentFolder = folderPath[folderIndex - 1];
              setCurrentFolder(parentFolder ? parentFolder._id : null);
              setFolderPath(prev => prev.slice(0, folderIndex));
              const params = {
                folder: parentFolder ? parentFolder._id : null,
                sort: sortBy
              };
              const data = await getUserFiles(params);
              const filesArray = Array.isArray(data.files) ? data.files : [];
              setFiles(filesArray);
            } else {
              setFolderPath(prev => prev.filter(f => f._id !== id));
            }
          }
        }

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

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter') {
      setSearchTerm(searchInput);
    }
  };

  if (loading) return <div className="loading">加载文件中...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="file-list">
      <h3>云端文件</h3>
      
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

      {/* 表格容器 - 可滚动区域 */}
      <div className="table-container">
        {files.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>暂无上传文件</p>
        ) : (
          <div className="table-scroll-container">
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
                  <th style={{ textAlign: 'center' }}>名称</th>
                  <th style={{ textAlign: 'center' }}>类型</th>
                  <th style={{ textAlign: 'center' }}>大小</th>
                  {userRole === 'admin' && <th style={{ textAlign: 'center' }}>上传时间</th>}
                  <th style={{ textAlign: 'center' }}>操作</th>
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
    </div>
  );
});

// Dashboard 组件
const Dashboard = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const fileListRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const response = await getCurrentUser();
        setCurrentUser(response);
        
        // 获取服务器配置中的显示用户信息开关
        try {
          const configResponse = await fetch('/api/config');
          if (configResponse.ok) {
            const config = await configResponse.json();
            setShowUserInfo(config.showUserInfo || false);
          }
        } catch (configErr) {
          console.log('获取配置失败，使用默认设置');
          setShowUserInfo(false);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleUploadSuccess = () => {
    getCurrentUser().then(setCurrentUser);
    fileListRef.current?.refresh();
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  const isAdmin = currentUser?.role === 'admin';

  return (
    <div className="dashboard">
      {/* 用户信息区域 - 根据配置显示/隐藏 */}
      {showUserInfo && (
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
      )}
      
      <div className="file-management">
        {/* 文件列表组件 */}
        <FileList 
          ref={fileListRef}
          userRole={currentUser?.role}
          onDeleteSuccess={() => {
            getCurrentUser().then(setCurrentUser);
            fileListRef.current?.refresh();
          }}
          className={currentUser?.role === 'admin' ? 'file-list' : 'file-list user-normal'}
        />
        
        {/* 上传文件组件 - 移到文件列表下方 */}
        {isAdmin && (
          <FileUpload 
            onUploadSuccess={handleUploadSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default Dashboard;