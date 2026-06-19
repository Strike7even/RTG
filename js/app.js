// app.js — 메인 컨트롤러: 2개 모드 관리, 세션 수명주기, 단축키

const App = (() => {
  const LANGUAGES = [
    { code: 'ko', label: '한국어'    },
    { code: 'en', label: 'English'   },
    { code: 'zh', label: '中文'      },
    { code: 'ja', label: '日本語'    },
    { code: 'es', label: 'Español'  },
    { code: 'fr', label: 'Français' },
    { code: 'de', label: 'Deutsch'  },
    { code: 'pt', label: 'Português'},
    { code: 'ru', label: 'Русский'  },
    { code: 'hi', label: 'हिन्दी'     },
    { code: 'id', label: 'Indonesia'},
    { code: 'vi', label: 'Tiếng Việt'},
    { code: 'it', label: 'Italiano' }
  ];

  // ── 상태 ────────────────────────────────────────────────────────────────────

  let mode        = 'toggle';     // 'toggle' | 'simultaneous'
  let lang1       = 'ko';         // 언어1 (기본: 한국어)
  let lang2       = 'en';         // 언어2 (기본: 영어)
  let inputSource = 'mic';
  let isRunning   = false;
  let isPaused    = false;
  let toggleDir   = 'to-lang2';   // 'to-lang1' | 'to-lang2'

  let sessionA    = null;
  let sessionB    = null;
  let streamA     = null;
  let streamB     = null;

  // ── 초기화 ──────────────────────────────────────────────────────────────────

  function init() {
    UI.init();
    _populateLangSelects();
    _bindEvents();
    _applyMode(mode, false);
    _updateDirLabel();
    if (!Config.isConfigured()) {
      _loadDeviceLists();
      UI.showSettings(true);
      UI.setStatus('설정을 먼저 입력해 주세요', 'warning');
    }
  }

  // ── 언어 셀렉트 채우기 ────────────────────────────────────────────────────────

  function _populateLangSelects() {
    _renderLangSelect('lang1', lang1, lang2);
    _renderLangSelect('lang2', lang2, lang1);
  }

  function _renderLangSelect(id, selected, exclude) {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = LANGUAGES
      .filter(l => l.code !== exclude)
      .map(l => `<option value="${l.code}"${l.code === selected ? ' selected' : ''}>${l.label}</option>`)
      .join('');
  }

  function _getLangLabel(code) {
    return LANGUAGES.find(l => l.code === code)?.label || code;
  }

  function _updateDirLabel() {
    UI.setDirLabel(_getLangLabel(lang1), _getLangLabel(lang2), toggleDir);
    // 동시 양방향 모드: 보조 패널 레이블 업데이트
    const secLabel = document.getElementById('secondary-label');
    if (secLabel) secLabel.textContent = `${_getLangLabel(lang1)} → ${_getLangLabel(lang2)}`;
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────────────────

  function _bindEvents() {
    // 모드 버튼
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => _requestModeChange(btn.dataset.mode));
    });

    // 언어1 선택
    document.getElementById('lang1')?.addEventListener('change', e => {
      lang1 = e.target.value;
      // lang2에서 lang1과 같은 항목 제외
      _renderLangSelect('lang2', lang2 === lang1 ? _fallbackLang(lang1) : lang2, lang1);
      if (lang2 === lang1) lang2 = document.getElementById('lang2')?.value || _fallbackLang(lang1);
      _updateDirLabel();
    });

    // 언어2 선택
    document.getElementById('lang2')?.addEventListener('change', e => {
      lang2 = e.target.value;
      // lang1에서 lang2와 같은 항목 제외
      _renderLangSelect('lang1', lang1 === lang2 ? _fallbackLang(lang2) : lang1, lang2);
      if (lang1 === lang2) lang1 = document.getElementById('lang1')?.value || _fallbackLang(lang2);
      _updateDirLabel();
    });

    // 입력 소스
    document.getElementById('input-source')
      ?.addEventListener('change', e => { inputSource = e.target.value; });

    // 시작 / 정지
    document.getElementById('btn-start') ?.addEventListener('click', start);
    document.getElementById('btn-stop')  ?.addEventListener('click', stop);
    document.getElementById('btn-pause') ?.addEventListener('click', togglePause);

    // 방향 화살표 버튼 (→ / ←)
    document.getElementById('btn-dir-arrow')
      ?.addEventListener('click', switchToggleDir);

    // 폰트 크기
    document.getElementById('btn-font-plus')
      ?.addEventListener('click', () => UI.changeFontSize(4));
    document.getElementById('btn-font-minus')
      ?.addEventListener('click', () => UI.changeFontSize(-4));

    // 테마
    document.getElementById('btn-theme')
      ?.addEventListener('click', UI.cycleTheme);

    // 전체화면
    document.getElementById('btn-fullscreen')
      ?.addEventListener('click', _toggleFullscreen);
    document.addEventListener('fullscreenchange', () => {
      const btn = document.getElementById('btn-fullscreen');
      if (btn) btn.textContent = document.fullscreenElement ? '⊡' : '⛶';
    });

    // 미러 — 누를 때 방향도 자동 전환 (상대방에게 보여주기)
    document.getElementById('btn-mirror')?.addEventListener('click', () => {
      const wrap    = document.getElementById('primary-panel-wrapper');
      const nowOn   = wrap?.classList.contains('mirrored');
      UI.setMirror(!nowOn);
      // 미러는 상대방에게 보여주는 용도 → 방향도 함께 전환
      if (mode === 'toggle') switchToggleDir();
    });

    // 패널 초기화 버튼
    document.getElementById('btn-clear-primary')?.addEventListener('click', () => {
      if (confirm('기본 패널의 번역 텍스트를 초기화할까요?')) UI.clearPanel('primary');
    });
    document.getElementById('btn-clear-secondary')?.addEventListener('click', () => {
      if (confirm('보조 패널의 번역 텍스트를 초기화할까요?')) UI.clearPanel('secondary');
    });

    // 저장 — UI 패널 내용을 폴백으로 전달 (done 이벤트 미수신 시 대비)
    document.getElementById('btn-save-txt')?.addEventListener('click', () => {
      const lines = [...UI.getPanelLines('primary'), ...UI.getPanelLines('secondary')];
      Record.saveWithWarning('txt', lines);
    });
    document.getElementById('btn-save-md')?.addEventListener('click', () => {
      const lines = [...UI.getPanelLines('primary'), ...UI.getPanelLines('secondary')];
      Record.saveWithWarning('md', lines);
    });

    // 설정 패널
    document.getElementById('btn-settings')
      ?.addEventListener('click', () => { _loadDeviceLists(); UI.showSettings(true); });
    document.getElementById('btn-settings-close')
      ?.addEventListener('click', () => UI.showSettings(false));
    document.getElementById('btn-settings-cancel')
      ?.addEventListener('click', () => UI.showSettings(false));
    document.getElementById('btn-settings-save')
      ?.addEventListener('click', _saveSettings);

    // 번역 음성 출력 체크박스 → 출력 장치 행 토글
    document.getElementById('s-audio-output')
      ?.addEventListener('change', e => _toggleOutputDeviceRow(e.target.checked));

    // 원문 토글
    document.getElementById('s-show-source')
      ?.addEventListener('change', e => Config.setShowSource(e.target.checked));

    // 키보드 단축키
    document.addEventListener('keydown', _onKey);
  }

  function _fallbackLang(exclude) {
    return LANGUAGES.find(l => l.code !== exclude)?.code || 'en';
  }

  // 누적 버퍼에서 완성된 문장들을 분리. 마지막 미완성 조각은 rest로 반환.
  // 문장 종료 부호(. ! ? 。 ． ！ ？ …) + 닫는 괄호/따옴표 뒤에 공백이 오면 그 지점에서 끊는다.
  function _splitCompletedSentences(buf) {
    const re = /[.!?。．！？…]+[)\]”’」』）]*\s+/g;
    const confirmed = [];
    let last = 0, m;
    while ((m = re.exec(buf)) !== null) {
      const end = m.index + m[0].length;
      confirmed.push(buf.slice(last, end));
      last = end;
    }
    return { confirmed, rest: buf.slice(last) };
  }

  function _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (!isRunning) start();
        else if (mode === 'toggle') switchToggleDir();
        else togglePause();
        break;
      case 'KeyF':
        if (!e.ctrlKey && !e.metaKey) _toggleFullscreen();
        break;
      case 'KeyM':
        if (!e.ctrlKey && !e.metaKey) {
          const m = ['toggle', 'simultaneous'];
          _requestModeChange(m[(m.indexOf(mode) + 1) % m.length]);
        }
        break;
    }
  }

  // ── 모드 전환 ────────────────────────────────────────────────────────────────

  function _requestModeChange(newMode) {
    if (newMode === mode) return;
    if (isRunning) {
      const names = { toggle: '토글 양방향', simultaneous: '동시 양방향' };
      if (!confirm(`"${names[newMode]}" 모드로 전환하면 현재 세션이 재시작됩니다.\n계속하시겠습니까?`)) return;
      stop().then(() => _applyMode(newMode, true));
    } else {
      _applyMode(newMode, true);
    }
  }

  function _applyMode(newMode, update) {
    mode = newMode;
    if (update) UI.setMode(mode);

    if (mode === 'simultaneous' && inputSource === 'mic') {
      UI.showWarning('⚠️ 동시 양방향은 오디오를 방향별로 분리할 수 있는 환경(화상 회의 탭 오디오+마이크 등)에서 권장합니다. 마이크 하나로 사용하면 오인식·중복 번역이 발생할 수 있습니다.');
    } else {
      UI.showWarning('');
    }
  }

  // ── 시작 ────────────────────────────────────────────────────────────────────

  async function start() {
    if (isRunning) return;
    if (!Config.isConfigured()) { UI.showSettings(true); return; }

    isRunning = true;
    isPaused  = false;
    UI.setStatus('연결 중...', 'connecting');
    UI.clearPanel('primary');
    UI.clearPanel('secondary');
    Record.clearEntries();
    _setStarted(true);

    try {
      const micId = Config.getMicDevice() || undefined;

      if (mode === 'simultaneous') {
        // 세션A: 탭/마이크 → lang1 / 세션B: 마이크 → lang2
        streamA = await Audio.getStream(inputSource, micId);
        streamB = await Audio.getMicStream(micId);
        sessionA = _makeSession(streamA, lang1, 'primary');
        sessionB = _makeSession(streamB, lang2, 'secondary');
        await Promise.all([sessionA.start(), sessionB.start()]);
        Record.start(2);
      } else {
        // 토글 단일 세션
        streamA = await Audio.getStream(inputSource, micId);
        const target = _currentToggleTarget();
        sessionA = _makeSession(streamA, target, 'primary');
        await sessionA.start();
        Record.start(1);
        toggleDir = 'to-lang2';
        _updateDirLabel();
      }

      Audio.startViz(streamA);
      UI.setStatus('● 연결됨', 'connected');
    } catch (err) {
      isRunning = false;
      _setStarted(false);
      Audio.stopViz();
      UI.setStatus('연결 실패: ' + err.message, 'error');
      console.error('[App] 시작 오류:', err);
    }
  }

  // 침묵으로 간주해 미완성 조각을 강제 확정하기까지의 대기(ms).
  // 문장 중간의 짧은 멈칫임에는 자르지 않도록 충분히 길게 둔다.
  const SILENCE_MS = 2500;
  // 문장 종료부호(+닫는 괄호/따옴표)로 끝나는지 — 완성 문장 판정.
  const ENDS_SENTENCE = /[.!?。．！？…]+[)\]”’」』）]*$/;

  function _makeSession(stream, targetLang, panelId) {
    let outBuf = '';      // 아직 확정되지 않은 누적 텍스트
    let srcBuf = '';
    let flushTimer = null;

    // 한 문장을 확정 줄(흰색)로 이동
    function _commit(text) {
      const t = (text || '').trim();
      if (!t) return;
      UI.appendFinal(panelId, t, srcBuf);
      Record.addEntry(panelId, t, srcBuf);
      srcBuf = '';
    }

    // 마침표 보정 — 종료부호로 끝나지 않으면 끝에 마침표를 붙인다.
    function _ensurePunct(t) {
      return ENDS_SENTENCE.test(t) ? t : t + '.';
    }

    // 침묵 타이머 재무장 — 남은 조각이 있을 때만.
    function _armFlush() {
      clearTimeout(flushTimer);
      if (outBuf.trim()) flushTimer = setTimeout(_flushPending, SILENCE_MS);
    }

    // 긴 침묵·세션 종료 시 남은 미완성 조각을 마침표 보정 후 강제 확정.
    function _flushPending() {
      clearTimeout(flushTimer);
      if (outBuf.trim()) { _commit(_ensurePunct(outBuf.trim())); outBuf = ''; UI.updateDelta(panelId, ''); }
    }

    // 마침표 기준으로 완성된 문장만 확정하고, 미완성 잔여는 outBuf에 남긴다.
    function _drainCompleted() {
      const { confirmed, rest } = _splitCompletedSentences(outBuf);
      confirmed.forEach(_commit);
      outBuf = rest;
      UI.updateDelta(panelId, outBuf);
    }

    const sess = new TranslationSession({
      targetLanguage: targetLang,
      audioStream:    stream,
      onOutputDelta: (d) => {
        outBuf += d;
        _drainCompleted();
        _armFlush();
      },
      // done은 "음성 세그먼트" 종료일 뿐 문장 종료가 아니다.
      // 마침표로 끝난(완성된) 잔여만 즉시 확정하고, 미완성 조각은 유지해
      // 다음 세그먼트와 병합하거나 침묵 타이머가 마침표 보정 후 확정하게 둔다.
      onOutputFinal: () => {
        _drainCompleted();
        if (outBuf.trim() && ENDS_SENTENCE.test(outBuf.trim())) {
          _commit(outBuf.trim());
          outBuf = '';
          UI.updateDelta(panelId, '');
        }
        _armFlush();
      },
      onInputDelta:  (d) => { srcBuf += d; },
      onInputFinal:  ()  => {},
      onStateChange: (s) => {
        if (s === 'reconnecting') UI.setStatus('재연결 중...', 'connecting');
        else if (s === 'connected') {
          if (isRunning && !isPaused) UI.setStatus('● 연결됨', 'connected');
        }
        else if (s === 'error') UI.setStatus('연결 오류 — 재시도 초과', 'error');
      }
    });

    sess.setAudioOutput(Config.getAudioOutput(), Config.getOutputDevice());
    return sess;
  }

  // ── 일시정지 / 재개 ──────────────────────────────────────────────────────────

  function togglePause() {
    if (!isRunning) return;
    if (isPaused) {
      sessionA?.resume(); sessionB?.resume();
      Record.resume();
      isPaused = false;
      UI.setStatus('● 연결됨', 'connected');
      _setPauseLabel('⏸ 일시정지');
    } else {
      sessionA?.pause(); sessionB?.pause();
      Record.pause();
      isPaused = true;
      UI.setStatus('⏸ 일시정지', 'paused');
      _setPauseLabel('▶ 재개');
    }
  }

  function _setPauseLabel(text) {
    const el = document.getElementById('btn-pause');
    if (el) el.textContent = text;
  }

  // ── 정지 ────────────────────────────────────────────────────────────────────

  async function stop() {
    Audio.stopViz();
    sessionA?.close(); sessionA = null;
    sessionB?.close(); sessionB = null;
    Audio.stopStream(streamA); streamA = null;
    Audio.stopStream(streamB); streamB = null;
    Record.stop();
    isRunning = false;
    isPaused  = false;
    _setStarted(false);
    _setPauseLabel('⏸ 일시정지');
    UI.setStatus('중지됨', 'idle');
  }

  // ── 토글 방향 전환 ────────────────────────────────────────────────────────────

  function switchToggleDir() {
    if (mode !== 'toggle') return;
    toggleDir = (toggleDir === 'to-lang2') ? 'to-lang1' : 'to-lang2';
    _updateDirLabel();
    if (isRunning) {
      const newTarget = _currentToggleTarget();
      sessionA?.updateTargetLanguage(newTarget);
      UI.updateDelta('primary', '');
    }
  }

  function _currentToggleTarget() {
    return toggleDir === 'to-lang2' ? lang2 : lang1;
  }

  // ── 설정 저장 ────────────────────────────────────────────────────────────────

  function _saveSettings() {
    const url = document.getElementById('s-script-url')?.value.trim();
    const pwd = document.getElementById('s-password')?.value.trim();
    if (!url || !pwd) { alert('Apps Script URL과 앱 비밀번호를 입력해 주세요.'); return; }

    Config.setScriptUrl(url);
    Config.setPassword(pwd);

    const mic = document.getElementById('s-mic-device')?.value;
    if (mic) Config.setMicDevice(mic);

    const audioOut = document.getElementById('s-audio-output')?.checked;
    if (audioOut !== undefined) Config.setAudioOutput(audioOut);

    const outDev = document.getElementById('s-output-device')?.value;
    if (audioOut && !outDev) {
      alert('번역 음성을 켜려면 출력 장치(이어폰 등)를 반드시 선택해 주세요.');
      return;
    }
    if (outDev) Config.setOutputDevice(outDev);

    const showSrc = document.getElementById('s-show-source')?.checked;
    if (showSrc !== undefined) Config.setShowSource(showSrc);

    const enabled = Config.getAudioOutput();
    const devId   = Config.getOutputDevice();
    sessionA?.setAudioOutput(enabled, devId);
    sessionB?.setAudioOutput(enabled, devId);

    UI.showSettings(false);
    UI.setStatus('설정 저장됨', 'idle');
  }

  // ── 장치 목록 로드 ────────────────────────────────────────────────────────────

  async function _loadDeviceLists() {
    _toggleOutputDeviceRow(Config.getAudioOutput());

    const [mics, outs] = await Promise.all([
      Audio.listMicDevices(),
      Audio.listOutputDevices()
    ]);

    const micSel = document.getElementById('s-mic-device');
    if (micSel) {
      micSel.innerHTML = mics.map((d, i) =>
        `<option value="${d.deviceId}">${d.label || '마이크 ' + (i + 1)}</option>`
      ).join('');
      micSel.value = Config.getMicDevice();
    }

    const outSel = document.getElementById('s-output-device');
    if (outSel) {
      outSel.innerHTML = outs.map((d, i) =>
        `<option value="${d.deviceId}">${d.label || '출력 장치 ' + (i + 1)}</option>`
      ).join('');
      outSel.value = Config.getOutputDevice();
    }
  }

  // ── 유틸 ────────────────────────────────────────────────────────────────────

  function _setStarted(on) {
    const startEl = document.getElementById('btn-start');
    const stopEl  = document.getElementById('btn-stop');
    const pauseEl = document.getElementById('btn-pause');
    if (startEl) on ? startEl.setAttribute('disabled', '') : startEl.removeAttribute('disabled');
    if (stopEl)  on ? stopEl.removeAttribute('disabled')   : stopEl.setAttribute('disabled', '');
    if (pauseEl) on ? pauseEl.removeAttribute('disabled')  : pauseEl.setAttribute('disabled', '');
  }

  function _toggleOutputDeviceRow(show) {
    const row  = document.getElementById('s-output-device-row');
    const warn = document.getElementById('s-output-warn');
    if (row)  row.style.display  = show ? '' : 'none';
    if (warn) warn.style.display = show ? '' : 'none';
  }

  function _toggleFullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      const rfn = el.requestFullscreen?.bind(el)
               || el.webkitRequestFullscreen?.bind(el)
               || el.mozRequestFullScreen?.bind(el);
      if (rfn) {
        rfn().catch(err => UI.setStatus('전체화면 사용 불가: ' + err.message, 'warning'));
      } else {
        UI.setStatus('전체화면을 지원하지 않는 브라우저입니다', 'warning');
      }
    } else {
      const efn = document.exitFullscreen?.bind(document)
               || document.webkitExitFullscreen?.bind(document);
      efn?.().catch(() => {});
    }
  }

  // ── DOMContentLoaded ────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    init();
    UI.setMode(mode);
  });

  return { start, stop, togglePause, switchToggleDir };
})();
