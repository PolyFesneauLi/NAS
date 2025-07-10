import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

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
export const uploadFile = async (file, config = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    ...config
  });
  return response.data;
};

// 文件操作 - CAD专用上传
export const uploadCadFile = async (file, config = {}) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/files/upload-cad', formData, {
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
  if (params.search) queryParams.append('search', encodeURIComponent(params.search));
  
  const url = `/files${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  const response = await api.get(url);
  return response.data;
};

export const downloadFile = async (id) => {
  const response = await api.get(`/files/download/${id}`, {
    responseType: 'blob',
  });
  return response;
};

export const deleteFile = async (id) => {
  const response = await api.delete(`/files/${id}`);
  return response.data;
};

export const batchDeleteFiles = async (ids) => {
  const response = await api.post('/files/batch-delete', { ids });
  return response.data;
};

// 用户信息
export const getCurrentUser = async () => {
  const response = await api.get('/users/me');
  return {
    ...response.data,
    storageUsage: response.data.storageUsage || {
      used: 0,
      quota: 1024 * 1024 * 1024
    }
  };
};

export default api;