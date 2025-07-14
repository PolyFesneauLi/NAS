const mongoose = require('mongoose');
const File = require('../models/File');
const User = require('../models/User');

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
        console.error('No admin user found for root folder creation');
        return;
      }
      
      // 创建根目录记录
      const newRootFolder = new File({
        filename: "home",
        originalName: "home",
        path: "../storage/uploads/home",
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
      console.log('ℹ️ Root folder record already exists');
    }
  } catch (error) {
    console.error('❌ Error initializing root folder:', error);
  }
}

module.exports = initRootFolder; 