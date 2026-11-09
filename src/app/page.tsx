'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, Check, ChevronDown, Clipboard, Clock3, Cloud, Download, FileText, Languages, LoaderCircle, Menu, Pause, Play, Plus, Settings2, ShieldCheck, Sparkles, Trash2, Upload, X, Zap } from 'lucide-react';
import { splitText } from '@/lib/chunk';
import { LANGUAGES, languageName } from '@/lib/languages';
import type { EngineConfig } from '@/lib/engines';
import { translateInBrowser } from '@/lib/translate-client';

type EngineId='google'|'microsoft'|'mymemory'|'baidu'|'custom';
type HistoryItem={id:string;sourceText:string;translatedText:string;sourceLanguage:string;targetLanguage:string;engine:string;createdAt:string;charCount:number};
type Preset={name:string;protocol:'openai'|'anthropic'|'gemini';endpoint:string;model:string};
const PRESETS:Record<string,Preset>={
  openai:{name:'OpenAI',protocol:'openai',endpoint:'https://api.openai.com/v1',model:'gpt-4o-mini'},
  deepseek:{name:'DeepSeek',protocol:'openai',endpoint:'https://api.deepseek.com/v1',model:'deepseek-chat'},
  kimi:{name:'Kimi',protocol:'openai',endpoint:'https://api.moonshot.cn/v1',model:'moonshot-v1-8k'},
  zhipu:{name:'智谱 GLM',protocol:'openai',endpoint:'https://open.bigmodel.cn/api/paas/v4',model:'glm-4-flash'},
  qwen:{name:'通义千问',protocol:'openai',endpoint:'https://dashscope.aliyuncs.com/compatible-mode/v1',model:'qwen-plus'},
  openrouter:{name:'OpenRouter',protocol:'openai',endpoint:'https://openrouter.ai/api/v1',model:'openai/gpt-4o-mini'},
  claude:{name:'Claude',protocol:'anthropic',endpoint:'https://api.anthropic.com',model:'claude-3-5-sonnet-latest'},
  gemini:{name:'Gemini',protocol:'gemini',endpoint:'https://generativelanguage.googleapis.com/v1beta',model:'gemini-2.0-flash'}
};
const ENGINE_NAMES:Record<string,string>={google:'谷歌翻译',microsoft:'微软翻译',mymemory:'MyMemory',baidu:'百度翻译',custom:'自定义大模型'};
const HISTORY_KEY='lft-history';
const newId=()=>typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():`${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const freshConfig=()=>({engine:'microsoft' as EngineId,baiduAppId:'',baiduSecret:'',azureKey:'',azureRegion:'',customProtocol:'openai' as 'openai'|'anthropic'|'gemini',customEndpoint:'https://api.openai.com/v1',customModel:'gpt-4o-mini',customKey:'',preset:'openai'});

export default function Home(){
 const [source,setSource]=useState(''),[target,setTarget]=useState('zh'),[sourceLang,setSourceLang]=useState('auto');
 const [cfg,setCfg]=useState(freshConfig),[ready,setReady]=useState(false),[showSettings,setShowSettings]=useState(false),[showHistory,setShowHistory]=useState(false);
 const [results,setResults]=useState<Record<number,string>>({}),[errors,setErrors]=useState<Record<number,string>>({}),[restoredOutput,setRestoredOutput]=useState<string|null>(null);
 const [isRunning,setIsRunning]=useState(false),[completed,setCompleted]=useState(false),[total,setTotal]=useState(0),[finished,setFinished]=useState(0),[copied,setCopied]=useState(false),[toast,setToast]=useState('');
 const [history,setHistory]=useState<HistoryItem[]>([]),[mobileMenu,setMobileMenu]=useState(false);
 const abortRef=useRef<AbortController|null>(null); const runIdRef=useRef(0); const uploadRef=useRef<HTMLInputElement>(null);
 const chunkSize=cfg.engine==='baidu'?1400:cfg.engine==='mymemory'?150:3600;
 const chunks=useMemo(()=>splitText(source,chunkSize),[source,chunkSize]);
 const translated=useMemo(()=>restoredOutput ?? chunks.map(c=>results[c.index]??'').join(''),[chunks,results,restoredOutput]);
 const successes=Object.keys(results).length;
 const percent=total?Math.round(finished/total*100):0;
 const notify=(s:string)=>{setToast(s);window.setTimeout(()=>setToast(''),2800)};
 useEffect(()=>{try{const saved=localStorage.getItem('lft-settings');if(saved)setCfg({...freshConfig(),...JSON.parse(saved)});}catch{} try{const stored=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');if(Array.isArray(stored))setHistory(stored.slice(0,50));}catch{} setReady(true);},[]);
 useEffect(()=>{if(ready)localStorage.setItem('lft-settings',JSON.stringify(cfg));},[cfg,ready]);
 const resetTranslation=()=>{runIdRef.current++;abortRef.current?.abort();abortRef.current=null;setIsRunning(false);setResults({});setErrors({});setRestoredOutput(null);setCompleted(false);setFinished(0);setTotal(0);};
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();resetTranslation();setSource('');}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[]);
 const selectEngine=(engine:EngineId)=>{if(engine!==cfg.engine)resetTranslation();setCfg(c=>({...c,engine}));};
 const enginePayload=():EngineConfig=>cfg.engine==='baidu'?{id:'baidu',appId:cfg.baiduAppId,secret:cfg.baiduSecret}:cfg.engine==='microsoft'?{id:'microsoft',azureKey:cfg.azureKey,azureRegion:cfg.azureRegion}:{id:cfg.engine,protocol:cfg.customProtocol,endpoint:cfg.customEndpoint,model:cfg.customModel,apiKey:cfg.customKey};
 const saveHistory=useCallback(async(finalText:string)=>{try{const item:HistoryItem={id:newId(),sourceText:source,translatedText:finalText,sourceLanguage:sourceLang,targetLanguage:target,engine:ENGINE_NAMES[cfg.engine],createdAt:new Date().toISOString(),charCount:source.length};setHistory(h=>{const next=[item,...h].slice(0,50);try{localStorage.setItem(HISTORY_KEY,JSON.stringify(next));}catch{} return next;});}catch{}},[source,sourceLang,target,cfg.engine]);
 const run=async(indices?:number[])=>{
   if(!source.trim()){notify('先粘贴或上传需要翻译的内容');return;} if(!chunks.length)return;
   if(cfg.engine==='baidu'&&(!cfg.baiduAppId||!cfg.baiduSecret)){setShowSettings(true);notify('请先配置百度翻译 APP ID 和密钥');return;}
   if(cfg.engine==='custom'&&!cfg.customKey){setShowSettings(true);notify('请先配置模型 API Key');return;}
   const runId=++runIdRef.current;setRestoredOutput(null);setIsRunning(true);setCompleted(false);setFinished(0);setTotal(indices?.length||chunks.length);setErrors({});
   const controller=new AbortController();abortRef.current=controller;
   try{
     await translateInBrowser({text:source,source:sourceLang,target,engine:enginePayload(),indices,chunkSize,signal:controller.signal,onEvent:(ev)=>{
       if(ev.type==='start')setTotal(ev.selected);
       if(ev.type==='chunk'){setResults(prev=>({...prev,[ev.index]:ev.text}));setErrors(prev=>{const n={...prev};delete n[ev.index];return n;});}
       if(ev.type==='error')setErrors(prev=>({...prev,[ev.index]:ev.message}));
       if(ev.type==='progress')setFinished(ev.finished);
       if(ev.type==='done')setCompleted(true);
     }});
   }catch(e){if((e as Error).name!=='AbortError')notify((e as Error).message||'翻译中断');}
   finally{if(runIdRef.current===runId){setIsRunning(false);abortRef.current=null;setCompleted(true);}}
 };
 useEffect(()=>{if(completed&&!Object.keys(errors).length&&chunks.length&&chunks.every(c=>results[c.index]!==undefined))saveHistory(chunks.map(c=>results[c.index]).join(''));},[completed]);
 const stop=()=>{abortRef.current?.abort();setIsRunning(false);notify('已停止，可随时继续剩余片段');};
 const continueRemaining=()=>{const missing=chunks.filter(c=>results[c.index]===undefined).map(c=>c.index);if(missing.length)run(missing);else notify('所有片段都已完成');};
 const retryFailed=()=>{const failed=Object.keys(errors).map(Number);if(failed.length)run(failed);else notify('当前没有失败片段');};
 const swap=()=>{if(sourceLang==='auto'){notify('自动检测模式不能互换');return;}resetTranslation();setSourceLang(target);setTarget(sourceLang);};
 const loadHistory=(h:HistoryItem)=>{resetTranslation();setSource(h.sourceText);setTarget(h.targetLanguage);setSourceLang(h.sourceLanguage);setRestoredOutput(h.translatedText);setShowHistory(false);};
 const copy=async()=>{if(!translated){notify('暂无可复制的译文');return;}await navigator.clipboard.writeText(translated);setCopied(true);window.setTimeout(()=>setCopied(false),1800);};
 const download=()=>{if(!translated){notify('暂无可下载的译文');return;}const blob=new Blob([translated],{type:'text/plain;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='translated.txt';a.click();URL.revokeObjectURL(a.href);};
 const upload=async(e:React.ChangeEvent<HTMLInputElement>)=>{const file=e.target.files?.[0];if(!file)return;try{const text=await file.text();resetTranslation();setSource(text);notify(`已载入 ${file.name}`);}catch{notify('文件读取失败');}e.target.value='';};
 const clearHistory=async()=>{try{localStorage.removeItem(HISTORY_KEY);}catch{} setHistory([]);};
 const choosePreset=(key:string)=>{const p=PRESETS[key];setCfg(c=>({...c,preset:key,customProtocol:p.protocol,customEndpoint:p.endpoint,customModel:p.model}));};
 return <main className="app-shell">
  <aside className={`sidebar ${mobileMenu?'sidebar-open':''}`}>
   <div className="brand"><div className="brand-mark"><Languages size={20}/></div><div><b>Lingua</b><small>LONG-FORM TRANSLATOR</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileMenu(false)}><X size={18}/></button></div>
   <button className="new-translation" onClick={()=>{resetTranslation();setSource('');setMobileMenu(false)}}><Plus size={17}/> 新建翻译 <span>⌘ K</span></button>
   <div className="side-label">工作区</div><button className="nav-item active"><Sparkles size={17}/> 长文翻译 <span className="nav-dot"/></button>
   <button className="nav-item" onClick={()=>setShowHistory(true)}><Clock3 size={17}/> 翻译历史 <span className="count-pill">{history.length||'—'}</span></button>
   <div className="side-spacer"/>
   <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={17}/></div><div><b>密钥只在本机</b><p>API 密钥保存于浏览器，不会写入历史记录，也不会发送到本应用的服务器。</p></div></div>
   <button className="profile" onClick={()=>setShowSettings(true)}><div className="avatar">L</div><div className="profile-copy"><b>翻译设置</b><small>{ENGINE_NAMES[cfg.engine]}</small></div><Settings2 size={17}/></button>
  </aside>
  <section className="main-panel">
   <header className="topbar"><button className="icon-btn menu-toggle" onClick={()=>setMobileMenu(!mobileMenu)}><Menu size={19}/></button><div className="breadcrumb">工作区 <span>/</span> <b>长文翻译</b></div><div className="top-right"><span className="secure-chip"><span/> 安全加密</span><button className="icon-btn" title="翻译设置" onClick={()=>setShowSettings(true)}><Settings2 size={18}/></button></div></header>
   <div className="workspace">
    <div className="intro"><div className="eyebrow"><span className="eyebrow-icon"><Zap size={13}/></span> LONG-FORM TRANSLATOR</div><h1>让长文翻译，<span>一气呵成。</span></h1><p>没有字数限制。智能分段、实时流式翻译，随时暂停或从断点继续。</p></div>
    <div className="langbar">
      <div className="lang-select"><span className="lang-caption">原文语言</span><select value={sourceLang} onChange={e=>{resetTranslation();setSourceLang(e.target.value)}}>{LANGUAGES.map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><ChevronDown className="select-chev" size={15}/></div>
      <button className="swap-btn" onClick={swap} title="互换语言"><ArrowDownUp size={17}/></button>
      <div className="lang-select target-select"><span className="lang-caption">翻译为</span><select value={target} onChange={e=>{resetTranslation();setTarget(e.target.value)}}>{LANGUAGES.filter(([code])=>code!=='auto').map(([code,name])=><option key={code} value={code}>{name}</option>)}</select><ChevronDown className="select-chev" size={15}/></div>
      <div className="engine-indicator"><span className={`engine-symbol ${cfg.engine}`}><EngineIcon id={cfg.engine}/></span><span>{ENGINE_NAMES[cfg.engine]}</span><button onClick={()=>setShowSettings(true)}>更改</button></div>
    </div>
    <div className="editor-grid">
      <section className="editor-card source-card"><div className="card-head"><div><span className="step-number">01</span><b>原文</b></div><div className="card-tools"><span className="char-count">{source.length.toLocaleString()} <i>字符</i></span><button className="tiny-btn" onClick={()=>uploadRef.current?.click()}><Upload size={14}/> 上传文件</button><input ref={uploadRef} hidden type="file" accept=".txt,.md,.markdown,.srt,.vtt,.csv,.log,.json,.html,.xml,.yaml,.yml" onChange={upload}/></div></div>
       <textarea value={source} onChange={e=>{resetTranslation();setSource(e.target.value)}} placeholder="在此粘贴或输入需要翻译的长文…\n\n支持 .txt、.md、.srt、.vtt 等文本文件。智能分段会保留原文格式，无需担心字数限制。" spellCheck={false}/>
       <div className="card-foot"><span><span className="status-dot"/> 自动保存于当前会话</span><button className="clear-btn" onClick={()=>{resetTranslation();setSource('');}}>清空</button></div>
      </section>
      <section className={`editor-card result-card ${isRunning?'running':''}`}><div className="card-head"><div><span className="step-number result-step">02</span><b>译文</b></div><div className="card-tools"><span className="result-language">{languageName(target)}</span><button className="icon-btn compact" onClick={copy} title="复制译文">{copied?<Check size={15}/>:<Clipboard size={15}/>}</button><button className="icon-btn compact" onClick={download} title="下载译文"><Download size={15}/></button></div></div>
       <div className={`translation-output ${translated?'has-content':''}`}>{translated?<div className="translated-text">{translated}</div>:<div className="empty-state"><div className="empty-art"><div className="art-page page-one"/><div className="art-page page-two"><i/><i/><i/></div><div className="art-spark"><Sparkles size={17}/></div></div><b>译文将在这里呈现</b><p>每个片段完成后会实时显示，<br/>整个过程可暂停、继续或重试。</p></div>}</div>
       {Object.keys(errors).length>0&&<div className="error-strip"><span>{Object.keys(errors).length} 个片段翻译失败</span><button onClick={retryFailed}>重试失败片段 <ArrowRight size={13}/></button></div>}
       <div className="card-foot"><span>{successes>0?<><span className="status-dot green"/> 已完成 {successes}/{chunks.length} 个片段</>:restoredOutput?<><span className="status-dot green"/> 已加载历史译文</>:<><span className="status-dot"/> 等待开始</>}</span><span className="format-note">保留段落与换行</span></div>
      </section>
    </div>
    {isRunning&&<div className="progress-card"><div className="progress-top"><span><LoaderCircle size={15} className="spin"/> 正在翻译 <b>{finished}</b> / {total} 个片段</span><span>{percent}%</span></div><div className="progress-track"><div className="progress-fill" style={{width:`${percent}%`}}/></div><div className="progress-bottom"><span>并发翻译中 · 每个片段完成后立即显示</span><button onClick={stop}><Pause size={14} fill="currentColor"/> 停止翻译</button></div></div>}
    <div className="action-row"><div className="action-hint"><span className="hint-star">✳</span>{chunks.length>0?`${chunks.length.toLocaleString()} 个智能片段`:'支持任意长度文本'}<span className="hint-separator">·</span>隐私安全，密钥不落库</div><div className="action-buttons">{completed&&chunks.some(c=>results[c.index]===undefined)&&<button className="secondary-action" onClick={continueRemaining}><Play size={15}/> 继续翻译剩余部分</button>}<button className="translate-btn" disabled={isRunning} onClick={()=>run()}>{isRunning?<><LoaderCircle size={17} className="spin"/> 翻译中…</>:<><Sparkles size={16}/> 开始翻译 <ArrowRight size={16}/></>}</button></div></div>
    <div className="feature-row"><div><div className="feature-icon lavender"><Zap size={16}/></div><span><b>无限字数</b><small>智能分段，完整拼接</small></span></div><div><div className="feature-icon mint"><Cloud size={16}/></div><span><b>实时流式</b><small>逐段呈现翻译结果</small></span></div><div><div className="feature-icon peach"><ShieldCheck size={16}/></div><span><b>断点续译</b><small>失败片段单独重试</small></span></div><div><div className="feature-icon blue"><FileText size={16}/></div><span><b>多引擎支持</b><small>免费引擎或自带密钥</small></span></div></div>
   </div>
   <footer className="footer"><span>LINGUA · LONG-FORM TRANSLATOR</span><span>为长文而生 <span className="footer-heart">♥</span></span></footer>
  </section>
  {mobileMenu&&<div className="mobile-overlay" onClick={()=>setMobileMenu(false)}/>}
  {showSettings&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowSettings(false)}}><div className="settings-modal"><div className="modal-heading"><div><span className="modal-kicker">PREFERENCES</span><h2>翻译设置</h2></div><button className="icon-btn" onClick={()=>setShowSettings(false)}><X size={19}/></button></div><div className="modal-content"><label className={`engine-choice ${cfg.engine==='google'?'selected':''}`} onClick={()=>selectEngine('google')}><span className="engine-logo google-logo">G</span><span className="choice-copy"><b>谷歌翻译</b><small>免费使用 · 无需配置</small></span><span className="recommended">推荐</span>{cfg.engine==='google'&&<Check className="choice-check" size={17}/>}</label>
    <label className={`engine-choice ${cfg.engine==='microsoft'?'selected':''}`} onClick={()=>selectEngine('microsoft')}><span className="engine-logo microsoft-logo"><span/><span/><span/><span/></span><span className="choice-copy"><b>必应 / 微软翻译</b><small>免费接口；可选填 Azure 密钥</small></span>{cfg.engine==='microsoft'&&<Check className="choice-check" size={17}/>}</label>
    {cfg.engine==='microsoft'&&<div className="engine-fields compact-fields"><Field label="Azure 翻译密钥（可选）" value={cfg.azureKey} onChange={v=>setCfg(c=>({...c,azureKey:v}))} secret placeholder="免费模式无需填写"/><Field label="Azure 区域（可选）" value={cfg.azureRegion} onChange={v=>setCfg(c=>({...c,azureRegion:v}))} placeholder="例如 eastus"/></div>}
    <label className={`engine-choice ${cfg.engine==='mymemory'?'selected':''}`} onClick={()=>selectEngine('mymemory')}><span className="engine-logo mymemory-logo">M</span><span className="choice-copy"><b>MyMemory</b><small>免费备用 · 无需密钥 · 匿名约 5,000 字符/天</small></span>{cfg.engine==='mymemory'&&<Check className="choice-check" size={17}/>}</label>
    {cfg.engine==='mymemory'&&<div className="engine-fields compact-fields"><p className="field-note">MyMemory 免费额度有限，质量和可用性可能波动；请求由浏览器直接发出，额度按当前网络计算。长文建议优先使用微软或谷歌翻译。</p></div>}
    <label className={`engine-choice ${cfg.engine==='baidu'?'selected':''}`} onClick={()=>selectEngine('baidu')}><span className="engine-logo baidu-logo">度</span><span className="choice-copy"><b>百度翻译</b><small>使用自己的 API 凭证</small></span>{cfg.engine==='baidu'&&<Check className="choice-check" size={17}/>}</label>
    {cfg.engine==='baidu'&&<div className="engine-fields"><Field label="APP ID" value={cfg.baiduAppId} onChange={v=>setCfg(c=>({...c,baiduAppId:v}))} placeholder="输入百度翻译 APP ID"/><Field label="密钥" value={cfg.baiduSecret} onChange={v=>setCfg(c=>({...c,baiduSecret:v}))} secret placeholder="输入百度翻译密钥"/><p className="field-note">凭证仅保存在当前浏览器 localStorage，翻译时临时发送，不会写入历史记录。浏览器直连百度接口可能被跨域策略拦截，此时请改用其他引擎。</p></div>}
    <label className={`engine-choice ${cfg.engine==='custom'?'selected':''}`} onClick={()=>selectEngine('custom')}><span className="engine-logo model-logo"><Sparkles size={17}/></span><span className="choice-copy"><b>自定义大模型</b><small>OpenAI 兼容 / Anthropic / Gemini</small></span>{cfg.engine==='custom'&&<Check className="choice-check" size={17}/>}</label>
    {cfg.engine==='custom'&&<div className="engine-fields"><label className="field-label">快捷预设</label><div className="preset-grid">{Object.entries(PRESETS).map(([key,p])=><button key={key} className={`preset-chip ${cfg.preset===key?'preset-active':''}`} onClick={()=>choosePreset(key)}>{p.name}</button>)}</div><label className="field-label">接口形态</label><div className="protocol-row">{(['openai','anthropic','gemini'] as const).map(p=><button key={p} className={cfg.customProtocol===p?'protocol-active':''} onClick={()=>setCfg(c=>({...c,customProtocol:p,preset:'',customEndpoint:p==='anthropic'?'https://api.anthropic.com':p==='gemini'?'https://generativelanguage.googleapis.com/v1beta':'https://api.openai.com/v1',customModel:p==='anthropic'?'claude-3-5-sonnet-latest':p==='gemini'?'gemini-2.0-flash':'gpt-4o-mini'}))}>{p==='openai'?'OpenAI 兼容':p==='anthropic'?'Anthropic':'Gemini'}</button>)}</div><Field label="API 地址" value={cfg.customEndpoint} onChange={v=>setCfg(c=>({...c,customEndpoint:v,preset:''}))} placeholder="https://api.example.com/v1"/><Field label="模型名称" value={cfg.customModel} onChange={v=>setCfg(c=>({...c,customModel:v,preset:''}))} placeholder="例如 gpt-4o-mini"/><Field label="API Key" value={cfg.customKey} onChange={v=>setCfg(c=>({...c,customKey:v}))} secret placeholder="sk-…"/><p className="field-note">密钥只存本机浏览器；每个片段按需调用模型接口。</p></div>}
    <div className="settings-safe"><ShieldCheck size={16}/><span><b>凭证安全</b><small>所有密钥只保存在 localStorage，翻译时由浏览器直接发送给对应服务商。</small></span></div>
   </div><div className="modal-footer"><button className="cancel-btn" onClick={()=>setShowSettings(false)}>取消</button><button className="save-btn" onClick={()=>setShowSettings(false)}>完成设置 <Check size={15}/></button></div></div></div>}
  {showHistory&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowHistory(false)}}><div className="history-modal"><div className="modal-heading"><div><span className="modal-kicker">YOUR WORKSPACE</span><h2>翻译历史</h2></div><button className="icon-btn" onClick={()=>setShowHistory(false)}><X size={19}/></button></div><div className="history-content">{history.length===0?<div className="history-empty"><div className="history-empty-icon"><Clock3 size={20}/></div><b>这里还没有翻译记录</b><p>完成一篇翻译后，记录会自动保存到你的工作区。</p></div>:history.map(item=><button className="history-item" key={item.id} onClick={()=>loadHistory(item)}><span className="history-file"><FileText size={17}/></span><span className="history-copy"><b>{item.sourceText.slice(0,62).replace(/\s+/g,' ')||'无标题文本'}{item.sourceText.length>62?'…':''}</b><small>{languageName(item.sourceLanguage)} → {languageName(item.targetLanguage)} · {new Date(item.createdAt).toLocaleDateString()} · {item.charCount.toLocaleString()} 字符</small></span><ArrowRight size={16}/></button>)}</div><div className="modal-footer history-footer"><span>历史记录保存在本地浏览器</span>{history.length>0&&<button className="delete-history" onClick={clearHistory}><Trash2 size={14}/> 清空历史</button>}</div></div></div>}
  {toast&&<div className="toast"><span className="toast-dot"/>{toast}</div>}
 </main>;
}
function EngineIcon({id}:{id:string}){return id==='google'?<span className="google-g">G</span>:id==='microsoft'?<span className="ms-logo"><i/><i/><i/><i/></span>:id==='mymemory'?<span className="mymemory-small">M</span>:id==='baidu'?<span className="baidu-small">度</span>:<Sparkles size={15}/>}
function Field({label,value,onChange,placeholder,secret}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;secret?:boolean}){return <label className="field"><span>{label}</span><input value={value} type={secret?'password':'text'} autoComplete="off" onChange={e=>onChange(e.target.value)} placeholder={placeholder}/></label>}
