const mongoose = require('mongoose');
const File = require('../models/File');
const User = require('../models/User');
const config = require('../config');
const path = require('path');

async function initRootFolder() {
  try {
    // 检查根目录是否存在
    const rootFolder = await File.findOne({ 
      isFolder: true, 
      parentFolder: null,
      filename: "home"  // 使用固定的根目录名称
    });
    
    if (!rootFolder) {
      // 查找第一个admin用户作为根目录的owner
      const adminUser = await User.findOne({ role: 'admin' });
      if (!adminUser) {
        console.log('⚠️  No admin user found for root folder creation. Will retry when admin user is created.');
        return;
      }
      
      // 创建根目录记录
      const newRootFolder = new File({
        filename: "home",
        originalName: "home",
        path: path.join(config.STORAGE_PATH, "uploads", "home"),
        size: 0,
        fileType: "regular",
        isFolder: true,
        parentFolder: null,
        owner: adminUser._id,
        sharedWith: [],
      });
      
      await newRootFolder.save();
      console.log('✅ Root folder record created successfully');
    } else {
      console.log('ℹ️  Root folder record already exists');
    }
  } catch (error) {
    console.error('❌ Error initializing root folder:', error);
  }
}

// 新增：检查并创建根目录的函数（供外部调用）
async function ensureRootFolder() {
  try {
    // 检查根目录是否存在
    const rootFolder = await File.findOne({ 
      isFolder: true, 
      parentFolder: null,
      filename: "home"
    });
    
    if (!rootFolder) {
      // 查找admin用户
      const adminUser = await User.findOne({ role: 'admin' });
      if (!adminUser) {
        throw new Error('No admin user found');
      }
      
      // 创建根目录记录
      const newRootFolder = new File({
        filename: "home",
        originalName: "home",
        path: path.join(config.STORAGE_PATH, "uploads", "home"),
        size: 0,
        fileType: "regular",
        isFolder: true,
        parentFolder: null,
        owner: adminUser._id,
        sharedWith: [],
      });
      
      await newRootFolder.save();
      console.log('✅ Root folder created successfully');
      return newRootFolder;
    }
    
    return rootFolder;
  } catch (error) {
    console.error('❌ Error ensuring root folder:', error);
    throw error;
  }
}

module.exports = { initRootFolder, ensureRootFolder }; 