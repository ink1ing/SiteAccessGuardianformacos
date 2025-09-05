// Service Worker - 处理Native Messaging通信
class BackgroundService {
  constructor() {
    this.nativeAppName = 'com.siteguardian.touchid';
    this.setupMessageHandlers();
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'getControlledSites':
          this.getControlledSites().then(sendResponse);
          return true;
          
        case 'authenticateWithTouchID':
          this.authenticateWithTouchID(request.domain).then(sendResponse);
          return true;
          
        case 'addControlledSite':
          this.addControlledSite(request.domain).then(sendResponse);
          return true;
          
        case 'removeControlledSite':
          this.removeControlledSite(request.domain).then(sendResponse);
          return true;
      }
    });
  }

  async getControlledSites() {
    try {
      const result = await chrome.storage.sync.get(['controlledSites']);
      return { sites: result.controlledSites || [] };
    } catch (error) {
      console.error('获取受控网站列表失败:', error);
      return { sites: [] };
    }
  }

  async addControlledSite(domain) {
    try {
      const result = await chrome.storage.sync.get(['controlledSites']);
      const sites = result.controlledSites || [];
      
      if (!sites.includes(domain)) {
        sites.push(domain);
        await chrome.storage.sync.set({ controlledSites: sites });
      }
      
      return { success: true, sites };
    } catch (error) {
      console.error('添加受控网站失败:', error);
      return { success: false, error: error.message };
    }
  }

  async removeControlledSite(domain) {
    try {
      // 先检查 1 分钟指纹验证有效期
      const ok = await this.ensureAdminAuth(`删除 ${domain}`);
      if (!ok.success) {
        return { success: false, error: ok.error || '需要指纹验证' };
      }

      const result = await chrome.storage.sync.get(['controlledSites']);
      const sites = result.controlledSites || [];
      const filteredSites = sites.filter(site => site !== domain);

      await chrome.storage.sync.set({ controlledSites: filteredSites });
      return { success: true, sites: filteredSites };
    } catch (error) {
      console.error('移除受控网站失败:', error);
      return { success: false, error: error.message };
    }
  }

  async ensureAdminAuth(actionText) {
    // 从 local 读取上次管理员验证时间戳
    try {
      const now = Date.now();
      const { adminAuthTs } = await chrome.storage.local.get(['adminAuthTs']);
      if (typeof adminAuthTs === 'number' && now - adminAuthTs <= 60 * 1000) {
        return { success: true, fromCache: true };
      }

      const reason = `管理受控网站 - ${actionText} / Manage controlled sites - ${actionText}`;
      const res = await this.authenticateWithTouchID('Site Guardian', reason);

      if (res && res.success) {
        await chrome.storage.local.set({ adminAuthTs: now });
        return { success: true };
      }
      return { success: false, error: (res && res.error) || '指纹验证失败' };
    } catch (e) {
      return { success: false, error: e && e.message ? e.message : '指纹验证异常' };
    }
  }

  async authenticateWithTouchID(domain, reasonText) {
    return new Promise((resolve) => {
      // 连接到本地应用
      const port = chrome.runtime.connectNative(this.nativeAppName);
      
      // 设置超时
      const timeout = setTimeout(() => {
        port.disconnect();
        resolve({ 
          success: false, 
          error: '验证超时' 
        });
      }, 30000);

      // 监听来自本地应用的响应
      port.onMessage.addListener((response) => {
        clearTimeout(timeout);
        port.disconnect();
        resolve(response);
      });

      // 处理连接错误
      port.onDisconnect.addListener(() => {
        clearTimeout(timeout);
        const error = chrome.runtime.lastError;
        resolve({ 
          success: false, 
          error: error ? error.message : '无法连接到Touch ID验证服务' 
        });
      });

      // 发送验证请求
      port.postMessage({
        action: 'authenticate',
        domain: domain,
        reason: reasonText || `验证访问 ${domain} / Authenticate to access ${domain}`
      });
    });
  }
}

// 初始化背景服务
new BackgroundService();
