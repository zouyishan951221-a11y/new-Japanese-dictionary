const PROMPT = "你是專業的日語辭典。使用者輸入的詞或句子可能是任何語言（中文、英文、韓文、西班牙文等），也可能已是日文。請只回傳純 JSON，不要任何其他文字或 Markdown，格式：{\"input_lang\":\"輸入語言（繁體中文）\",\"entries\":[{\"word\":\"日文詞（常用寫法）\",\"reading\":\"平假名讀音\",\"romaji\":\"羅馬拼音\",\"pos\":\"詞性（繁體中文）\",\"jlpt\":\"N5/N4/N3/N2/N1 或 —\",\"meaning\":\"簡短繁體中文釋義\",\"explanation\":\"詞義、語感、使用場合與易混淆點，2到3句繁體中文\",\"examples\":[{\"ja\":\"日文例句\",\"reading\":\"例句平假名\",\"zh\":\"繁體中文翻譯\"}],\"related\":[\"相關或近義日文詞\"]}]}。最多 3 個最貼切的詞條，每個 2 個例句；若輸入是句子，給 1 個詞條，word 為完整日文翻譯，並在 explanation 解說文法與用詞。使用者輸入：";

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });

async function lookup(request, env) {
  let q;
  try { ({ q } = await request.json()); } catch { return J({ error: 'bad_request' }, 400); }
  q = String(q || '').trim().slice(0, 200);
  if (!q) return J({ error: 'empty' }, 400);
  if (!env.ANTHROPIC_API_KEY) return J({ error: 'no_key' }, 500);
  const models = [env.MODEL, 'claude-haiku-5-5', 'claude-sonnet-4-6'].filter((m, i, a) => m && a.indexOf(m) === i);
  let last = '';
  for (const model of models) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: PROMPT + q }] })
    });
    if (r.status === 429) return J({ error: 'rate_limited' }, 429);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      last = r.status + ' ' + String((d.error && d.error.message) || '').slice(0, 120);
      if (r.status === 404 || r.status === 400) continue;
      return J({ error: 'upstream', detail: last }, 502);
    }
    const t = (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    try { return J(JSON.parse(t.slice(a, b + 1))); } catch { return J({ error: 'parse', detail: 'stop_reason=' + d.stop_reason }, 502); }
  }
  return J({ error: 'upstream', detail: last }, 502);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lookup') {
      if (request.method !== 'POST') return J({ error: 'method' }, 405);
      return lookup(request, env);
    }
    return env.ASSETS.fetch(request);
  }
};
