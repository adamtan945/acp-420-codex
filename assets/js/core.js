(function (root) {
  'use strict';
  const A = root.ACP || (root.ACP = {});
  const sortedSet = xs => [...new Set(xs)].sort();
  function grade(q, selected) {
    const choices = q.options.map(o => o.optionId);
    if (!Array.isArray(selected) || selected.some(id => !choices.includes(id))) return false;
    const actual = sortedSet(selected), expected = sortedSet(q.correctOptionIds);
    return actual.length === expected.length && actual.every((id, i) => id === expected[i]);
  }
  function allocateQuotas(total, weights) {
    if (!Number.isInteger(total) || total <= 0 || !weights.length || weights.some(w => !Number.isFinite(w) || w < 0)) throw Error('模考設定無效');
    const sum = weights.reduce((a,b) => a+b, 0);
    if (sum !== 100) throw Error('Domain 權重必須合計 100');
    const exact = weights.map(w => total*w/100), counts = exact.map(Math.floor);
    const order = exact.map((x,i) => ({i, remainder:x-counts[i]})).sort((a,b) => b.remainder-a.remainder || a.i-b.i);
    for (let n = total-counts.reduce((a,b) => a+b,0), i=0; i<n; i++) counts[order[i].i]++;
    return counts;
  }
  function random(seed) {
    let x = 2166136261;
    for (const c of String(seed)) x = Math.imul(x ^ c.charCodeAt(0), 16777619);
    return () => { x += 0x6D2B79F5; let t=x; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; };
  }
  function shuffle(items, rand) {
    const out = items.slice(); for (let i=out.length-1;i>0;i--) { const j=Math.floor(rand()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; } return out;
  }
  function sampleExam(questions, domains, total, seed) {
    const quotas = allocateQuotas(total, domains.map(d => d.weight));
    if (new Set(questions.map(q=>q.questionId)).size !== questions.length) throw Error('題庫 ID 重複');
    const rand = random(seed), selected=[];
    domains.forEach((d,i) => {
      const pool=questions.filter(q=>q.domainId===d.domainId);
      if (pool.length<quotas[i]) throw Error('Domain '+d.domainId+' 題庫不足：需要 '+quotas[i]+'，目前 '+pool.length);
      selected.push(...shuffle(pool,rand).slice(0,quotas[i]).map(q => ({...q, options:shuffle(q.options,rand)})));
    });
    return shuffle(selected,rand);
  }
  function uuid() {
    const c=root.crypto;
    if (c && c.randomUUID) return c.randomUUID();
    if (!c || !c.getRandomValues) throw Error('瀏覽器不支援安全的紀錄 ID；請使用新版瀏覽器');
    const b=c.getRandomValues(new Uint8Array(16)); b[6]=(b[6]&15)|64; b[8]=(b[8]&63)|128;
    const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join(''); return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function createExam(course, questions, now, id) {
    return {sessionId:id||uuid(), startedAt:now, deadline:now+course.exam.minutes*60000, finishedAt:null, questions:JSON.parse(JSON.stringify(questions)), answers:{}, sourceContentVersion:course.sourceContentVersion,siteContentVersion:course.siteContentVersion,passCount:course.exam.passCount, seed:null};
  }
  const remainingMs=(s,now)=>Math.max(0,s.deadline-now);
  function assumptionsText(value){
    if(typeof value==='string')return value;
    if(Array.isArray(value))return value.map(assumptionsText).filter(Boolean).join('\n');
    if(value&&typeof value==='object')return Object.entries(value).map(([key,item])=>key.replace(/([a-z])([A-Z])/g,'$1 $2')+': '+assumptionsText(item)).join('\n');
    return value===null||value===undefined?'':String(value);
  }
  function diagramText(diagram) {
    if(!diagram)return '';
    const parts=[];for(const key of ['textEquivalent','description','altTextZhTW','title','caption'])if(typeof diagram[key]==='string')parts.push(diagram[key]);
    if(typeof diagram.alt==='string')parts.push(diagram.alt);else if(diagram.alt){for(const value of Object.values(diagram.alt))if(typeof value==='string')parts.push(value);}
    for(const key of ['nodes','cards','steps','records'])if(Array.isArray(diagram[key]))diagram[key].forEach(x=>{if(typeof x==='string')parts.push(x);else if(x&&typeof x==='object')parts.push(Object.entries(x).filter(([,v])=>typeof v==='string'||typeof v==='number').map(([k,v])=>k+': '+v).join(' · '));});
    if(Array.isArray(diagram.edges))diagram.edges.forEach(e=>parts.push(e.from+' → '+e.to+(e.label?' · '+e.label:'')));
    return [...new Set(parts.filter(Boolean))].join('\n');
  }
  function finishExam(session, now) {
    if (session.finishedAt !== null) return {session, newlyFinished:false};
    const out={...session,finishedAt:now};
    out.results=out.questions.map(q => {const premise=q.assumptionsText||assumptionsText(q.assumptions);return {questionId:q.questionId,revision:q.revision,selectedIds:(out.answers[q.questionId]||[]).slice(),correct:grade(q,out.answers[q.questionId]||[]),stem:q.stem,options:q.options.map(o=>({optionId:o.optionId,text:o.text,explanation:o.explanation,sourceRefs:o.sourceRefs||[]})),correctOptionIds:q.correctOptionIds.slice(),...(q.diagram?{diagramText:diagramText(q.diagram)}:{}),...(q.diagramRevision?{diagramRevision:q.diagramRevision}:{}),...(premise?{assumptionsText:premise}:{})};});
    out.correctCount=out.results.filter(r=>r.correct).length; out.passed=out.correctCount>=out.passCount;
    return {session:out,newlyFinished:true};
  }
  const resolveTheme=(mode,systemDark)=>mode==='system'?(systemDark?'dark':'light'):mode;
  function currentWrong(events, questions) {
    const last=new Map();
    events.filter(e=>e.type==='attempt').sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)).forEach(e=>last.set(e.questionId+'@'+e.revision,e));
    return questions.filter(q => {const e=last.get(q.questionId+'@'+q.revision);return e && !e.correct;});
  }
  Object.assign(A,{grade,allocateQuotas,random,shuffle,sampleExam,uuid,createExam,remainingMs,finishExam,resolveTheme,currentWrong,diagramText,assumptionsText});
  if (typeof module !== 'undefined' && module.exports) module.exports=A;
})(typeof window !== 'undefined' ? window : globalThis);
