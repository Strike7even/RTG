// audio.js — 마이크 / 탭 오디오 캡처 + 장치 열거·선택

const Audio = (() => {
  async function listMicDevices() {
    // 권한 획득 후 장치 열거
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch (_) {}
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audioinput');
  }

  async function listOutputDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'audiooutput');
  }

  async function getMicStream(deviceId) {
    const constraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true }
        : { echoCancellation: true, noiseSuppression: true },
      video: false
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function getTabStream() {
    // 탭/시스템 오디오 캡처 (화상 회의용)
    // video: true 필수 — Windows/Chrome은 video: false 시 오디오 픽커를 표시하지 않음
    const stream = await navigator.mediaDevices.getDisplayMedia({
      audio: { suppressLocalAudioPlayback: false },
      video: true
    });
    stream.getVideoTracks().forEach(t => t.stop());
    return stream;
  }

  async function getStream(source, deviceId) {
    if (source === 'tab') return getTabStream();
    return getMicStream(deviceId);
  }

  function stopStream(stream) {
    if (stream) stream.getTracks().forEach(t => t.stop());
  }

  // ── 마이크 음파 시각화 ─────────────────────────────────────────────────────

  let _vizAudioCtx = null;
  let _vizAnalyser = null;
  let _vizRaf     = null;

  function startViz(stream) {
    const canvas = document.getElementById('mic-viz');
    if (!canvas) return;
    canvas.classList.add('active');

    _vizAudioCtx = new AudioContext();
    const src = _vizAudioCtx.createMediaStreamSource(stream);
    _vizAnalyser = _vizAudioCtx.createAnalyser();
    _vizAnalyser.fftSize = 32;
    _vizAnalyser.smoothingTimeConstant = 0.75;
    src.connect(_vizAnalyser);

    const ctx2d = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const bars = 8, gap = 2;
    const barW = (W - gap * (bars - 1)) / bars;

    function draw() {
      _vizRaf = requestAnimationFrame(draw);
      const data = new Uint8Array(_vizAnalyser.frequencyBinCount);
      _vizAnalyser.getByteFrequencyData(data);
      ctx2d.clearRect(0, 0, W, H);
      for (let i = 0; i < bars; i++) {
        const val = data[i] / 255;
        const h = Math.max(3, val * H);
        const x = i * (barW + gap);
        const y = (H - h) / 2;
        ctx2d.fillStyle = `rgba(74, 222, 128, ${0.25 + val * 0.75})`;
        ctx2d.beginPath();
        if (ctx2d.roundRect) ctx2d.roundRect(x, y, barW, h, 2);
        else ctx2d.rect(x, y, barW, h);
        ctx2d.fill();
      }
    }
    draw();
  }

  function stopViz() {
    if (_vizRaf) { cancelAnimationFrame(_vizRaf); _vizRaf = null; }
    const canvas = document.getElementById('mic-viz');
    if (canvas) {
      canvas.classList.remove('active');
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    }
    if (_vizAudioCtx) { _vizAudioCtx.close().catch(() => {}); _vizAudioCtx = null; }
    _vizAnalyser = null;
  }

  return {
    listMicDevices, listOutputDevices, getMicStream, getTabStream, getStream, stopStream,
    startViz, stopViz
  };
})();
