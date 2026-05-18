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

  return { listMicDevices, listOutputDevices, getMicStream, getTabStream, getStream, stopStream };
})();
