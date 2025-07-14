import React, { useState, useEffect, useRef } from 'react';
import { uploadFile, uploadCadFile, getUserFiles } from '../services/api';
import '../components/Dashboard.css';

const FileUpload = ({ onUploadSuccess, fileType = 'regular', userRole, currentFolder = null }) => {
  const [files, setFiles] = useState([]); // 支持多文件
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({}); // 每个文件单独进度
  const [folderStructure, setFolderStructure] = useState([]); // 文件夹树形结构
  const [selectedFolder, setSelectedFolder] = useState(currentFolder); // 选中的文件夹
  const [currentPath, setCurrentPath] = useState('Home');
  const [folderPaths, setFolderPaths] = useState(new Map()); // 存储文件夹ID到完整路径的映射
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
      
      // 按文件夹名称排序（使用originalName，如果没有则使用filename）
      foldersList.sort((a, b) => {
        const nameA = (a.originalName || a.filename).toLowerCase();
        const nameB = (b.originalName || b.filename).toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      const structure = await Promise.all(foldersList.map(async folder => {
        const currentPath = parentPath === 'Home' ? 
          `${parentPath}/${folder.originalName || folder.filename}` : 
          `${parentPath}/${folder.originalName || folder.filename}`;
        
        // 更新路径映射
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

  // 获取文件夹列表
  const fetchFolders = async () => {
    try {
      // 重置路径映射
      setFolderPaths(new Map().set(null, 'Home'));
      const structure = await buildFolderStructure();
      setFolderStructure(structure);
    } catch (err) {
      setError('获取文件夹列表失败: ' + (err.message || '未知错误'));
    }
  };

  useEffect(() => {
    fetchFolders();
  }, []);

  // 处理文件夹选择变化
  const handleFolderSelect = (folderId, path) => {
    setSelectedFolder(folderId);
    setCurrentPath(path);
    setIsDropdownOpen(false);
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
    // 校验所有文件
    const validFiles = [];
    for (const f of selectedFiles) {
      const fileExt = '.' + f.name.split('.').pop().toLowerCase();
      const isValidFile = Object.values(allAcceptedExtensions).flat().includes(fileExt);
      if (!isValidFile) {
        setError(`不支持的文件格式: ${fileExt}`);
        setFiles([]);
        return;
      }
      validFiles.push(f);
    }
    setFiles(validFiles);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!files.length) return;
    setIsUploading(true);
    setError('');
    setProgress({});
    try {
      await Promise.all(files.map((file) => {
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        const isCadFile = allAcceptedExtensions.cad.includes(fileExt);
        const uploadApi = isCadFile ? uploadCadFile : uploadFile;
        const config = {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
          }
        };

        const formData = new FormData();
        formData.append('file', file);
        if (selectedFolder) {
          formData.append('folderId', selectedFolder);
        }

        return uploadApi(formData, config);
      }));
      onUploadSuccess();
      setFiles([]);
      setProgress({});
    } catch (err) {
      setError(err.response?.data?.error || `上传失败: ${err.message || '未知错误'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`file-upload ${fileType}`}>
      <h3>上传文件</h3>
      
      {/* 自定义文件夹选择器 */}
      <div className="folder-controls" ref={dropdownRef}>
        <label className="path-select-label">上传路径选择</label>
        <div className="custom-select">
          <div 
            className="selected-value"
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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

export default FileUpload;