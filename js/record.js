// record.js — 비용 미터, 세션 타이머, 회의록 누적·내보내기

const Record = (() => {
  const RATE = 0.034; // $0.034 / 분 / 세션

  let _seconds      = 0;
  let _sessionCount = 1;
  let _interval     = null;
  let _entries      = []; // { ts, panelId, text, sourceText }

  // ── 타이머 제어 ────────────────────────────────────────────────────────────

  function start(sessionCount) {
    stop();
    _seconds      = 0;
    _sessionCount = sessionCount || 1;
    _interval = setInterval(_tick, 1000);
  }

  function stop() {
    clearInterval(_interval);
    _interval = null;
  }

  function pause() {
    clearInterval(_interval);
    _interval = null;
  }

  function resume(sessionCount) {
    if (sessionCount !== undefined) _sessionCount = sessionCount;
    if (!_interval) _interval = setInterval(_tick, 1000);
  }

  function setSessionCount(n) {
    _sessionCount = n;
  }

  function _tick() {
    _seconds++;
    _updateUI();
  }

  function _updateUI() {
    const cost = (_seconds / 60) * RATE * _sessionCount;
    const el   = document.getElementById('cost-meter');
    if (el) el.textContent = '$' + cost.toFixed(3);

    const timerEl = document.getElementById('session-timer');
    if (timerEl) {
      const h = Math.floor(_seconds / 3600);
      const m = Math.floor((_seconds % 3600) / 60);
      const s = _seconds % 60;
      timerEl.textContent = h > 0
        ? `${h}:${_pad(m)}:${_pad(s)}`
        : `${_pad(m)}:${_pad(s)}`;
    }
  }

  function _pad(n) { return String(n).padStart(2, '0'); }

  // ── 회의록 ─────────────────────────────────────────────────────────────────

  function addEntry(panelId, text, sourceText) {
    _entries.push({ ts: new Date().toISOString(), panelId, text, sourceText: sourceText || '' });
  }

  function clearEntries() {
    _entries = [];
  }

  function _formatTime(iso) {
    return new Date(iso).toLocaleTimeString('ko-KR', { hour12: false });
  }

  function _toTxt() {
    const warn = '⚠️ 통역 결과에 오류가 있을 수 있으며, 회의 내용에 민감·기밀 정보가 포함될 수 있으니 취급에 주의하세요.\n\n';
    const body = _entries.map(e =>
      `[${_formatTime(e.ts)}] ${e.text}` +
      (e.sourceText ? `\n  (원문: ${e.sourceText})` : '')
    ).join('\n');
    return warn + body;
  }

  function _toMd() {
    const warn = '> ⚠️ **주의**: 통역 결과에 오류가 있을 수 있으며, 회의 내용에 민감·기밀 정보가 포함될 수 있으니 취급에 주의하세요.\n\n# 회의록\n\n';
    const body = _entries.map(e =>
      `**[${_formatTime(e.ts)}]** ${e.text}` +
      (e.sourceText ? `\n> 원문: ${e.sourceText}` : '')
    ).join('\n\n');
    return warn + body;
  }

  function saveWithWarning(format) {
    if (_entries.length === 0) { alert('저장할 내용이 없습니다.'); return; }

    const ok = confirm(
      '⚠️ 회의록 저장 안내\n\n' +
      '통역 결과에 오류가 있을 수 있으며,\n' +
      '회의 내용에 민감·기밀 정보가 포함될 수 있으니\n' +
      '취급에 주의하세요.\n\n저장하시겠습니까?'
    );
    if (!ok) return;

    const date    = new Date().toISOString().slice(0, 10);
    const content = format === 'md' ? _toMd() : _toTxt();
    const ext     = format === 'md' ? 'md'    : 'txt';
    _download(content, `meeting-${date}.${ext}`);
  }

  function _download(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    a.click();
    URL.revokeObjectURL(url);
  }

  return { start, stop, pause, resume, setSessionCount, addEntry, clearEntries, saveWithWarning };
})();
