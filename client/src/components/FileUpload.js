import React, { useState } from 'react';
import { uploadFile, uploadCadFile } from '../services/api';

const FileUpload = ({ onUploadSuccess, fileType = 'regular' }) => {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

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
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileExt = '.' + selectedFile.name.split('.').pop().toLowerCase();
      
      // 检查文件是否在任何允许的扩展名列表中
      const isValidFile = Object.values(allAcceptedExtensions)
        .flat()
        .includes(fileExt);

      if (!isValidFile) {
        setError(`不支持的文件格式: ${fileExt}`);
        setFile(null);
        return;
      }

      setFile(selectedFile);
      setError('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    
    try {
      setIsUploading(true);
      setError('');
      setProgress(0);
      
      // 根据文件扩展名决定使用哪个API
      const fileExt = '.' + file.name.split('.').pop().toLowerCase();
      const isCadFile = allAcceptedExtensions.cad.includes(fileExt);
      
      const uploadApi = isCadFile ? uploadCadFile : uploadFile;
      
      const config = {
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setProgress(percentCompleted);
        }
      };
      
      await uploadApi(file, config);
      onUploadSuccess();
      setFile(null);
      setProgress(0);
    } catch (err) {
      setError(err.response?.data?.error || 
        `上传失败: ${err.message || '未知错误'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={`file-upload ${fileType}`}>
      <h3>{{
        regular: '上传文档/代码',
        cad: '上传工程图纸',
        code: '上传源代码'
      }[fileType]}</h3>
      
      <form onSubmit={handleSubmit}>
        <div className="file-input-container">
          <label className="file-label">
            {file ? file.name : '选择文件'}
            <input 
              type="file" 
              onChange={handleFileChange}
              accept={unifiedAccept}  // 仍然显示所有支持的文件类型
              disabled={isUploading}
              className="file-input"
            />
          </label>
        </div>
        
        {/* 只有选择了文件才显示文件信息和上传按钮 */}
        {file && (
          <>
            <div className="file-info">
              <span>文件大小: <strong>{(file.size / 1024 / 1024).toFixed(2)} MB</strong></span>
            </div>
            
            {progress > 0 && progress < 100 && (
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${progress}%` }}
                >
                  {progress}%
                </div>
              </div>
            )}
            
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