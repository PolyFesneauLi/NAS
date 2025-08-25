import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { getCurrentUser, uploadFile, uploadCadFile, uploadFolder, getUserFiles, getFileDetails, downloadFile, downloadFolder, deleteFile, batchDeleteFiles, createFolder, getAdminStorageUsage, checkFolderDownloadStatus, getArchivingProgress, addTags, removeTags, getAllTags, createTag, updateTagOrder, searchFiles, renameFile, deleteTag, forceDeleteTag } from '../services/api';
import { formatBytes } from '../utils';
import StorageMeter from './StorageMeter';
import '../components/Dashboard.css';
import response from '../services/api';

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

// 检测文件是否支持预览
const isSupportedForPreview = (filename) => {
  const extension = getFileExtension(filename);
  const supportedTypes = ['pdf', 'txt', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'dwl', 'dwg', 'csv'];
  return supportedTypes.includes(extension);
};

// 获取文件预览类型
const getPreviewType = (filename) => {
  const extension = getFileExtension(filename);
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'image';
  if (['pdf'].includes(extension)) return 'pdf';
  if (['txt'].includes(extension)) return 'text';
  if (['xls', 'xlsx', 'csv'].includes(extension)) return 'excel';
  if (['doc', 'docx'].includes(extension)) return 'word';
  if (['ppt', 'pptx'].includes(extension)) return 'powerpoint';
  if (['dwl', 'dwg'].includes(extension)) return 'cad';
  return 'unsupported';
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
    // 首先按类型排序：文件夹在前
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    
    const nameA = a.originalName || a.filename;
    const nameB = b.originalName || b.filename;
    const result = charByCharSort(nameA, nameB);
    return ascending ? result : -result;
  });
};

// 按扩展名排序函数
const sortFilesByExtension = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    // 首先按类型排序：文件夹在前
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    
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
    // 首先按类型排序：文件夹在前
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    
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

// 按更新时间排序函数
const sortFilesByTime = (files, ascending = true) => {
  return [...files].sort((a, b) => {
    // 首先按类型排序：文件夹在前
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }
    
    const timeA = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const timeB = new Date(b.updatedAt || b.createdAt || 0).getTime();
    
    if (timeA === timeB) {
      const nameA = a.originalName || a.filename;
      const nameB = b.originalName || b.filename;
      return ascending ? charByCharSort(nameA, nameB) : charByCharSort(nameB, nameA);
    }
    
    return ascending ? timeA - timeB : timeB - timeA;
  });
};

// 统一错误信息映射：将常见后端状态码转换为中文友好提示
const mapApiErrorMessage = (error, fallbackMessage = '操作失败') => {
  const status = error?.response?.status;
  if (status === 404) {
    return '要操作的文件已不存在，请刷新界面';
  }
  if (status === 409) {
    // 主要用于异步同名文件夹/文件冲突
    return '上传失败：存在同名文件夹，请重命名后再试';
  }
  return `${fallbackMessage}: ${error?.response?.data?.error || error?.message || '未知错误'}`;
};

// 合并同目录下同名文件夹（并发上传时避免重复展示）
const mergeDuplicateFolders = (files) => {
  if (!Array.isArray(files) || files.length === 0) return files || [];
  const folderMap = new Map();
  const others = [];
  for (const item of files) {
    if (item && item.isFolder) {
      const name = (item.originalName || item.filename || '').toLowerCase();
      const parent = item.parentFolder || 'root';
      const key = `${parent}::${name}`;
      if (!folderMap.has(key)) {
        folderMap.set(key, item);
      } else {
        const existing = folderMap.get(key);
        const timeExisting = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const timeIncoming = new Date(item.updatedAt || item.createdAt || 0).getTime();
        // 选择更新时间较新的作为展示项
        folderMap.set(key, timeIncoming >= timeExisting ? item : existing);
      }
    } else if (item) {
      others.push(item);
    }
  }
  return [...folderMap.values(), ...others];
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

// ------------------------------------------------------------
// FilePreview 组件
// ------------------------------------------------------------
const FilePreview = ({ file, isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [panelWidth, setPanelWidth] = useState(50); // 初始宽度50%
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartWidth, setDragStartWidth] = useState(50);

  useEffect(() => {
    if (isOpen && file) {
      loadPreview();
    }
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [isOpen, file]);

  const loadPreview = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await downloadFile(file._id, null); // 预览不需要进度回调
      const previewType = getPreviewType(file.originalName || file.filename);
      
      if (previewType === 'image') {
        const blob = new Blob([response.data], { type: response.headers['content-type'] });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } else if (previewType === 'pdf') {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } else if (previewType === 'text') {
        if (typeof response.data === 'string') {
          setPreviewUrl(response.data);
        } else if (response.data instanceof ArrayBuffer) {
          const text = new TextDecoder('utf-8').decode(response.data);
          setPreviewUrl(text);
        } else if (response.data instanceof Uint8Array) {
          const text = new TextDecoder('utf-8').decode(response.data);
          setPreviewUrl(text);
        } else {
          // 如果是其他类型，尝试转换为Blob再读取
          const blob = new Blob([response.data], { type: 'text/plain' });
          const text = await blob.text();
          setPreviewUrl(text);
        }
      } else if (['excel', 'word', 'powerpoint'].includes(previewType)) {
        // Office文档不需要下载内容，直接显示提示信息
        setPreviewUrl('office-document');
      } else if (previewType === 'cad') {
        // CAD文件不需要下载内容，直接显示提示信息
        setPreviewUrl('cad-document');
      } else {
        setError('暂不支持此文件类型的预览');
      }
    } catch (err) {
      setError('预览加载失败: ' + (err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 拖拽开始
  const handleDragStart = (e) => {
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartWidth(panelWidth);
  };

  // 拖拽过程中
  const handleDragMove = useCallback((e) => {
    if (!isDragging) return;
    
    const deltaX = e.clientX - dragStartX;
    const windowWidth = window.innerWidth;
    const deltaPercent = (deltaX / windowWidth) * 100;
    const newWidth = Math.max(20, Math.min(80, dragStartWidth + deltaPercent)); // 限制在20%-80%之间
    
    setPanelWidth(newWidth);
  }, [isDragging, dragStartX, dragStartWidth]);

  // 拖拽结束
  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 添加全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const renderPreviewContent = () => {
    if (loading) {
      return <div className="preview-loading">正在加载预览...</div>;
    }
    
    if (error) {
      return <div className="preview-error">{error}</div>;
    }
    
    // 根据 previewUrl 的值来判断显示内容
    if (previewUrl === 'office-document') {
      return (
        <div className="preview-office">
          <div className="office-preview-message">
            <h4>Office 文档预览</h4>
            <p>暂不支持 {getFileExtension(file.originalName || file.filename).toUpperCase()} 文件的在线预览。</p>
            <p>请下载文件后使用相应的应用程序打开。</p>
          </div>
        </div>
      );
    }
    
    if (previewUrl === 'cad-document') {
      return (
        <div className="preview-cad">
          <div className="cad-preview-message">
            <h4>CAD 文件预览</h4>
            <p>暂不支持 {getFileExtension(file.originalName || file.filename).toUpperCase()} 文件的在线预览。</p>
            <p>请下载文件后使用 AutoCAD 或其他 CAD 软件打开。</p>
            <div className="cad-file-info">
              <p><strong>文件类型:</strong> {getFileExtension(file.originalName || file.filename).toUpperCase()}</p>
              <p><strong>文件大小:</strong> {formatBytes(file.size)}</p>
              <p><strong>建议软件:</strong> AutoCAD, DraftSight, LibreCAD</p>
            </div>
          </div>
        </div>
      );
    }
    
    // 其他文件类型的预览
    const previewType = getPreviewType(file.originalName || file.filename);
    switch (previewType) {
      case 'image':
        return <img src={previewUrl} alt="预览" className="preview-image" />;
      case 'pdf':
        return <iframe src={previewUrl} className="preview-iframe" title="PDF预览" />;
      case 'text':
        return <pre className="preview-text">{previewUrl}</pre>;
      default:
        return <div className="preview-unsupported">不支持的文件类型</div>;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`file-preview-overlay ${isOpen ? 'open' : ''}`}>
      <div 
        className="file-preview-panel"
        style={{ width: `${panelWidth}%` }}
      >
        <div className="preview-header">
          <h3 className="preview-title">
            {fixEncoding(file.originalName || file.filename)}
          </h3>
          <button className="preview-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="preview-content">
          {renderPreviewContent()}
        </div>
        <div 
          className="resize-handle"
          onMouseDown={handleDragStart}
        />
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// FileUpload 组件
// ------------------------------------------------------------
const FileUpload = ({ onUploadSuccess, fileType = 'regular', userRole, currentFolder = null, folderPath = [], onFolderChange }) => {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({});
  const [folderStructure, setFolderStructure] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(currentFolder);
  const [currentPath, setCurrentPath] = useState('Home');
  const [uploadPath, setUploadPath] = useState('Home'); // 新增：专门用于上传的路径
  const [folderPaths, setFolderPaths] = useState(new Map());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderName, setFolderName] = useState(null);
  const dropdownRef = useRef(null);
  const folderInputRef = useRef(null);
  const fileInputRef = useRef(null);
  
  // 新增：归档进度状态
  const [archivingProgress, setArchivingProgress] = useState({});
  const [archivingFiles, setArchivingFiles] = useState(new Set());

  // 新增：防抖相关的状态
  const [hoveredFolder, setHoveredFolder] = useState(null);
  const hoverTimeoutRef = useRef(null);

  // 新增：层级悬停状态管理
  const [hoveredHierarchy, setHoveredHierarchy] = useState(new Set());
  const hierarchyTimeoutRef = useRef(null);

  // 新增：按钮按下效果状态
  const [uploadButtonPressed, setUploadButtonPressed] = useState(false);

  // 同步当前文件夹和路径
  useEffect(() => {
    setSelectedFolder(currentFolder);
    if (folderPath && Array.isArray(folderPath) && folderPath.length > 0) {
      const pathString = 'Home/' + folderPath.map(f => f.originalName || f.filename).join('/');
      setCurrentPath(pathString);
    } else {
      setCurrentPath('Home');
    }
  }, [currentFolder, folderPath]);

  // 监听selectedFolder变化，确保uploadPath显示正确
  useEffect(() => {
    if (selectedFolder && folderPaths.has(selectedFolder)) {
      const path = folderPaths.get(selectedFolder);
      if (path && path !== uploadPath) {
        console.log('[FOLDER] 更新上传路径显示:', {
          selectedFolder,
          path,
          uploadPath
        });
        setUploadPath(path);
      }
    } else if (selectedFolder && !folderPaths.has(selectedFolder)) {
      // 如果selectedFolder存在但路径映射中没有，生成默认路径
      const defaultPath = `Home/文件夹_${selectedFolder}`;
      console.warn('[FOLDER] 路径映射中不存在，使用默认路径:', {
        selectedFolder,
        defaultPath
      });
      setUploadPath(defaultPath);
    } else if (!selectedFolder && uploadPath !== 'Home') {
      setUploadPath('Home');
    }
  }, [selectedFolder, folderPaths]); // 移除uploadPath依赖，避免无限循环

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

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      if (hierarchyTimeoutRef.current) {
        clearTimeout(hierarchyTimeoutRef.current);
      }
    };
  }, []);

  // 所有支持的文件类型定义
  const allAcceptedExtensions = {
    regular: ['.txt','.md','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.csv','.html','.json','.jpg','.jpeg','.png','.svg','.bak','.log','.err','.bmp','.db','.lsp','.fas','.dat','.tmp'],
    cad: ['.dwg','.dxf','.stp','.step','.igs','.iges','.sldprt','.sldasm','.dwl','.dwl2','.smbx','.dgn','.dst','.sbp',".zip",".rar",".7z",".tar",".gz",".bz2",'.ovkml','.ovobj'],
    code: ['.c','.cpp','.h','.java','.js','.py','.php','.sh','.css','.json','.xml']
  };

  // 合并所有文件类型为统一的accept属性
  const unifiedAccept = Object.values(allAcceptedExtensions)
    .flat()
    .join(',');

  // 递归构建文件夹树形结构和路径映射
  const buildFolderStructure = useCallback(async (parentId = null, level = 0, parentPath = 'Home') => {
    try {
      // 获取所有当前目录的一级子文件夹
      const data = await getUserFiles({ folder: parentId });
      const foldersList = data.files.filter(f => f.isFolder);

      // 默认按文件名从大到小排序下拉框选项
      foldersList.sort((a, b) => {
        const nameA = (a.originalName || a.filename).toLowerCase();
        const nameB = (b.originalName || b.filename).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      const structure = await Promise.all(foldersList.map(async folder => {
        const currentPath = parentPath === 'Home' ? 
          `${parentPath}/${folder.originalName || folder.filename}` : 
          `${parentPath}/${folder.originalName || folder.filename}`;
        
        // 确保路径被正确设置
        setFolderPaths(prev => {
          const newMap = new Map(prev);
          // 避免重复设置相同的路径
          if (!newMap.has(folder._id) || newMap.get(folder._id) !== currentPath) {
            newMap.set(folder._id, currentPath);
          }
          return newMap;
        });
        //递归构建子树
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
  }, []);

  useEffect(() => {
    const fetchFoldersData = async () => {
      try {
        console.log('[FOLDER] 开始获取文件夹结构');
        setFolderPaths(new Map().set(null, 'Home'));
        const structure = await buildFolderStructure();
        setFolderStructure(structure);
        console.log('[FOLDER] 文件夹结构获取完成');
      } catch (err) {
        setError('获取文件夹列表失败: ' + (err.message || '未知错误'));
      }
    };
    fetchFoldersData();
  }, []); // 移除buildFolderStructure依赖，避免无限循环

  // 处理文件夹选择变化
  const handleFolderSelect = (folderId, path) => {
    console.log('[FOLDER] 开始选择文件夹:', {
      folderId,
      path,
      currentSelectedFolder: selectedFolder
    });
    
    // 批量更新状态，避免多次渲染
    setSelectedFolder(folderId);
    
    // 确保路径有效
    let displayPath = 'Home';
    if (folderId && path) {
      displayPath = path;
    } else if (folderId) {
      // 如果只有folderId但没有path，生成默认路径
      displayPath = `Home/文件夹_${folderId}`;
      console.warn('[FOLDER] 使用默认路径:', displayPath);
    }
    
    setUploadPath(displayPath);
    setIsDropdownOpen(false);
    setHoveredFolder(null);
    setHoveredHierarchy(new Set());
    
    console.log('[FOLDER] 选择文件夹完成:', {
      folderId,
      path,
      displayPath,
      selectedFolder: folderId
    });
  };

  // 处理下拉框点击
  const handleDropdownClick = async () => {
    const newState = !isDropdownOpen;
    setIsDropdownOpen(newState);
    
    if (newState && folderStructure.length === 0) {
      // 只有在文件夹结构为空时才重新获取
      console.log('[FOLDER] 下拉框打开，获取文件夹结构');
      try {
        setFolderPaths(new Map().set(null, 'Home'));
        const structure = await buildFolderStructure();
        setFolderStructure(structure);
      } catch (err) {
        setError('获取文件夹列表失败: ' + (err.message || '未知错误'));
      }
    }
  };

  // 获取文件夹的完整层级路径
  const getFolderHierarchy = useCallback((folderId, structure = folderStructure) => {
    const hierarchy = new Set();
    
    const findHierarchy = (folders, targetId, currentPath = []) => {
      for (const folder of folders) {
        const newPath = [...currentPath, folder._id];
        
        if (folder._id === targetId) {
          newPath.forEach(id => hierarchy.add(id));
          return true;
        }
        
        if (folder.children && folder.children.length > 0) {
          if (findHierarchy(folder.children, targetId, newPath)) {
            return true;
          }
        }
      }
      return false;
    };
    
    findHierarchy(structure, folderId);
    return hierarchy;
  }, [folderStructure]);

  // 处理鼠标悬停（带层级管理）
  const handleMouseEnter = (folderId) => {
    // 清除之前的定时器
    if (hierarchyTimeoutRef.current) {
      clearTimeout(hierarchyTimeoutRef.current);
    }
    
    // 设置新的定时器，延迟显示子菜单
    hierarchyTimeoutRef.current = setTimeout(() => {
      const hierarchy = getFolderHierarchy(folderId);
      setHoveredHierarchy(hierarchy);
      setHoveredFolder(folderId);
    }, 100); // 减少延迟时间，提高响应性
  };

  // 处理鼠标离开
  const handleMouseLeave = () => {
    if (hierarchyTimeoutRef.current) {
      clearTimeout(hierarchyTimeoutRef.current);
    }
    
    // 延迟隐藏子菜单，给用户时间移动到子菜单
    hierarchyTimeoutRef.current = setTimeout(() => {
      setHoveredHierarchy(new Set());
      setHoveredFolder(null);
    }, 200); // 增加延迟时间，确保稳定性
  };

  // 递归生成文件夹选项
  const FolderOption = ({ folder, level = 0 }) => {
    const isInHierarchy = hoveredHierarchy.has(folder._id);
    const hasChildren = folder.children && folder.children.length > 0;
    const isSelected = selectedFolder === folder._id;
    
    return (
      <div 
        className="cascading-option-wrapper"
        onMouseEnter={() => hasChildren && handleMouseEnter(folder._id)}
        onMouseLeave={handleMouseLeave}
      >
                          <div 
          className={`cascading-option ${isSelected ? 'selected' : ''}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const path = folderPaths.get(folder._id);
            console.log('[FOLDER] 点击文件夹本体:', {
              folderId: folder._id,
              folderName: folder.originalName || folder.filename,
              path,
              level,
              eventTarget: e.target,
              eventCurrentTarget: e.currentTarget
            });
            
            // 如果路径不存在，动态生成路径
            let finalPath = path;
            if (!path) {
              console.warn('[FOLDER] 路径不存在，动态生成:', {
                folderId: folder._id,
                folderName: folder.originalName || folder.filename
              });
              
              // 动态生成路径：Home/文件夹名
              finalPath = `Home/${folder.originalName || folder.filename}`;
              
              // 更新路径映射
              setFolderPaths(prev => {
                const newMap = new Map(prev);
                newMap.set(folder._id, finalPath);
                return newMap;
              });
            }
            
            // 点击文件夹本体直接选择，不展开子菜单
            handleFolderSelect(folder._id, finalPath);
          }}
        >
          <span className="folder-icon">📁</span>
          <span className="folder-name">{folder.originalName || folder.filename}</span>
          {hasChildren && (
            <span 
              className="submenu-arrow"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[FOLDER] 点击展开符号:', {
                  folderId: folder._id,
                  folderName: folder.originalName || folder.filename
                });
                // 点击展开符号时触发悬停效果
                handleMouseEnter(folder._id);
              }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                console.log('[FOLDER] 悬停展开符号:', {
                  folderId: folder._id,
                  folderName: folder.originalName || folder.filename
                });
                // 悬停展开符号时也触发悬停效果
                handleMouseEnter(folder._id);
              }}
            >▶</span>
          )}
        </div>
        {hasChildren && (
                      <div 
              className={`cascading-submenu ${isInHierarchy ? 'visible' : ''}`}
              onMouseEnter={(e) => {
                e.stopPropagation();
                // 确保子菜单保持显示，并更新层级
                const hierarchy = getFolderHierarchy(folder._id);
                setHoveredHierarchy(hierarchy);
                setHoveredFolder(folder._id);
              }}
              onMouseLeave={(e) => {
                e.stopPropagation();
                handleMouseLeave();
              }}
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
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
    setUploadComplete(false);
    setSuccessMessage('');
    setProgress({});
    // 重置 input 值，避免选择相同文件时不触发 onChange
    try { e.target.value = null; } catch (_) {}
  };

  // 检查路径长度是否超过限制
  const checkPathLength = (filePath, fileName) => {
    // Windows 最大路径长度限制为 260 字符，UNC 路径为 32767 字符
    // 但为了安全起见，我们设置一个合理的限制
    const MAX_PATH_LENGTH = 240; // 给一些余量
    
    // 模拟最终存储路径：\\10.172.79.26\storage\uploads\folderName\filePath\fileName
    const basePath = '\\\\10.172.79.26\\storage\\uploads\\';
    const fullPath = basePath + filePath + '\\' + fileName;
    
    return fullPath.length <= MAX_PATH_LENGTH;
  };

  const handleFolderChange = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // 获取文件夹名称（从第一个文件的路径中提取）
    const firstFile = files[0];
    const pathParts = firstFile.webkitRelativePath.split('/');
    const folderName = pathParts[0];
    
    if (!folderName) {
      setError('无法获取文件夹名称');
      setFolderFiles([]);
      setFolderName(null);
      try { e.target.value = null; } catch (_) {}
      return;
    }

    // 验证文件格式和路径长度
    const validFiles = [];
    const pathLengthErrors = [];
    
    for (const file of files) {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isValidFile = Object.values(allAcceptedExtensions).flat().includes(fileExt);
      
      if (!isValidFile) {
        setError(`不支持的文件格式: ${fileExt} (${file.name})`);
        setFolderFiles([]);
        setFolderName(null);
        try { e.target.value = null; } catch (_) {}
        return;
      }
      
      // 检查路径长度
      const filePath = file.webkitRelativePath.replace(file.name, '').replace(/\/$/, '');
      if (!checkPathLength(filePath, file.name)) {
        pathLengthErrors.push(file.webkitRelativePath);
      } else {
        validFiles.push(file);
      }
    }
    
    // 如果有路径长度超限的文件，显示错误
    if (pathLengthErrors.length > 0) {
      setError(`文件上传错误：文件夹太深，组合出来的文件名过长。请考虑分次上传。\n\n超限文件：\n${pathLengthErrors.slice(0, 5).join('\n')}${pathLengthErrors.length > 5 ? '\n...' : ''}`);
      setFolderFiles([]);
      setFolderName(null);
      try { e.target.value = null; } catch (_) {}
      return;
    }

    setFolderFiles(validFiles);
    setFolderName(folderName);
    setError('');
    setUploadComplete(false);
    setSuccessMessage('');
    setProgress({});
    // 重置 input 值，避免选择相同文件夹时不触发 onChange
    try { e.target.value = null; } catch (_) {}
  };

  // 归档进度动画函数
  const startArchivingProgress = async (folderName, totalFiles) => {
    console.log(`开始归档文件夹: ${folderName}，共 ${totalFiles} 个文件`);
    
    // 设置初始进度
    setArchivingProgress(prev => ({ ...prev, [folderName]: 0 }));
    
    // 使用轮询方式获取真实进度
    const pollProgress = async () => {
      try {
        const response = await getArchivingProgress(folderName);
        const progress = response.progress || 0;
        
        setArchivingProgress(prev => ({ ...prev, [folderName]: progress }));
        console.log(`归档进度: ${progress}% - 正在整理文件结构...`);
        
        if (progress < 100 && response.status !== 'completed') {
          // 继续轮询
          setTimeout(pollProgress, 200);
        } else {
          // 归档完成
          setArchivingProgress(prev => ({ ...prev, [folderName]: 100 }));
          console.log(`归档完成: 100% - 文件夹结构整理完成`);
          
          // 归档完成后延迟清除状态
          setTimeout(() => {
            setArchivingFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(folderName);
              return newSet;
            });
            setArchivingProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[folderName];
              return newProgress;
            });
          }, 1000);
        }
      } catch (error) {
        console.error('获取归档进度失败:', error);
        // 如果API调用失败，使用模拟进度
        let currentProgress = 0;
        const progressInterval = setInterval(() => {
          const increment = Math.max(1, Math.floor(totalFiles / 50));
          currentProgress = Math.min(98, currentProgress + increment);
          
          setArchivingProgress(prev => ({ ...prev, [folderName]: currentProgress }));
          
          if (currentProgress >= 98) {
            clearInterval(progressInterval);
            setTimeout(() => {
              setArchivingProgress(prev => ({ ...prev, [folderName]: 100 }));
              setTimeout(() => {
                setArchivingFiles(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(folderName);
                  return newSet;
                });
                setArchivingProgress(prev => {
                  const newProgress = { ...prev };
                  delete newProgress[folderName];
                  return newProgress;
                });
              }, 1000);
            }, 300);
          }
        }, 150);
      }
    };
    
    // 开始轮询
    setTimeout(pollProgress, 500);
  };

  const handleFolderUpload = async (e) => {
    e.preventDefault();
    if (!folderFiles.length || folderName == null) return;
    
    // 立即设置上传状态，防止重复点击
    setIsUploading(true);
    setUploadButtonPressed(true);
    
    // 检测当前目录是否有同名（前置检查，异步情况下仍可能冲突，后台再校验409）
    try {
      const currentFiles = await getUserFiles({ folder: selectedFolder });
      const existingFiles = currentFiles.files || [];
      const hasSameNameFolder = existingFiles.some(file => file.isFolder && (file.originalName || file.filename) === folderName);
      const hasSameNameFile = existingFiles.some(file => !file.isFolder && (file.originalName || file.filename) === folderName);
      if (hasSameNameFolder) {
        setError(`文件夹 "${folderName}" 已存在，请重命名后重新上传`);
        setIsUploading(false);
        setUploadButtonPressed(false);
        return;
      }
      if (hasSameNameFile) {
        setError(`文件 "${folderName}" 已存在，请重命名后重新上传`);
        setIsUploading(false);
        setUploadButtonPressed(false);
        return;
      }
    } catch (preCheckErr) {
      // 如果预检查失败，不阻断上传，交由后端最终判定
      console.warn('同名预检查失败，继续上传以由后端判定:', preCheckErr);
    }
    
    // 计算总文件大小
    const totalSize = folderFiles.reduce((sum, file) => sum + file.size, 0);
    
    // 检查存储空间
    const hasEnoughSpace = await checkStorageSpace(totalSize);
    if (!hasEnoughSpace) {
      setIsUploading(false);
      setUploadButtonPressed(false);
      return;
    }

    setError('');
    setUploadComplete(false);
    setSuccessMessage('');

    try {
      const formData = new FormData();
      formData.append('folderName', folderName);
      
      if (selectedFolder) {
        formData.append('folderId', selectedFolder);
      }

      // 添加所有文件，保持相对路径（使用三划线 ___ 作为唯一分隔符编码整个路径+文件名）
      folderFiles.forEach(file => {
        const encodedFullPath = file.webkitRelativePath.replace(/[\\/]/g, '___');
        const fileWithPath = new File([file], encodedFullPath, {
          type: file.type,
          lastModified: file.lastModified
        });
        formData.append('files', fileWithPath);
      });

      const response = await uploadFolder(formData, {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setProgress({ [folderName]: percentCompleted });
          
          // 当上传达到100%时，立即切换到归档阶段
          if (percentCompleted >= 100) {
            // 立即切换到归档阶段，不等待
            setProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[folderName];
              return newProgress;
            });
            
            // 设置归档状态并立即开始进度
            setArchivingFiles(prev => new Set(prev).add(folderName));
            setArchivingProgress(prev => ({ ...prev, [folderName]: 0 }));
            
            // 立即开始归档进度动画，传递一个立即完成的 Promise
            startArchivingProgress(folderName, folderFiles.length);
          }
        }
      });

      setUploadComplete(true);
      setSuccessMessage(`文件夹 "${folderName}" 上传成功！包含 ${response.files.length} 个文件`);
      
      if (onUploadSuccess) {
        onUploadSuccess({
          type: 'folder',
          targetFolder: selectedFolder ?? null,
          folder: response.folder,
          items: response.files
        });
      }

      // 2秒后清除状态
      setTimeout(() => {
        setFolderFiles([]);
        setFolderName(null);
        setProgress({});
        setArchivingProgress({});
        setArchivingFiles(new Set());
        setUploadComplete(false);
        setSuccessMessage('');
        // 清空文件夹 input 值，允许再次选择同名文件夹触发 onChange
        if (folderInputRef.current) {
          try { folderInputRef.current.value = null; } catch (_) {}
        }
      }, 2000);

    } catch (error) {
      console.error('文件夹上传失败:', error);
      setError(mapApiErrorMessage(error, '文件夹上传失败'));
    } finally {
      setIsUploading(false);
      setUploadButtonPressed(false);
      setProgress({});
      setArchivingProgress({});
      setArchivingFiles(new Set());
      // 兜底清空，防止同名文件夹二次选择不触发 onChange
      if (folderInputRef.current) {
        try { folderInputRef.current.value = null; } catch (_) {}
      }
    }
  };

  // 检查存储空间是否足够
  const checkStorageSpace = async (totalSize) => {
    try {
      const response = await getAdminStorageUsage();
      const { totalUsedStorage, totalQuota } = response;
      const remaining = totalQuota - totalUsedStorage;
      console.log('[USED] 使用空间',totalUsedStorage);
      console.log('[QUOTA] 总容量',totalQuota);
      console.log('[REMAINING] 剩余空间',remaining);
      
      if (totalSize > remaining) {
        const errorMsg = `上传失败 云空间不足 只剩余${formatBytes(remaining)}`;
        setError(errorMsg);
        return false;
      }
      return true;
    } catch (err) {
      setError('获取存储空间信息失败');
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    
    // 立即设置上传状态，防止重复点击
    setIsUploading(true);
    setUploadButtonPressed(true);
    
    // 计算总文件大小
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    // 检查存储空间
    const hasEnoughSpace = await checkStorageSpace(totalSize);
    if (!hasEnoughSpace) {
      setIsUploading(false);
      setUploadButtonPressed(false);
      return; // 错误信息已在checkStorageSpace中设置
    }
    
    // console.log('[UPLOAD] 开始上传文件，总数量:', files.length);
    // console.log('[UPLOAD] 当前选择的文件夹:', selectedFolder || 'Home');
    setError('');
    setUploadComplete(false);
    setSuccessMessage('');
    
    // 设置全局上传状态
    if (window.uploadState) {
      window.uploadState.isUploading = true;
    }
    
    // 初始化所有文件的进度条为0
    const initialProgress = {};
    files.forEach(file => {
      initialProgress[file.name] = 0;
    });
    setProgress(initialProgress);
    
    try {
      const uploadPromises = files.map(async (file) => {
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
              setProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
            }
          });
          // console.log(`[UPLOAD] ✅ 文件 ${file.name} 上传成功! 服务器响应:`, response);
          return response;
        } catch (error) {
          // console.log(`[UPLOAD] ❌ 文件 ${file.name} 上传失败:`, error);
          throw error;
        }
      });
      
      // 等待所有文件上传完成
      const results = await Promise.all(uploadPromises);
      
      // console.log('[UPLOAD] 🎉 所有文件上传完成!');
      setUploadComplete(true);
      setSuccessMessage(`共成功上传${formatBytes(totalSize)}文件`);
      
      // 增量合并当前目录
      if (onUploadSuccess) {
        try {
          const items = (results || []).map(r => r?.file).filter(Boolean).map(f => ({
            _id: f.id,
            filename: f.filename,
            originalName: f.originalName,
            size: f.size,
            isFolder: false,
            parentFolder: f.parentFolder
          }));
          onUploadSuccess({ type: 'files', targetFolder: selectedFolder ?? null, items });
        } catch (_) {}
      }

      // 2秒后隐藏进度条和成功消息
      setTimeout(() => {
        setFiles([]);
        setFolderFiles([]);
        setFolderName('');
        setProgress({});
        setUploadComplete(false);
        setSuccessMessage('');
        
        // 重置全局上传状态
        if (window.uploadState) {
          window.uploadState.isUploading = false;
        }
        
        if (onUploadSuccess) onUploadSuccess();
      }, 2000);
      
    } catch (err) {
      // console.log('[UPLOAD] ❌ 上传过程中发生错误:', err);
      setError(err.response?.data?.error || `上传失败: ${err.message || '未知错误'}`);
      setUploadComplete(false);
      setSuccessMessage('');
    } finally {
      // console.log('[UPLOAD] 上传流程结束，重置上传状态');
      setIsUploading(false);
      setUploadButtonPressed(false);
      
      // 重置全局上传状态
      if (window.uploadState) {
        window.uploadState.isUploading = false;
      }
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
            <span className="current-path">{uploadPath}</span>
            <span className={`dropdown-arrow ${isDropdownOpen ? 'open' : ''}`}>▼</span>
          </div>
          {isDropdownOpen && (
            <div className="cascading-container">
                              <div 
                  className="cascading-option"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('[FOLDER] 点击Home选项');
                    handleFolderSelect(null, 'Home');
                  }}
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
                ref={fileInputRef}
            />
          </label>
        </div>

        {files.length > 0 && (
          <>
            <div className="file-info">
              {files.map(f => (
                <div key={f.name} className="file-item">
                  <span>{f.name} | <strong>{(f.size / 1024 / 1024).toFixed(2)} MB</strong></span>
                  {(progress[f.name] > 0 || uploadComplete) && (
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar"
                        style={{ width: `${progress[f.name] || 0}%` }}
                      />
                      <span className="progress-text">{progress[f.name] || 0}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {successMessage && (
              <div className="success-message">
                {successMessage}
              </div>
            )}
            
            {!uploadComplete && (
            <button 
              type="submit" 
              disabled={isUploading}
              className={`upload-button ${uploadButtonPressed ? 'upload-button-pressed' : ''}`}
            >
              {isUploading ? '上传中...' : '开始上传'}
            </button>
            )}
          </>
        )}
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
      </form>

      {/* 文件夹上传部分 */}
      <div className="folder-upload-section">
        <h4>上传文件夹</h4>
        <form onSubmit={handleFolderUpload}>
          <div className="folder-input-container">
            <label className="folder-label" style={{ fontWeight: 'bold' }}>
              {folderFiles.length ? `${folderFiles.length} 个文件` : '选择文件夹'}
              <input 
                type="file" 
                onChange={handleFolderChange}
                webkitdirectory=""
                directory=""
                multiple
                disabled={isUploading}
                style={{ display: 'none' }}
                ref={folderInputRef}
              />
            </label>
          </div>

          {folderFiles.length > 0 && (
            <>
              <div className="folder-info">
                <div className="folder-item">
                  <span>文件夹: {folderName} | <strong>{folderFiles.length} 个文件</strong></span>
                  {(progress[folderName] > 0 || uploadComplete) && (
                    <div className="progress-bar-container">
                      <div 
                        className="progress-bar"
                        style={{ width: `${progress[folderName] || 0}%` }}
                      />
                      <span className="progress-text">{progress[folderName] || 0}%</span>
                    </div>
                  )}
                  {archivingFiles.has(folderName) && (
                    <div className="archiving-progress-container">
                      <div 
                        className="archiving-progress-fill"
                        style={{ width: `${archivingProgress[folderName] || 0}%` }}
                      />
                      <div className="archiving-text-container">
                        {/* <span className="archiving-progress-text">
                          {archivingProgress[folderName] || 0}%
                        </span> */}
                        <span className="archiving-text">归档中</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {successMessage && (
                <div className="success-message">
                  {successMessage}
                </div>
              )}
              
              {!uploadComplete && (
                <button 
                  type="submit" 
                  disabled={isUploading || folderName == null}
                  className={`upload-button ${uploadButtonPressed ? 'upload-button-pressed' : ''}`}
                >
                  {isUploading ? '上传中...' : '开始上传'}
                </button>
              )}
            </>
          )}
        </form>
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// FileList 组件
// ------------------------------------------------------------
  const FileList = forwardRef(({ userRole, onDeleteSuccess, className = 'file-list', currentFolder, folderPath, onFolderChange, onOpenTagModal, setCurrentFolder, setFolderPath, searchBackup, setSearchBackup, isFromSearch, setIsFromSearch, latestRequestRef, searchInput, setSearchInput, searchTerm, setSearchTerm, searchTags, setSearchTags, globalSearch, setGlobalSearch, files, setFiles, setIsFromLocationJump, setNavigationState, navigationState, availableTags, refreshAllTags }, ref) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({});
  const [downloadingFiles, setDownloadingFiles] = useState(new Set());
  const [parsingProgress, setParsingProgress] = useState({});
  const [parsingFiles, setParsingFiles] = useState(new Set());
  const [deletingProgress, setDeletingProgress] = useState({});
  const [deletingFiles, setDeletingFiles] = useState(new Set());
  
  // 标签搜索相关状态
  const [tagInputValue, setTagInputValue] = useState(''); // 标签输入框的值
  const [hotTags, setHotTags] = useState([]); // 热门标签
  const [availableTagsForSearch, setAvailableTagsForSearch] = useState([]); // 可用的标签列表
  const [searchLoading, setSearchLoading] = useState(false); // 搜索加载状态
  
  // 搜索中断相关状态
  const [searchAbortController, setSearchAbortController] = useState(null);
  const [lastSearchParams, setLastSearchParams] = useState(null);

  // 新增：按钮按下效果和加载状态
  const [locationButtonPressed, setLocationButtonPressed] = useState(new Set());
  const [locationLoading, setLocationLoading] = useState(new Set());

  // 通用搜索函数(enter或者按搜索按钮后触发)，支持中断功能
  const performSearch = async (searchParams, isFromEnter = false) => {
    // ---------------------
    // 检查搜索参数是否有变化
    // ---------------------
    const currentParams = JSON.stringify(searchParams);
    const hasParamsChanged = lastSearchParams !== currentParams;
    // 如果正在搜索且参数有变化，中断当前搜索
    if (searchLoading && hasParamsChanged) {
      if (searchAbortController) {
        searchAbortController.abort();
      }
      setError('已终止旧搜索进程，重新搜索...');
      // 短暂延迟后清除错误信息
      setTimeout(() => setError(''), 600);
    }
    
    // 创建新的 AbortController 用于中断搜索调用
    const abortController = new AbortController();
    setSearchAbortController(abortController);
    setSearchLoading(true);
    // 更新最后搜索参数
    setLastSearchParams(currentParams);
    
    // ---------------------
    // 开始搜索
    // ---------------------
    try {
      // 调用API搜索文件
      const response = await searchFiles(searchParams, abortController.signal);
      // 检查是否被中断
      if (abortController.signal.aborted) {
        return;
      }
      setFiles(response.files);
      if (isFromEnter) {
        setSearchTerm(searchParams.search);
      }
      
      // 设置搜索状态机
      setNavigationState(prev => ({
        ...prev,
        currentState: 'search',
        searchInput: searchParams.search,
        searchTerm: searchParams.search,
        searchTags: searchParams.tags,
        globalSearch: searchParams.globalSearch,
        // 备份搜索状态 用于智能返回smartback功能
        backup: {
          searchInput: searchParams.search,
          searchTerm: searchParams.search,
          searchTags: searchParams.tags,
          globalSearch: searchParams.globalSearch,
          files: response.files,
          currentFolder,
          folderPath: [...folderPath]
        }
      }));
    } catch (error) {
      // 如果是中断错误或取消错误，不显示错误信息，直接返回
      if (error.name === 'AbortError' || error.name === 'CanceledError' || error.code === 'ERR_CANCELED') {
        return;
      }
      // 其他错误仍然显示
      console.error('搜索文件失败:', error);
      setError('搜索文件失败: ' + error.message);
    } finally {
      // 只有在没有被中断的情况下才重置状态
      if (!abortController.signal.aborted) {
        setSearchLoading(false);
        setSearchAbortController(null);
      }
    }
  };

  // 按回车键搜索
  const handleSearchSubmit = async (e) => {
    if (e.key === 'Enter') {
      const searchParams = {
        search: searchInput, // 搜索文件名
        tags: searchTags,    // 标签筛选
        folder: currentFolder,
        sort: sortBy,
        globalSearch: globalSearch // 全局搜索参数
      };
      
      await performSearch(searchParams, true);
    }
  };

  const handleAddSearchTag = (tagName) => {
    if (!searchTags.includes(tagName)) {
      setSearchTags([...searchTags, tagName]);
    }
  };

  const handleRemoveSearchTag = (tagName) => {
    setSearchTags(searchTags.filter(tag => tag !== tagName));
  };

  const handleSearchWithTags = async () => {
    const searchParams = {
      search: searchInput, // 搜索文件名
      tags: searchTags,    // 标签筛选
      folder: currentFolder,
      sort: sortBy,
      globalSearch: globalSearch // 全局搜索参数
    };
    
    await performSearch(searchParams, false);
  };

  // 标签输入框处理函数
  const handleTagInputChange = (e) => {
    setTagInputValue(e.target.value);
  };

  const handleTagInputSubmit = (e) => {
    if (e.key === 'Enter' && tagInputValue.trim()) {
      const newTag = tagInputValue.trim();
      if (!searchTags.includes(newTag)) {
        setSearchTags([...searchTags, newTag]);
      }
      setTagInputValue('');
    }
  };

  const handleSearchChange = (e) => {
    setSearchInput(e.target.value);
  };

  const handleGlobalSearchChange = (e) => {
    const newGlobalSearch = e.target.checked;
    setGlobalSearch(newGlobalSearch);
    // 只更新状态，不触发搜索
  };

  const handleSortChange = async (e) => {
    const newSortBy = e.target.value;
    setSortBy(newSortBy);
    
    // 如果有搜索条件，对现有结果进行客户端排序
    if (searchInput || searchTags.length > 0) {
      try {
        setSearchLoading(true);
        
        // 对现有的 files 数组进行客户端排序
        let sortedFiles = [...files];
        
        switch (newSortBy) {
          case 'name_asc':
            sortedFiles = sortFilesByName(sortedFiles, true);
            break;
          case 'name_desc':
            sortedFiles = sortFilesByName(sortedFiles, false);
            break;
          case 'extension_asc':
            sortedFiles = sortFilesByExtension(sortedFiles, true);
            break;
          case 'extension_desc':
            sortedFiles = sortFilesByExtension(sortedFiles, false);
            break;
          case 'size_asc':
            sortedFiles = sortFilesBySize(sortedFiles, true);
            break;
          case 'size_desc':
            sortedFiles = sortFilesBySize(sortedFiles, false);
            break;
          case 'time_asc':
            sortedFiles = sortFilesByTime(sortedFiles, true);
            break;
          case 'time_desc':
            sortedFiles = sortFilesByTime(sortedFiles, false);
            break;
          default:
            // 默认按名称升序
            sortedFiles = sortFilesByName(sortedFiles, true);
        }
        
        setFiles(sortedFiles);
      } catch (error) {
        console.error('客户端排序失败:', error);
        setError('排序失败: ' + error.message);
      } finally {
        setSearchLoading(false);
      }
    }
    // 如果没有搜索条件，useEffect 会根据新的 sortBy 值重新获取数据
  };

  // 解析进度动画函数
  const startParsingProgress = async (fileId, closePromise) => {
    const parsingSteps = 48; // 48步到80%
    const baseDelay = 150; // 基础延迟时间
    
    // 第一阶段：平滑进度到80%
    for (let i = 1; i <= parsingSteps; i++) {
      const delay = baseDelay + Math.random() * 100; // 150-250ms随机延迟
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const progress = Math.round((i / parsingSteps) * 80); // 只到80%
      setParsingProgress(prev => ({ ...prev, [fileId]: progress }));
      
      // 在关键节点添加一些变化，让用户感受到系统在工作
      if (i % 8 === 0) {
        console.log(`解析进度: ${progress}% - 正在处理文件...`);
      }
    }
    
    // 第二阶段：等待文件写入完成（writable.close()）
    console.log(`解析进度: 80% - 等待文件写入完成...`);
    
    // 等待真正的 writable.close() 完成
    if (closePromise) {
      await closePromise;
      console.log(`writable.close() 已完成`);
    }
    
    // 最后20%快速完成
    // for (let i = 1; i <= 10; i++) {
    //   await new Promise(resolve => setTimeout(resolve, 100));
    //   const progress = 80 + Math.round((i / 10) * 20); // 80%到100%
    //   setParsingProgress(prev => ({ ...prev, [fileId]: progress }));
    // }
    
    console.log(`解析完成: 100% - 文件写入完成`);
    
    // 重置登录倒计时 - 在解析完成后
    if (window.resetIdleTimer) {
      window.resetIdleTimer();
    }
    
    // 解析完成后延迟清除状态
    setTimeout(() => {
      if (fileId === 'batch') {
        // 批量下载：清除所有选中项目的解析状态
        setParsingFiles(prev => {
          const newSet = new Set(prev);
          selectedIds.forEach(id => newSet.delete(id));
          return newSet;
        });
        setParsingProgress(prev => {
          const newProgress = { ...prev };
          selectedIds.forEach(id => {
            delete newProgress[id];
          });
          return newProgress;
        });
      } else {
        // 单个文件：清除指定文件的解析状态
        setParsingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(fileId);
          return newSet;
        });
        setParsingProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[fileId];
          return newProgress;
        });
      }
    }, 1000);
  };

  // 删除进度动画函数
  const startDeletingProgress = async (fileId, isFolder = false) => {
    console.log(`开始删除${isFolder ? '文件夹' : '文件'}: ${fileId}`);
    
    // 设置初始进度
    setDeletingProgress(prev => ({ ...prev, [fileId]: 0 }));
    
    // 根据文件类型设置不同的进度速度
    const progressSteps = isFolder ? 20 : 15; // 文件夹更多步骤，文件较少步骤
    let currentStep = 0;
    
    const progressInterval = setInterval(() => {
      currentStep++;
      const progress = Math.min(90, Math.round((currentStep / progressSteps) * 90)); // 最多到90%
      
      setDeletingProgress(prev => ({ ...prev, [fileId]: progress }));
      console.log(`删除进度: ${progress}% - 正在${isFolder ? '清理文件夹结构' : '删除文件'}...`);
      
      if (currentStep >= progressSteps) {
        clearInterval(progressInterval);
        // 等待真实的删除操作完成
        // 这里不立即设置100%，而是等待实际的删除API调用完成
      }
    }, 150); // 每150ms更新一次进度
    
    // 返回一个Promise，用于在删除完成后设置100%
    return new Promise((resolve) => {
      // 保存interval引用，以便在删除完成时清除
      window.deleteProgressIntervals = window.deleteProgressIntervals || {};
      window.deleteProgressIntervals[fileId] = progressInterval;
      
      // 保存resolve函数，以便在删除完成时调用
      window.deleteProgressResolvers = window.deleteProgressResolvers || {};
      window.deleteProgressResolvers[fileId] = resolve;
    });
  };

  const refreshFiles = async () => {
    try {
      // 后台刷新：不打断前端显示，仅设置轻量状态
      setLoading(true);
      setError('');
        
        // 创建请求标识符，用于防止竞态条件
        const requestId = Date.now();
        latestRequestRef.current = requestId;
        
        const params = {};
        if (sortBy) params.sort = sortBy;
        if (searchTerm) params.search = searchTerm;
        if (currentFolder) params.folder = currentFolder;
        // 不在refreshFiles中包含globalSearch参数，避免重复请求问题
        
        const data = await getUserFiles(params);
        
        // 检查是否是最新的请求
        if (latestRequestRef.current !== requestId) {
          console.log('⚠️ 刷新文件请求已过期，忽略结果');
          return;
        }
      
      let filesArray = Array.isArray(data.files) ? data.files : [];
      filesArray = mergeDuplicateFolders(filesArray);
      
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
      // 备份普通目录文件列表
      setNavigationState(prev => ({
        ...prev,
        normalBackup: {
          currentFolder: currentFolder || null,
          folderPath: [...(folderPath || [])],
          files: sortedFiles
        }
      }));
      // 只有在文件列表设置完成后才结束loading状态
      setLoading(false);
    } catch (err) {
      setError('获取文件列表失败: ' + (err.message || '未知错误'));
      setFiles([]);
      setLoading(false);
    }
  };

  useImperativeHandle(ref, () => ({
    refresh: refreshFiles
  }));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      // 只选择当前显示的文件（排除正在删除的文件）
      const availableFiles = files.filter(file => !deletingFiles.has(file._id));
      setSelectedIds(availableFiles.map(f => f._id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelect = (id) => {
    // 如果文件正在删除中，不允许选择
    if (deletingFiles.has(id)) {
      return;
    }
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
      // 设置批量删除状态
      setDeletingFiles(prev => new Set([...prev, ...selectedIds]));
      setDeletingProgress(prev => {
        const newProgress = { ...prev };
        selectedIds.forEach(id => {
          newProgress[id] = 0;
        });
        return newProgress;
      });
      
      // 开始批量删除进度动画
      const progressPromises = [];
      selectedIds.forEach(id => {
        const file = files.find(f => f._id === id);
        if (file) {
          const progressPromise = startDeletingProgress(id, file.isFolder);
          progressPromises.push(progressPromise);
        }
      });

      // 执行实际的批量删除操作
      await batchDeleteFiles(selectedIds);
      
      // 批量删除成功后，设置所有项目的进度为100%
      selectedIds.forEach(id => {
        setDeletingProgress(prev => ({ ...prev, [id]: 100 }));
        console.log(`批量删除完成: 100% - 项目 ${id} 已删除`);
        
        // 调用resolve函数完成进度Promise
        if (window.deleteProgressResolvers && window.deleteProgressResolvers[id]) {
          window.deleteProgressResolvers[id]();
        }
        
        // 清除进度相关状态
        if (window.deleteProgressIntervals && window.deleteProgressIntervals[id]) {
          clearInterval(window.deleteProgressIntervals[id]);
          delete window.deleteProgressIntervals[id];
        }
        if (window.deleteProgressResolvers && window.deleteProgressResolvers[id]) {
          delete window.deleteProgressResolvers[id];
        }
      });

      // 立即从文件列表中移除所有被删除的文件，并同步 normalBackup
      setFiles(prevFiles => prevFiles.filter(file => !selectedIds.includes(file._id)));
      setNavigationState(prev => ({
        ...prev,
        normalBackup: {
          ...prev.normalBackup,
          files: (Array.isArray(prev.normalBackup.files) ? prev.normalBackup.files : []).filter(file => !selectedIds.includes(file._id))
        }
      }));
      
      // 清空选中列表
      setSelectedIds([]);

      const deletedPathFolder = selectedFiles.find(file => 
        file.isFolder && folderPath.some(f => f._id === file._id)
      );

      if (deletedPathFolder) {
        const folderIndex = folderPath.findIndex(f => f._id === deletedPathFolder._id);
        if (folderIndex !== -1) {
          const parentFolder = folderPath[folderIndex - 1];
          onFolderChange(parentFolder ? parentFolder._id : null, folderPath.slice(0, folderIndex));
          
          // 若删除的是当前路径节点，则回到父目录；列表刷新交由 onFolderChange 后的 useEffect 完成
        } else {
          const newPath = folderPath.filter(f => f._id !== deletedPathFolder._id);
          onFolderChange(currentFolder, newPath);
        }
      }

      if (onDeleteSuccess) onDeleteSuccess();
      
      // 批量删除完成后延迟清除状态
      setTimeout(() => {
        setDeletingFiles(prev => {
          const newSet = new Set(prev);
          selectedIds.forEach(id => newSet.delete(id));
          return newSet;
        });
        setDeletingProgress(prev => {
          const newProgress = { ...prev };
          selectedIds.forEach(id => {
            delete newProgress[id];
          });
          return newProgress;
        });
      }, 1000);
    } catch (err) {
      console.error('批量删除错误:', err);
      const errorMessage = err.response?.data?.error || err.message || '未知错误';
      setError(`批量删除失败: ${errorMessage}`);
      refreshFiles();
      
      // 清除删除状态
      setDeletingFiles(prev => {
        const newSet = new Set(prev);
        selectedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      setDeletingProgress(prev => {
        const newProgress = { ...prev };
        selectedIds.forEach(id => {
          delete newProgress[id];
        });
        return newProgress;
      });
    }
  };

  const handleFolderClick = async (folder) => {
    
    try {
      // 乐观显示：先更新路径并沿用当前前端文件（不清空不闪烁），后台再刷新
      setLoading(true);

      const newFolderPath = folderPath.length === 0 ? [folder] : [...folderPath, folder];
      
      // 通知父组件状态变化
      onFolderChange(folder._id, newFolderPath);

      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // 重置搜索相关状态
      setIsFromSearch(false);
      setIsFromLocationJump(false); // 重置跳转状态
      setNavigationState(prev => ({
        ...prev,
        currentState: 'normal',
        locationJump: {
          fromSearch: false,
          originalSearchState: null,
          currentLocation: {
            currentFolder: null,
            folderPath: [],
            files: []
          }
        }
      }));
      setSearchBackup({
        searchInput: '',
        searchTerm: '',
        searchTags: [],
        globalSearch: false,
        files: [],
        currentFolder: null,
        folderPath: []
      });
      
      // 创建请求标识符，用于防止竞态条件
      const requestId = Date.now();
      latestRequestRef.current = requestId;
      
      const params = {
        folder: folder._id,
        sort: sortBy
      };
        
      // 后台刷新当前目录文件，并备份
      (async () => {
        try {
          const data = await getUserFiles(params);
          if (latestRequestRef.current !== requestId) return;
      let filesArray = Array.isArray(data.files) ? data.files : [];
      filesArray = mergeDuplicateFolders(filesArray);
          let sortedFiles = filesArray;
          if (sortBy === 'name_asc') sortedFiles = sortFilesByName(filesArray, true);
          else if (sortBy === 'name_desc') sortedFiles = sortFilesByName(filesArray, false);
          else if (sortBy === 'extension_asc') sortedFiles = sortFilesByExtension(filesArray, true);
          else if (sortBy === 'extension_desc') sortedFiles = sortFilesByExtension(filesArray, false);
          else if (sortBy === 'size_asc') sortedFiles = sortFilesBySize(filesArray, true);
          else if (sortBy === 'size_desc') sortedFiles = sortFilesBySize(filesArray, false);
          setFiles(sortedFiles);
          setNavigationState(prev => ({
            ...prev,
            currentState: 'normal',
            normalBackup: {
              currentFolder: folder._id,
              folderPath: newFolderPath,
              files: sortedFiles
            }
          }));
        } catch (e) {
          setError('进入文件夹失败: ' + (e.message || '未知错误'));
        } finally {
          setLoading(false);
        }
      })();
      
    } catch (err) {
      setError('进入文件夹失败: ' + (err.message || '未知错误'));
      setLoading(false);
    }
  };

    // 智能返回函数
  const handleSmartBack = async () => {
    try {
      // 立即清空文件列表并设置加载状态
      setFiles([]);
      setLoading(true);
      
      if (navigationState.currentState === 'search_to_location') {
        // 从搜索跳转位置返回到搜索结果
        console.log('=== 从搜索跳转位置返回搜索结果 ===');
        const originalState = navigationState.locationJump.originalSearchState;
        
        // 恢复原始搜索状态
        setSearchInput(originalState.searchInput);
        setSearchTerm(originalState.searchTerm);
        setSearchTags([...originalState.searchTags]);
        setGlobalSearch(originalState.globalSearch);
        setFiles([...originalState.files]);
        setCurrentFolder(originalState.currentFolder);
        setFolderPath([...originalState.folderPath]);
        
        // 将状态机切回 search，并恢复搜索备份，确保后续编辑不触发刷新
        setNavigationState(prev => ({
          ...prev,
          currentState: 'search',
          searchInput: originalState.searchInput,
          searchTerm: originalState.searchTerm,
          searchTags: [...originalState.searchTags],
          globalSearch: originalState.globalSearch,
          backup: {
            searchInput: originalState.searchInput,
            searchTerm: originalState.searchTerm,
            searchTags: [...originalState.searchTags],
            globalSearch: originalState.globalSearch,
            files: [...originalState.files],
            currentFolder: originalState.currentFolder,
            folderPath: [...originalState.folderPath]
          },
          locationJump: {
            fromSearch: false,
            originalSearchState: null,
            currentLocation: { currentFolder: null, folderPath: [], files: [] }
          }
        }));
        
        console.log('✅ 搜索状态恢复完成');
        setLoading(false);
      } else if (isFromSearch && searchBackup.searchInput) {
        // 兼容旧逻辑：从搜索结果跳转来的，返回到搜索结果
        console.log('=== 点击返回搜索结果按钮 ===');
        console.log('isFromSearch:', isFromSearch);
        console.log('备份文件数量:', searchBackup.files.length);
        console.log('备份搜索输入:', searchBackup.searchInput);
        
        // 恢复搜索状态
        console.log('=== 开始恢复搜索状态 ===');
        setSearchInput(searchBackup.searchInput);
        setSearchTerm(searchBackup.searchTerm);
        setSearchTags([...searchBackup.searchTags]);
        setGlobalSearch(searchBackup.globalSearch);
        setFiles([...searchBackup.files]);
        setCurrentFolder(searchBackup.currentFolder);
        setFolderPath([...searchBackup.folderPath]);
        
        console.log('✅ 搜索状态恢复完成');
        console.log('恢复文件数量:', searchBackup.files.length);
        console.log('恢复搜索输入:', searchBackup.searchInput);
        
        // 延迟重置状态，避免 useEffect 立即触发
        setTimeout(() => {
          console.log('=== 延迟重置状态 ===');
          setIsFromSearch(false);
          setIsFromLocationJump(false); // 重置跳转状态
          setSearchBackup({
            searchInput: '',
            searchTerm: '',
            searchTags: [],
            globalSearch: false,
            files: [],
            currentFolder: null,
            folderPath: []
          });
          // 重置状态机
          setNavigationState(prev => ({
            ...prev,
            currentState: 'normal',
            locationJump: {
              fromSearch: false,
              originalSearchState: null,
              currentLocation: {
                currentFolder: null,
                folderPath: [],
                files: []
              }
            }
          }));
          console.log('✅ 状态重置完成');
        }, 100);
      } else {
        // 正常返回上级目录
        console.log('返回上级目录');
        
        if (folderPath.length > 0) {
          // 返回上级目录
          const parentPath = folderPath.slice(0, -1);
          const parentFolder = parentPath.length > 0 ? parentPath[parentPath.length - 1] : null;
          
          setCurrentFolder(parentFolder ? parentFolder._id : null);
          setFolderPath(parentPath);
          
          // 获取上级目录的文件列表
          // 创建请求标识符，用于防止竞态条件
          const requestId = Date.now();
          latestRequestRef.current = requestId;
          
          const params = {
            folder: parentFolder ? parentFolder._id : null,
            sort: sortBy
          };
          
          const data = await getUserFiles(params);
          
          // 检查是否是最新的请求
          if (latestRequestRef.current !== requestId) {
            console.log('⚠️ 智能返回请求已过期，忽略结果');
            return;
          }
          
          const filesArray = Array.isArray(data.files) ? data.files : [];
          
          // 应用排序
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
          // 只有在文件列表设置完成后才结束loading状态
          setLoading(false);
        } else {
          // 已经在根目录，返回根目录
          setCurrentFolder(null);
          setFolderPath([]);
          
          // 创建请求标识符，用于防止竞态条件
          const requestId = Date.now();
          latestRequestRef.current = requestId;
          
          const data = await getUserFiles({ sort: sortBy });
          
          // 检查是否是最新的请求
          if (latestRequestRef.current !== requestId) {
            console.log('⚠️ 智能返回根目录请求已过期，忽略结果');
            return;
          }
          
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
          // 只有在文件列表设置完成后才结束loading状态
          setLoading(false);
        }
      }
      
      // 清除选择状态
      setSelectedIds([]);
      
    } catch (err) {
      setError('返回失败: ' + (err.message || '未知错误'));
      setLoading(false);
    }
  };

  const handlePathClick = async (index) => {
    try {
      // 乐观显示：更新路径即可，后台刷新
      setLoading(true);
      
      let targetFolder = null;
      let newPath = [];
      
      if (index === -1) {
        onFolderChange(null, []);
      } else {
        targetFolder = folderPath[index];
        newPath = folderPath.slice(0, index + 1);
 
        onFolderChange(targetFolder._id, newPath);
      }
      
      setSelectedIds([]);
      setSearchInput('');
      setSearchTerm('');
      
      // 重置搜索相关状态
      setIsFromSearch(false);
      setIsFromLocationJump(false); // 重置跳转状态
      setNavigationState(prev => ({
        ...prev,
        currentState: 'normal',
        locationJump: {
          fromSearch: false,
          originalSearchState: null,
          currentLocation: {
            currentFolder: null,
            folderPath: [],
            files: []
          }
        }
      }));
      setSearchBackup({
        searchInput: '',
        searchTerm: '',
        searchTags: [],
        globalSearch: false,
        files: [],
        currentFolder: null,
        folderPath: []
      });
      
      // 创建请求标识符，用于防止竞态条件
      const requestId = Date.now();
      latestRequestRef.current = requestId;
      
      const params = {
        folder: targetFolder ? targetFolder._id : null,
        sort: sortBy
      };
        
      // 后台刷新与备份
      (async () => {
        try {
          const data = await getUserFiles(params);
          if (latestRequestRef.current !== requestId) return;
          const filesArray = Array.isArray(data.files) ? data.files : [];
          let sortedFiles = filesArray;
          if (sortBy === 'name_asc') sortedFiles = sortFilesByName(filesArray, true);
          else if (sortBy === 'name_desc') sortedFiles = sortFilesByName(filesArray, false);
          else if (sortBy === 'extension_asc') sortedFiles = sortFilesByExtension(filesArray, true);
          else if (sortBy === 'extension_desc') sortedFiles = sortFilesByExtension(filesArray, false);
          else if (sortBy === 'size_asc') sortedFiles = sortFilesBySize(filesArray, true);
          else if (sortBy === 'size_desc') sortedFiles = sortFilesBySize(filesArray, false);
          setFiles(sortedFiles);
          setNavigationState(prev => ({
            ...prev,
            currentState: 'normal',
            normalBackup: {
              currentFolder: targetFolder ? targetFolder._id : null,
              folderPath: newPath,
              files: sortedFiles
            }
          }));
        } catch (e) {
          setError('切换文件夹失败: ' + (e.message || '未知错误'));
        } finally {
          setLoading(false);
        }
      })();
      
    } catch (err) {
      setError('切换文件夹失败: ' + (err.message || '未知错误'));
      setLoading(false);
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

  const handlePreview = (file) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
  };

  // 打开文件所在位置
  const handleOpenFileLocation = async (file) => {
    try {
      // 设置按钮按下效果和加载状态
      setLocationButtonPressed(prev => new Set(prev).add(file._id));
      setLocationLoading(prev => new Set(prev).add(file._id));
      
      // 检查是否来自搜索结果
      const isFromSearchResults = searchInput || searchTerm || searchTags.length > 0 || globalSearch;
      
              console.log('=== 点击跳转到位置按钮 ===');
        console.log('搜索输入:', searchInput);
        console.log('搜索词:', searchTerm);
        console.log('搜索标签:', searchTags);
        console.log('全局搜索:', globalSearch);
        console.log('当前文件数量:', files.length);
        console.log('来自搜索结果:', isFromSearchResults);
      
      if (isFromSearchResults) {
        // 更新状态机：从搜索跳转到位置
        setNavigationState(prev => ({
          ...prev,
          currentState: 'search_to_location',
          locationJump: {
            fromSearch: true,
            originalSearchState: {
              searchInput,
              searchTerm,
              searchTags: [...searchTags],
              globalSearch,
              files: [...files],
              currentFolder,
              folderPath: [...folderPath]
            },
            currentLocation: {
              currentFolder: null,
              folderPath: [],
              files: []
            }
          }
        }));
        
        console.log('✅ 状态机更新为: search_to_location');
      } else {
        // 更新状态机：普通位置跳转
        setNavigationState(prev => ({
          ...prev,
          currentState: 'location_jump',
          locationJump: {
            fromSearch: false,
            originalSearchState: null,
            currentLocation: {
              currentFolder: null,
              folderPath: [],
              files: []
            }
          }
        }));
        
        console.log('✅ 状态机更新为: location_jump');
      }
      
      if (file.parentFolder) {
        // 递归重建完整的文件夹路径
        const reconstructFullPath = async (targetFolderId) => {
          const path = [];
          let currentFolderId = targetFolderId;
          
          while (currentFolderId) {
            try {
              const folderDetails = await getFileDetails(currentFolderId);
              if (folderDetails) {
                const folderName = folderDetails.originalName || folderDetails.filename || 'Unknown Folder';
                path.unshift({
                  _id: currentFolderId,
                  originalName: folderName,
                  filename: folderDetails.filename,
                  isFolder: folderDetails.isFolder
                });
                currentFolderId = folderDetails.parentFolder;
              } else {
                break;
              }
            } catch (error) {
              console.error('获取文件夹详情失败:', error);
              break;
            }
          }
          //去掉第一个home保留之后的路径 适配前端
          const path_edited = path.slice(1, path.length); 
          console.log('[PATH]', path_edited);
          return path_edited;
        };
        
        // 重建目标文件夹的完整路径
        const fullPath = await reconstructFullPath(file.parentFolder);
        
        if (fullPath.length > 0) {
          // 直接设置完整路径，避免使用 handleFolderClick 的路径合并逻辑
          const targetFolder = fullPath[fullPath.length - 1];
          
          // 设置跳转状态
          setIsFromLocationJump(true);
          
          // 更新状态
          onFolderChange(targetFolder._id, fullPath);
          
          // 获取目标文件夹的文件列表
          setLoading(true);
          const params = {
            folder: targetFolder._id,
            sort: sortBy
          };
          
          const data = await getUserFiles(params);
          const filesArray = Array.isArray(data.files) ? data.files : [];
          
          // 应用排序
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
          setLoading(false);
          
          // 更新状态机中的当前位置信息
          setNavigationState(prev => ({
            ...prev,
            locationJump: {
              ...prev.locationJump,
              currentLocation: {
                currentFolder: targetFolder._id,
                folderPath: fullPath,
                files: sortedFiles
              }
            }
          }));
        } else {
          // 如果无法重建路径，导航到根目录
          onFolderChange(null, []);
        }
        
        // 清除搜索相关状态
        setSearchInput('');
        setSearchTerm('');
        setSearchTags([]);
        setGlobalSearch(false);
      } else {
        // 如果文件在根目录，导航到根目录
        onFolderChange(null, []);
        
        // 清除搜索相关状态
        setSearchInput('');
        setSearchTerm('');
        setSearchTags([]);
        setGlobalSearch(false);
      }
    } catch (error) {
      console.error('获取文件位置失败:', error);
      setError('获取文件位置失败: ' + error.message);
    } finally {
      // 重置按钮状态
      setLocationButtonPressed(prev => {
        const newSet = new Set(prev);
        newSet.delete(file._id);
        return newSet;
      });
      setLocationLoading(prev => {
        const newSet = new Set(prev);
        newSet.delete(file._id);
        return newSet;
      });
    }
  };

  useEffect(() => {
    const fetchFilesData = async () => {
      try {
        console.log('=== useEffect 触发文件列表刷新 ===');
        console.log('触发原因:', { currentFolder, sortBy });
        console.log('当前状态:', { isFromSearch, searchBackupFiles: searchBackup.files.length, navState: navigationState.currentState });
        
        // 基于状态机：非 normal 状态下交由上层逻辑维护文件列表，阻止自动刷新
        if (navigationState && navigationState.currentState && navigationState.currentState !== 'normal') {
          console.log('⚠️ 跳过自动刷新（状态机非 normal）:', navigationState.currentState);
          return;
        }
        
        // 如果有搜索条件，跳过自动刷新，让搜索功能处理
        if (searchInput || searchTags.length > 0 || globalSearch || isFromSearch) {
          console.log('⚠️ 跳过自动刷新，当前有搜索条件:', {
            searchInput,
            searchTags: searchTags.length,
            globalSearch,
            isFromSearch
          });
          return;
        }
        
        // 后台刷新：若已有数据，则静默刷新不遮挡；无数据时才显示loading
        if (!files || files.length === 0) {
          setLoading(true);
        }
        setError('');
        
        // 创建请求标识符，用于防止竞态条件
        const requestId = Date.now();
        latestRequestRef.current = requestId;
        
        const params = {};
        if (sortBy) params.sort = sortBy;
        if (searchTerm) params.search = searchTerm;
        if (currentFolder) params.folder = currentFolder;
        // 不在自动获取文件时包含 globalSearch 参数
        
        const data = await getUserFiles(params);
        
        // 检查是否是最新的请求
        if (latestRequestRef.current !== requestId) {
          console.log('⚠️ 请求已过期，忽略结果');
          return;
        }
        
        const filesArray = Array.isArray(data.files) ? data.files : [];
        console.log('服务器返回文件数量:', filesArray.length);
        
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
        
        console.log('设置文件列表，数量:', sortedFiles.length);
        setFiles(sortedFiles);
        // 更新普通目录备份
        setNavigationState(prev => ({
          ...prev,
          normalBackup: {
            currentFolder: currentFolder || null,
            folderPath: [...(folderPath || [])],
            files: sortedFiles
          }
        }));
        // 只有在文件列表设置完成后才结束loading状态
        setLoading(false);
      } catch (err) {
        console.error('获取文件列表失败:', err);
        setError('获取文件列表失败: ' + (err.message || '未知错误'));
        setFiles([]);
        setLoading(false);
      }
    };
    fetchFilesData();
  }, [currentFolder, sortBy]); // 移除搜索相关的依赖项，避免在搜索状态下触发刷新

  // 获取热门标签
  useEffect(() => {
    const fetchHotTags = async () => {
      try {
        // 使用和编辑标签模态框相同的方式获取所有标签
        const response = await getAllTags();
        const allTags = response.tags || [];
        
        // 确保 allTags 是数组且不为空
        if (!Array.isArray(allTags)) {
          console.warn('获取到的标签不是数组格式:', allTags);
          setHotTags([]);
          return;
        }
        
        // 按order升序，order相同时按usageCount降序，取前10个
        const sortedTags = allTags
          .filter(tag => tag && tag.name) // 过滤掉无效的标签
          .sort((a, b) => {
            if (a.order !== b.order) {
              return a.order - b.order; // order升序
            }
            return b.usageCount - a.usageCount; // usageCount降序
          })
          .slice(0, 10)
          .map(tag => tag.name);
        
        setHotTags(sortedTags);
      } catch (error) {
        console.error('获取热门标签失败:', error);
        setHotTags([]);
      }
    };
    
    fetchHotTags();
  }, []);

  // 根据父组件预取的 availableTags 即时计算热门标签，确保即时显示
  useEffect(() => {
    if (!availableTags || !Array.isArray(availableTags)) {
      return;
    }
    const sortedHot = availableTags
      .filter(t => t && t.name)
      .sort((a, b) => (a.order !== b.order ? a.order - b.order : (b.usageCount || 0) - (a.usageCount || 0)))
      .slice(0, 10)
      .map(t => t.name);
    setHotTags(sortedHot);
  }, [availableTags]);

  // 监听 files 状态变化
  useEffect(() => {
    console.log('=== files 状态发生变化 ===');
    console.log('新的 files 数量:', files.length);
    console.log('当前 isFromSearch:', isFromSearch);
    console.log('当前 searchBackup.files 数量:', searchBackup.files.length);
  }, [files]);

  // 获取所有可用标签
  useEffect(() => {
    const allTags = new Set();
    files.forEach(file => {
      if (file.tags && Array.isArray(file.tags) && file.tags.length > 0) {
        file.tags.forEach(tag => {
          if (tag && tag.name) {
            allTags.add(tag.name);
          }
        });
      }
    });
    setAvailableTagsForSearch(Array.from(allTags));
  }, [files]);

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

  // 组件卸载时清理 AbortController
  useEffect(() => {
    return () => {
      if (searchAbortController) {
        searchAbortController.abort();
      }
    };
  }, [searchAbortController]);

  const handleDownload = async (id, filename) => {
    try {
      let downloadFilename = fixEncoding(filename);
      
      // 设置下载状态
      setDownloadingFiles(prev => new Set(prev).add(id));
      setDownloadProgress(prev => ({ ...prev, [id]: 0 }));
      
      // 检查浏览器是否支持 showSaveFilePicker API
      if ('showSaveFilePicker' in window) {
        try {
          // 在用户手势事件中直接调用 showSaveFilePicker
          const handle = await window.showSaveFilePicker({
            suggestedName: downloadFilename,
            types: [{
              description: 'All Files',
              accept: {'*/*': []}
            }],
          });

          // 获取文件数据，带进度回调
          const response = await downloadFile(id, (progress, loaded, total) => {
            setDownloadProgress(prev => ({ ...prev, [id]: progress }));
            console.log(`下载进度: ${progress}% (${(loaded / 1024 / 1024).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`);
            
            // 当下载达到100%时，立即切换到解析阶段
            if (progress === 100) {
              // 立即切换到解析阶段，不等待
              setDownloadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
              });
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[id];
                return newProgress;
              });
              
              // 设置解析状态并立即开始进度
              setParsingFiles(prev => new Set(prev).add(id));
              setParsingProgress(prev => ({ ...prev, [id]: 0 }));
              
              // 立即开始解析进度动画，传递一个立即完成的 Promise
              startParsingProgress(id, Promise.resolve());
            }
          });
          
          // 从响应头中获取文件名（如果后端设置了的话）
          const contentDisposition = response.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              downloadFilename = filenameMatch[1].replace(/['"]/g, '');
            }
          }

          const writable = await handle.createWritable();
          
          // 统一处理文件写入，无论大小
          console.log(`开始下载文件: ${downloadFilename} (${(response.data.size / 1024 / 1024).toFixed(2)}MB)`);
          
          // 验证blob数据完整性
          if (!response.data || response.data.size === 0) {
            throw new Error('下载的文件数据为空');
          }
          
          // 直接写入文件，进度已经在下载阶段处理
          await writable.write(response.data);
          
          // 创建 close Promise，但不立即等待
          const closePromise = writable.close();
          
          // 立即开始解析进度动画，传递 close Promise
          startParsingProgress(id, closePromise);
          
          // 等待 close 完成
          await closePromise;
          console.log(`文件写入完成: ${downloadFilename}`);
          
          console.log(`文件已保存到用户选择的位置: ${downloadFilename}`);
          
        } catch (err) {
          if (err.name === 'AbortError') {
            return; // 用户取消了选择
          }
          console.error('下载过程中发生错误:', err);
          console.error('错误详情:', {
            name: err.name,
            message: err.message,
            stack: err.stack,
            fileSize: response.data?.size,
            fileName: downloadFilename
          });
          throw err;
        } finally {
          // 确保在出错时也清除下载状态
          setDownloadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[id];
            return newProgress;
          });
          // 确保在出错时也清除解析状态
          setParsingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setParsingProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[id];
            return newProgress;
          });
        }
      } else {
        // 降级方案：使用传统的下载方式
        console.log(`使用传统方式下载: ${downloadFilename}`);
        const response = await downloadFile(id, (progress, loaded, total) => {
          setDownloadProgress(prev => ({ ...prev, [id]: progress }));
          console.log(`传统下载进度: ${progress}% (${(loaded / 1024 / 1024).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`);
          
          // 当下载达到100%时，立即切换到解析阶段
          if (progress === 100) {
            // 立即切换到解析阶段
            setDownloadingFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[id];
              return newProgress;
            });
            
            // 设置解析状态并立即开始进度
            setParsingFiles(prev => new Set(prev).add(id));
            setParsingProgress(prev => ({ ...prev, [id]: 0 }));
            
            // 立即开始解析进度动画，传递一个立即完成的 Promise
            startParsingProgress(id, Promise.resolve());
          }
        });
        
        // 从响应头中获取文件名（如果后端设置了的话）
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            downloadFilename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        // 直接使用response.data作为blob，避免重复创建
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        console.log(`传统下载完成: ${downloadFilename}`);
        
        // 解析进度已经在startParsingProgress函数中处理
        
        // 解析状态会在startParsingProgress中自动清除
      }
    } catch (err) {
      console.error('下载失败:', err);
      alert(mapApiErrorMessage(err, '下载失败'));
      
      // 清除下载和解析状态
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[id];
        return newProgress;
      });
      setParsingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setParsingProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[id];
        return newProgress;
      });
    }
  };

  const handleDownloadFolder = async (id, folderName) => {
    try {
      let downloadFilename = fixEncoding(folderName) + '.zip';
      
      // 设置下载状态
      setDownloadingFiles(prev => new Set(prev).add(id));
      setDownloadProgress(prev => ({ ...prev, [id]: 0 }));
      
      // 检查浏览器是否支持 showSaveFilePicker API
      let handle = null;
      if ('showSaveFilePicker' in window) {
        try {
          // 立即在用户手势事件中调用 showSaveFilePicker
          handle = await window.showSaveFilePicker({
            suggestedName: downloadFilename,
            types: [{
              description: 'ZIP Files',
              accept: {'application/zip': ['.zip']}
            }],
          });
        } catch (err) {
          if (err.name === 'AbortError') {
            // 用户取消了选择，清除下载状态并返回
            setDownloadingFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[id];
              return newProgress;
            });
            return;
          }
          throw err;
        }
      }
      
      // 预检查文件夹状态
      console.log(`开始检查文件夹状态: ${folderName}`);
      const folderStatus = await checkFolderDownloadStatus(id);
      console.log(`文件夹状态:`, folderStatus);
      
      // 显示预检查进度（模拟）
      setDownloadProgress(prev => ({ ...prev, [id]: 5 }));
      await new Promise(resolve => setTimeout(resolve, 500));
      setDownloadProgress(prev => ({ ...prev, [id]: 10 }));
      
      if (handle) {
        // 使用 showSaveFilePicker API
        try {
          // 获取文件夹数据，带进度回调
          const response = await downloadFolder(id, (progress, loaded, total) => {
            // 将预检查进度（10%）和实际下载进度（90%）结合
            const actualProgress = 10 + Math.round((progress * 90) / 100);
            setDownloadProgress(prev => ({ ...prev, [id]: actualProgress }));
            console.log(`文件夹下载进度: ${actualProgress}% (${(loaded / 1024 / 1024).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`);
            
            // 当下载达到100%时，立即切换到解析阶段
            if (actualProgress >= 100) {
              // 立即切换到解析阶段，不等待
              setDownloadingFiles(prev => {
                const newSet = new Set(prev);
                newSet.delete(id);
                return newSet;
              });
              setDownloadProgress(prev => {
                const newProgress = { ...prev };
                delete newProgress[id];
                return newProgress;
              });
              
              // 设置解析状态并立即开始进度
              setParsingFiles(prev => new Set(prev).add(id));
              setParsingProgress(prev => ({ ...prev, [id]: 0 }));
              
              // 立即开始解析进度动画，传递一个立即完成的 Promise
              startParsingProgress(id, Promise.resolve());
            }
          });
          
          // 从响应头中获取文件名（如果后端设置了的话）
          const contentDisposition = response.headers['content-disposition'];
          if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
              downloadFilename = filenameMatch[1].replace(/['"]/g, '');
            }
          }

          const writable = await handle.createWritable();
          
          // 统一处理文件写入，无论大小
          console.log(`开始下载文件夹: ${downloadFilename} (${(response.data.size / 1024 / 1024).toFixed(2)}MB)`);
          
          // 验证blob数据完整性
          if (!response.data || response.data.size === 0) {
            throw new Error('下载的文件夹数据为空');
          }
          
          // 直接写入文件，进度已经在下载阶段处理
          await writable.write(response.data);
          
          // 创建 close Promise，但不立即等待
          const closePromise = writable.close();
          
          // 立即开始解析进度动画，传递 close Promise
          startParsingProgress(id, closePromise);
          
          // 等待 close 完成
          await closePromise;
          console.log(`文件夹写入完成: ${downloadFilename}`);
          
          console.log(`文件夹已保存到用户选择的位置: ${downloadFilename}`);
          
        } catch (err) {
          console.error('文件夹下载过程中发生错误:', err);
          console.error('错误详情:', {
            name: err.name,
            message: err.message,
            stack: err.stack,
            fileSize: response?.data?.size,
            fileName: downloadFilename
          });
          throw err;
        } finally {
          // 确保在出错时也清除下载状态
          setDownloadingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setDownloadProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[id];
            return newProgress;
          });
          // 确保在出错时也清除解析状态
          setParsingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setParsingProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[id];
            return newProgress;
          });
        }
      } else {
        // 降级方案：使用传统的下载方式
        console.log(`使用传统方式下载文件夹: ${downloadFilename}`);
        const response = await downloadFolder(id, (progress, loaded, total) => {
          // 将预检查进度（10%）和实际下载进度（90%）结合
          const actualProgress = 10 + Math.round((progress * 90) / 100);
          setDownloadProgress(prev => ({ ...prev, [id]: actualProgress }));
          console.log(`传统文件夹下载进度: ${actualProgress}% (${(loaded / 1024 / 1024).toFixed(2)}MB / ${(total / 1024 / 1024).toFixed(2)}MB)`);
          
          // 当下载达到100%时，立即切换到解析阶段
          if (actualProgress >= 100) {
            // 立即切换到解析阶段
            setDownloadingFiles(prev => {
              const newSet = new Set(prev);
              newSet.delete(id);
              return newSet;
            });
            setDownloadProgress(prev => {
              const newProgress = { ...prev };
              delete newProgress[id];
              return newProgress;
            });
            
            // 设置解析状态并立即开始进度
            setParsingFiles(prev => new Set(prev).add(id));
            setParsingProgress(prev => ({ ...prev, [id]: 0 }));
            
            // 立即开始解析进度动画，传递一个立即完成的 Promise
            startParsingProgress(id, Promise.resolve());
          }
        });
        
        // 从响应头中获取文件名（如果后端设置了的话）
        const contentDisposition = response.headers['content-disposition'];
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
          if (filenameMatch && filenameMatch[1]) {
            downloadFilename = filenameMatch[1].replace(/['"]/g, '');
          }
        }
        
        // 直接使用response.data作为blob，避免重复创建
        const url = window.URL.createObjectURL(response.data);
        const link = document.createElement('a');
        link.href = url;
        link.download = downloadFilename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        console.log(`传统文件夹下载完成: ${downloadFilename}`);
        
        // 解析进度已经在startParsingProgress函数中处理
        
        // 解析状态会在startParsingProgress中自动清除
      }
    } catch (err) {
      console.error('文件夹下载失败:', err);
      alert(mapApiErrorMessage(err, '文件夹下载失败'));
      
      // 清除下载和解析状态
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[id];
        return newProgress;
      });
      setParsingFiles(prev => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
      setParsingProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[id];
        return newProgress;
      });
    }
  };

  const handleBatchDownload = async () => {
    try {
      if (selectedIds.length === 0) {
        alert('请选择要下载的文件或文件夹');
        return;
      }

      // 获取选中的文件和文件夹信息
      const selectedItems = files.filter(file => selectedIds.includes(file._id));
      
      // 设置下载状态
      setDownloadingFiles(prev => new Set([...prev, ...selectedIds]));
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        selectedIds.forEach(id => {
          newProgress[id] = 0;
        });
        return newProgress;
      });
      
      // 逐个处理选中的项目
      for (const file of selectedItems) {
        try {
          if (file.isFolder) {
            // 文件夹：调用文件夹下载函数
            await handleDownloadFolder(file._id, file.originalName || file.filename);
          } else {
            // 文件：调用文件下载函数
            await handleDownload(file._id, file.originalName || file.filename);
          }
        } catch (err) {
          console.error(`下载失败: ${file.originalName || file.filename}`, err);
          alert(`下载失败: ${file.originalName || file.filename}`);
        }
      }
      
      // 下载完成后清空选中列表
      setSelectedIds([]);
      
    } catch (err) {
      console.error('批量下载失败:', err);
      alert('批量下载失败: ' + (err.message || '未知错误'));
    } finally {
      // 清除下载状态
      setDownloadingFiles(prev => {
        const newSet = new Set(prev);
        selectedIds.forEach(id => newSet.delete(id));
        return newSet;
      });
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        selectedIds.forEach(id => {
          delete newProgress[id];
        });
        return newProgress;
      });
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
        // 设置删除状态并开始进度动画
        setDeletingFiles(prev => new Set(prev).add(id));
        setDeletingProgress(prev => ({ ...prev, [id]: 0 }));
        
        // 开始删除进度动画，获取Promise
        startDeletingProgress(id, fileToDelete.isFolder);
        
        // 执行实际的删除操作
        await deleteFile(id);
        
        // 删除成功后，设置进度为100%并完成
        setDeletingProgress(prev => ({ ...prev, [id]: 100 }));
        console.log(`删除完成: 100% - ${fileToDelete.isFolder ? '文件夹' : '文件'}已删除`);
        
        // 调用resolve函数完成进度Promise
        if (window.deleteProgressResolvers && window.deleteProgressResolvers[id]) {
          window.deleteProgressResolvers[id]();
        }
        
        // 清除进度相关状态
        if (window.deleteProgressIntervals && window.deleteProgressIntervals[id]) {
          clearInterval(window.deleteProgressIntervals[id]);
          delete window.deleteProgressIntervals[id];
        }
        if (window.deleteProgressResolvers && window.deleteProgressResolvers[id]) {
          delete window.deleteProgressResolvers[id];
        }
        
        // 立即从文件列表中移除被删除的文件，并同步 normalBackup
        setFiles(prevFiles => prevFiles.filter(file => file._id !== id));
        setNavigationState(prev => ({
          ...prev,
          normalBackup: {
            ...prev.normalBackup,
            files: (Array.isArray(prev.normalBackup.files) ? prev.normalBackup.files : []).filter(file => file._id !== id)
          }
        }));
        
        // 从选中列表中移除被删除的文件
        setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        
        if (fileToDelete.isFolder) {
          const folderIndex = folderPath.findIndex(f => f._id === id);
          if (folderIndex !== -1) {
            if (folderIndex === folderPath.length - 1) {
              const parentFolder = folderPath[folderIndex - 1];
              onFolderChange(parentFolder ? parentFolder._id : null, folderPath.slice(0, folderIndex));
              // 切回父级，列表刷新交由 onFolderChange 的副作用处理
                          } else {
                const newPath = folderPath.filter(f => f._id !== id);
                onFolderChange(currentFolder, newPath);
              }
          }
        }

        if (onDeleteSuccess) {
          onDeleteSuccess();
        }
        
        // 删除完成后延迟清除状态
        setTimeout(() => {
          setDeletingFiles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setDeletingProgress(prev => {
            const newProgress = { ...prev };
            delete newProgress[id];
            return newProgress;
          });
        }, 1000);
        
      } catch (err) {
        alert(mapApiErrorMessage(err, '删除失败'));
        // 清除删除状态
        setDeletingFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        setDeletingProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[id];
          return newProgress;
        });
        
        // 清除进度相关状态
        if (window.deleteProgressIntervals && window.deleteProgressIntervals[id]) {
          clearInterval(window.deleteProgressIntervals[id]);
          delete window.deleteProgressIntervals[id];
        }
        if (window.deleteProgressResolvers && window.deleteProgressResolvers[id]) {
          delete window.deleteProgressResolvers[id];
        }
      }
    }
  };







  // 标签相关函数















  // 标签显示组件
  const TagDisplay = ({ tags, sortedTags }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const dropdownRef = useRef(null);
    
    // 点击外部关闭下拉框
    useEffect(() => {
      const handleClickOutside = (event) => {
        if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
          setIsExpanded(false);
        }
      };
      
      if (isExpanded) {
        document.addEventListener('mousedown', handleClickOutside);
      }
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, [isExpanded]);
    
    // 添加更好的空值检查
    if (!tags || !Array.isArray(tags) || tags.length === 0) return null;
    
    // 如果有排序后的标签，使用它们来排序当前标签
    const sortedTagsList = sortedTags && Array.isArray(sortedTags) ? 
      tags.sort((a, b) => {
        // 确保标签对象有效
        if (!a || !b || !a.name || !b.name) {
          return 0;
        }
        const aIndex = sortedTags.findIndex(t => t && t.name === a.name);
        const bIndex = sortedTags.findIndex(t => t && t.name === b.name);
        // 如果标签在排序列表中，按排序位置排序；否则按名称排序
        if (aIndex !== -1 && bIndex !== -1) {
          return aIndex - bIndex;
        } else if (aIndex !== -1) {
          return -1;
        } else if (bIndex !== -1) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      }) : tags;
    
    if (sortedTagsList.length <= 2) {
      // 如果标签数量少于等于2个，直接显示
      return (
        <div className="tags-display">
          {sortedTagsList.map((tag, index) => (
            <span
              key={index}
              className="tag"
              style={{ backgroundColor: tag.color || '#007bff' }}
              title={tag.name || ''}
            >
              {tag.name || '未命名标签'}
            </span>
          ))}
        </div>
      );
    }
    
    // 如果标签数量大于2个，使用下拉框格式
    return (
      <div className="tags-dropdown-container" ref={dropdownRef}>
        <div className="tags-preview">
          {sortedTagsList.slice(0, 2).map((tag, index) => (
            <span
              key={index}
              className="tag"
              style={{ backgroundColor: tag.color || '#007bff' }}
              title={tag.name || ''}
            >
              {tag.name || '未命名标签'}
            </span>
          ))}
          <button
            className="tags-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            title={`显示全部 ${sortedTagsList.length} 个标签`}
          >
            +{sortedTagsList.length - 2}
          </button>
        </div>
        
        {isExpanded && (
          <div className="tags-dropdown">
            {sortedTagsList.map((tag, index) => (
              <span
                key={index}
                className="tag"
                style={{ backgroundColor: tag.color || '#007bff' }}
                title={tag.name || ''}
              >
                {tag.name || '未命名标签'}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };



  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="file-list">
      <FilePreview 
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
      
      <h3>云端文件</h3>
      
      <div className="folder-navigation">
        <button 
          onClick={handleSmartBack} 
          className="back-btn"
          style={{ visibility: currentFolder ? 'visible' : 'hidden' }}
        >
          {navigationState.currentState === 'search_to_location' ? '返回搜索结果' : '返回上级'}
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
        <button
          className="refresh-btn"
          onClick={() => {
            // 在列表内部直接刷新当前目录并备份
            refreshFiles();
          }}
          style={{ marginLeft: '12px' }}
        >
          刷新
        </button>
      </div>
      
      <div className="file-controls">
        {/* 搜索和排序控制栏 */}
        <div className="search-sort-row">
          {/* 搜索加载指示器 */}
          {searchLoading && (
            <div className="search-loading-spinner">
              <div className="spinner"></div>
              <span>搜索中...</span>
            </div>
          )}
          
          {/* 主搜索框 */}
          <div className="search-box">
            <input
              type="text"
              placeholder="搜索文件名... (按回车搜索)"
              value={searchInput}
              onChange={handleSearchChange}  // 搜索框输入内容变化时调用
              onKeyDown={handleSearchSubmit} // 按回车键搜索
              className="search-input"
            />
          </div>
          
          {/* 全局搜索复选框 */}
          <div className="global-search-box">
            <label className="global-search-label">
              <input
                type="checkbox"
                checked={globalSearch}
                onChange={handleGlobalSearchChange}
                className="global-search-checkbox"
              />
              <span className="global-search-text">全局搜索</span>
            </label>
          </div>
          
          {/* 排序下拉框 */}
          <div className="sort-box">
            <select value={sortBy} onChange={handleSortChange} className="sort-select">
              <option value="time_desc">更新时间（最新）</option>
              <option value="time_asc">更新时间（最早）</option>
              <option value="size_desc">文件大小（从大到小）</option>
              <option value="size_asc">文件大小（从小到大）</option>
              <option value="name_asc">文件名（A-Z）</option>
              <option value="name_desc">文件名（Z-A）</option>
              <option value="extension_asc">文件后缀（A-Z）</option>
              <option value="extension_desc">文件后缀（Z-A）</option>
            </select>
          </div>
          <div className="admin-controls">
            {selectedIds.length > 0 && (
              <>
                <button className="btn btn-primary" onClick={handleBatchDownload}>
                  批量下载({selectedIds.length})
                </button>
                {userRole === 'admin' && (
                  <button className="btn btn-danger" onClick={handleBatchDelete}>
                    批量删除({selectedIds.length})
                  </button>
                )}
              </>
            )}
            {userRole === 'admin' && (
              <>
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
              </>
            )}
          </div>
        </div>
        
        {/* 标签搜索组件 */}
        <div className="tag-search-container">
          {/* 已选标签显示 - 一直存在 */}
          <div className="selected-tags-container">
            <span className="selected-tags-label">已选标签:</span>
            {/* 标签输入框 */}
            <div className="tag-input-container">
              <input
                type="text"
                placeholder="输入标签..."
                value={tagInputValue}
                onChange={handleTagInputChange}
                onKeyDown={handleTagInputSubmit}
                className="tag-input-small"
              />
              {tagInputValue.trim() && (
                <button
                  className="add-tag-btn-small"
                  onClick={() => {
                    const newTag = tagInputValue.trim();
                    if (!searchTags.includes(newTag)) {
                      setSearchTags([...searchTags, newTag]);
                    }
                    setTagInputValue('');
                  }}
                  title="添加标签"
                >
                  +
                </button>
              )}
            </div>
            <div className="selected-tags-list">
              {searchTags.map((tag, index) => (
                <span key={index} className="selected-tag">
                  {tag}
                  <button
                    className="remove-tag-btn-small"
                    onClick={() => handleRemoveSearchTag(tag)}
                    title={`移除标签: ${tag}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <button
              className="search-with-tags-btn"
              onClick={handleSearchWithTags}
              title="使用选中的标签进行搜索"
            >
              搜索
            </button>
          </div>
          
          {/* 热门标签提示行 - 支持拖动排序（仅管理员显示拖拽手柄），拖动后调用 updateTagOrder('global') */}
          <div className="hot-tags-container">
            <span className="hot-tags-label">热门标签:</span>
            <div 
              className="hot-tags-list"
              onDragOver={(e) => e.preventDefault()}
            >
              {hotTags.length > 0 ? (
                hotTags.map((tag, index) => (
                  <div
                    key={tag}
                    className="hot-tag-item"
                    draggable={userRole === 'admin'}
                    onDragStart={(e) => {
                      if (userRole !== 'admin') return;
                      e.dataTransfer.setData('text/plain', String(index));
                    }}
                    onDrop={async (e) => {
                      if (userRole !== 'admin') return;
                      e.preventDefault();
                      const fromIndexStr = e.dataTransfer.getData('text/plain');
                      const fromIndex = parseInt(fromIndexStr, 10);
                      const toIndex = index;
                      if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
                      const newOrder = [...hotTags];
                      const [moved] = newOrder.splice(fromIndex, 1);
                      newOrder.splice(toIndex, 0, moved);
                      // 乐观更新
                      setHotTags(newOrder);
                      try {
                        // 使用全局模式更新 order（后端会更新 Tag.order）
                        await updateTagOrder('global', newOrder);
                        // 同步刷新全局可选标签，热门标签由 availableTags 联动
                        if (typeof refreshAllTags === 'function') {
                          await refreshAllTags();
                        }
                      } catch (err) {
                        console.error('更新热门标签顺序失败:', err);
                      }
                    }}
                    title={userRole === 'admin' ? '拖动以排序（仅管理员）' : ''}
                  >
                    <button
                      className="hot-tag-btn"
                      onClick={() => handleAddSearchTag(tag)}
                    >
                      {tag}
                    </button>
                  </div>
                ))
              ) : (
                <span className="no-hot-tags">暂无热门标签</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* 表格容器 - 可滚动区域 */}
      <div className="table-container">
        {loading ? (
          <div className="loading">加载文件中...</div>
        ) : files.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#64748b' }}>暂无上传文件</p>
        ) : (
          <div className="table-scroll-container">
            <table>
              <thead>
                <tr>
                  <th>
                    <input 
                      type="checkbox" 
                      checked={selectedIds.length === files.filter(f => !deletingFiles.has(f._id)).length && files.filter(f => !deletingFiles.has(f._id)).length > 0} 
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th style={{ textAlign: 'center', width: '100px' }}>标签</th>
                  <th style={{ textAlign: 'center' }}>名称</th>
                  <th style={{ textAlign: 'center' }}>类型</th>
                  <th style={{ textAlign: 'center' }}>大小</th>
                  {/* {userRole === 'admin' && <th style={{ textAlign: 'center' }}>创建时间</th>} */}
                  {userRole === 'admin' && <th style={{ textAlign: 'center' }}>更新时间</th>}
                  <th style={{ textAlign: 'center' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {files.map(file => (
                  <tr key={file._id} className={file.isFolder ? 'folder-row' : ''}>
                    <td>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(file._id)} 
                        onChange={() => handleSelect(file._id)}
                        disabled={deletingFiles.has(file._id)}
                      />
                    </td>
                    <td style={{ width: '100px', maxWidth: '100px', overflow: 'hidden' }}>
                      <TagDisplay tags={file.tags} sortedTags={file.sortedTags} />
                    </td>
                    <td>
                      {file.isFolder ? (
                        <button 
                          className="folder-name-btn"
                          onClick={() => handleFolderClick(file)}
                        >
                          <span className="folder-icon">📁</span>
                          <span className="folder-name-text">
                          {fixEncoding(file.originalName || file.filename)}
                          </span>
                        </button>
                      ) : (
                        <span className="file-name">
                          {fixEncoding(file.originalName || file.filename)}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>{file.isFolder ? '文件夹' : getFileExtension(file.originalName || file.filename)}</td>
                    <td style={{ textAlign: 'center' }}>{file.isFolder ? '-' : formatBytes(file.size)}</td>
                    {/* {userRole === 'admin' && <td>{formatBeijingTime(file.createdAt)}</td>} */}
                    {userRole === 'admin' && <td style={{ textAlign: 'center' }}>{formatBeijingTime(file.updatedAt)}</td>}
                    <td className="action-buttons">
                      {userRole === 'admin' && (
                        <button
                          className="btn btn-tag"
                          onClick={() => onOpenTagModal(file)}
                          title="管理标签"
                          style={{ background: '#58c6e9' }}
                        >
                          🏷️
                        </button>
                      )}
                      {/* 文件 */}
                      {!file.isFolder && (
                        <>  
                          <button
                            className={`btn btn-location ${locationButtonPressed.has(file._id) ? 'btn-location-pressed' : ''} ${locationLoading.has(file._id) ? 'btn-location-loading' : ''}`}
                            onClick={() => !locationLoading.has(file._id) && handleOpenFileLocation(file)}
                            title="打开文件所在位置"
                            style={{ background: '#99caff' }}    // 很浅很浅的蓝色
                          >
                            {locationLoading.has(file._id) ? (
                              <div className="location-loading-spinner"></div>
                            ) : (
                              '🔍'
                            )}
                          </button>
                          {isSupportedForPreview(file.originalName || file.filename) ? (
                            <button 
                              className="btn btn-preview"
                              onClick={() => handlePreview(file)}
                              title="预览文件"
                              style={{ background: '#8c9ffa' }}    // 中等深度蓝色
                            >
                              预览
                            </button>
                          ) : (
                            <div 
                              className="btn btn-preview"
                              style={{ 
                                background: 'transparent',
                                border: 'none',
                                visibility: 'hidden'
                              }}
                            >
                              预览
                            </div>
                          )}
                          {downloadingFiles.has(file._id) ? (
                            <div className="download-progress-container">
                              <div className="download-progress-bar">
                                <div 
                                  className="download-progress-fill"
                                  style={{ width: `${downloadProgress[file._id] || 0}%` }}
                                ></div>
                              </div>
                              <span className="download-progress-text">
                                {downloadProgress[file._id] || 0}%
                              </span>
                            </div>
                          ) : parsingFiles.has(file._id) ? (
                            <div className="download-progress-container">
                              <div className="download-progress-bar">
                                <div 
                                  className="download-progress-fill parsing"
                                  style={{ width: `${parsingProgress[file._id] || 0}%` }}
                                ></div>
                              </div>
                              <span className="download-progress-text">
                                {parsingProgress[file._id] || 0}%
                              </span>
                              <span className="parsing-text">解析中</span>
                            </div>
                          ) : (
                            <button 
                              className="btn btn-primary"
                              onClick={() => handleDownload(file._id, file.originalName || file.filename)}
                              style={{ background: '#007bde' }}
                            >
                              下载
                            </button>
                          )}
                        </>
                      )}


                      {/* 文件夹 */}
                      {file.isFolder && (
                        <>
                          {/* 跳转按钮 */}
                          <button
                            className={`btn btn-location ${locationButtonPressed.has(file._id) ? 'btn-location-pressed' : ''} ${locationLoading.has(file._id) ? 'btn-location-loading' : ''}`}
                            onClick={() => !locationLoading.has(file._id) && handleOpenFileLocation(file)}
                            title="打开文件所在位置"
                            style={{ background: '#99caff' }}    // 很浅很浅的蓝色
                          >
                            {locationLoading.has(file._id) ? (
                              <div className="location-loading-spinner"></div>
                            ) : (
                              '🔍'
                            )}
                          </button>
                          {/* 文件夹预览占位符 */}
                          <div 
                            className="btn btn-preview"
                            style={{ 
                              background: 'transparent',
                              border: 'none',
                              visibility: 'hidden'
                            }}
                          >
                            预览
                          </div>
                          {downloadingFiles.has(file._id) ? (
                            <div className="download-progress-container">
                              <div className="download-progress-bar">
                                <div 
                                  className="download-progress-fill"
                                  style={{ width: `${downloadProgress[file._id] || 0}%` }}
                                ></div>
                              </div>
                              <span className="download-progress-text">
                                {downloadProgress[file._id] || 0}%
                              </span>
                            </div>
                          ) : parsingFiles.has(file._id) ? (
                            <div className="download-progress-container">
                              <div className="download-progress-bar">
                                <div 
                                  className="download-progress-fill parsing"
                                  style={{ width: `${parsingProgress[file._id] || 0}%` }}
                                ></div>
                              </div>
                              <span className="download-progress-text">
                                {parsingProgress[file._id] || 0}%
                              </span>
                              <span className="parsing-text">解析中</span>
                            </div>
                          ) : (
                            <button 
                              className="btn btn-primary"
                              onClick={() => handleDownloadFolder(file._id, file.originalName || file.filename)}
                              title="下载文件夹（ZIP格式）"
                              style={{ background: '#007bde' }}
                            >
                              下载
                            </button>
                          )}
                        </>
                      )}
                      {userRole === 'admin' && (
                        <>
                          {deletingFiles.has(file._id) ? (
                            <div className="download-progress-container">
                              <div className="download-progress-bar">
                                <div 
                                  className="download-progress-fill deleting"
                                  style={{ width: `${deletingProgress[file._id] || 0}%` }}
                                ></div>
                              </div>
                              <span className="download-progress-text">
                                {deletingProgress[file._id] || 0}%
                              </span>
                            </div>
                          ) : (
                            <button 
                              className="btn btn-danger"
                              onClick={() => handleDelete(file._id)}
                            >
                              删除
                            </button>
                          )}
                        </>
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

// 标签模态框组件
const TagModal = ({ 
  showTagModal, 
  selectedFileForTags, 
  availableTags, 
  newTagColor, 
  setNewTagColor, 
  tagModalError, 
  handleCloseTagModal, 
  handleAddNewTag, 
  handleRemoveTag,
  newTagInputRef,
  inputValueRef,
  tagColors,
  setTagModalError,
  setSelectedFileForTags,
  handleTagReorder,
  refreshAllTags,
  setFiles,
  setNavigationState,
  // 文件重命名相关参数
  newFileName,
  setNewFileName,
  isRenaming,
  handleRenameFile,
  handleFileNameChange,
  handleFileNameKeyPress,
  fileNameInputRef,
  currentUser
}) => {
  const [dragState, setDragState] = useState({
    isDragging: false,
    draggedIndex: null,
    targetIndex: null,
    draggedTag: null
  });

  // 可用标签独立的拖拽状态
  const [availableTagDragState, setAvailableTagDragState] = useState({
    isDragging: false,
    draggedIndex: null,
    targetIndex: null,
    draggedTag: null
  });

  // 可用标签拖拽删除/排序状态
  const [isOverTrash, setIsOverTrash] = useState(false);

  // 处理可用标签全局排序（拖拽到目标标签上）
  const handleAvailableTagDropOnItem = async (draggedTagName, targetIndex) => {
    try {
      const names = availableTags.map(t => t.name);
      const fromIndex = names.indexOf(draggedTagName);
      if (fromIndex === -1 || targetIndex === -1 || fromIndex === targetIndex) return;
      const newOrder = [...names];
      const [moved] = newOrder.splice(fromIndex, 1);
      const insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
      newOrder.splice(insertIndex, 0, moved);
      await updateTagOrder('global', newOrder);
      if (typeof refreshAllTags === 'function') {
        await refreshAllTags();
      }
    } catch (err) {
      console.error('全局标签排序失败:', err);
      setTagModalError('更新可用标签顺序失败');
      setTimeout(() => setTagModalError(''), 3000);
    }
  };

  // 可用标签拖拽排序相关函数
  const handleAvailableTagDragStart = (e, index, tag) => {
    setAvailableTagDragState({
      isDragging: true,
      draggedIndex: index,
      targetIndex: null,
      draggedTag: tag
    });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tag.name);
  };

  const handleAvailableTagDragEnd = () => {
    setAvailableTagDragState({
      isDragging: false,
      draggedIndex: null,
      targetIndex: null,
      draggedTag: null
    });
  };

  const handleAvailableTagDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetIndex = calculateAvailableTagTargetIndex(e.clientX, e.clientY);
    
    setAvailableTagDragState(prev => ({
      ...prev,
      targetIndex: targetIndex
    }));
  };

  const handleAvailableTagDrop = (e) => {
    e.preventDefault();
    
    const finalToIndex = calculateAvailableTagTargetIndex(e.clientX, e.clientY);
    const fromIndex = availableTagDragState.draggedIndex;
    
    if (fromIndex !== null && finalToIndex !== null && finalToIndex !== fromIndex) {
      console.log(`可用标签拖拽排序: ${fromIndex} -> ${finalToIndex}`);
      handleAvailableTagReorder(fromIndex, finalToIndex);
    }
    
    handleAvailableTagDragEnd();
  };

  // 计算可用标签目标索引
  const calculateAvailableTagTargetIndex = (mouseX, mouseY) => {
    const container = document.querySelector('.available-tags .tags-list');
    if (!container) return 0;

    const containerRect = container.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const relativeY = mouseY - containerRect.top;

    const tags = container.querySelectorAll('.tag-item');
    const tagHeight = getAvailableTagHeight(); // 使用专用函数
    const availableTagGap = 8; // 可用标签的CSS gap值
    
    // 计算行信息
    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;
    let currentY = 0;

    tags.forEach((tag, index) => {
      const tagWidth = tag.offsetWidth;
      
      if (currentRowWidth + tagWidth + availableTagGap > container.offsetWidth && currentRow.length > 0) {
        rows.push({
          tags: currentRow,
          y: currentY,
          width: currentRowWidth - availableTagGap
        });
        currentRow = [];
        currentRowWidth = 0;
        currentY += tagHeight + availableTagGap;
      }
      
      currentRow.push({
        element: tag,
        index: index,
        x: currentRowWidth,
        y: currentY,
        width: tagWidth
      });
      currentRowWidth += tagWidth + availableTagGap;
    });

    if (currentRow.length > 0) {
      rows.push({
        tags: currentRow,
        y: currentY,
        width: currentRowWidth - availableTagGap
      });
    }

    // 找到鼠标所在的行
    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // 使用可用标签专用的行判定范围
      const rowTop = row.y + availableTagGap;  // 整体下移，与已选标签保持一致
      const rowBottom = row.y + tagHeight + availableTagGap / 2;  // 向下扩展半个间距
      
      if (relativeY >= rowTop && relativeY < rowBottom) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return null;
    }

    const targetRow = rows[targetRowIndex];
    
    // 在目标行中找到鼠标位置对应的标签索引
    let targetIndex = 0;
    
    if (relativeX < targetRow.tags[0].x) {
      targetIndex = targetRow.tags[0].index;
    } else if (relativeX > targetRow.tags[targetRow.tags.length - 1].x + targetRow.tags[targetRow.tags.length - 1].width) {
      targetIndex = targetRow.tags[targetRow.tags.length - 1].index + 1;
    } else {
      for (let i = 0; i < targetRow.tags.length; i++) {
        const tag = targetRow.tags[i];
        const tagRight = tag.x + tag.width;
        
        if (relativeX < tagRight) {
          targetIndex = tag.index;
          break;
        }
        
        if (i === targetRow.tags.length - 1) {
          targetIndex = tag.index + 1;
        }
      }
    }

    return targetIndex;
  };

  // 处理可用标签重新排序
  const handleAvailableTagReorder = (fromIndex, toIndex) => {
    const newOrderedTags = [...availableTags];
    const [movedTag] = newOrderedTags.splice(fromIndex, 1);
    newOrderedTags.splice(toIndex, 0, movedTag);

    // 立即更新本地状态
    const newOrder = newOrderedTags.map(tag => tag.name);
    
    // 异步更新数据库
    (async () => {
      try {
        await updateTagOrder('global', newOrder);
        if (typeof refreshAllTags === 'function') {
          await refreshAllTags();
        }
      } catch (err) {
        console.error('更新可用标签顺序失败:', err);
        setTagModalError('更新可用标签顺序失败');
        setTimeout(() => setTagModalError(''), 3000);
      }
    })();
  };

  // 获取可用标签样式
  const getAvailableTagStyle = (index) => {
    const style = {};
    
    if (availableTagDragState.isDragging && availableTagDragState.draggedIndex !== null && availableTagDragState.targetIndex !== null) {
      if (index === availableTagDragState.draggedIndex) {
        // 被拖动的标签
        style.transform = 'scale(1.1) rotate(5deg)';
        style.zIndex = 1000;
        style.opacity = 0.8;
        style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.3)';
      } else {
        const draggedIndex = availableTagDragState.draggedIndex;
        const targetIndex = availableTagDragState.targetIndex;
        
        // 获取被拖动标签的尺寸
        const draggedElement = document.querySelector(`.available-tags [data-index="${draggedIndex}"]`);
        let draggedWidth = 0;
        if (draggedElement) {
          draggedWidth = draggedElement.offsetWidth;
        }
        
        // 使用可用标签专用的间距值
        const availableTagGap = 8; // 可用标签的CSS gap值
        
        // 计算行信息，确保只有同行内的标签才会移动
        const container = document.querySelector('.available-tags .tags-list');
        if (!container) return style;
        
        const tags = container.querySelectorAll('.tag-item');
        const tagHeight = getAvailableTagHeight(); // 使用专用函数
        
        // 计算行信息
        const rows = [];
        let currentRow = [];
        let currentRowWidth = 0;
        let currentY = 0;

        tags.forEach((tag, tagIndex) => {
          const tagWidth = tag.offsetWidth;
          
          if (currentRowWidth + tagWidth + availableTagGap > container.offsetWidth && currentRow.length > 0) {
            rows.push({
              tags: currentRow,
              y: currentY,
              width: currentRowWidth - availableTagGap
            });
            currentRow = [];
            currentRowWidth = 0;
            currentY += tagHeight + availableTagGap;
          }
          
          currentRow.push({
            element: tag,
            index: tagIndex,
            x: currentRowWidth,
            y: currentY,
            width: tagWidth
          });
          currentRowWidth += tagWidth + availableTagGap;
        });

        if (currentRow.length > 0) {
          rows.push({
            tags: currentRow,
            y: currentY,
            width: currentRowWidth - availableTagGap
          });
        }
        
        // 找到当前标签所在的行
        let currentRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const tagInRow = row.tags.find(t => t.index === index);
          if (tagInRow) {
            currentRowIndex = i;
            break;
          }
        }
        
        // 找到目标位置所在的行
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const tagInRow = row.tags.find(t => t.index === targetIndex);
          if (tagInRow) {
            targetRowIndex = i;
            break;
          }
        }
        
        // 只有同行内的标签才会移动
        if (currentRowIndex !== -1 && targetRowIndex !== -1 && currentRowIndex === targetRowIndex) {
          // 同行内移动 - 修复逻辑
          if (draggedIndex < targetIndex) {
            // 向右拖动：中间标签向左移动
            if (index > draggedIndex && index <= targetIndex) {
              style.transform = `translateX(-${draggedWidth + availableTagGap}px)`;
              style.transition = 'transform 0.2s ease';
            }
          } else if (draggedIndex > targetIndex) {
            // 向左拖动：中间标签向右移动
            if (index >= targetIndex && index < draggedIndex) {
              style.transform = `translateX(${draggedWidth + availableTagGap}px)`;
              style.transition = 'transform 0.2s ease';
            }
          }
        }
      }
    }
    
    return style;
  };

  // 获取CSS变量和计算行数
  const getTagHeight = () => {
    const container = document.querySelector('.tags-list');
    if (container) {
      // 获取标签高度，包括padding和margin
      const tagItem = container.querySelector('.tag-item');
      if (tagItem) {
        const tagRect = tagItem.getBoundingClientRect();
        return tagRect.height;
      }
    }
    return 32; // 默认高度
  };

  const getGapValue = () => {
    const container = document.querySelector('.tags-list');
    if (container) {
      return parseInt(getComputedStyle(container).gap) || 8;
    }
    return 8;
  };

  // 获取可用标签专用高度
  const getAvailableTagHeight = () => {
    const container = document.querySelector('.available-tags .tags-list');
    if (container) {
      const tagItem = container.querySelector('.tag-item');
      if (tagItem) {
        const tagRect = tagItem.getBoundingClientRect();
        return tagRect.height;
      }
    }
    return 32; // 默认高度
  };

  // 计算标签在容器中的位置信息
  const calculateTagPositions = () => {
    const container = document.querySelector('.tags-list');
    if (!container) return { rows: [], containerWidth: 0, tagHeight: 0, gap: 0 };

    const containerWidth = container.offsetWidth;
    const tagHeight = getTagHeight();
    const gap = getGapValue();
    const tags = container.querySelectorAll('.tag-item');
    
    const rows = [];
    let currentRow = [];
    let currentRowWidth = 0;
    let currentY = 0;

    tags.forEach((tag, index) => {
      const tagWidth = tag.offsetWidth;
      
      // 如果当前行放不下这个标签，换行
      if (currentRowWidth + tagWidth + gap > containerWidth && currentRow.length > 0) {
        rows.push({
          tags: currentRow,
          y: currentY,
          width: currentRowWidth - gap
        });
        currentRow = [];
        currentRowWidth = 0;
        currentY += tagHeight + gap;
      }
      
      currentRow.push({
        element: tag,
        index: index,
        x: currentRowWidth,
        y: currentY,
        width: tagWidth
      });
      currentRowWidth += tagWidth + gap;
    });

    // 添加最后一行
    if (currentRow.length > 0) {
      rows.push({
        tags: currentRow,
        y: currentY,
        width: currentRowWidth - gap
      });
    }

    return { rows, containerWidth, tagHeight, gap };
  };

  // 根据鼠标位置计算目标索引   null 不移动
  const calculateTargetIndex = (mouseX, mouseY) => {
    const { rows, tagHeight, gap } = calculateTagPositions();
    const container = document.querySelector('.tags-list');
    if (!container) return 0;

    const containerRect = container.getBoundingClientRect();
    const relativeX = mouseX - containerRect.left;
    const relativeY = mouseY - containerRect.top;

    // 找到鼠标所在的行
    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      //if (relativeY >= row.y && relativeY < row.y + tagHeight) {   //不敏感方案 ，第二行后 鼠标悬停较上才会触发悬停
      
      // 方案1：扩大行判定范围，增加容错性
      // const rowTop = row.y - gap / 2;        // 向上扩展半个间距
      const rowTop = row.y + gap ;  // 整体下移
      const rowBottom = row.y + tagHeight + gap / 2;  // 向下扩展半个间距
      
      // 方案2：如果方案1不够，可以进一步扩大范围
      // const rowTop = row.y - gap;           // 向上扩展一个间距
      // const rowBottom = row.y + tagHeight + gap;  // 向下扩展一个间距
      
      // 调试信息（可以注释掉）
      // console.log(`行 ${i}: row.y=${row.y}, rowTop=${rowTop}, rowBottom=${rowBottom}, relativeY=${relativeY}`);
      
      if (relativeY >= rowTop && relativeY < rowBottom) {
        targetRowIndex = i;
        break;
      }
    }

    // 如果鼠标在容器外，不移动 返回原来的位置  
    if (targetRowIndex === -1) {
      // if (relativeY < 0) {
      //   return 0; // 第一行第一个
      // } else {
      //   return rows.reduce((total, row) => total + row.tags.length, 0); // 最后
      // }
      return null;
    }

    const targetRow = rows[targetRowIndex];
    
    // 在目标行中找到鼠标位置对应的标签索引
    let targetIndex = 0;
    
    // 如果鼠标在行的最左边，插入到行首
    if (relativeX < targetRow.tags[0].x) {
      targetIndex = targetRow.tags[0].index;
    }
    // 如果鼠标在行的最右边，插入到行尾
    else if (relativeX > targetRow.tags[targetRow.tags.length - 1].x + targetRow.tags[targetRow.tags.length - 1].width) {
      targetIndex = targetRow.tags[targetRow.tags.length - 1].index + 1;
    }
    // 在标签之间找到插入位置
    else {
      for (let i = 0; i < targetRow.tags.length; i++) {
        const tag = targetRow.tags[i];
        const tagRight = tag.x + tag.width;
        
        if (relativeX < tagRight) {
          targetIndex = tag.index;
          break;
        }
        
        if (i === targetRow.tags.length - 1) {
          targetIndex = tag.index + 1;
        }
      }
    }

    return targetIndex;
  };

  const handleDragStart = (e, index, tag) => {
    setDragState({
      isDragging: true,
      draggedIndex: index,
      targetIndex: null,
      draggedTag: tag
    });
    e.dataTransfer.effectAllowed = 'move';
    // 设置拖拽数据，用于垃圾桶删除
    e.dataTransfer.setData('text/plain', tag.name);
  };

  const handleDragEnd = () => {
    setDragState({
      isDragging: false,
      draggedIndex: null,
      targetIndex: null,
      draggedTag: null
    });
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const targetIndex = calculateTargetIndex(e.clientX, e.clientY);
    
    setDragState(prev => ({
      ...prev,
      targetIndex: targetIndex
    }));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    
    const finalToIndex = calculateTargetIndex(e.clientX, e.clientY);
    const fromIndex = dragState.draggedIndex;
    
    if (fromIndex !== null && finalToIndex !== null && finalToIndex !== fromIndex) {
      console.log(`拖拽排序: ${fromIndex} -> ${finalToIndex}`);
      handleTagReorder(fromIndex, finalToIndex);
      
      // 拖动后立即刷新弹窗数据
      setTimeout(async () => {
        if (selectedFileForTags && selectedFileForTags._id) {
          try {
            const updatedFile = await getFileDetails(selectedFileForTags._id);
            if (updatedFile) {
              setSelectedFileForTags(updatedFile);
            }
          } catch (err) {
            console.error('刷新文件数据失败:', err);
          }
        }
      }, 100);
    }
    
    handleDragEnd();
  };

  const getTagStyle = (index) => {
    const style = {};
    
    if (dragState.isDragging && dragState.draggedIndex !== null && dragState.targetIndex !== null) {
      if (index === dragState.draggedIndex) {
        // 被拖动的标签
        style.transform = 'scale(1.1) rotate(5deg)';
        style.zIndex = 1000;
        style.opacity = 0.8;
        style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.3)';
      } else {
        const draggedIndex = dragState.draggedIndex;
        const targetIndex = dragState.targetIndex;
        
        // 获取被拖动标签的尺寸
        const draggedElement = document.querySelector(`[data-index="${draggedIndex}"]`);
        let draggedWidth = 0;
        if (draggedElement) {
          draggedWidth = draggedElement.offsetWidth;
        }
        
        const { rows, gap } = calculateTagPositions();
        
        // 找到当前标签所在的行
        let currentRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const tagInRow = row.tags.find(t => t.index === index);
          if (tagInRow) {
            currentRowIndex = i;
            break;
          }
        }
        
        // 找到目标位置所在的行
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const tagInRow = row.tags.find(t => t.index === targetIndex);
          if (tagInRow) {
            targetRowIndex = i;
            break;
          }
        }
        
        // 只有同行内的标签才会移动
        if (currentRowIndex !== -1 && targetRowIndex !== -1 && currentRowIndex === targetRowIndex) {
          // 同行内移动 - 修复逻辑
          if (draggedIndex < targetIndex) {
            // 向右拖动：中间标签向左移动
            if (index > draggedIndex && index <= targetIndex) {
              style.transform = `translateX(-${draggedWidth + gap}px)`;
              style.transition = 'transform 0.2s ease';
            }
          } else if (draggedIndex > targetIndex) {
            // 向左拖动：中间标签向右移动
            if (index >= targetIndex && index < draggedIndex) {
              style.transform = `translateX(${draggedWidth + gap}px)`;
              style.transition = 'transform 0.2s ease';
            }
          }
        }
      }
    }
    
    return style;
  };
  
  if (!showTagModal || !selectedFileForTags) return null;
  
  return (
    <div className="modal-overlay" onClick={handleCloseTagModal}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>管理标签 - {fixEncoding(selectedFileForTags.originalName || selectedFileForTags.filename)}</h3>
          <button className="close-btn" onClick={handleCloseTagModal}>×</button>
        </div>
        
        <div className="modal-body">
          {/* 标签弹窗内的错误信息显示 */}
          {tagModalError && (
            <div className="tag-modal-error" style={{
              backgroundColor: '#fee',
              color: '#c33',
              padding: '8px 12px',
              borderRadius: '4px',
              marginBottom: '12px',
              fontSize: '14px',
              border: '1px solid #fcc'
            }}>
              {tagModalError}
            </div>
          )}

          {/* 文件重命名功能 - 仅管理员可见 */}
          {currentUser?.role === 'admin' && (
            <div className="file-rename-section" style={{
              marginBottom: '20px',
              padding: '15px',
              backgroundColor: '#f8f9fa',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <h4 style={{ marginBottom: '10px', color: '#495057' }}>文件重命名</h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label style={{ 
                  fontSize: '14px', 
                  color: '#6c757d',
                  minWidth: '80px'
                }}>
                  当前文件名：
                </label>
                <input
                  ref={fileNameInputRef}
                  type="text"
                  value={newFileName}
                  onChange={handleFileNameChange}
                  onKeyPress={handleFileNameKeyPress}
                  placeholder={fixEncoding(selectedFileForTags.originalName || selectedFileForTags.filename)}
                  className="tag-name-input"
                  style={{
                    flex: '1',
                    padding: '8px 12px',
                    border: '1px solid #ced4da',
                    borderRadius: '4px',
                    fontSize: '14px',
                    backgroundColor: '#fff'
                  }}
                  onInput={(e) => {
                    // 应用 fixEncoding 处理中文输入
                    const value = e.target.value;
                    const fixedValue = fixEncoding(value);
                    if (value !== fixedValue) {
                      e.target.value = fixedValue;
                      setNewFileName(fixedValue);
                    }
                  }}
                />
                <button
                  onClick={handleRenameFile}
                  disabled={isRenaming || !newFileName.trim()}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: isRenaming ? '#6c757d' : '#007bff',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isRenaming ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    fontWeight: '500'
                  }}
                >
                  {isRenaming ? '重命名中...' : '重命名'}
                </button>
              </div>
              <div style={{ 
                marginTop: '8px', 
                fontSize: '12px', 
                color: '#6c757d',
                fontStyle: 'italic'
              }}>
                提示：请输入完整的文件名，包括扩展名（如：document.pdf）
              </div>
            </div>
          )}

          {/* 当前标签 */}
            <div className="current-tags">
              <h4>当前标签: (可拖拽排序)</h4>
              {selectedFileForTags.tags && selectedFileForTags.tags.length > 0 ? (
                <div 
                  className={`tags-list ${dragState.isDragging ? 'drag-active' : ''}`}
                  id="sortable-tags"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  {selectedFileForTags.tags.sort((a, b) => {
                    // 第一优先级：按你规定的顺序（order）
                    const aTag = availableTags.find(t => t.name === a.name);
                    const bTag = availableTags.find(t => t.name === b.name);
                    
                    if (aTag && bTag) {
                      // 如果两个标签都在全局标签列表中，按order排序
                      if (aTag.order !== bTag.order) {
                        return aTag.order - bTag.order;
                      }
                      // 第二优先级：按usageCount递减排序
                      if (aTag.usageCount !== bTag.usageCount) {
                        return bTag.usageCount - aTag.usageCount;
                      }
                    } else if (aTag) {
                      // 如果只有a在全局列表中，a排在前面
                      return -1;
                    } else if (bTag) {
                      // 如果只有b在全局列表中，b排在前面
                      return 1;
                    }
                    
                    // 第三优先级：按名称排序
                    return a.name.localeCompare(b.name);
                  }).map((tag, index) => (
                    <span 
                      key={`${tag.name}-${index}`} 
                      className="tag-item draggable-tag"
                      style={getTagStyle(index)}
                      draggable="true"
                      data-index={index}
                      data-tag-name={tag.name}
                      onDragStart={(e) => handleDragStart(e, index, tag)}
                      onDragEnd={handleDragEnd}
                    >
                      <span
                        className="tag"
                        style={{ backgroundColor: tag.color }}
                        title={tag.name}
                      >
                        {tag.name}
                      </span>
                      <button
                        className="remove-tag-btn"
                        onClick={() => handleRemoveTag(tag.name)}
                        title={`删除标签 "${tag.name}"`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p>暂无标签</p>
              )}
            </div>
          
          {/* 添加新标签 */}
          <div className="add-tag-section">
            <h4>添加新标签:</h4>
            <div className="add-tag-form">
              <input
                ref={newTagInputRef}
                type="text"
                placeholder="标签名称"
                defaultValue=""
                className="tag-name-input"
                onInput={(e) => {
                  inputValueRef.current = e.target.value;
                }}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    const value = inputValueRef.current.trim();
                    if (value) {
                      handleAddNewTag();
                    }
                  }
                }}
              />
              <div className="color-picker">
                {tagColors.map((color, index) => (
                  <button
                    key={index}
                    className={`color-option ${newTagColor === color ? 'selected' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                  />
                ))}
              </div>
              <button
                className="add-tag-btn"
                onClick={handleAddNewTag}
              >
                添加标签
              </button>
            </div>
          </div>
          
          {/* 可用标签 */}
          <div className="available-tags">
            <h4>可用标签: (可拖拽排序和删除)</h4>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
              <div 
                className={`tags-list ${availableTagDragState.isDragging ? 'drag-active' : ''}`}
                style={{ flex: '1' }}
                onDragOver={handleAvailableTagDragOver}
                onDrop={handleAvailableTagDrop}
              >
                {availableTags.map((tag, index) => (
                  <span
                    key={index}
                    className="tag-item draggable-tag"
                    draggable="true"
                    data-index={index}
                    data-tag-name={tag.name}
                    style={getAvailableTagStyle(index)}
                    onDragStart={(e) => handleAvailableTagDragStart(e, index, tag)}
                    onDragEnd={handleAvailableTagDragEnd}
                    onClick={async () => {
                      console.log('=== 标签点击调试信息 ===');
                      console.log('1. 点击的标签:', tag);
                      console.log('2. selectedFileForTags:', selectedFileForTags);
                      console.log('3. selectedFileForTags._id:', selectedFileForTags?._id);
                      
                      if (!selectedFileForTags || !selectedFileForTags._id) {
                        console.error('错误: selectedFileForTags 或 _id 为空');
                        return;
                      }
                      
                      // 前端乐观检查：快速检查内存中是否已存在该标签
                      const existingTag = selectedFileForTags.tags?.find(existingTag => 
                        existingTag.name.toLowerCase() === tag.name.toLowerCase()
                      );
                      
                      if (existingTag) {
                        console.log('标签已存在，跳过添加');
                        setTagModalError(`标签 "${tag.name}" 已存在`);
                        setTimeout(() => setTagModalError(''), 3000);
                        return;
                      }
                      
                      console.log('4. 开始前端乐观更新...');
                      
                      // 前端乐观更新：立即更新UI状态，让用户看到即时反馈
                      const updatedFile = {
                        ...selectedFileForTags,
                        tags: [...(selectedFileForTags.tags || []), tag]
                      };
                      
                      // 1. 立即更新弹窗内的文件状态
                      setSelectedFileForTags(updatedFile);
                      
                      // 2. 使用统一的增量更新函数更新所有相关状态
                      const updateFileWithNewTag = (fileList) => {
                        if (!Array.isArray(fileList)) return fileList;
                        return fileList.map(file => 
                          file._id === selectedFileForTags._id 
                            ? { ...file, tags: [...(file.tags || []), tag] }
                            : file
                        );
                      };

                      // 更新当前显示的文件列表
                      setFiles(prevFiles => updateFileWithNewTag(prevFiles));
                      
                      // 更新状态机中的所有相关备份
                      setNavigationState(prev => {
                        const newState = { ...prev };
                        
                        // 更新 normalBackup
                        if (newState.normalBackup && newState.normalBackup.files) {
                          newState.normalBackup.files = updateFileWithNewTag(newState.normalBackup.files);
                        }
                        
                        // 更新 search backup
                        if (newState.backup && newState.backup.files) {
                          newState.backup.files = updateFileWithNewTag(newState.backup.files);
                        }
                        
                        // 更新 locationJump 相关状态
                        if (newState.locationJump) {
                          if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
                            newState.locationJump.currentLocation.files = updateFileWithNewTag(newState.locationJump.currentLocation.files);
                          }
                          if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
                            newState.locationJump.originalSearchState.files = updateFileWithNewTag(newState.locationJump.originalSearchState.files);
                          }
                        }
                        
                        return newState;
                      });
                      
                      // 清除错误信息
                      setTagModalError('');
                      console.log('5. 前端乐观更新完成！');
                      
                      // 后端异步处理：不阻塞UI，让用户继续操作
                      console.log('6. 开始后端异步处理...');
                      (async () => {
                        try {
                          // 调用后端API添加标签
                          const result = await addTags(selectedFileForTags._id, [tag]);
                          console.log('7. 后端添加标签成功:', result);
                          
                          // 后端成功后，刷新文件详情以获取正确的标签顺序
                          try {
                            const updatedFileFromServer = await getFileDetails(selectedFileForTags._id);
                            if (updatedFileFromServer) {
                              console.log('8. 获取到服务器最新数据:', updatedFileFromServer);
                              // 更新为服务器的最新数据，确保数据一致性
                              setSelectedFileForTags(updatedFileFromServer);
                              
                              // 同步更新其他状态
                              const updateFileWithServerData = (fileList) => {
                                if (!Array.isArray(fileList)) return fileList;
                                return fileList.map(file => 
                                  file._id === selectedFileForTags._id 
                                    ? updatedFileFromServer
                                    : file
                                );
                              };
                              
                              setFiles(prevFiles => updateFileWithServerData(prevFiles));
                              setNavigationState(prev => {
                                const newState = { ...prev };
                                if (newState.normalBackup && newState.normalBackup.files) {
                                  newState.normalBackup.files = updateFileWithServerData(newState.normalBackup.files);
                                }
                                if (newState.backup && newState.backup.files) {
                                  newState.backup.files = updateFileWithServerData(newState.backup.files);
                                }
                                if (newState.locationJump) {
                                  if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
                                    newState.locationJump.currentLocation.files = updateFileWithServerData(newState.locationJump.currentLocation.files);
                                  }
                                  if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
                                    newState.locationJump.originalSearchState.files = updateFileWithServerData(newState.locationJump.originalSearchState.files);
                                  }
                                }
                                return newState;
                              });
                            }
                          } catch (refreshErr) {
                            console.error('刷新文件数据失败:', refreshErr);
                          }
                          
                          console.log('9. 后端处理完成！');
                        } catch (err) {
                          console.error('=== 后端添加标签失败 ===');
                          console.error('错误详情:', err);
                          console.error('错误消息:', err.message);
                          
                          // 后端失败时，回滚前端状态
                          console.log('10. 开始回滚前端状态...');
                          setSelectedFileForTags(prev => ({
                            ...prev,
                            tags: prev.tags.filter(t => t.name !== tag.name)
                          }));
                          
                          // 回滚其他状态
                          const rollbackFileUpdate = (fileList) => {
                            if (!Array.isArray(fileList)) return fileList;
                            return fileList.map(file => 
                              file._id === selectedFileForTags._id 
                                ? { ...file, tags: file.tags.filter(t => t.name !== tag.name) }
                                : file
                            );
                          };
                          
                          setFiles(prevFiles => rollbackFileUpdate(prevFiles));
                          setNavigationState(prev => {
                            const newState = { ...prev };
                            if (newState.normalBackup && newState.normalBackup.files) {
                              newState.normalBackup.files = rollbackFileUpdate(newState.normalBackup.files);
                            }
                            if (newState.backup && newState.backup.files) {
                              newState.backup.files = rollbackFileUpdate(newState.backup.files);
                            }
                            if (newState.locationJump) {
                              if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
                                newState.locationJump.currentLocation.files = rollbackFileUpdate(newState.locationJump.currentLocation.files);
                              }
                              if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
                                newState.locationJump.originalSearchState.files = rollbackFileUpdate(newState.locationJump.originalSearchState.files);
                              }
                            }
                            return newState;
                          });
                          
                          // 显示错误信息
                          setTagModalError(`添加标签失败: ${err.message || '未知错误'}`);
                          setTimeout(() => setTagModalError(''), 5000);
                          
                          console.log('11. 前端状态回滚完成！');
                        }
                      })();
                      
                      console.log('12. 标签添加流程启动完成！');
                    }}
                    title={`点击添加标签: ${tag.name}`}
                  >
                    <span
                      className="tag"
                      style={{ backgroundColor: tag.color }}
                      title={tag.name}
                    >
                      {tag.name}
                    </span>
                  </span>
                ))}
              </div>
              
              {/* 垃圾桶区域 */}
              <div 
                className="trash-zone"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  setIsOverTrash(true);
                }}
                onDragLeave={() => setIsOverTrash(false)}
                onDrop={async (e) => {
                  e.preventDefault();
                  setIsOverTrash(false);
                  const draggedTagName = e.dataTransfer.getData('text/plain');
                  if (draggedTagName) {
                    try {
                      await deleteTag(draggedTagName);
                      setTagModalError(`标签 "${draggedTagName}" 删除成功`);
                      setTimeout(() => setTagModalError(''), 1500);
                      if (typeof refreshAllTags === 'function') {
                        await refreshAllTags();
                      }
                    } catch (err) {
                      console.error('删除标签失败:', err);
                      
                      // 检查是否是标签正在使用的错误
                      if (err.response?.status === 400 && err.response?.data?.details?.fileCount) {
                        const fileCount = err.response.data.details.fileCount;
                        const confirmForceDelete = window.confirm(
                          `标签 "${draggedTagName}" 正在被 ${fileCount} 个文件使用，无法直接删除。\n\n` +
                          `是否要强制删除？这将从所有文件上移除该标签。\n\n` +
                          `点击"确定"强制删除，点击"取消"放弃操作。`
                        );
                        
                        if (confirmForceDelete) {
                          try {
                            await forceDeleteTag(draggedTagName);
                            setTagModalError(`标签 "${draggedTagName}" 强制删除成功，已从 ${fileCount} 个文件上移除`);
                            setTimeout(() => setTagModalError(''), 3000);
                            
                            // 立即更新弹窗中当前文件的标签列表
                            if (selectedFileForTags && selectedFileForTags.tags) {
                              setSelectedFileForTags(prev => ({
                                ...prev,
                                tags: prev.tags.filter(tag => tag.name !== draggedTagName),
                                tagOrder: prev.tagOrder ? prev.tagOrder.filter(name => name !== draggedTagName) : []
                              }));
                            }
                            
                            // 同步更新文件列表中的标签
                            setFiles(prevFiles => 
                              prevFiles.map(file => 
                                file._id === selectedFileForTags._id
                                  ? {
                                      ...file,
                                      tags: file.tags.filter(tag => tag.name !== draggedTagName),
                                      tagOrder: file.tagOrder ? file.tagOrder.filter(name => name !== draggedTagName) : []
                                    }
                                  : file
                              )
                            );
                            
                            // 同步更新导航状态中的文件标签
                            setNavigationState(prev => {
                              const updateFileTags = (fileList) => 
                                fileList.map(file => 
                                  file._id === selectedFileForTags._id
                                    ? {
                                        ...file,
                                        tags: file.tags.filter(tag => tag.name !== draggedTagName),
                                        tagOrder: file.tagOrder ? file.tagOrder.filter(name => name !== draggedTagName) : []
                                      }
                                    : file
                                );
                              
                              return {
                                ...prev,
                                normalBackup: {
                                  ...prev.normalBackup,
                                  files: updateFileTags(prev.normalBackup.files || [])
                                },
                                backup: {
                                  ...prev.backup,
                                  files: updateFileTags(prev.backup.files || [])
                                },
                                locationJump: {
                                  ...prev.locationJump,
                                  currentLocation: {
                                    ...prev.locationJump.currentLocation,
                                    files: updateFileTags(prev.locationJump.currentLocation.files || [])
                                  }
                                }
                              };
                            });
                            
                            if (typeof refreshAllTags === 'function') {
                              await refreshAllTags();
                            }
                          } catch (forceDeleteErr) {
                            console.error('强制删除标签失败:', forceDeleteErr);
                            setTagModalError(`强制删除标签失败: ${forceDeleteErr.response?.data?.error || forceDeleteErr.message}`);
                            setTimeout(() => setTagModalError(''), 5000);
                          }
                        }
                      } else {
                        // 显示其他类型的错误信息
                        let errorMessage = '删除标签失败';
                        if (err.response?.data) {
                          const errorData = err.response.data;
                          if (errorData.details) {
                            if (errorData.details.message) {
                              errorMessage = errorData.details.message;
                            } else if (errorData.details.fileCount) {
                              errorMessage = `该标签被 ${errorData.details.fileCount} 个文件使用，无法删除`;
                            }
                          } else if (errorData.error) {
                            errorMessage = errorData.error;
                          }
                        } else if (err.message) {
                          errorMessage = err.message;
                        }
                        
                        setTagModalError(errorMessage);
                        setTimeout(() => setTagModalError(''), 5000); // 显示更长时间
                      }
                    }
                  }
                }}
                style={{
                  width: isOverTrash ? '96px' : '80px',
                  height: isOverTrash ? '96px' : '80px',
                  border: `2px dashed ${isOverTrash ? '#c82333' : '#dc3545'}`,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isOverTrash ? '#ffe6e6' : '#fff5f5',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  flexShrink: 0
                }}
              >
                <span style={{ fontSize: '24px', color: '#dc3545' }}>🗑️</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------
// Dashboard 组件
// ------------------------------------------------------------
const Dashboard = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const fileListRef = useRef(null);
  const latestRequestRef = useRef(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);
  
  // 导航历史状态 - 用于智能返回功能
  const [isFromSearch, setIsFromSearch] = useState(false);
  const [searchBackup, setSearchBackup] = useState({
    searchInput: '',
    searchTerm: '',
    searchTags: [],
    globalSearch: false,
    files: [],
    currentFolder: null,
    folderPath: []
  });
  
  // 标签相关状态 - 从 FileList 组件移到这里
  const [showTagModal, setShowTagModal] = useState(false);
  const [selectedFileForTags, setSelectedFileForTags] = useState(null);
  const [availableTags, setAvailableTags] = useState([]);
  const [newTagColor, setNewTagColor] = useState('#007bff');
  const [tagModalError, setTagModalError] = useState('');
  const newTagInputRef = useRef(null);
  const inputValueRef = useRef('');
  const [files, setFiles] = useState([]);
  
  // 搜索相关状态 - 从 FileList 组件移到这里
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTags, setSearchTags] = useState([]);
  const [globalSearch, setGlobalSearch] = useState(false);
  
  // 导航状态机
  const [navigationState, setNavigationState] = useState({
    // 当前状态类型
    currentState: 'normal', // 'normal' | 'search' | 'location_jump' | 'search_to_location'
    
    // 搜索相关状态
    searchInput: '',
    searchTerm: '',
    searchTags: [],
    globalSearch: false,
    
    // 备份状态
    backup: {
      searchInput: '',
      searchTerm: '',
      searchTags: [],
      globalSearch: false,
      files: [],
      currentFolder: null,
      folderPath: []
    },
    
    // 位置跳转状态
    locationJump: {
      fromSearch: false,
      originalSearchState: null,
      currentLocation: {
        currentFolder: null,
        folderPath: [],
        files: []
      }
    },
    // 普通目录浏览备份（仅在 normal 状态下使用）
    normalBackup: {
      currentFolder: null,
      folderPath: [],
      files: []
    }
  });
  
  // 兼容性状态（保持现有代码工作）
  const [isFromLocationJump, setIsFromLocationJump] = useState(false);
  
  // 文件重命名相关状态
  const [newFileName, setNewFileName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const fileNameInputRef = useRef(null);
  
  // 搜索中断相关状态
  const [searchAbortController, setSearchAbortController] = useState(null);
  
  // 标签颜色选择器
  const tagColors = [
    '#007bff', '#28a745', '#dc3545', '#ffc107', '#17a2b8',
    '#6f42c1', '#fd7e14', '#e83e8c', '#20c997', '#6c757d'
  ];



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

    // 首次启动：并行静默获取根目录文件，避免初次白屏和长时间"刷新中"
    (async () => {
      try {
        const data = await getUserFiles({ sort: 'time_desc' });
        let filesArray = Array.isArray(data.files) ? data.files : [];
        filesArray = mergeDuplicateFolders(filesArray);
        setFiles(filesArray);
        setNavigationState(prev => ({
          ...prev,
          currentState: 'normal',
          normalBackup: {
            currentFolder: null,
            folderPath: [],
            files: filesArray
          }
        }));
      } catch (e) {
        // 忽略静默拉取错误
      }
    })();
  }, []);

  // 登录后预取所有可用标签，供标签弹窗即时使用
  useEffect(() => {
    const preloadAllTags = async () => {
      if (!currentUser) return;
      try {
        const res = await getAllTags();
        const allTags = Array.isArray(res?.tags) ? res.tags : [];
        setAvailableTags(allTags);
      } catch (err) {
        console.error('预取可用标签失败:', err);
        setAvailableTags([]);
      }
    };
    preloadAllTags();
  }, [currentUser]);

  // 统一刷新全局可选标签（用于弹窗与热门标签的即时更新）
  const refreshAllTags = useCallback(async () => {
    try {
      const res = await getAllTags();
      const allTags = Array.isArray(res?.tags) ? res.tags : [];
      setAvailableTags(allTags);
    } catch (err) {
      console.error('刷新可用标签失败:', err);
    }
  }, []);

  // 组件卸载时清理 AbortController
  useEffect(() => {
    return () => {
      if (searchAbortController) {
        searchAbortController.abort();
      }
    };
  }, [searchAbortController]);

  const handleUploadSuccess = (payload) => {
    // 不全量刷新：仅刷新用户信息与标签
    getCurrentUser().then(setCurrentUser);
    refreshAllTags();

    // 增量合并当前目录的上传结果
    if (!payload) return;
    const targetFolder = payload.targetFolder ?? null;
    if (targetFolder !== (currentFolder ?? null)) return;

    if (payload.type === 'files' && Array.isArray(payload.items) && payload.items.length > 0) {
      setFiles(prev => {
        const existingIds = new Set(prev.map(f => f._id));
        const merged = [...payload.items.filter(it => !existingIds.has(it._id)), ...prev];
        return merged;
      });
      setNavigationState(prev => ({
        ...prev,
        normalBackup: {
          ...prev.normalBackup,
          files: (() => {
            const prevFiles = Array.isArray(prev.normalBackup.files) ? prev.normalBackup.files : [];
            const existingIds = new Set(prevFiles.map(f => f._id));
            return [...payload.items.filter(it => !existingIds.has(it._id)), ...prevFiles];
          })()
        }
      }));
    }
    if (payload.type === 'folder' && payload.folder) {
      const folderItem = {
        _id: payload.folder.id,
        filename: payload.folder.name,
        originalName: payload.folder.name,
        size: payload.folder.size ?? 0,
        isFolder: true,
        parentFolder: targetFolder
      };
      setFiles(prev => {
        const exists = prev.some(f => f._id === folderItem._id);
        return exists ? prev : [folderItem, ...prev];
      });
      setNavigationState(prev => ({
        ...prev,
        normalBackup: {
          ...prev.normalBackup,
          files: (() => {
            const prevFiles = Array.isArray(prev.normalBackup.files) ? prev.normalBackup.files : [];
            return prevFiles.some(f => f._id === folderItem._id) ? prevFiles : [folderItem, ...prevFiles];
          })()
        }
      }));
    }
  };

  // 标签相关函数
  const handleOpenTagModal = async (file) => {
    // 立即显示弹窗，提升响应速度
    setSelectedFileForTags(file);
    setNewFileName(fixEncoding(file.originalName || file.filename));
    // 直接使用预取的 availableTags，确保"一按下就呈现完整可选标签"
    setShowTagModal(true);
    
    // 后台轻量刷新（不阻塞UI）
    (async () => {
      try {
        const response = await getAllTags();
        const allTags = Array.isArray(response?.tags) ? response.tags : [];
        setAvailableTags(allTags);
      } catch (err) {
        console.error('获取标签失败:', err);
      }
    })();
  };

  const handleCloseTagModal = () => {
    const lastEditedFile = selectedFileForTags;
    setShowTagModal(false);
    setNewTagColor('#007bff');
    setTagModalError('');
    
    console.log('[TAG] 关闭标签弹窗，当前状态机状态:', navigationState.currentState);
    console.log('[TAG] 最后编辑的文件:', lastEditedFile);

    // 如果没有编辑的文件，直接返回
    if (!lastEditedFile) {
      console.log('[TAG] 没有编辑的文件，直接关闭弹窗');
      setSelectedFileForTags(null);
      return;
    }

    const applyEditedToFileList = (fileList) => {
      if (!lastEditedFile || !Array.isArray(fileList)) return fileList;
      return fileList.map(file =>
        file._id === lastEditedFile._id
          ? {
              ...file,
              tags: lastEditedFile.tags ?? file.tags,
              tagOrder: lastEditedFile.tagOrder ?? file.tagOrder,
              originalName: lastEditedFile.originalName || file.originalName,
              filename: lastEditedFile.filename || file.filename,
            }
          : file
      );
    };

    // 通用更新函数：更新所有相关的状态
    const updateAllRelatedStates = () => {
      // 1. 更新当前显示的文件列表
      setFiles(prevFiles => {
        const updatedFiles = applyEditedToFileList(prevFiles);
        console.log('[TAG] 更新当前显示列表，文件数量:', updatedFiles.length);
        return updatedFiles;
      });

      // 2. 更新状态机中的所有相关备份
      setNavigationState(prev => {
        const newState = { ...prev };
        
        // 更新 normalBackup
        if (newState.normalBackup && newState.normalBackup.files) {
          newState.normalBackup.files = applyEditedToFileList(newState.normalBackup.files);
        }
        
        // 更新 search backup
        if (newState.backup && newState.backup.files) {
          newState.backup.files = applyEditedToFileList(newState.backup.files);
        }
        
        // 更新 locationJump 相关状态
        if (newState.locationJump) {
          if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
            newState.locationJump.currentLocation.files = applyEditedToFileList(newState.locationJump.currentLocation.files);
          }
          if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
            newState.locationJump.originalSearchState.files = applyEditedToFileList(newState.locationJump.originalSearchState.files);
          }
        }
        
        console.log('[TAG] 更新状态机完成');
        return newState;
      });
    };

    // 根据状态机决定行为
    switch (navigationState.currentState) {
      case 'search_to_location': {
        console.log('[TAG] 从搜索跳转位置编辑，更新当前位置文件，保持当前位置');
        updateAllRelatedStates();
        break;
      }
      case 'location_jump': {
        console.log('[TAG] 从普通跳转位置编辑，更新当前位置文件，保持当前位置');
        updateAllRelatedStates();
        break;
      }
      case 'search': {
        console.log('[TAG] 从搜索结果编辑，更新备份与显示列表，保持搜索状态');
        updateAllRelatedStates();
        break;
      }
      case 'normal':
      default: {
        console.log('[TAG] 从普通目录编辑，增量更新当前列表与 normalBackup');
        updateAllRelatedStates();
        break;
      }
    }

    // 强制触发一次重新渲染，确保UI更新
    setTimeout(() => {
      setFiles(prevFiles => [...prevFiles]);
    }, 0);

    // 最后再清空所选文件，避免丢失更新数据
    setSelectedFileForTags(null);
    
    console.log('[TAG] 标签弹窗关闭，增量更新完成');
  };

  const handleAddNewTag = useCallback(async () => {
    const tagName = inputValueRef.current.trim();
    if (!tagName) {
      setTagModalError('请输入标签名称');
      setTimeout(() => setTagModalError(''), 3000);
      return;
    }
    
    // 确保 selectedFileForTags 不为空
    if (!selectedFileForTags) {
      setTagModalError('未选择文件');
      setTimeout(() => setTagModalError(''), 3000);
      return;
    }
    
    // 检查当前文件的标签（乐观检查）
    if (selectedFileForTags.tags && selectedFileForTags.tags.length > 0) {
      const existingTag = selectedFileForTags.tags.find(tag => 
        tag.name.toLowerCase() === tagName.toLowerCase()
      );
      
      if (existingTag) {
        setTagModalError(`标签 "${tagName}" 已存在`);
        setTimeout(() => setTagModalError(''), 3000);
        return;
      }
    }
    
    // 先检查全局是否已存在该标签
    let globalTag = null;
    try {
      const allTags = await getAllTags();
      globalTag = allTags.tags.find(tag => 
        tag.name.toLowerCase() === tagName.toLowerCase()
      );
    } catch (err) {
      console.warn('获取全局标签失败:', err);
    }
    
    // 如果全局已存在该标签，使用全局标签的属性
    const tagToAdd = globalTag ? {
      name: globalTag.name,
      color: globalTag.color
    } : {
      name: tagName,
      color: newTagColor
    };
    
    // 乐观更新：立即更新UI
    setSelectedFileForTags(prev => {
      if (!prev) return null;
      return {
        ...prev,
        tags: [...(prev.tags || []), tagToAdd],
        tagOrder: [...(prev.tagOrder || []), tagToAdd.name]
      };
    });
    
    // 使用统一的增量更新函数
    const updateFileWithNewTag = (fileList) => {
      if (!Array.isArray(fileList)) return fileList;
      return fileList.map(file => 
        file._id === selectedFileForTags._id 
          ? { 
              ...file, 
              tags: [...(file.tags || []), tagToAdd],
              tagOrder: [...(file.tagOrder || []), tagToAdd.name]
            }
          : file
      );
    };

    // 更新当前显示的文件列表
    setFiles(prevFiles => updateFileWithNewTag(prevFiles));
    
    // 更新状态机中的所有相关备份
    setNavigationState(prev => {
      const newState = { ...prev };
      
      // 更新 normalBackup
      if (newState.normalBackup && newState.normalBackup.files) {
        newState.normalBackup.files = updateFileWithNewTag(newState.normalBackup.files);
      }
      
      // 更新 search backup
      if (newState.backup && newState.backup.files) {
        newState.backup.files = updateFileWithNewTag(newState.backup.files);
      }
      
      // 更新 locationJump 相关状态
      if (newState.locationJump) {
        if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
          newState.locationJump.currentLocation.files = updateFileWithNewTag(newState.locationJump.currentLocation.files);
        }
        if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
          newState.locationJump.originalSearchState.files = updateFileWithNewTag(newState.locationJump.originalSearchState.files);
        }
      }
      
      return newState;
    });
    
    // 立即更新UI状态
    setNewTagColor('#007bff');
    setTagModalError('');
    refreshAllTags();
    
    // 异步处理后端操作（不阻塞UI）
    (async () => {
      try {
        // 只有当标签不存在时才尝试创建
        if (!globalTag) {
          try {
            await createTag(tagToAdd);
          } catch (err) {
            if (!err.message.includes('标签已存在')) {
              console.error('创建标签失败:', err);
              return;
            }
          }
        }
        
        await addTags(selectedFileForTags._id, [tagToAdd]);
      } catch (err) {
        console.error('后端标签操作失败:', err);
        // 如果后端失败，可以考虑回滚UI状态
      }
    })();
  }, [selectedFileForTags, newTagColor]);

  const handleRemoveTag = async (tagName) => {
    try {
      await removeTags(selectedFileForTags._id, [tagName]);
      
      setSelectedFileForTags(prev => ({
        ...prev,
        tags: prev.tags.filter(tag => tag.name !== tagName),
        tagOrder: prev.tagOrder ? prev.tagOrder.filter(name => name !== tagName) : []
      }));
      
      // 使用统一的增量更新函数
      const updateFileWithRemovedTag = (fileList) => {
        if (!Array.isArray(fileList)) return fileList;
        return fileList.map(file => 
          file._id === selectedFileForTags._id 
            ? { 
                ...file, 
                tags: file.tags.filter(tag => tag.name !== tagName),
                tagOrder: file.tagOrder ? file.tagOrder.filter(name => name !== tagName) : []
              }
            : file
        );
      };

      // 更新当前显示的文件列表
      setFiles(prevFiles => updateFileWithRemovedTag(prevFiles));
      
      // 更新状态机中的所有相关备份
      setNavigationState(prev => {
        const newState = { ...prev };
        
        // 更新 normalBackup
        if (newState.normalBackup && newState.normalBackup.files) {
          newState.normalBackup.files = updateFileWithRemovedTag(newState.normalBackup.files);
        }
        
        // 更新 search backup
        if (newState.backup && newState.backup.files) {
          newState.backup.files = updateFileWithRemovedTag(newState.backup.files);
        }
        
        // 更新 locationJump 相关状态
        if (newState.locationJump) {
          if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
            newState.locationJump.currentLocation.files = updateFileWithRemovedTag(newState.locationJump.currentLocation.files);
          }
          if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
            newState.locationJump.originalSearchState.files = updateFileWithRemovedTag(newState.locationJump.originalSearchState.files);
          }
        }
        
        return newState;
      });
      
      setTagModalError('');
      // 变更后即时刷新可选标签与热门标签
      refreshAllTags();
    } catch (err) {
      console.error('移除标签失败:', err);
      setTagModalError(`移除标签失败: ${err.message}`);
      setTimeout(() => setTagModalError(''), 3000);
    }
  };










  // 处理标签重新排序
  const handleTagReorder = (fromIndex, toIndex) => {
    // 获取当前按顺序排列的标签
    const currentOrderedTags = selectedFileForTags.tagOrder && selectedFileForTags.tagOrder.length > 0 
      ? selectedFileForTags.tagOrder.map(tagName => {
          const tag = selectedFileForTags.tags.find(t => t.name === tagName);
          return tag;
        }).filter(Boolean)
      : selectedFileForTags.tags;
    
    const newOrderedTags = [...currentOrderedTags];
    // 删除原标签
    const [movedTag] = newOrderedTags.splice(fromIndex, 1);
    // // 从左到右移动，需要将toIndex改为toIndex-1
    // if (fromIndex < toIndex) {
    //   toIndex = toIndex - 1;
    // }
    newOrderedTags.splice(toIndex, 0, movedTag);
    
    // 更新本地状态
    setSelectedFileForTags(prev => ({
      ...prev,
      tagOrder: newOrderedTags.map(tag => tag.name)
    }));
    
    // 使用统一的增量更新函数
    const updateFileWithNewTagOrder = (fileList) => {
      if (!Array.isArray(fileList)) return fileList;
      return fileList.map(file => 
        file._id === selectedFileForTags._id 
          ? { ...file, tagOrder: newOrderedTags.map(tag => tag.name) }
          : file
      );
    };

    // 更新当前显示的文件列表
    setFiles(prevFiles => updateFileWithNewTagOrder(prevFiles));
    
    // 更新状态机中的所有相关备份
    setNavigationState(prev => {
      const newState = { ...prev };
      
      // 更新 normalBackup
      if (newState.normalBackup && newState.normalBackup.files) {
        newState.normalBackup.files = updateFileWithNewTagOrder(newState.normalBackup.files);
      }
      
      // 更新 search backup
      if (newState.backup && newState.backup.files) {
        newState.backup.files = updateFileWithNewTagOrder(newState.backup.files);
      }
      
      // 更新 locationJump 相关状态
      if (newState.locationJump) {
        if (newState.locationJump.currentLocation && newState.locationJump.currentLocation.files) {
          newState.locationJump.currentLocation.files = updateFileWithNewTagOrder(newState.locationJump.currentLocation.files);
        }
        if (newState.locationJump.originalSearchState && newState.locationJump.originalSearchState.files) {
          newState.locationJump.originalSearchState.files = updateFileWithNewTagOrder(newState.locationJump.originalSearchState.files);
        }
      }
      
      return newState;
    });
    
    // 立即更新数据库，带重试机制
    const tagOrder = newOrderedTags.map(tag => tag.name);
    console.log('准备更新标签顺序:', {
      fileId: selectedFileForTags._id,
      tagOrder: tagOrder,
      fromIndex,
      toIndex
    });
    
    const updateWithRetry = async (retries = 3) => {
      try {
        console.log(`尝试更新标签顺序 (第 ${4 - retries}/3 次)...`);
        const result = await updateTagOrder(selectedFileForTags._id, tagOrder);
        console.log('标签顺序更新成功:', result);
        
        // 更新成功后立即刷新弹窗数据
        const updatedFile = await getFileDetails(selectedFileForTags._id);
        if (updatedFile) {
          console.log('获取到更新后的文件:', updatedFile);
          setSelectedFileForTags(updatedFile);
        }
        
        // 排序变更后也刷新可选标签与热门标签（受 order 影响）
        console.log('刷新所有标签...');
        refreshAllTags();
        
        console.log('标签排序更新完成！');
      } catch (err) {
        console.error(`更新标签顺序失败 (尝试 ${4 - retries}/3):`, err);
        if (retries > 1) {
          // 等待短暂时间后重试
          console.log(`等待100ms后重试...`);
          await new Promise(resolve => setTimeout(resolve, 100));
          return updateWithRetry(retries - 1);
        } else {
          setTagModalError('更新标签顺序失败，请重试');
          // 恢复原始状态
          setSelectedFileForTags(prev => ({
            ...prev,
            tagOrder: currentOrderedTags.map(tag => tag.name)
          }));
        }
      }
    };
    
    updateWithRetry();
  };

  // 文件重命名处理函数
  const handleRenameFile = async () => {
    try {
      if (!selectedFileForTags || !selectedFileForTags._id) {
        setTagModalError('文件信息不完整，无法重命名');
        return;
      }

      const trimmedName = newFileName.trim();
      if (!trimmedName) {
        setTagModalError('文件名不能为空');
        return;
      }

      const newFileNameWithExtension = trimmedName;

      setIsRenaming(true);
      setTagModalError('');

      console.log('=== 开始重命名文件(乐观更新) ===');
      console.log('文件ID:', selectedFileForTags._id);
      console.log('原文件名:', selectedFileForTags.originalName || selectedFileForTags.filename);
      console.log('新文件名:', newFileNameWithExtension);

      // 先进行乐观更新，立即反映到UI
      setSelectedFileForTags(prev => ({
        ...prev,
        originalName: newFileNameWithExtension,
        filename: newFileNameWithExtension
      }));

      setFiles(prevFiles => 
        prevFiles.map(file => 
          file._id === selectedFileForTags._id 
            ? { ...file, originalName: newFileNameWithExtension, filename: newFileNameWithExtension }
            : file
        )
      );

      if (navigationState.currentState === 'search_to_location') {
        setNavigationState(prev => ({
          ...prev,
          locationJump: {
            ...prev.locationJump,
            originalSearchState: {
              ...prev.locationJump.originalSearchState,
              files: prev.locationJump.originalSearchState.files.map(file => 
                file._id === selectedFileForTags._id 
                  ? { ...file, originalName: newFileNameWithExtension, filename: newFileNameWithExtension }
                  : file
              )
            }
          }
        }));
        setNavigationState(prev => ({
          ...prev,
          locationJump: {
            ...prev.locationJump,
            currentLocation: {
              ...prev.locationJump.currentLocation,
              files: prev.locationJump.currentLocation.files.map(file =>
                file._id === selectedFileForTags._id
                  ? { ...file, originalName: newFileNameWithExtension, filename: newFileNameWithExtension }
                  : file
              )
            }
          }
        }));
      }

      if (navigationState.currentState === 'location_jump') {
        setNavigationState(prev => ({
          ...prev,
          locationJump: {
            ...prev.locationJump,
            currentLocation: {
              ...prev.locationJump.currentLocation,
              files: prev.locationJump.currentLocation.files.map(file => 
                file._id === selectedFileForTags._id 
                  ? { ...file, originalName: newFileNameWithExtension, filename: newFileNameWithExtension }
                  : file
              )
            }
          }
        }));
      }

      if (navigationState.currentState === 'search') {
        setNavigationState(prev => ({
          ...prev,
          backup: {
            ...prev.backup,
            files: prev.backup.files.map(file => 
              file._id === selectedFileForTags._id 
                ? { ...file, originalName: newFileNameWithExtension, filename: newFileNameWithExtension }
                : file
            )
          }
        }));
      }

      // 迅速结束"重命名中"按钮状态，提升响应性
      setTimeout(() => setIsRenaming(false), 150);

      // 后台调用API，同步服务器
      (async () => {
        try {
          await renameFile(selectedFileForTags._id, newFileNameWithExtension);
        } catch (err) {
          console.error('文件重命名失败:', err);
          setTagModalError('文件重命名失败: ' + (err.message || '未知错误'));
        }
      })();

      setNewFileName('');

    } catch (err) {
      console.error('文件重命名流程异常:', err);
      setTagModalError(mapApiErrorMessage(err, '文件重命名失败'));
      setIsRenaming(false);
    }
  };

  // 处理文件名输入变化
  const handleFileNameChange = (e) => {
    const value = e.target.value;
    setNewFileName(value);
    setTagModalError(''); // 清除错误信息
  };

  // 处理文件名输入框回车
  const handleFileNameKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRenameFile();
    }
  };



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
              <StorageMeter />
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
            // 删除后不再强制刷新列表，保持增量更新
            getCurrentUser().then(setCurrentUser);
          }}
          className={currentUser?.role === 'admin' ? 'file-list' : 'file-list user-normal'}
          currentFolder={currentFolder}
          folderPath={folderPath}
          onFolderChange={(newFolder, newPath) => {
            setCurrentFolder(newFolder);
            setFolderPath(newPath);
          }}
          onOpenTagModal={handleOpenTagModal}
          setCurrentFolder={setCurrentFolder}
          setFolderPath={setFolderPath}
          searchBackup={searchBackup}
          setSearchBackup={setSearchBackup}
          isFromSearch={isFromSearch}
          setIsFromSearch={setIsFromSearch}
          latestRequestRef={latestRequestRef}
          // 搜索相关状态
          searchInput={searchInput}
          setSearchInput={setSearchInput}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchTags={searchTags}
          setSearchTags={setSearchTags}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
          files={files}
          setFiles={setFiles}
          setIsFromLocationJump={setIsFromLocationJump}
          setNavigationState={setNavigationState}
          navigationState={navigationState}
          availableTags={availableTags}
          refreshAllTags={refreshAllTags}
        />
        
        {/* 上传文件组件 - 移到文件列表下方 */}
        {isAdmin && (
          <FileUpload 
            onUploadSuccess={handleUploadSuccess}
            currentFolder={currentFolder}
            folderPath={folderPath}
            onFolderChange={(newFolder, newPath) => {
              setCurrentFolder(newFolder);
              setFolderPath(newPath);
            }}
          />
        )}
      </div>
      
      {/* 标签模态框组件 */}
      <TagModal 
        showTagModal={showTagModal}
        selectedFileForTags={selectedFileForTags}
        availableTags={availableTags}
        newTagColor={newTagColor}
        setNewTagColor={setNewTagColor}
        tagModalError={tagModalError}
        handleCloseTagModal={handleCloseTagModal}
        handleAddNewTag={handleAddNewTag}
        handleRemoveTag={handleRemoveTag}
        newTagInputRef={newTagInputRef}
        inputValueRef={inputValueRef}
        tagColors={tagColors}
        setTagModalError={setTagModalError}
        setSelectedFileForTags={setSelectedFileForTags}
        handleTagReorder={handleTagReorder}
        refreshAllTags={refreshAllTags}
        setFiles={setFiles}
        setNavigationState={setNavigationState}
        // 文件重命名相关参数
        newFileName={newFileName}
        setNewFileName={setNewFileName}
        isRenaming={isRenaming}
        handleRenameFile={handleRenameFile}
        handleFileNameChange={handleFileNameChange}
        handleFileNameKeyPress={handleFileNameKeyPress}
        fileNameInputRef={fileNameInputRef}
        currentUser={currentUser}
      />
    </div>
  );
};

export default Dashboard;