const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 18890;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function getProviderConfig(body = {}) {
  return {
    apiKey: body.apiKey || process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '',
    apiBaseUrl: (body.apiBaseUrl || process.env.OPENAI_BASE_URL || process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, ''),
    model: body.model || process.env.AI_MODEL || 'openai/gpt-4.1-mini',
  };
}

async function callChatCompletion({ system, user, apiKey, apiBaseUrl, model, temperature = 0.7, responseFormat }) {
  if (!apiKey) {
    return { ok: false, status: 400, error: 'Missing API key' };
  }

  try {
    const response = await fetch(apiBaseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify({
        model,
        temperature,
        response_format: responseFormat,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          { role: 'user', content: user },
        ],
      }),
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { raw }; }

    if (!response.ok) {
      return { ok: false, status: response.status, error: data.error?.message || raw || 'Upstream API error' };
    }

    const text = data.choices?.[0]?.message?.content || '';
    return { ok: true, status: 200, text, data };
  } catch (error) {
    return { ok: false, status: 500, error: error.message };
  }
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'teaching-app', ts: new Date().toISOString() });
});

app.post('/api/chat', async (req, res) => {
  const { message, topic = 'fractions', mode = 'socratic' } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  const cfg = getProviderConfig(req.body);
  if (!cfg.apiKey) {
    return res.json({
      mode: 'demo',
      reply: mode === 'socratic'
        ? `先不要急著找答案。關於「${message.trim()}」，你現在最有把握的是哪一部分？先用自己的話說一次。`
        : `這題可以先拆成兩步：先判斷已知條件，再找出缺少的資訊。你要不要先試著列條件？`,
    });
  }

  const system = 'You are an elite bilingual AI teacher. Reply in Traditional Chinese. Be concise, supportive, and pedagogically strong. Prefer Socratic guidance over direct answers unless the user explicitly asks for the final answer.';
  const user = `Topic: ${topic}\nTeaching mode: ${mode}\nStudent message: ${message}\nRespond in Traditional Chinese.`;
  const result = await callChatCompletion({ ...cfg, system, user, temperature: 0.8 });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ mode: 'live', reply: result.text });
});

app.post('/api/teacher/lesson-loop', async (req, res) => {
  const { topic = 'fractions', weakness = '文字題理解與分數比較' } = req.body || {};
  const cfg = getProviderConfig(req.body);

  if (!cfg.apiKey) {
    return res.json({
      mode: 'demo',
      steps: [
        `系統依照弱點「${weakness}」選出今日主題：${topic}`,
        '自動產生 5 題由淺入深題目，混合圖像化與情境題。',
        '學生作答後，即時批改並標出：概念對、文字轉式子慢。',
        '分析判定：真正卡點在語意轉換，而非計算。',
        '系統再出 3 題變體題，並交給 AI 老師用提示式方式追問。'
      ],
      assignment: ['比較 3/4 與 2/3', '把生活題翻成數學式', '用圖像解釋通分'],
      insight: '建議先補語意轉換，再回到應用題。'
    });
  }

  const prompt = `You are generating a structured teaching loop for a teacher dashboard. Topic: ${topic}. Weakness: ${weakness}. Return strict JSON with keys: steps (array of 5 strings), assignment (array of 3 short strings), insight (string). All in Traditional Chinese.`;
  const result = await callChatCompletion({
    ...cfg,
    system: 'Return only JSON. No markdown.',
    user: prompt,
    temperature: 0.4,
    responseFormat: { type: 'json_object' }
  });

  if (!result.ok) return res.status(result.status).json({ error: result.error });
  try {
    return res.json({ mode: 'live', ...JSON.parse(result.text) });
  } catch {
    return res.json({ mode: 'live', steps: [result.text], assignment: [], insight: '' });
  }
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`✅ Teaching app running → http://localhost:${PORT}`);
  });
}

module.exports = app;
