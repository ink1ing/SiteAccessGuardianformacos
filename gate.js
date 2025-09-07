(() => {
  function getParam(name) {
    const url = new URL(window.location.href);
    return url.searchParams.get(name) || '';
  }

  const targetUrl = getParam('targetUrl');
  const domain = getParam('domain');

  document.getElementById('target').textContent = targetUrl || '[无]';
  document.getElementById('domain').textContent = domain || '[无]';

  const statusEl = document.getElementById('status');

  async function currentTabId() {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        resolve(tabs && tabs[0] ? tabs[0].id : -1);
      });
    });
  }

  async function doAuth() {
    statusEl.textContent = '';
    try {
      const res = await chrome.runtime.sendMessage({ action: 'authenticateWithTouchID', domain });
      if (!res || !res.success) {
        statusEl.textContent = '指纹验证失败：' + (res && res.error ? res.error : '未知错误');
        return;
      }
      const tabId = await currentTabId();
      // 让当前 tab 对该域名放行
      const grant = await chrome.runtime.sendMessage({ action: 'grantTabAccess', domain, tabId });
      if (!grant || !grant.success) {
        statusEl.textContent = '放行失败：' + (grant && grant.error ? grant.error : '未知错误');
        return;
      }
      // 跳回原目标
      if (targetUrl) {
        window.location.replace(targetUrl);
      }
    } catch (e) {
      statusEl.textContent = '异常：' + (e && e.message ? e.message : e);
    }
  }

  document.getElementById('verify').addEventListener('click', doAuth);
  document.getElementById('cancel').addEventListener('click', () => window.history.back());

  // 自动触发一次，用户也可手动重试
  doAuth();
})();

