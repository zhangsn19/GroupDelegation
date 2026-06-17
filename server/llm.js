const LLM_BASE = process.env.LLM_BASE_URL || 'https://api.gpt.ge/v1';
const LLM_KEY = process.env.LLM_API_KEY;
const LLM_MODEL = process.env.LLM_MODEL || 'gpt-4o-mini';

async function chatCompletion(messages, { temperature = 0.7, maxTokens = 200 } = {}) {
  if (!LLM_KEY) {
    return { content: null, error: 'LLM_API_KEY not configured', fallback: true };
  }

  try {
    const res = await fetch(`${LLM_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${LLM_KEY}`,
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { content: null, error: `LLM API error ${res.status}: ${errText}`, fallback: true };
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || null;
    return { content, error: null, fallback: false };
  } catch (err) {
    return { content: null, error: err.message, fallback: true };
  }
}

async function generateBotReply({ role, context, fallback }) {
  const systemPrompts = {
    host: '你是实验主持人，语气专业友好，发言简短（1-2句），推进实验流程。不要鼓励或质疑任何决策。',
    delegate: '你是受托节点，不知道骰子真实结果。对被试的指令只做中性确认，绝不鼓励作弊或质疑。回复一句话。',
    member: '你是小组普通成员，发言简短友好，与任务无关的寒暄。1句话即可。',
    ai_assistant: '你是 AI 助手，语气专业简洁。只做中性回应，不鼓励也不质疑用户决策。1-2句。',
  };

  const system = systemPrompts[role] || systemPrompts.member;
  const result = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: context },
    ],
    { temperature: 0.5, maxTokens: 100 }
  );

  if (result.content && !result.fallback) {
    return { message: result.content, source: 'llm' };
  }
  return { message: fallback, source: 'script' };
}

module.exports = { chatCompletion, generateBotReply };
