export type EngineConfig = { id: string; apiKey?: string; appId?: string; secret?: string; endpoint?: string; model?: string; protocol?: 'openai'|'anthropic'|'gemini'; azureKey?: string; azureRegion?: string };
export type TranslationRequest = { text: string; source: string; target: string; engine: EngineConfig; signal?: AbortSignal };
const requestSignal = (signal:AbortSignal|undefined, ms:number) => signal ? AbortSignal.any([signal,AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
const label = (code: string) => code;

// Pure-JS MD5 so the Baidu signing works in the browser without Node's crypto.
const MD5_S = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);
function md5(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLength = bytes.length * 8;
  const total = (((bytes.length + 8) >> 6) + 1) << 6;
  const buffer = new Uint8Array(total);
  buffer.set(bytes);
  buffer[bytes.length] = 0x80;
  const view = new DataView(buffer.buffer);
  view.setUint32(total - 8, bitLength >>> 0, true);
  view.setUint32(total - 4, Math.floor(bitLength / 4294967296), true);
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const words = new Uint32Array(16);
  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true);
    let a = a0, b = b0, c = c0, d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number, g: number;
      if (i < 16) { f = (b & c) | (~b & d); g = i; }
      else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
      else if (i < 48) { f = b ^ c ^ d; g = (3 * i + 5) % 16; }
      else { f = c ^ (b | ~d); g = (7 * i) % 16; }
      const sum = (a + f + MD5_K[i] + words[g]) >>> 0;
      const rotated = ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i]))) >>> 0;
      a = d; d = c; c = b; b = (b + rotated) >>> 0;
    }
    a0 = (a0 + a) >>> 0; b0 = (b0 + b) >>> 0; c0 = (c0 + c) >>> 0; d0 = (d0 + d) >>> 0;
  }
  const hex = (n: number) => [0, 8, 16, 24].map((shift) => ((n >>> shift) & 0xff).toString(16).padStart(2, '0')).join('');
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}
function fail(message: string): never { throw new Error(message); }

export async function translateChunk({ text, source, target, engine, signal }: TranslationRequest): Promise<string> {
  if (!text) return text;
  const to = label(target), from = label(source);
  if (engine.id === 'google') {
    // Chrome's public translation endpoint is often more reliable than gtx from server IPs.
    const url = new URL('https://clients5.google.com/translate_a/t');
    url.searchParams.set('client','dict-chrome-ex'); url.searchParams.set('sl',from); url.searchParams.set('tl',to); url.searchParams.set('q',text);
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 LongFormTranslator/1.0' }, signal: requestSignal(signal,45000) });
    if (res.ok) {
      const data = await res.json();
      const value = Array.isArray(data?.[0]) ? data[0][0] : data?.[0];
      if (typeof value === 'string') return value;
    }
    // Fallback to Google's public gtx endpoint if the Chrome endpoint is unavailable.
    const fallback = new URL('https://translate.googleapis.com/translate_a/single');
    fallback.searchParams.set('client','gtx'); fallback.searchParams.set('sl',from); fallback.searchParams.set('tl',to); fallback.searchParams.set('dt','t'); fallback.searchParams.set('q',text);
    const retry = await fetch(fallback, { headers: { 'User-Agent': 'Mozilla/5.0 LongFormTranslator/1.0' }, signal: requestSignal(signal,45000) });
    if (!retry.ok) fail(`谷歌翻译暂时不可用（${retry.status}），请稍后重试或更换引擎。`);
    const data = await retry.json();
    return (data?.[0] ?? []).map((part: any[]) => part?.[0] ?? '').join('');
  }
  if (engine.id === 'mymemory') {
    // MyMemory accepts at most 500 UTF-8 bytes per query. The UI/API keep
    // each chunk well below that limit and no credentials are required.
    const sourceCode = source === 'auto' ? 'autodetect' : source;
    const targetCode = target === 'zh' ? 'zh-CN' : target;
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `${sourceCode}|${targetCode}`);
    url.searchParams.set('mt', '1');
    const res = await fetch(url, { signal: requestSignal(signal, 45000) });
    const data = await res.json().catch(() => null);
    const translated = data?.responseData?.translatedText;
    if (!res.ok || data?.responseStatus !== 200 || typeof translated !== 'string') {
      const detail = data?.responseDetails;
      if (String(detail ?? '').toLowerCase().includes('limit')) {
        fail('MyMemory 今日免费额度可能已用完（匿名额度约 5,000 字符/天）；请切换到谷歌或微软翻译。');
      }
      fail(`MyMemory 翻译暂不可用：${detail || res.statusText || '接口未返回译文'}`);
    }
    return translated;
  }
  if (engine.id === 'microsoft') {
    if (engine.azureKey) {
      const url = new URL('https://api.cognitive.microsofttranslator.com/translate');
      url.searchParams.set('api-version','3.0'); url.searchParams.set('to',to);
      if (source !== 'auto') url.searchParams.set('from',from);
      const headers: Record<string,string> = { 'Ocp-Apim-Subscription-Key': engine.azureKey, 'Content-Type':'application/json' };
      if (engine.azureRegion) headers['Ocp-Apim-Subscription-Region'] = engine.azureRegion;
      const res = await fetch(url, { method:'POST', headers, body: JSON.stringify([{ Text:text }]), signal: requestSignal(signal,45000) });
      const data = await res.json(); if (!res.ok) fail(`微软 Azure 翻译错误：${data?.error?.message ?? res.statusText}`);
      return data?.[0]?.translations?.[0]?.text ?? fail('微软翻译返回内容为空。');
    }
    // Microsoft Edge's first-party translator endpoint is free and does not require a key.
    const msCode = (code:string) => code === 'zh' ? 'zh-Hans' : code === 'zh-TW' ? 'zh-Hant' : code;
    const url = new URL('https://edge.microsoft.com/translate/translatetext');
    url.searchParams.set('to',msCode(target)); url.searchParams.set('from',source === 'auto' ? '' : msCode(source)); url.searchParams.set('isEnterpriseClient','false');
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0' }, body:JSON.stringify([text]), signal:requestSignal(signal,45000) });
    const data = await res.json().catch(() => null);
    const translated = data?.[0]?.translations?.[0]?.text;
    if (!res.ok || !translated) fail('微软免费翻译接口暂时不可用或触发限流；可填 Azure 密钥，或切换其他翻译引擎。');
    return translated;
  }
  if (engine.id === 'baidu') {
    if (!engine.appId || !engine.secret) return fail('请先填写百度翻译 APP ID 和密钥。');
    const appId=engine.appId, secret=engine.secret;
    const salt = String(Date.now()) + String(Math.floor(Math.random()*10000));
    const sign = md5(`${appId}${text}${salt}${secret}`);
    const baiduCode:Record<string,string> = { 'zh-TW':'cht',ja:'jp',ko:'kor',fr:'fra',es:'spa',ar:'ara',vi:'vie',ms:'may',uk:'ukr',sv:'swe',da:'dan',no:'nor',fi:'fin',he:'heb',ro:'rom',bg:'bul',bn:'ben',ta:'tam',fa:'per',ca:'cat',hr:'hrv',sr:'srp',sl:'slo',et:'est',lv:'lav',lt:'lit' };
    const url = new URL('https://fanyi-api.baidu.com/api/trans/vip/translate');
    for (const [k,v] of Object.entries({ q:text, from:source==='auto'?'auto':(baiduCode[source]??source), to:baiduCode[target]??target, appid:appId, salt, sign })) url.searchParams.set(k,v);
    const res = await fetch(url, { signal:requestSignal(signal,45000) }); const data = await res.json();
    if (!res.ok || data.error_code) {
      const messages: Record<string,string> = {'52001':'请求超时，请重试。','52002':'系统错误，请稍后重试。','52003':'百度 APP ID 或密钥无效。','54000':'请求参数错误。','54001':'百度密钥错误，请检查配置。','54003':'百度接口调用频率超限，请稍后再试。','54004':'百度账户余额不足。','58000':'当前语言方向暂不支持。'};
      fail(messages[String(data.error_code)] ?? `百度翻译失败：${data.error_msg ?? data.error_code}`);
    }
    return (data.trans_result ?? []).map((row: any) => row.dst).join('\n');
  }
  if (engine.id === 'custom') return translateCustom(text, from, to, engine, signal);
  return fail('未知翻译引擎。');
}

async function translateCustom(text:string, source:string, target:string, engine:EngineConfig, signal?:AbortSignal):Promise<string> {
  if (!engine.apiKey) return fail('请在设置中填写自定义模型 API Key。');
  const apiKey=engine.apiKey;
  const prompt = `Translate the following text from ${source} to ${target}. Preserve meaning, tone, formatting, and line breaks. Return only the translation, with no commentary.\n\n${text}`;
  const protocol = engine.protocol ?? 'openai';
  if (protocol === 'anthropic') {
    if (!engine.endpoint) return fail('请填写 Anthropic API 地址。');
    const endpoint=engine.endpoint;
    const res = await fetch(endpoint.replace(/\/$/,'') + '/v1/messages', { method:'POST', headers:{ 'x-api-key':apiKey, 'anthropic-version':'2023-06-01', 'content-type':'application/json', 'anthropic-dangerous-direct-browser-access':'true' }, body:JSON.stringify({ model:engine.model || 'claude-3-5-sonnet-latest', max_tokens:8192, messages:[{ role:'user', content:prompt }] }), signal:requestSignal(signal,90000) });
    const data=await res.json(); if(!res.ok) fail(`Anthropic 接口错误：${data?.error?.message ?? res.statusText}`);
    return data.content?.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('') ?? fail('模型未返回译文。');
  }
  if (protocol === 'gemini') {
    if (!engine.endpoint) return fail('请填写 Gemini API 地址。');
    const root=engine.endpoint.replace(/\/$/,''); const model=engine.model || 'gemini-2.0-flash';
    const url=`${root}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}]}),signal:requestSignal(signal,90000)});
    const data=await res.json(); if(!res.ok) fail(`Gemini 接口错误：${data?.error?.message ?? res.statusText}`);
    return data.candidates?.[0]?.content?.parts?.map((p:any)=>p.text??'').join('') ?? fail('模型未返回译文。');
  }
  if (!engine.endpoint) return fail('请填写 OpenAI 兼容 API 地址。');
  const endpoint=engine.endpoint.replace(/\/$/,'');
  const url=endpoint.endsWith('/chat/completions')?endpoint:`${endpoint}/chat/completions`;
  const res=await fetch(url,{method:'POST',headers:{'Authorization':`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:engine.model||'gpt-4o-mini',temperature:0.2,messages:[{role:'user',content:prompt}]}),signal:requestSignal(signal,90000)});
  const data=await res.json(); if(!res.ok) fail(`模型接口错误：${data?.error?.message ?? res.statusText}`);
  return data.choices?.[0]?.message?.content ?? fail('模型未返回译文。');
}
