// config.js — 설정(localStorage) 관리

const Config = (() => {
  const K = {
    SCRIPT_URL:    'rt_script_url',
    PASSWORD:      'rt_password',
    THEME:         'rt_theme',
    FONT_SIZE:     'rt_font_size',
    AUDIO_OUTPUT:  'rt_audio_output',
    OUTPUT_DEVICE: 'rt_output_device',
    MIC_DEVICE:    'rt_mic_device',
    SHOW_SOURCE:   'rt_show_source'
  };

  const get = (key, def = '') => localStorage.getItem(key) ?? def;
  const set = (key, val) => localStorage.setItem(key, String(val));

  return {
    getScriptUrl:    () => get(K.SCRIPT_URL),
    setScriptUrl:    v  => set(K.SCRIPT_URL, v),

    getPassword:     () => get(K.PASSWORD),
    setPassword:     v  => set(K.PASSWORD, v),

    getTheme:        () => get(K.THEME, 'dark'),
    setTheme:        v  => set(K.THEME, v),

    getFontSize:     () => parseInt(get(K.FONT_SIZE, '28')),
    setFontSize:     v  => set(K.FONT_SIZE, v),

    getAudioOutput:  () => get(K.AUDIO_OUTPUT, 'false') === 'true',
    setAudioOutput:  v  => set(K.AUDIO_OUTPUT, v),

    getOutputDevice: () => get(K.OUTPUT_DEVICE),
    setOutputDevice: v  => set(K.OUTPUT_DEVICE, v),

    getMicDevice:    () => get(K.MIC_DEVICE),
    setMicDevice:    v  => set(K.MIC_DEVICE, v),

    getShowSource:   () => get(K.SHOW_SOURCE, 'true') === 'true',
    setShowSource:   v  => set(K.SHOW_SOURCE, v),

    isConfigured:    () => !!get(K.SCRIPT_URL) && !!get(K.PASSWORD)
  };
})();
