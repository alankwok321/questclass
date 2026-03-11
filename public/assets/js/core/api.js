export function getApiPayload() {
  try {
    const settings = JSON.parse(localStorage.getItem('questclass_settings_v1') || '{}');
    return {
      apiBaseUrl: settings.apiBaseUrl || '',
      model: settings.apiModel || '',
      apiKey: settings.apiKey || ''
    };
  } catch {
    return { apiBaseUrl: '', model: '', apiKey: '' };
  }
}

export async function sendChat(message, studentName) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      topic: 'fractions',
      mode: 'socratic',
      studentName,
      ...getApiPayload()
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Chat request failed');
  return data;
}

export async function runLessonLoop(student, classroom) {
  const response = await fetch('/api/teacher/lesson-loop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: 'fractions',
      weakness: student.weaknessLabel,
      studentName: student.name,
      grade: classroom.grade,
      ...getApiPayload()
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Lesson loop request failed');
  return data;
}
