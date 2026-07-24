// /api/ai.js
// AI API for The Tender Genie
// Handles Groq, Gemini, Cerebras, OpenRouter with 5 keys each,
// and now falls back ACROSS providers too — not just across keys
// within one provider — before ever giving up.

export const config = {
  runtime: 'edge',
};

// ====== YOUR API KEYS (5 per provider) ======
const KEYS = {
  groq: [
    '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',
    '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',
    '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',
    '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',
    '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',
  ],
  gemini: [
    'AQ.Ab8RN6K-IiWCf9t-T5YKoZ44Tr5m308SRtCYfDr0sH_TquTMpQ',
    'AQ.Ab8RN6IQDfyoac3QU_lXmNSKo5JjdPLHDgahtY0Dv89R0Zupgw',
    'AQ.Ab8RN6J8xIsSLK2azG0KG43XbqZb9XCZwgwgpFS1QWyRxrhELQ',
    'AQ.Ab8RN6KIidHYnSw8V2z6ax5KlRvw_3ha17QpR5C1AcwVpfQbSg',
    'AQ.Ab8RN6INMdYm8BTXEXG7dFmHPiSdDPs29fWLVu8qrUemtDhiQA',
  ],
  cerebras: [
    'csk-nmvf5f2yweedrhvmfm6hr2hmpcdpnvfrrk2fxw995pxhr433',
    'csk-kvhtdm6dcn3rjf2myjw3rdc48ep48249883kkxvjdkdr649t',
    'csk-vyn5jkhw666yvh2ctyvtp6fmjd2w3t63fp4krwvddcpe3jx3',
    'csk-kvmy3jrd4dftvjfjkmpnf5dj2k2vkyk3tpp2vf58vykxy8pk',
    'csk-me242k9nyrvr5mvm8wdndwex2dnxtetdj25845cc3v4f55t2',
  ],
  openrouter: [
    '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',
    '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',
    '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',
    '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',
    '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',
  ],
};

// ====== DEFAULT MODEL PER PROVIDER (used when falling back to a provider
// that isn't the task's preferred one) ======
const PROVIDER_DEFAULT_MODEL = {
  groq: 'llama-3.3-70b-versatile',
  gemini: 'gemini-2.0-flash',
  cerebras: 'llama-3.3-70b',
  openrouter: 'deepseek/deepseek-r1:free',
};

// ====== WHICH PROVIDER TO TRY FIRST FOR EACH TASK ======
// (fallback across the OTHER providers happens automatically if this one's
// keys are all exhausted — see FALLBACK_ORDER below)
const TASKS = {
  ocr:           { provider: 'gemini',   model: 'gemini-2.0-flash' },
  extract:       { provider: 'gemini',   model: 'gemini-2.0-flash' },
  chat:          { provider: 'groq',     model: 'llama-3.3-70b-versatile' },
  eligibility:   { provider: 'groq',     model: 'llama-3.3-70b-versatile' },
  compare:       { provider: 'gemini',   model: 'gemini-2.0-flash' },
  evaluate:      { provider: 'gemini',   model: 'gemini-2.0-flash' },
  report:        { provider: 'groq',     model: 'llama-3.3-70b-versatile' },
};

// The order to try OTHER providers in, if the task's preferred provider
// exhausts all 5 of its own keys without success. Gemini first since it's
// been the most reliable provider in practice; Groq kept as a fallback
// rather than removed entirely, in case it's just transiently rate-limited.
const FALLBACK_ORDER = ['gemini', 'groq', 'cerebras', 'openrouter'];

// Track which key to use next per provider (round-robin)
let keyIndex = { groq: 0, gemini: 0, cerebras: 0, openrouter: 0 };

// ====== MAIN FUNCTION ======
export default async function handler(req) {

  // Allow browser to call this API
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return json({ error: 'Please use POST' }, 405);
  }

  try {
    // Read what the HTML page sent
    const body = await req.json();
    const { task, messages } = body;

    // Check if task is valid
    if (!task || !TASKS[task]) {
      return json({ error: 'Unknown task. Use: ' + Object.keys(TASKS).join(', ') }, 400);
    }

    // Check if messages exist
    if (!messages || !Array.isArray(messages)) {
      return json({ error: 'Please send messages array' }, 400);
    }

    // Try the task's preferred provider first, then fall back ACROSS
    // providers (not just across keys within one provider) before giving up.
    const result = await callWithFullFallback(task, messages, body.temperature, body.max_tokens);

    if (!result.success) {
      return json({ error: 'All providers and keys failed', details: result.error }, 503);
    }

    // Return success
    return json({
      success: true,
      task: task,
      provider: result.provider,
      model: result.model,
      content: result.content,
      key_used: result.keyNumber,
      fell_back: result.fellBack,
      time: new Date().toISOString(),
    });

  } catch (err) {
    return json({ error: 'Something went wrong', message: err.message }, 500);
  }
}

// ====== FULL FALLBACK: try preferred provider's 5 keys, then each other
// provider's 5 keys in turn, until one succeeds or everything is exhausted ======
async function callWithFullFallback(task, messages, temperature, maxTokens) {
  const preferred = TASKS[task].provider;
  const providerOrder = [preferred, ...FALLBACK_ORDER.filter(p => p !== preferred)];

  const errors = [];
  for (let i = 0; i < providerOrder.length; i++) {
    const provider = providerOrder[i];
    const model = provider === preferred ? TASKS[task].model : PROVIDER_DEFAULT_MODEL[provider];

    const result = await tryWithFallback(provider, model, messages, temperature, maxTokens);
    if (result.success) {
      return {
        success: true,
        content: result.content,
        provider,
        model,
        keyNumber: result.keyNumber,
        fellBack: provider !== preferred,
      };
    }
    errors.push(provider + ': ' + result.error);
  }

  return { success: false, error: errors.join(' | ') };
}

// ====== TRY ALL 5 KEYS OF A SINGLE PROVIDER ======
async function tryWithFallback(provider, model, messages, temperature, maxTokens) {
  const keyList = KEYS[provider];

  for (let i = 0; i < keyList.length; i++) {
    // Pick next key in rotation
    const idx = keyIndex[provider] % keyList.length;
    keyIndex[provider] = (keyIndex[provider] + 1) % keyList.length;

    const key = keyList[idx];

    try {
      const result = await callProvider(provider, key, model, messages, temperature, maxTokens);
      if (result) {
        return { success: true, content: result, keyNumber: idx + 1 };
      }
    } catch (err) {
      console.log(provider + ' key ' + (idx + 1) + ' failed: ' + err.message);
      // Try next key
    }
  }

  return { success: false, error: 'all ' + keyList.length + ' keys exhausted' };
}

// ====== CALL THE ACTUAL AI PROVIDER ======
async function callProvider(provider, key, model, messages, temperature, maxTokens) {

  // --- GROQ ---
  if (provider === 'groq') {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096,
      }),
    });

    if (!res.ok) throw new Error('Groq error ' + res.status);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // --- GEMINI ---
  if (provider === 'gemini') {
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: messages.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: temperature || 0.3,
          maxOutputTokens: maxTokens || 8192,
        },
      }),
    });

    if (!res.ok) throw new Error('Gemini error ' + res.status);
    const data = await res.json();
    return data.candidates[0].content.parts[0].text;
  }

  // --- CEREBRAS ---
  if (provider === 'cerebras') {
    const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b',
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096,
      }),
    });

    if (!res.ok) throw new Error('Cerebras error ' + res.status);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // --- OPENROUTER ---
  if (provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://the-tender-genie.vercel.app',
        'X-Title': 'The Tender Genie',
      },
      body: JSON.stringify({
        model: model || 'deepseek/deepseek-r1:free',
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096,
      }),
    });

    if (!res.ok) throw new Error('OpenRouter error ' + res.status);
    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error('Unknown provider: ' + provider);
}

// ====== HELPER: Send JSON response ======
function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
