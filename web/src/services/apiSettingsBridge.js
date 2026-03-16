import { loadSettings } from './settings.js';

// Optional bridge: if server-side code expects apiKey/apiBaseUrl/model in request body,
// keep a single place to map local settings -> request payload.
export function withLocalApiSettings(body = {}) {
  const s = loadSettings();
  return {
    ...body,
    apiKey: body.apiKey ?? s.apiKey,
    apiBaseUrl: body.apiBaseUrl ?? s.apiBaseUrl,
    model: body.model ?? s.apiModel,
    studentUid: body.studentUid ?? s.aiStudentUid,
  };
}
