// /api/ai.js
// AI API for The Tender Genie
// Handles Groq, Gemini, Cerebras, OpenRouter, Mistral, Cloudflare Workers AI
// — each with multiple keys, cross-provider fallback chains.

export const config = {
  runtime: 'edge',
};

// ====== YOUR API KEYS (multiple per provider, round-robin) ======
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
  mistral: [
    'gzF3MyqrkjTIQUbNZ5ux6BaYcES9iG8h',
    'rjYDJoOyAZCFbZybirKfx3rDqFksqnYG',
    '431qLJk4lwQYSxLQ6qnNxCZBmnD3bR3g',
    'q4aMLfI87stAKGNWHGv4j8xYaQW698u7',
    'ulB3d0lOeYDlPzb1nmfrrDj1UoynJDlp',
  ],
  cloudflare: [
    'cfat_ZIbWSZYxpraGDw8VAYJg4CelU4iwH9LRFbqmMftQ92858ae6',
    'cfat_ZA16ggUANQceHLYVRyfGjg6d23hPDfat6xHejiYz2aaf2ca2',
    'cfat_QMDzYxWC2IPVU04EwFmFWxDDGe7R86eSkTitq7eO62429a7a',
    'cfat_Q4KMVm5oa0wM41pLjSKvXvioENveaG1u8tbXVUZ6b6602720',
    'cfat_Qs3wlEnJsw0qW5DE1pke3xNLRgthHdH5WycK4HIu060a258d',
  ],
};

// Cloudflare Workers AI requires an Account ID in the URL path, not just a
// token. Fill this in — find it in the Cloudflare dashboard (top-right on
// any page, or Workers & Pages -> Overview).
const CLOUDFLARE_ACCOUNT_ID = 'PASTE_YOUR_CLOUDFLARE_ACCOUNT_ID_HERE';

// ====== TASK CONFIGURATION WITH FALLBACKS ======
// Each task has a primary provider and an ordered list of fallback providers.
// If the primary fails (all keys exhausted / rate-limited), it tries
// fallbacks in order until one succeeds or all are exhausted.
const TASKS = {
  ocr: {
    primary:   { provider: 'gemini',   model: 'gemini-2.0-flash' },
    fallbacks: [],
  },
  extract: {
    primary:   { provider: 'gemini',   model: 'gemini-2.0-flash' },
    fallbacks: [],
  },
  chat: {
    primary:   { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    fallbacks: [
      { provider: 'cerebras',   model: 'llama-3.3-70b' },
      { provider: 'mistral',    model: 'mistral-small-latest' },
      { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
      { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ],
  },
  eligibility: {
    primary:   { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    fallbacks: [
      { provider: 'cerebras',   model: 'llama-3.3-70b' },
      { provider: 'mistral',    model: 'mistral-small-latest' },
      { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
      { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ],
  },
  compare: {
    primary:   { provider: 'gemini',   model: 'gemini-2.0-flash' },
    fallbacks: [
      { provider: 'mistral', model: 'mistral-small-latest' },
    ],
  },
  evaluate: {
    primary:   { provider: 'gemini',   model: 'gemini-2.0-flash' },
    fallbacks: [
      { provider: 'mistral', model: 'mistral-small-latest' },
    ],
  },
  report: {
    primary:   { provider: 'groq',       model: 'llama-3.3-70b-versatile' },
    fallbacks: [
      { provider: 'cerebras',   model: 'llama-3.3-70b' },
      { provider: 'mistral',    model: 'mistral-small-latest' },
      { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' },
      { provider: 'cloudflare', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
      { provider: 'gemini',     model: 'gemini-2.0-flash' },
    ],
  },
};

// Track which key to use next per provider (round-robin)
let keyIndex = { groq: 0, gemini: 0, cerebras: 0, openrouter: 0, mistral: 0, cloudflare: 0 };

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

    // Get task configuration
    const taskConfig = TASKS[task];

    // Build list of providers to try: primary + fallbacks
    const providersToTry = [taskConfig.primary, ...(taskConfig.fallbacks || [])];

    // Try each provider until one works
    const result = await tryProviders(providersToTry, messages, body.temperature, body.max_tokens);

    if (!result.success) {
      return json({
        error: 'All providers failed for task: ' + task,
        details: result.error
      }, 503);
    }

    // Return success
    return json({
      success: true,
      task: task,
      provider: result.provider,
      model: result.model,
      content: result.content,
      key_used: result.keyNumber,
      fallback_used: result.fallbackUsed,
      time: new Date().toISOString(),
    });

  } catch (err) {
    return json({ error: 'Something went wrong', message: err.message }, 500);
  }
}

// ====== TRY PROVIDERS ONE BY ONE ======
async function tryProviders(providers, messages, temperature, maxTokens) {
  const allErrors = [];
  for (let i = 0; i < providers.length; i++) {
    const config = providers[i];
    const isFallback = i > 0;

    try {
      const result = await tryWithFallback(
        config.provider,
        config.model,
        messages,
        temperature,
        maxTokens
      );

      if (result.success) {
        return {
          success: true,
          content: result.content,
          provider: config.provider,
          model: config.model,
          keyNumber: result.keyNumber,
          fallbackUsed: isFallback,
        };
      } else {
        allErrors.push(config.provider + ': ' + result.error);
      }
    } catch (err) {
      const msg = (isFallback ? 'Fallback' : 'Primary') + ' provider ' + config.provider + ' threw: ' + err.message;
      console.log(msg);
      allErrors.push(config.provider + ': ' + err.message);
      // Continue to next provider
    }
  }

  return { success: false, error: allErrors.join(' | ') };
}

// ====== TRY KEYS ONE BY ONE (for a single provider) ======
async function tryWithFallback(provider, model, messages, temperature, maxTokens) {
  const keyList = KEYS[provider];

  if (!keyList || keyList.length === 0) {
    return { success: false, error: 'No keys found for provider: ' + provider };
  }

  const keyErrors = [];
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
      const msg = 'key' + (idx + 1) + '=' + err.message;
      console.log('Key ' + (idx + 1) + ' failed for ' + provider + ': ' + err.message);
      keyErrors.push(msg);
      // Try next key
    }
  }

  return { success: false, error: '[' + keyErrors.join(', ') + ']' };
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

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('Groq HTTP ' + res.status + ' - ' + bodyText);
    }
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

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('Gemini HTTP ' + res.status + ' - ' + bodyText);
    }
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

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('Cerebras HTTP ' + res.status + ' - ' + bodyText);
    }
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

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('OpenRouter HTTP ' + res.status + ' - ' + bodyText);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // --- MISTRAL --- (OpenAI-compatible chat completions shape)
  if (provider === 'mistral') {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'mistral-small-latest',
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('Mistral HTTP ' + res.status + ' - ' + bodyText);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  // --- CLOUDFLARE WORKERS AI ---
  // Different shape from the others: model name goes in the URL path, and
  // the request body uses a "messages" field directly (no wrapping needed
  // for chat-style models), but the response shape is { result: { response } }
  // rather than an OpenAI-style choices array.
  if (provider === 'cloudflare') {
    if (!CLOUDFLARE_ACCOUNT_ID || CLOUDFLARE_ACCOUNT_ID.startsWith('PASTE_')) {
      throw new Error('Cloudflare account ID not configured — set CLOUDFLARE_ACCOUNT_ID in ai.js');
    }
    const modelPath = model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
    const url = 'https://api.cloudflare.com/client/v4/accounts/' + CLOUDFLARE_ACCOUNT_ID + '/ai/run/' + modelPath;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages,
        temperature: temperature || 0.3,
        max_tokens: maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      const bodyText = await safeReadBody(res);
      throw new Error('Cloudflare HTTP ' + res.status + ' - ' + bodyText);
    }
    const data = await res.json();
    if (!data.success) {
      throw new Error('Cloudflare error: ' + JSON.stringify(data.errors || data));
    }
    return data.result.response;
  }

  throw new Error('Unknown provider: ' + provider);
}

// ====== HELPER: Safely read an error response body, truncated, without
// throwing if it's not readable/JSON ======
async function safeReadBody(res) {
  try {
    const text = await res.text();
    return text.length > 300 ? text.slice(0, 300) + '...' : text;
  } catch (e) {
    return '(could not read response body)';
  }
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
