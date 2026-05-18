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
  // API 스펙: model은 session 내부, 필드는 audio.input / audio.output 중첩 구조
  const payload = {
    session: {
      model: 'gpt-realtime-translate',
      audio: {
        input: {
          transcription:   { model: 'gpt-realtime-whisper' },
          noise_reduction: { type: 'near_field' }
        },
        output: { language: targetLang }
      }
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
    const detail = responseText.substring(0, 300);
    appendLog('ERROR', targetLang, statusCode, detail);
    return jsonResponse({ error: 'OpenAI API error', status: statusCode, detail: detail });
  }

  // 성공: 카운터 증가 + 로그 (응답 구조 확인용으로 앞 200자 기록)
  props.setProperty(countKey, String(currentCount + 1));
  const preview = responseText.substring(0, 200);
  appendLog('OK', targetLang, statusCode, preview);

  const data = JSON.parse(responseText);
  // API 응답 구조: { client_secret: { value, expires_at } } 또는 { value, expires_at } 직접
  const clientSecret = (data.client_secret !== undefined) ? data.client_secret
                     : (data.value         !== undefined) ? { value: data.value, expires_at: data.expires_at }
                     : null;
  if (!clientSecret) {
    appendLog('ERROR', targetLang, statusCode, 'client_secret 필드 없음: ' + preview);
    return jsonResponse({ error: 'client_secret 파싱 실패', detail: preview });
  }
  return jsonResponse({
    client_secret: clientSecret,
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
