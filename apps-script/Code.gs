/**
 * Realtime Translator — Google Apps Script Backend
 *
 * Script Properties 설정 필요:
 *   OPENAI_API_KEY  — OpenAI API 키
 *   APP_PASSWORD    — 앱 공유 비밀번호
 *   DAILY_LIMIT     — 일일 발급 한도 (기본 100)
 *
 * 배포: 웹 앱 > 실행: 나 / 액세스: 모든 사용자
 */

function doPost(e) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('OPENAI_API_KEY');
  const appPassword = props.getProperty('APP_PASSWORD');
  const dailyLimit = parseInt(props.getProperty('DAILY_LIMIT') || '100');

  // 요청 파싱
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (_) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  // [방어 1] 앱 비밀번호 검증
  if (!appPassword || body.password !== appPassword) {
    appendLog('DENIED', body.target_language || '', 401, 'Wrong password');
    return jsonResponse({ error: 'Unauthorized' });
  }

  // [방어 2] 일일 발급 한도
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const countKey = 'count_' + today;
  const currentCount = parseInt(props.getProperty(countKey) || '0');

  if (currentCount >= dailyLimit) {
    appendLog('BLOCKED', body.target_language || '', 429, 'Daily limit exceeded');
    return jsonResponse({ error: 'Daily limit exceeded. Try again tomorrow.' });
  }

  // [방어 3] OpenAI client_secret 발급
  const targetLang = body.target_language || 'ko';
  const payload = {
    model: 'gpt-realtime-translate',
    session: {
      input_audio_transcription: { model: 'gpt-realtime-whisper' },
      input_audio_noise_reduction: { type: 'near_field' },
      output_audio: { language: targetLang }
    }
  };

  let oaiRes;
  try {
    oaiRes = UrlFetchApp.fetch(
      'https://api.openai.com/v1/realtime/translations/client_secrets',
      {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );
  } catch (err) {
    appendLog('ERROR', targetLang, 0, 'UrlFetch: ' + err.message);
    return jsonResponse({ error: 'Network error' });
  }

  const statusCode = oaiRes.getResponseCode();
  const responseText = oaiRes.getContentText();

  if (statusCode !== 200) {
    appendLog('ERROR', targetLang, statusCode, responseText.substring(0, 300));
    return jsonResponse({ error: 'OpenAI API error', status: statusCode });
  }

  // 성공: 카운터 증가 + 로그
  props.setProperty(countKey, String(currentCount + 1));
  appendLog('OK', targetLang, statusCode, '');

  const data = JSON.parse(responseText);
  return jsonResponse({
    client_secret: data.client_secret,
    target_language: targetLang,
    remaining_today: dailyLimit - currentCount - 1
  });
}

function doGet(e) {
  return jsonResponse({ status: 'ok', service: 'Realtime Translator', version: '1.0' });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function appendLog(status, targetLang, httpCode, detail) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName('Log');
    if (!sheet) {
      sheet = ss.insertSheet('Log');
      sheet.appendRow(['Timestamp', 'Status', 'TargetLang', 'HTTP', 'Detail']);
      sheet.setFrozenRows(1);
    }
    sheet.appendRow([new Date().toISOString(), status, targetLang, httpCode, detail]);
  } catch (_) {
    Logger.log('[Log] ' + status + ' | ' + targetLang + ' | ' + httpCode + ' | ' + detail);
  }
}
