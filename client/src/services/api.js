import axios from 'axios';

// 使用环境变量或默认端口
const API_URL = process.env.REACT_APP_API_URL || `http://localhost:${process.env.REACT_APP_SERVER_PORT || 5000}/api`;

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 设置认证令牌
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

// 用户认证
export const login = async (credentials) => {
  const response = await api.post('/auth/login', credentials);
  return response.data;
};

export const register = async (userData) => {
  const response = await api.post('/auth/register', userData);
  return response.data;
};

// 文件操作 - 通用上传
export const uploadFile = async (formData, config = {}) => {
  const response = await api.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config
  });
  return response.data;
};

// 文件操作 - CAD专用上传
export const uploadCadFile = async (formData, config = {}) => {
  const response = await api.post('/files/upload-cad', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config
  });
  return response.data;
};

// 文件操作 - 文件夹上传
export const uploadFolder = async (formData, config = {}) => {
  const response = await api.post('/files/upload-folder', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config
  });
  return response.data;
};

// 获取上传进度包装器
export const withUploadProgress = (callback) => ({
  onUploadProgress: (progressEvent) => {
    const percentCompleted = Math.round(
      (progressEvent.loaded * 100) / (progressEvent.total || 1)
    );
    callback(percentCompleted);
  }
});

export const getUserFiles = async (params = {}) => {
  const queryParams = new URLSearchParams();
  
  if (params.type) queryParams.append('type', params.type);
  if (params.sort) queryParams.append('sort', params.sort);
  if (params.search) {
    // 对搜索关键词应用编码修复
    const fixedSearch = fixEncoding(params.search);
    queryParams.append('search', encodeURIComponent(fixedSearch));
  }
  if (params.folder) queryParams.append('folder', params.folder); // 添加文件夹参数
  
  const url = `/files${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  const response = await api.get(url);
  return response.data;
};

// 获取单个文件的详细信息
export const getFileDetails = async (fileId) => {
  const response = await api.get(`/files/${fileId}`);
  return response.data;
};

export const downloadFile = async (id, onProgress) => {
  // 获取当前的认证令牌
  const token = api.defaults.headers.common['Authorization'];
  
  const response = await api.get(`/files/download/${id}`, {
    responseType: 'blob',  // 使用blob而不是arraybuffer，更适合大文件
    timeout: 30 * 60 * 1000, // 30分钟超时，适合大文件下载
    headers: {
      'Accept': 'application/octet-stream',  // 告诉服务器我们要二进制数据
      'Authorization': token  // 添加认证令牌
    },
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted, progressEvent.loaded, progressEvent.total);
      }
    }
  });
  return response;
};

export const downloadFolder = async (id, onProgress) => {
  // 获取当前的认证令牌
  const token = api.defaults.headers.common['Authorization'];
  
  const response = await api.get(`/files/download-folder/${id}`, {
    responseType: 'blob',  // 使用blob而不是arraybuffer，更适合大文件
    timeout: 30 * 60 * 1000, // 30分钟超时，适合大文件下载
    headers: {
      'Accept': 'application/zip',  // 告诉服务器我们要ZIP文件
      'Authorization': token  // 添加认证令牌
    },
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted, progressEvent.loaded, progressEvent.total);
      }
    }
  });
  return response;
};

// 获取归档进度
export const getArchivingProgress = async (folderName) => {
  const fixedFolderName = fixEncoding(folderName);
  const response = await api.get(`/files/archiving-progress?folderName=${encodeURIComponent(fixedFolderName)}`);
  return response.data;
};

// 检查文件夹下载状态
export const checkFolderDownloadStatus = async (id) => {
  const response = await api.get(`/files/check-folder/${id}`);
  return response.data;
};


export const deleteFile = async (id) => {
  const response = await api.delete(`/files/${id}`);
  return response.data;
};

export const batchDeleteFiles = async (ids) => {
  const response = await api.post('/files/batch-delete', { ids });
  return response.data;
};

// 创建新文件夹
export const createFolder = async (folderName, parentFolder = null) => {
  const response = await api.post('/files/create-folder', { 
    folderName,
    parentFolder 
  });
  return response.data;
};

// 用户信息
export const getCurrentUser = async () => {
  const response = await api.get('/users/me');
  return {
    ...response.data,
    storageUsage: response.data.storageUsage || {
      used: 0,
      quota: 1024 * 1024 * 1024*500 // 500G
      
    }
  };
};

// 获取待审核用户列表
export const getPendingUsers = async () => {
  const response = await api.get('/users/pending');
  return response.data;
};

// 审核通过用户
export const approveUser = async (userId) => {
  const response = await api.post(`/users/${userId}/approve`);
  return response.data;
};

// 拒绝用户注册
export const rejectUser = async (userId) => {
  const response = await api.post(`/users/${userId}/reject`);
  return response.data;
};

// 获取所有用户
export const getAllUsers = async () => {
  const response = await api.get('/users/all');
  return response.data;
};

// 删除用户（拒绝注册）
export const deleteUser = async (userId) => {
  const response = await api.delete(`/users/${userId}`);
  return response.data;
};

// 修改用户权限
export const changeUserRole = async (userId, newRole) => {
  const response = await api.put(`/users/${userId}/role`, { role: newRole });
  return response.data;
};

// 获取所有admin用户的存储使用情况总和
export const getAdminStorageUsage = async () => {
  const response = await api.get('/users/admin-storage');
  return response.data;
};

// 标签相关API
export const addTags = async (fileId, tags) => {
  const response = await api.post('/files/add-tags', { fileId, tags });
  return response.data;
};

export const removeTags = async (fileId, tagNames) => {
  const response = await api.post('/files/remove-tags', { fileId, tagNames });
  return response.data;
};

export const getAllTags = async () => {
  const response = await api.get('/files/tags');
  return response.data;
};

export const createTag = async (tagData) => {
  const response = await api.post('/files/create-tag', tagData);
  return response.data;
};

export const deleteTag = async (tagName) => {
  const response = await api.delete('/files/delete-tag', { data: { tagName } });
  return response.data;
};

export const forceDeleteTag = async (tagName) => {
  const response = await api.post('/files/force-delete-tag', { tagName, force: true });
  return response.data;
};

export const cleanupOrphanedTags = async () => {
  const response = await api.post('/files/cleanup-orphaned-tags');
  return response.data;
};

export const updateTagOrder = async (fileId, tagOrder) => {
  const response = await api.post('/files/update-tag-order', { fileId, tagOrder });
  return response.data;
};

// 文件重命名
export const renameFile = async (fileId, newFilename) => {
  const response = await api.put(`/files/rename/${fileId}`, { 
    newFilename: fixEncoding(newFilename) 
  });
  return response.data;
};



// 修复编码问题的工具函数
const fixEncoding = (str) => {
  try {
    return decodeURIComponent(escape(str));
  } catch (e) {
    return str;
  }
};

// 搜索文件（支持文件名和标签搜索）
// signal 是 AbortController的信号，用于中断搜索
export const searchFiles = async (params = {}, signal = null) => {
  const queryParams = new URLSearchParams();
  
  if (params.type) queryParams.append('type', params.type);
  if (params.sort) queryParams.append('sort', params.sort);
  if (params.search) {
    // 对搜索关键词应用编码修复
    const fixedSearch = fixEncoding(params.search);
    queryParams.append('search', encodeURIComponent(fixedSearch));
  }
  if (params.folder) queryParams.append('folder', params.folder);
  if (params.globalSearch) queryParams.append('globalSearch', params.globalSearch);
  if (params.tags && params.tags.length > 0) {
    // 对每个标签应用中文编码修复
    const fixedTags = params.tags.map(tag => fixEncoding(tag));
    queryParams.append('tags', encodeURIComponent(JSON.stringify(fixedTags)));
  }
  
  const url = `/files${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  const config = signal ? { signal } : {};
  const response = await api.get(url, config);
  return response.data;
};

export default api;