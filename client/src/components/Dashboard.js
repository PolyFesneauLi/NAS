import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { getCurrentUser, uploadFile, uploadCadFile, uploadFolder, getUserFiles, downloadFile, downloadFolder, deleteFile, batchDeleteFiles, createFolder, getAdminStorageUsage, checkFolderDownloadStatus, getArchivingProgress } from '../services/api';
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
  const supportedTypes = ['pdf', 'txt', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'dwl', 'dwg'];
  return supportedTypes.includes(extension);
};

// 获取文件预览类型
const getPreviewType = (filename) => {
  const extension = getFileExtension(filename);
  if (['png', 'jpg', 'jpeg'].includes(extension)) return 'image';
  if (['pdf'].includes(extension)) return 'pdf';
  if (['txt'].includes(extension)) return 'text';
  if (['xls', 'xlsx'].includes(extension)) return 'excel';
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
  const [folderPaths, setFolderPaths] = useState(new Map());
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [folderFiles, setFolderFiles] = useState([]);
  const [folderName, setFolderName] = useState('');
  const dropdownRef = useRef(null);
  
  // 新增：归档进度状态
  const [archivingProgress, setArchivingProgress] = useState({});
  const [archivingFiles, setArchivingFiles] = useState(new Set());

  // 同步当前文件夹和路径
  useEffect(() => {
    setSelectedFolder(currentFolder);
    if (folderPath && folderPath.length > 0) {
      const pathString = 'Home/' + folderPath.map(f => f.originalName || f.filename).join('/');
      setCurrentPath(pathString);
    } else {
      setCurrentPath('Home');
    }
  }, [currentFolder, folderPath]);

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
    regular: ['.txt','.md','.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.html','.json','.jpg','.jpeg','.png','.svg','.bak','.log','.err','.bmp'],
    cad: ['.dwg','.dxf','.stp','.step','.igs','.iges','.sldprt','.sldasm','.dwl',".zip",".rar",".7z",".tar",".gz",".bz2",".smbx",'.dgn','.dst','.dwl2','.sbp','.ovkml','.ovobj'],
    code: ['.c','.cpp','.h','.java','.js','.py','.php','.sh','.css','.json','.xml']
  };

  // 合并所有文件类型为统一的accept属性
  const unifiedAccept = Object.values(allAcceptedExtensions)
    .flat()
    .join(',');

  // 递归构建文件夹树形结构和路径映射
  const buildFolderStructure = useCallback(async (parentId = null, level = 0, parentPath = 'Home') => {
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
  }, []);



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
  }, [buildFolderStructure]);

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
      return;
    }

    // 验证文件格式
    const validFiles = [];
    for (const file of files) {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isValidFile = Object.values(allAcceptedExtensions).flat().includes(fileExt);
      if (!isValidFile) {
        setError(`不支持的文件格式: ${fileExt} (${file.name})`);
        setFolderFiles([]);
        setFolderName('');
        return;
      }
      validFiles.push(file);
    }

    setFolderFiles(validFiles);
    setFolderName(folderName);
    setError('');
    setUploadComplete(false);
    setSuccessMessage('');
    setProgress({});
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
    if (!folderFiles.length) return;
    
    // 检测当前目录是否有同名文件夹
    const currentFiles = await getUserFiles({ folder: selectedFolder });
    const existingFiles = currentFiles.files || [];
    
    // 检查是否有同名文件夹
    const hasSameNameFolder = existingFiles.some(file => 
      file.isFolder && (file.originalName || file.filename) === folderName
    );
    
    if (hasSameNameFolder) {
      setError(`文件夹 "${folderName}" 已存在，请重命名后重新上传`);
      return;
    }
    
    // 检查是否有同名文件
    const hasSameNameFile = existingFiles.some(file => 
      !file.isFolder && (file.originalName || file.filename) === folderName
    );
    
    if (hasSameNameFile) {
      setError(`文件 "${folderName}" 已存在，请重命名后重新上传`);
      return;
    }
    
    // 计算总文件大小
    const totalSize = folderFiles.reduce((sum, file) => sum + file.size, 0);
    
    // 检查存储空间
    const hasEnoughSpace = await checkStorageSpace(totalSize);
    if (!hasEnoughSpace) {
      return;
    }

    setIsUploading(true);
    setError('');
    setUploadComplete(false);
    setSuccessMessage('');

    try {
      const formData = new FormData();
      formData.append('folderName', folderName);
      
      if (selectedFolder) {
        formData.append('folderId', selectedFolder);
      }

      // 添加所有文件，保持相对路径
      folderFiles.forEach(file => {
        // 将路径信息作为文件名前缀传递
        const pathPrefix = file.webkitRelativePath.replace(/\//g, '_').replace(/\\/g, '_');
        const fileWithPath = new File([file], `${pathPrefix}_${file.name}`, {
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
        onUploadSuccess();
      }

      // 2秒后清除状态
      setTimeout(() => {
        setFolderFiles([]);
        setFolderName('');
        setProgress({});
        setArchivingProgress({});
        setArchivingFiles(new Set());
        setUploadComplete(false);
        setSuccessMessage('');
      }, 2000);

    } catch (error) {
      console.error('文件夹上传失败:', error);
      setError('文件夹上传失败: ' + (error.response?.data?.error || error.message));
    } finally {
      setIsUploading(false);
      setProgress({});
      setArchivingProgress({});
      setArchivingFiles(new Set());
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
    
    // 计算总文件大小
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    
    // 检查存储空间
    const hasEnoughSpace = await checkStorageSpace(totalSize);
    if (!hasEnoughSpace) {
      return; // 错误信息已在checkStorageSpace中设置
    }
    
    // console.log('[UPLOAD] 开始上传文件，总数量:', files.length);
    // console.log('[UPLOAD] 当前选择的文件夹:', selectedFolder || 'Home');
    setIsUploading(true);
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
      await Promise.all(uploadPromises);
      
      // console.log('[UPLOAD] 🎉 所有文件上传完成!');
      setUploadComplete(true);
      setSuccessMessage(`共成功上传${formatBytes(totalSize)}文件`);
      
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
        
        onUploadSuccess();
      }, 2000);
      
    } catch (err) {
      // console.log('[UPLOAD] ❌ 上传过程中发生错误:', err);
      setError(err.response?.data?.error || `上传失败: ${err.message || '未知错误'}`);
      setUploadComplete(false);
      setSuccessMessage('');
    } finally {
      // console.log('[UPLOAD] 上传流程结束，重置上传状态');
      setIsUploading(false);
      
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
              className="upload-button"
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
            <label className="folder-label">
              {folderFiles.length ? `${folderFiles.length} 个文件` : '选择文件夹'}
              <input 
                type="file" 
                onChange={handleFolderChange}
                webkitdirectory=""
                directory=""
                multiple
                disabled={isUploading}
                style={{ display: 'none' }}
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
                  disabled={isUploading}
                  className="upload-button"
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
const FileList = forwardRef(({ userRole, onDeleteSuccess, className = 'file-list', currentFolder, folderPath, onFolderChange }, ref) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('time_desc');
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
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
      selectedIds.forEach(id => {
        const file = files.find(f => f._id === id);
        if (file) {
          startDeletingProgress(id, file.isFolder);
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

      // 立即从文件列表中移除所有被删除的文件
      setFiles(prevFiles => prevFiles.filter(file => !selectedIds.includes(file._id)));
      
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
          
          const params = {
            folder: parentFolder ? parentFolder._id : null,
            sort: sortBy
          };
          const data = await getUserFiles(params);
          const filesArray = Array.isArray(data.files) ? data.files : [];
          setFiles(filesArray);
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
      
      // 通知父组件状态变化
      onFolderChange(folder._id, newFolderPath);
      
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
        onFolderChange(null, []);
      } else {
        // console.log('2.2 跳转到指定层级的文件夹');
        targetFolder = folderPath[index];
        newPath = folderPath.slice(0, index + 1);
        // console.log('目标文件夹:', {
        //   id: targetFolder._id,
        //   name: targetFolder.originalName || targetFolder.filename,
        //   path: newPath.map(f => f.originalName || f.filename).join('/')
        // });
        onFolderChange(targetFolder._id, newPath);
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

  const handlePreview = (file) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
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
      alert('下载失败: ' + (err.message || '未知错误'));
      
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
      alert('文件夹下载失败: ' + (err.message || '未知错误'));
      
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
        
        // 立即从文件列表中移除被删除的文件
        setFiles(prevFiles => prevFiles.filter(file => file._id !== id));
        
        // 从选中列表中移除被删除的文件
        setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        
        if (fileToDelete.isFolder) {
          const folderIndex = folderPath.findIndex(f => f._id === id);
          if (folderIndex !== -1) {
            if (folderIndex === folderPath.length - 1) {
              const parentFolder = folderPath[folderIndex - 1];
              onFolderChange(parentFolder ? parentFolder._id : null, folderPath.slice(0, folderIndex));
              const params = {
                folder: parentFolder ? parentFolder._id : null,
                sort: sortBy
              };
              const data = await getUserFiles(params);
              const filesArray = Array.isArray(data.files) ? data.files : [];
              setFiles(filesArray);
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
        alert('删除失败: ' + (err.message || '未知错误'));
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
      <FilePreview 
        file={previewFile}
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
      />
      
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
        {userRole === 'admin' && (
          <div className="admin-controls">
            {selectedIds.length > 0 && (
              <>
                <button className="btn btn-primary" onClick={handleBatchDownload}>
                  批量下载({selectedIds.length})
                </button>
                <button className="btn btn-danger" onClick={handleBatchDelete}>
                  批量删除({selectedIds.length})
                </button>
              </>
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
                        checked={selectedIds.length === files.filter(f => !deletingFiles.has(f._id)).length && files.filter(f => !deletingFiles.has(f._id)).length > 0} 
                        onChange={handleSelectAll}
                      />
                    </th>
                  )}
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
                    {userRole === 'admin' && (
                      <td>
                        <input 
                          type="checkbox" 
                          checked={selectedIds.includes(file._id)} 
                          onChange={() => handleSelect(file._id)}
                          disabled={deletingFiles.has(file._id)}
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
                      {!file.isFolder && (
                        <>
                          {isSupportedForPreview(file.originalName || file.filename) && (
                            <button 
                              className="btn btn-preview"
                              onClick={() => handlePreview(file)}
                              title="预览文件"
                              style={{ background: '#bc9ffa' }}    // 中等深度紫色
                            >
                              预览
                            </button>
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
                          >
                            下载
                          </button>
                        )}
                        </>
                      )}
                      {file.isFolder && (
                        <>
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

// ------------------------------------------------------------
// Dashboard 组件
// ------------------------------------------------------------
const Dashboard = () => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showUserInfo, setShowUserInfo] = useState(false);
  const fileListRef = useRef(null);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [folderPath, setFolderPath] = useState([]);

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
            getCurrentUser().then(setCurrentUser);
            fileListRef.current?.refresh();
          }}
          className={currentUser?.role === 'admin' ? 'file-list' : 'file-list user-normal'}
          currentFolder={currentFolder}
          folderPath={folderPath}
          onFolderChange={(newFolder, newPath) => {
            setCurrentFolder(newFolder);
            setFolderPath(newPath);
          }}
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
    </div>
  );
};

export default Dashboard;