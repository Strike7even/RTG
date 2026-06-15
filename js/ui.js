// ui.js — 패널 렌더링, delta/확정 텍스트, 미러, 테마

const UI = (() => {
  const panels = {
    primary:   { lines: [], delta: '' },
    secondary: { lines: [], delta: '' }
  };

  let _editingPanel = null; // 편집 중인 패널 ID ('primary' | 'secondary' | null)

  // ── 초기화 ──────────────────────────────────────────────────────────────────

  function init() {
    applyTheme(Config.getTheme());
    applyFontSize(Config.getFontSize());
    _setupEditListeners();
  }

  // ── 인라인 편집 (더블클릭) ────────────────────────────────────────────────

  function _setupEditListeners() {
    ['primary', 'secondary'].forEach(panelId => {
      const panelEl = document.getElementById('panel-' + panelId);
      if (!panelEl) return;

      panelEl.addEventListener('dblclick', (e) => {
        const tText = e.target.closest('.t-line.confirmed .t-text');
        if (!tText) return;
        const line = tText.closest('.t-line.confirmed');
        const idx  = parseInt(line?.dataset.index ?? '-1');
        if (idx < 0 || !panels[panelId].lines[idx]) return;

        _editingPanel = panelId;
        tText.contentEditable = 'true';
        tText.style.outline = '2px solid var(--accent)';
        tText.style.borderRadius = '3px';
        // 전체 선택
        const range = document.createRange();
        range.selectNodeContents(tText);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        tText.focus();

        const finish = () => {
          tText.contentEditable = 'false';
          tText.style.outline = '';
          tText.style.borderRadius = '';
          const newText = tText.textContent.trim();
          if (newText) panels[panelId].lines[idx].text = newText;
          _editingPanel = null;
        };

        tText.addEventListener('blur', finish, { once: true });
        tText.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); tText.blur(); }
          if (ev.key === 'Escape') {
            tText.textContent = panels[panelId].lines[idx]?.text || '';
            tText.blur();
          }
        });
      });
    });
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
    const p = panels[panelId];
    if (!p) return [];
    const out = p.lines.slice();
    // 아직 확정(done)되지 않은 진행 중 텍스트(delta)도 저장 대상에 포함.
    // done 이벤트가 늦거나 누락돼도 화면에 보이는 내용은 항상 저장되도록 한다.
    if (p.delta && p.delta.trim()) {
      out.push({ text: p.delta.trim(), sourceText: '', ts: _timeStr() });
    }
    return out;
  }

  function _render(panelId) {
    if (_editingPanel === panelId) return; // 편집 중에는 재렌더 건너뜀
    const el = document.getElementById('panel-' + panelId);
    if (!el) return;
    const showSrc = Config.getShowSource();
    const { lines, delta } = panels[panelId];

    let html = lines.map((l, i) => `
      <div class="t-line confirmed" data-index="${i}">
        <span class="t-ts">${l.ts}</span>
        <span class="t-text">${_formatSentences(l.text)}</span>
        ${showSrc && l.sourceText ? `<span class="t-src">${_esc(l.sourceText)}</span>` : ''}
      </div>`).join('');

    if (delta) {
      html += `<div class="t-line delta"><span class="t-text">${_formatSentences(delta)}</span></div>`;
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

  // 문장 종료 부호(. ! ? 。 ． ！ ？ …) 뒤에 공백이 오면 줄바꿈 — 가독성 향상.
  // 종료 부호 뒤 닫는 괄호·따옴표(escape 후에도 보존되는 문자)까지 포함해 끊는다.
  // 공백 한 칸을 유지해 인라인 편집 시 textContent가 문장을 붙여버리지 않도록 한다.
  function _formatSentences(s) {
    return _esc(s).replace(/([.!?。．！？…]+[)\]”’」』）]*)\s+/g, '$1 <br>');
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

  // ── 방향 화살표 레이블 ───────────────────────────────────────────────────────

  // dir: 'to-lang2' → arrow shows →  |  'to-lang1' → arrow shows ←
  function setDirLabel(lang1Name, lang2Name, dir) {
    const arrowBtn = document.getElementById('btn-dir-arrow');
    const l1El     = document.getElementById('dir-lang1');
    const l2El     = document.getElementById('dir-lang2');
    if (arrowBtn) arrowBtn.textContent = (dir === 'to-lang2') ? '→' : '←';
    if (l1El) l1El.textContent = lang1Name;
    if (l2El) l2El.textContent = lang2Name;
  }

  // ── 레이아웃 / 모드 ─────────────────────────────────────────────────────────

  function setMode(mode) {
    document.querySelectorAll('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });

    const sec = document.getElementById('secondary-panel-wrapper');
    if (sec) sec.style.display = mode === 'simultaneous' ? '' : 'none';

    // 방향 제어 영역: 토글 모드에만 화살표 버튼 활성화
    const dirCtrl  = document.getElementById('dir-control');
    const arrowBtn = document.getElementById('btn-dir-arrow');
    if (dirCtrl) dirCtrl.style.display = '';
    if (arrowBtn) {
      if (mode === 'toggle') {
        arrowBtn.disabled = false;
        arrowBtn.classList.remove('dir-arrow-disabled');
      } else {
        arrowBtn.disabled = true;
        arrowBtn.classList.add('dir-arrow-disabled');
      }
    }
  }

  function setMirror(enabled) {
    const wrap = document.getElementById('primary-panel-wrapper');
    wrap?.classList.toggle('mirrored', enabled);
    const btn = document.getElementById('btn-mirror');
    if (btn) btn.classList.toggle('active', enabled);
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
    setDirLabel, setMode, setMirror,
    setStatus, showWarning, showSettings
  };
})();
