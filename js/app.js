// app.js — 메인 컨트롤러: 3개 모드 관리, 세션 수명주기, 단축키

const App = (() => {
  const LANGUAGES = [
    { code: 'en', label: 'English'    },
    { code: 'zh', label: '中文'       },
    { code: 'ja', label: '日本語'     },
    { code: 'es', label: 'Español'   },
    { code: 'fr', label: 'Français'  },
    { code: 'de', label: 'Deutsch'   },
    { code: 'pt', label: 'Português' },
    { code: 'ru', label: 'Русский'   },
    { code: 'hi', label: 'हिन्दी'      },
    { code: 'id', label: 'Indonesia' },
    { code: 'vi', label: 'Tiếng Việt'},
    { code: 'it', label: 'Italiano'  }
    // 한국어(ko)는 항상 자국어이므로 선택 목록에서 제외
  ];

  // ── 상태 ────────────────────────────────────────────────────────────────────

  let mode          = 'toggle';  // 'unidirectional' | 'toggle' | 'simultaneous'
  let foreignLang   = 'en';
  let inputSource   = 'mic';     // 'mic' | 'tab'
  let isRunning     = false;
  let isPaused      = false;
  let toggleDir     = 'to-ko';   // 'to-ko' | 'to-foreign' (토글 모드)

  let sessionA      = null;      // 외국어→한국어 (또는 토글 현재 방향)
  let sessionB      = null;      // 한국어→외국어 (동시 양방향 전용)
  let streamA       = null;
  let streamB       = null;

  // ── 초기화 ──────────────────────────────────────────────────────────────────

  function init() {
    UI.init();
    _populateLangSelect();
    _bindEvents();
    _applyMode(mode, false);
    if (!Config.isConfigured()) {
      UI.showSettings(true);
      UI.setStatus('설정을 먼저 입력해 주세요', 'warning');
    }
  }

  function _populateLangSelect() {
    const sel = document.getElementById('foreign-lang');
    if (!sel) return;
    sel.innerHTML = LANGUAGES.map(l =>
      `<option value="${l.code}">${l.label}</option>`
    ).join('');
    sel.value = foreignLang;
  }

  // ── 이벤트 바인딩 ────────────────────────────────────────────────────────────

  function _bindEvents() {
    // 모드 버튼
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => _requestModeChange(btn.dataset.mode));
    });

    // 언어 / 입력 소스 선택
    document.getElementById('foreign-lang')
      ?.addEventListener('change', e => { foreignLang = e.target.value; });
    document.getElementById('input-source')
      ?.addEventListener('change', e => { inputSource = e.target.value; });

    // 시작 / 정지
    document.getElementById('btn-start') ?.addEventListener('click', start);
    document.getElementById('btn-stop')  ?.addEventListener('click', stop);
    document.getElementById('btn-pause') ?.addEventListener('click', togglePause);

    // 토글 방향 전환 버튼
    document.getElementById('btn-toggle-dir')
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

    // 미러
    document.getElementById('btn-mirror')
      ?.addEventListener('click', () => {
        const wrap = document.getElementById('primary-panel-wrapper');
        const on = wrap?.classList.contains('mirrored');
        UI.setMirror(!on);
      });

    // 팝업 창
    document.getElementById('btn-popup')
      ?.addEventListener('click', () => {
        window.open('popup.html', 'rt-popup', 'width=860,height=620,resizable=yes');
      });

    // 저장
    document.getElementById('btn-save-txt')
      ?.addEventListener('click', () => Record.saveWithWarning('txt'));
    document.getElementById('btn-save-md')
      ?.addEventListener('click', () => Record.saveWithWarning('md'));

    // 설정 패널
    document.getElementById('btn-settings')
      ?.addEventListener('click', () => { _loadDeviceLists(); UI.showSettings(true); });
    document.getElementById('btn-settings-close')
      ?.addEventListener('click', () => UI.showSettings(false));
    document.getElementById('btn-settings-cancel')
      ?.addEventListener('click', () => UI.showSettings(false));
    document.getElementById('btn-settings-save')
      ?.addEventListener('click', _saveSettings);

    // 원문 토글
    document.getElementById('s-show-source')
      ?.addEventListener('change', e => Config.setShowSource(e.target.checked));

    // 키보드 단축키
    document.addEventListener('keydown', _onKey);
  }

  function _onKey(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
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
          const m = ['unidirectional', 'toggle', 'simultaneous'];
          _requestModeChange(m[(m.indexOf(mode) + 1) % m.length]);
        }
        break;
    }
  }

  // ── 모드 전환 ────────────────────────────────────────────────────────────────

  function _requestModeChange(newMode) {
    if (newMode === mode) return;
    if (isRunning) {
      const names = { unidirectional: '단방향', toggle: '토글 양방향', simultaneous: '동시 양방향' };
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
        // 세션 A: 탭/마이크 → 한국어 / 세션 B: 마이크 → 외국어
        streamA = await Audio.getStream(inputSource, micId);
        streamB = await Audio.getMicStream(micId);
        sessionA = _makeSession(streamA, 'ko',          'primary');
        sessionB = _makeSession(streamB, foreignLang,   'secondary');
        await Promise.all([sessionA.start(), sessionB.start()]);
        Record.start(2);
      } else {
        // 단일 세션: 단방향 또는 토글
        streamA = await Audio.getStream(inputSource, micId);
        const target = _currentToggleTarget();
        sessionA = _makeSession(streamA, target, 'primary');
        await sessionA.start();
        Record.start(1);
        if (mode === 'toggle') {
          toggleDir = 'to-ko';
          UI.setToggleDirection(toggleDir);
        }
      }

      UI.setStatus('● 연결됨', 'connected');
    } catch (err) {
      isRunning = false;
      _setStarted(false);
      UI.setStatus('연결 실패: ' + err.message, 'error');
      console.error('[App] 시작 오류:', err);
    }
  }

  function _makeSession(stream, targetLang, panelId) {
    let outBuf = '';
    let srcBuf = '';

    const sess = new TranslationSession({
      targetLanguage: targetLang,
      audioStream:    stream,
      onOutputDelta: (d) => { outBuf += d; UI.updateDelta(panelId, outBuf); },
      onOutputFinal: (t) => {
        UI.appendFinal(panelId, t, srcBuf);
        Record.addEntry(panelId, t, srcBuf);
        outBuf = ''; srcBuf = '';
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
    if (!isRunning || mode !== 'toggle') return;
    toggleDir = (toggleDir === 'to-ko') ? 'to-foreign' : 'to-ko';
    UI.setToggleDirection(toggleDir);
    UI.updateDelta('primary', ''); // 진행 중 delta 초기화

    const newTarget = _currentToggleTarget();
    sessionA?.updateTargetLanguage(newTarget);
  }

  function _currentToggleTarget() {
    if (mode !== 'toggle') return 'ko';
    return toggleDir === 'to-ko' ? 'ko' : foreignLang;
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
    if (outDev) Config.setOutputDevice(outDev);

    const showSrc = document.getElementById('s-show-source')?.checked;
    if (showSrc !== undefined) Config.setShowSource(showSrc);

    // 실행 중인 세션에 오디오 출력 즉시 반영
    const enabled  = Config.getAudioOutput();
    const devId    = Config.getOutputDevice();
    sessionA?.setAudioOutput(enabled, devId);
    sessionB?.setAudioOutput(enabled, devId);

    UI.showSettings(false);
    UI.setStatus('설정 저장됨', 'idle');
  }

  // ── 장치 목록 로드 ────────────────────────────────────────────────────────────

  async function _loadDeviceLists() {
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
    document.getElementById('btn-start')?.setAttribute('disabled', on ? '' : null);
    if (!on) document.getElementById('btn-start')?.removeAttribute('disabled');
    document.getElementById('btn-stop')?.toggleAttribute('disabled', !on);
    if (on) document.getElementById('btn-stop')?.removeAttribute('disabled');
    document.getElementById('btn-pause')?.toggleAttribute('disabled', !on);
    if (on) document.getElementById('btn-pause')?.removeAttribute('disabled');
  }

  function _toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  // ── DOMContentLoaded ────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', () => {
    init();
    UI.setMode(mode);
  });

  return { start, stop, togglePause, switchToggleDir };
})();
