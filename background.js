// Service Worker - 处理Native Messaging通信
class BackgroundService {
  constructor() {
    this.nativeAppName = 'com.siteguardian.touchid';
    this.setupMessageHandlers();
    this.initDnrSync();
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

        case 'grantTabAccess':
          this.grantTabAccess(request.domain, request.tabId).then(sendResponse);
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

  // ---------------- DNR 同步与放行 ----------------
  async initDnrSync() {
    // 启动/安装时同步规则
    chrome.runtime.onInstalled.addListener(() => this.syncAllDnrRules());
    this.syncAllDnrRules();
    // 存储变更时同步
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.controlledSites) {
        this.syncAllDnrRules();
      }
    });
    // Tab 关闭时清理允许规则
    chrome.tabs.onRemoved.addListener((tabId) => this.cleanupAllowRulesForTab(tabId));
  }

  escapeForRegex(domain) {
    return domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  buildDomainRegex(domain) {
    const esc = this.escapeForRegex(domain);
    return `^https?://([^.]+\\.)*${esc}(/.*)?$`;
  }

  blockRuleIdForDomain(domain) {
    // 以稳定 hash 生成 id（避免与允许规则冲突）
    let h = 0;
    for (let i = 0; i < domain.length; i++) h = ((h << 5) - h) + domain.charCodeAt(i) | 0;
    return 100000 + (Math.abs(h) % 800000);
  }

  allowRuleId(domain, tabId) {
    // 为 tab+domain 生成唯一 id
    const base = this.blockRuleIdForDomain(domain);
    return 2000000000 - ((tabId % 100000) * 1000 + (base % 1000));
  }

  async syncAllDnrRules() {
    const { controlledSites } = await chrome.storage.sync.get(['controlledSites']);
    const sites = controlledSites || [];

    // 先移除现有的所有拦截规则（仅我们分配的区间）再重建
    const existing = await chrome.declarativeNetRequest.getSessionRules();
    const removeIds = existing
      .filter(r => r.id >= 100000 && r.id < 2000000000) // 我们的区间
      .map(r => r.id);

    const addRules = sites.map(domain => {
      const id = this.blockRuleIdForDomain(domain);
      const regexFilter = this.buildDomainRegex(domain);
      const extUrl = `chrome-extension://${chrome.runtime.id}/gate.html?targetUrl=\\0&domain=${domain}`;
      return {
        id,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: extUrl } },
        condition: { regexFilter, resourceTypes: ['main_frame'] }
      };
    });

    await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: removeIds, addRules });
  }

  async grantTabAccess(domain, tabId) {
    try {
      if (typeof tabId !== 'number' || tabId < 0) return { success: false, error: '无效的 tabId' };
      const regexFilter = this.buildDomainRegex(domain);
      const id = this.allowRuleId(domain, tabId);
      const allowRule = {
        id,
        priority: 100,
        action: { type: 'allow' },
        condition: { regexFilter, resourceTypes: ['main_frame'], tabIds: [tabId] }
      };
      // 先移除旧同名 id，再添加
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [id], addRules: [allowRule] });
      return { success: true };
    } catch (e) {
      return { success: false, error: e && e.message ? e.message : '添加放行规则失败' };
    }
  }

  async cleanupAllowRulesForTab(tabId) {
    try {
      const existing = await chrome.declarativeNetRequest.getSessionRules();
      const ids = existing
        .filter(r => r.condition && r.condition.tabIds && r.condition.tabIds.includes(tabId))
        .map(r => r.id);
      if (ids.length) {
        await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ids, addRules: [] });
      }
    } catch {}
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
