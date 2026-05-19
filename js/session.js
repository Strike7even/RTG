// session.js — TranslationSession: WebRTC 기반 단일 통역 세션

class TranslationSession {
  constructor({
    targetLanguage,
    audioStream,
    onOutputDelta,
    onOutputFinal,
    onInputDelta,
    onInputFinal,
    onStateChange
  }) {
    this.targetLanguage = targetLanguage;
    this.audioStream    = audioStream;
    this.onOutputDelta  = onOutputDelta  || (() => {});
    this.onOutputFinal  = onOutputFinal  || (() => {});
    this.onInputDelta   = onInputDelta   || (() => {});
    this.onInputFinal   = onInputFinal   || (() => {});
    this.onStateChange  = onStateChange  || (() => {});

    this.pc              = null;
    this.dc              = null;
    this.clientSecret    = null;
    this.state           = 'idle';
    this.audioEl         = null;
    this.audioEnabled    = false;
    this.outputDeviceId  = null;
    this._reconnectTimer = null;
    this._reconnectCount = 0;
    this._maxReconnect   = 5;
    this._closed         = false;
  }

  // ── 상태 관리 ──────────────────────────────────────────────────────────────

  _setState(s) {
    this.state = s;
    this.onStateChange(s);
  }

  // ── 시작 ──────────────────────────────────────────────────────────────────

  async start() {
    this._closed = false;
    this._setState('connecting');
    await this._fetchClientSecret();
    await this._setupWebRTC();
    this._reconnectCount = 0;
  }

  // ── 토큰 발급 (Apps Script → client_secret) ───────────────────────────────

  async _fetchClientSecret() {
    const url = Config.getScriptUrl();
    if (!url) throw new Error('Apps Script URL이 설정되지 않았습니다');

    const res = await fetch(url, {
      method: 'POST',
      // text/plain으로 CORS preflight 회피
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        password: Config.getPassword(),
        target_language: this.targetLanguage
      })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.detail
        ? `${data.error} (HTTP ${data.status}: ${data.detail})`
        : (data.error || `HTTP ${res.status}`);
      throw new Error(msg);
    }
    this.clientSecret = data.client_secret;
  }

  // ── WebRTC 세션 수립 ───────────────────────────────────────────────────────

  async _setupWebRTC() {
    this.pc = new RTCPeerConnection();

    // 번역 음성 수신 트랙 처리
    this.audioEl = document.createElement('audio');
    this.audioEl.autoplay = true;
    this.pc.ontrack = (evt) => {
      if (this.audioEnabled) {
        this.audioEl.srcObject = evt.streams[0];
        if (this.outputDeviceId && this.audioEl.setSinkId) {
          this.audioEl.setSinkId(this.outputDeviceId).catch(() => {});
        }
      }
    };

    // 오디오 입력 트랙 추가
    const track = this.audioStream.getAudioTracks()[0];
    this.pc.addTrack(track, this.audioStream);

    // 데이터 채널 생성
    this.dc = this.pc.createDataChannel('oai-events');
    this.dc.onopen    = () => { this._sendSessionConfig(); this._setState('connected'); };
    this.dc.onmessage = (e) => this._handleEvent(JSON.parse(e.data));
    this.dc.onclose   = () => { if (!this._closed) this._scheduleReconnect(); };

    this.pc.onconnectionstatechange = () => {
      const s = this.pc?.connectionState;
      if ((s === 'disconnected' || s === 'failed') && !this._closed) {
        this._scheduleReconnect();
      }
    };

    // SDP offer 생성 → ICE 후보 수집 완료 대기 → OpenAI에 전송
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // ICE 후보가 모두 수집될 때까지 대기 (Vanilla ICE)
    await new Promise((resolve) => {
      if (this.pc.iceGatheringState === 'complete') { resolve(); return; }
      const onState = () => {
        if (this.pc.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', onState);
          resolve();
        }
      };
      this.pc.addEventListener('icegatheringstatechange', onState);
      setTimeout(resolve, 4000); // 최대 4초 대기
    });

    const secretValue = typeof this.clientSecret === 'object'
      ? this.clientSecret.value
      : this.clientSecret;

    const answerRes = await fetch('https://api.openai.com/v1/realtime/translations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretValue}`,
        'Content-Type': 'application/sdp'
      },
      body: this.pc.localDescription.sdp  // ICE 후보가 포함된 최종 SDP
    });

    if (!answerRes.ok) {
      const errBody = await answerRes.text().catch(() => '');
      throw new Error(`SDP 교환 실패: ${answerRes.status} ${errBody.slice(0, 300)}`);
    }
    const answerSdp = await answerRes.text();
    await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  // ── 세션 설정 전송 ─────────────────────────────────────────────────────────

  _sendSessionConfig() {
    if (!this.dc || this.dc.readyState !== 'open') return;
    this.dc.send(JSON.stringify({
      type: 'session.update',
      session: {
        audio: {
          output: { language: this.targetLanguage },
          input:  { transcription: { model: 'gpt-realtime-whisper' } }
        }
      }
    }));
  }

  // 토글 모드에서 번역 방향 전환 시 호출
  updateTargetLanguage(lang) {
    this.targetLanguage = lang;
    this._sendSessionConfig();
  }

  // ── 데이터 채널 이벤트 처리 ────────────────────────────────────────────────

  _handleEvent(evt) {
    switch (evt.type) {
      case 'session.output_transcript.delta':
        this.onOutputDelta(evt.delta || '');
        break;
      case 'session.output_transcript.done':
        this.onOutputFinal(evt.transcript || '');
        break;
      case 'session.input_transcript.delta':
        this.onInputDelta(evt.delta || '');
        break;
      case 'session.input_transcript.done':
        this.onInputFinal(evt.transcript || '');
        break;
      case 'error':
        console.error('[Session] 오류:', evt);
        break;
      default:
        console.log('[Session] 미처리 이벤트:', evt.type, JSON.stringify(evt).slice(0, 200));
    }
  }

  // ── 음성 출력 제어 ─────────────────────────────────────────────────────────

  setAudioOutput(enabled, deviceId) {
    this.audioEnabled   = enabled;
    this.outputDeviceId = deviceId || null;
    if (!enabled && this.audioEl) {
      this.audioEl.srcObject = null;
    }
  }

  // ── 일시정지 / 재개 ────────────────────────────────────────────────────────

  pause() {
    this.audioStream?.getAudioTracks().forEach(t => { t.enabled = false; });
    this._setState('paused');
  }

  resume() {
    this.audioStream?.getAudioTracks().forEach(t => { t.enabled = true; });
    this._setState('connected');
  }

  // ── 종료 ──────────────────────────────────────────────────────────────────

  close() {
    this._closed = true;
    clearTimeout(this._reconnectTimer);
    this._setState('closed');
    if (this.dc)      { this.dc.close(); this.dc = null; }
    if (this.pc)      { this.pc.close(); this.pc = null; }
    if (this.audioEl) { this.audioEl.srcObject = null;   }
  }

  // ── 자동 재연결 ────────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._reconnectCount >= this._maxReconnect) {
      this._setState('error');
      return;
    }
    this._setState('reconnecting');
    const delay = Math.min(1000 * Math.pow(2, this._reconnectCount), 30000);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectCount++;
      try {
        if (this.pc) { this.pc.close(); this.pc = null; }
        await this._fetchClientSecret();
        await this._setupWebRTC();
      } catch (_) {
        this._scheduleReconnect();
      }
    }, delay);
  }
}
