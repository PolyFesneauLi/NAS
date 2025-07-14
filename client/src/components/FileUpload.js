import React, { useState } from 'react';
import { uploadFile, uploadCadFile } from '../services/api';

const FileUpload = ({ onUploadSuccess, fileType = 'regular', userRole, currentFolder = null }) => {
  const [files, setFiles] = useState([]); // 支持多文件
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState({}); // 每个文件单独进度

  // 所有支持的文件类型定义
  const allAcceptedExtensions = {
    regular: ['.txt','.md','.pdf','.doc','.docx','.xls','.xlsx','.html','.json','.jpg','.jpeg','.png','.svg'],
    cad: ['.dwg','.dxf','.stp','.step','.igs','.iges','.sldprt','.sldasm','.dwl',".zip",".rar",".7z",".tar",".gz",".bz2"],
    code: ['.c','.cpp','.h','.java','.js','.py','.php','.sh','.css','.json','.xml']
  };

  // 合并所有文件类型为统一的accept属性（保持文件选择对话框显示所有类型）
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
      // 并发上传所有文件
      await Promise.all(files.map((file, idx) => {
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isCadFile = allAcceptedExtensions.cad.includes(fileExt);
      const uploadApi = isCadFile ? uploadCadFile : uploadFile;
      const config = {
        onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(prev => ({ ...prev, [file.name]: percentCompleted }));
        }
      };

        // 创建FormData对象
        const formData = new FormData();
        formData.append('file', file);
        if (currentFolder) {
          formData.append('folderId', currentFolder);
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
      <h3>上传文件{currentFolder ? ' (当前文件夹)' : ''}</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="file-input-container">
          <label className="file-label">
            {files.length ? files.map(f => f.name).join(', ') : '选择文件'}
            <input 
              type="file" 
              onChange={handleFileChange}
              accept={unifiedAccept}
              multiple // 支持多选
              disabled={isUploading}
              className="file-input"
            />
          </label>
        </div>
        {/* 只有选择了文件才显示文件信息和上传按钮 */}
        {files.length > 0 && (
          <>
            <div className="file-info">
              {files.map(f => (
                <div key={f.name} style={{marginBottom: 4}}>
                  <span>{f.name} | <strong>{(f.size / 1024 / 1024).toFixed(2)} MB</strong></span>
                  {progress[f.name] > 0 && progress[f.name] < 100 && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill" 
                        style={{ width: `${progress[f.name]}%` }}
                      >
                        {progress[f.name]}%
                      </div>
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
        
        {error && <div className="error-message" style={{ marginTop: '16px' }}>{error}</div>}
      </form>
      
      {/* <div className="file-type-hint">
        当前模式: {{
          regular: '文档/代码',
          cad: '工程图纸',
          code: '源代码'
        }[fileType]} | 支持格式: {allAcceptedExtensions[fileType].join(', ')}
      </div> */}
    </div>
  );
};

export default FileUpload;