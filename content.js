// 内容脚本 - 拦截页面加载
class SiteGuardian {
  constructor() {
    this.isAuthenticated = false;
    this.currentDomain = this.extractDomain(window.location.href);
    this.init();
  }

  async init() {
    // 检查当前域名是否在受控列表中
    const controlledSites = await this.getControlledSites();

    if (this.matchesControlledList(controlledSites, this.currentDomain)) {
      await this.blockPageAndAuthenticate();
    }
  }

  async getControlledSites() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'getControlledSites'
      }, (response) => {
        resolve(response.sites || []);
      });
    });
  }

  extractDomain(url) {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  }

  async blockPageAndAuthenticate() {
    // 注入样式并隐藏页面除覆盖层外的内容（在 document_start 即可生效）
    this.injectGuardStyles();
    // 创建验证覆盖层
    this.createAuthOverlay();
    
    // 请求指纹验证
    const authResult = await this.requestTouchIDAuth();
    
    if (authResult.success) {
      this.isAuthenticated = true;
      this.removeAuthOverlay();
      this.removeGuardStyles();
    } else {
      // 验证失败，阻止页面加载
      window.location.href = 'about:blank';
    }
  }

  createAuthOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'site-guardian-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0,0,0,0.9);
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 2147483647;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      ">
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 20px;">🔒</div>
          <h2>网站访问验证</h2>
          <p>请使用Touch ID验证身份以访问: ${this.currentDomain}</p>
          <div id="auth-status" style="margin-top: 20px;">正在等待验证...</div>
        </div>
      </div>
    `;

    const attach = () => {
      // body 若尚未创建，延后挂载，样式已确保页面内容不可见
      if (document.body) {
        document.body.appendChild(overlay);
      } else {
        document.addEventListener('DOMContentLoaded', () => {
          if (!document.getElementById('site-guardian-overlay')) {
            document.body.appendChild(overlay);
          }
        }, { once: true });
      }
    };

    attach();
  }

  removeAuthOverlay() {
    const overlay = document.getElementById('site-guardian-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  async requestTouchIDAuth() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({
        action: 'authenticateWithTouchID',
        domain: this.currentDomain
      }, (response) => {
        const statusEl = document.getElementById('auth-status');
        if (statusEl) {
          statusEl.textContent = response.success ? '验证成功' : '验证失败';
        }
        
        setTimeout(() => resolve(response), 1000);
      });
    });
  }

  injectGuardStyles() {
    if (document.getElementById('site-guardian-style')) return;
    const style = document.createElement('style');
    style.id = 'site-guardian-style';
    style.textContent = `
      html.sg-locked, html.sg-locked body { background: #000 !important; }
      html.sg-locked body > :not(#site-guardian-overlay) { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(style);
    document.documentElement.classList.add('sg-locked');
  }

  removeGuardStyles() {
    document.documentElement.classList.remove('sg-locked');
    const style = document.getElementById('site-guardian-style');
    if (style) style.remove();
  }

  matchesControlledList(list, domain) {
    // 支持子域匹配：添加 example.com 将匹配 a.example.com
    return list.some(site => domain === site || domain.endsWith(`.${site}`));
  }
}

// 页面加载时立即执行
new SiteGuardian();
