// ui.js — 패널 렌더링, delta/확정 텍스트, 미러, 테마

const UI = (() => {
  const panels = {
    primary:   { lines: [], delta: '' },
    secondary: { lines: [], delta: '' }
  };

  // ── 초기화 ──────────────────────────────────────────────────────────────────

  function init() {
    applyTheme(Config.getTheme());
    applyFontSize(Config.getFontSize());
  }

  // ── 테마 / 폰트 ─────────────────────────────────────────────────────────────

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    Config.setTheme(theme);
    const btn = document.getElementById('btn-theme');
    if (btn) btn.textContent = { dark: '☀️', light: '🌙', 'high-contrast': '◑' }[theme] || '🌙';
  }

  function cycleTheme() {
    const order = ['dark', 'light', 'high-contrast'];
    const cur   = Config.getTheme();
    applyTheme(order[(order.indexOf(cur) + 1) % order.length]);
  }

  function applyFontSize(size) {
    document.documentElement.style.setProperty('--font-size-translate', size + 'px');
    Config.setFontSize(size);
  }

  function changeFontSize(delta) {
    applyFontSize(Math.min(Math.max(Config.getFontSize() + delta, 16), 80));
  }

  // ── 패널 텍스트 ─────────────────────────────────────────────────────────────

  function updateDelta(panelId, text) {
    panels[panelId].delta = text;
    _render(panelId);
  }

  function appendFinal(panelId, text, sourceText) {
    if (!text.trim()) return;
    const ts = _timeStr();
    panels[panelId].lines.push({ text, sourceText: sourceText || '', ts });
    panels[panelId].delta = '';
    _render(panelId);
    _broadcast(panelId, text, sourceText, ts);
  }

  function clearPanel(panelId) {
    panels[panelId] = { lines: [], delta: '' };
    _render(panelId);
  }

  function getPanelLines(panelId) {
    return panels[panelId]?.lines || [];
  }

  function _render(panelId) {
    const el = document.getElementById('panel-' + panelId);
    if (!el) return;
    const showSrc = Config.getShowSource();
    const { lines, delta } = panels[panelId];

    let html = lines.map(l => `
      <div class="t-line confirmed">
        <span class="t-ts">${l.ts}</span>
        <span class="t-text">${_esc(l.text)}</span>
        ${showSrc && l.sourceText ? `<span class="t-src">${_esc(l.sourceText)}</span>` : ''}
      </div>`).join('');

    if (delta) {
      html += `<div class="t-line delta"><span class="t-text">${_esc(delta)}</span></div>`;
    }

    if (!html) {
      html = `<div class="panel-placeholder">번역 결과가 여기에 표시됩니다</div>`;
    }

    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
  }

  function _esc(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _timeStr() {
    return new Date().toLocaleTimeString('ko-KR', { hour12: false });
  }

  // ── BroadcastChannel: popup.html에 전송 ─────────────────────────────────────

  let _bc = null;
  function _broadcast(panelId, text, sourceText, ts) {
    try {
      if (!_bc) _bc = new BroadcastChannel('rt-panel');
      _bc.postMessage({ panelId, text, sourceText: sourceText || '', ts });
    } catch (_) {}
  }

  // ── 레이아웃 / 모드 ─────────────────────────────────────────────────────────

  function setMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    const sec = document.getElementById('secondary-panel-wrapper');
    if (sec) sec.style.display = mode === 'simultaneous' ? '' : 'none';

    const toggleRow = document.getElementById('toggle-dir-row');
    if (toggleRow) toggleRow.style.display = mode === 'toggle' ? '' : 'none';

    const primaryLabel = document.getElementById('primary-label');
    if (primaryLabel) {
      primaryLabel.textContent = mode === 'simultaneous' ? '상대 → 한국어' : '→ 한국어';
    }
  }

  function setToggleDirection(dir) {
    const el = document.getElementById('toggle-dir-label');
    if (el) el.textContent = dir === 'to-ko' ? '상대방 → 한국어' : '한국어 → 상대방';
  }

  function setMirror(enabled) {
    document.getElementById('primary-panel-wrapper')
      ?.classList.toggle('mirrored', enabled);
  }

  // ── 상태 표시 ────────────────────────────────────────────────────────────────

  function setStatus(text, type) {
    const el = document.getElementById('status-text');
    if (el) { el.textContent = text; el.className = 'status-badge status-' + (type || 'idle'); }
  }

  function showWarning(msg) {
    const el = document.getElementById('warning-banner');
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? '' : 'none';
  }

  // ── 설정 패널 ────────────────────────────────────────────────────────────────

  function showSettings(show) {
    document.getElementById('settings-panel')?.classList.toggle('hidden', !show);
    if (show) {
      // 현재 설정 값 반영
      const url = document.getElementById('s-script-url');
      const pwd = document.getElementById('s-password');
      const out = document.getElementById('s-audio-output');
      const src = document.getElementById('s-show-source');
      if (url) url.value = Config.getScriptUrl();
      if (pwd) pwd.value = Config.getPassword();
      if (out) out.checked = Config.getAudioOutput();
      if (src) src.checked = Config.getShowSource();
    }
  }

  return {
    init,
    applyTheme, cycleTheme, applyFontSize, changeFontSize,
    updateDelta, appendFinal, clearPanel, getPanelLines,
    setMode, setToggleDirection, setMirror,
    setStatus, showWarning, showSettings
  };
})();
