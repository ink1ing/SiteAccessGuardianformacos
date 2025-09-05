// 弹窗控制脚本（GitHub 深色 + 中英文切换）
const I18N = {
  zh: {
    currentPageLabel: '当前页面',
    addCurrent: '添加到受控列表',
    inputPlaceholder: '输入域名 (例如: google.com)',
    add: '添加',
    listTitle: '受控网站列表',
    loading: '加载中...',
    empty: '暂无受控网站',
    remove: '移除',
    statusAdded: (d) => `已添加: ${d}`,
    statusRemoved: (d) => `已移除: ${d}`,
    statusAddFailed: (e) => `添加失败: ${e || '未知错误'}`,
    statusRemoveFailed: (e) => `移除失败: ${e || '未知错误'}`,
    statusInvalidDomain: '请输入有效的域名',
    currentDomainFetchFail: '获取失败',
    currentDomainUnknown: '无法获取域名',
    langToggle: 'English'
  },
  en: {
    currentPageLabel: 'Current page',
    addCurrent: 'Add to controlled list',
    inputPlaceholder: 'Enter domain (e.g., google.com)',
    add: 'Add',
    listTitle: 'Controlled Sites',
    loading: 'Loading...',
    empty: 'No controlled sites',
    remove: 'Remove',
    statusAdded: (d) => `Added: ${d}`,
    statusRemoved: (d) => `Removed: ${d}`,
    statusAddFailed: (e) => `Add failed: ${e || 'Unknown error'}`,
    statusRemoveFailed: (e) => `Remove failed: ${e || 'Unknown error'}`,
    statusInvalidDomain: 'Please enter a valid domain',
    currentDomainFetchFail: 'Failed to get',
    currentDomainUnknown: 'Cannot get domain',
    langToggle: '中文'
  }
};

class PopupController {
  constructor() {
    this.currentDomain = '';
    this.lang = 'zh';
    this.init();
  }

  async init() {
    await this.loadLanguage();
    this.applyI18n();
    await this.getCurrentDomain();
    await this.loadSitesList();
    this.setupEventListeners();
  }

  async loadLanguage() {
    try {
      const { uiLanguage } = await chrome.storage.sync.get(['uiLanguage']);
      if (uiLanguage === 'zh' || uiLanguage === 'en') {
        this.lang = uiLanguage;
      } else {
        this.lang = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
      }
    } catch {
      this.lang = 'zh';
    }
  }

  async setLanguage(lang) {
    this.lang = lang;
    try { await chrome.storage.sync.set({ uiLanguage: lang }); } catch {}
    this.applyI18n();
    // 重新渲染依赖文案的区域
    document.getElementById('sites-list').innerHTML = 
      `<div style="text-align: center; color: var(--muted); padding: 20px;">${I18N[this.lang].loading}</div>`;
    await this.loadSitesList();
  }

  applyI18n() {
    const t = I18N[this.lang];
    const $ = (id) => document.getElementById(id);
    // 固定文案
    document.querySelector('[data-i18n="currentPageLabel"]').textContent = t.currentPageLabel;
    document.querySelector('[data-i18n="addCurrent"]').textContent = t.addCurrent;
    document.querySelector('[data-i18n="add"]').textContent = t.add;
    document.querySelector('[data-i18n="listTitle"]').textContent = t.listTitle;
    // 输入框占位符
    $('domain-input').placeholder = t.inputPlaceholder;
    // 语言切换按钮文案
    $('lang-toggle').textContent = t.langToggle;
  }

  async getCurrentDomain() {
    const t = I18N[this.lang];
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        this.currentDomain = new URL(tab.url).hostname;
        document.getElementById('current-domain').textContent = this.currentDomain;
      } else {
        document.getElementById('current-domain').textContent = t.currentDomainUnknown;
      }
    } catch (error) {
      document.getElementById('current-domain').textContent = t.currentDomainFetchFail;
    }
  }

  setupEventListeners() {
    const t = () => I18N[this.lang];

    // 添加按钮
    document.getElementById('add-btn').addEventListener('click', () => {
      const domain = document.getElementById('domain-input').value.trim();
      if (domain) { this.addSite(domain); }
    });

    // 添加当前网站
    document.getElementById('add-current').addEventListener('click', () => {
      if (this.currentDomain) { this.addSite(this.currentDomain); }
    });

    // 回车添加
    document.getElementById('domain-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const domain = e.target.value.trim();
        if (domain) { this.addSite(domain); }
      }
    });

    // 语言切换
    document.getElementById('lang-toggle').addEventListener('click', () => {
      const next = this.lang === 'zh' ? 'en' : 'zh';
      this.setLanguage(next);
    });
  }

  async addSite(domain) {
    const t = I18N[this.lang];
    const cleanDomain = this.cleanDomain(domain);
    if (!this.isValidDomain(cleanDomain)) {
      this.showStatus(t.statusInvalidDomain, 'error');
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'addControlledSite',
        domain: cleanDomain
      });

      if (response.success) {
        this.showStatus(t.statusAdded(cleanDomain), 'success');
        document.getElementById('domain-input').value = '';
        await this.loadSitesList();
      } else {
        this.showStatus(t.statusAddFailed(response.error), 'error');
      }
    } catch (error) {
      this.showStatus(t.statusAddFailed(error.message), 'error');
    }
  }

  async removeSite(domain) {
    const t = I18N[this.lang];
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'removeControlledSite',
        domain: domain
      });

      if (response.success) {
        this.showStatus(t.statusRemoved(domain), 'success');
        await this.loadSitesList();
      } else {
        this.showStatus(t.statusRemoveFailed(response.error), 'error');
      }
    } catch (error) {
      this.showStatus(t.statusRemoveFailed(error.message), 'error');
    }
  }

  async loadSitesList() {
    const t = I18N[this.lang];
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getControlledSites' });
      const sites = response.sites || [];
      this.renderSitesList(sites);
    } catch (error) {
      document.getElementById('sites-list').innerHTML = 
        `<div style="text-align: center; color: var(--error-fg); padding: 20px;">${t.statusRemoveFailed('load')}</div>`;
    }
  }

  renderSitesList(sites) {
    const t = I18N[this.lang];
    const listContainer = document.getElementById('sites-list');

    if (sites.length === 0) {
      listContainer.innerHTML = 
        `<div style="text-align: center; color: var(--muted); padding: 20px;">${t.empty}</div>`;
      return;
    }

    const sitesHTML = sites.map(domain => `
      <div class="site-item">
        <span class="site-domain">${domain}</span>
        <button class="remove-btn" data-domain="${domain}">${t.remove}</button>
      </div>
    `).join('');

    listContainer.innerHTML = sitesHTML;

    // 绑定移除事件
    listContainer.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const domain = e.target.dataset.domain;
        this.removeSite(domain);
      });
    });
  }

  cleanDomain(domain) {
    return domain
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '')
      .toLowerCase();
  }

  isValidDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain) && domain.length <= 253;
  }

  showStatus(message, type) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = message;
    statusEl.className = `status ${type}`;
    // 3秒后恢复默认样式为隐藏（通过 class 控制）
    setTimeout(() => {
      statusEl.className = 'status';
      statusEl.textContent = '';
    }, 3000);
  }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});
