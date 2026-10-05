(function(root) {
  'use strict';
  const A=root.ACP||(typeof require==='function'?require('./core.js'):{});
  const MAX_BYTES=5242880, MAX_STRING=65536, BAD_KEYS=new Set(['__proto__','constructor','prototype']);
  function safeParse(text) {
    if (typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES) throw Error('匯入檔案超過 5 MiB');
    let p=0;
    const ws=()=>{while(/[ \t\r\n]/.test(text[p]||'')&&p<text.length)p++;};
    function string() {
      const start=p++; let escaped=false;
      while(p<text.length) {const c=text[p++];if(c==='"'&&!escaped) {const v=JSON.parse(text.slice(start,p));if(new TextEncoder().encode(v).length>MAX_STRING)throw Error('文字欄位過長');return v;}if(c==='\\'&&!escaped)escaped=true;else escaped=false;}
      throw Error('JSON 字串不完整');
    }
    function value(depth) {
      if(depth>32)throw Error('JSON 巢狀超過 32 層'); ws(); const c=text[p];
      if(c==='"')return string();
      if(c==='{') {
        p++;ws();const o=Object.create(null),seen=new Set();if(text[p]==='}') {p++;return o;}
        for(;;) {ws();if(text[p]!=='"')throw Error('JSON 欄位格式錯誤');const key=string();if(BAD_KEYS.has(key))throw Error('禁止的 JSON 欄位');if(seen.has(key))throw Error('重複 JSON 欄位：'+key);seen.add(key);ws();if(text[p++]!==':')throw Error('JSON 格式錯誤');o[key]=value(depth+1);ws();const next=text[p++];if(next==='}')break;if(next!==',')throw Error('JSON 格式錯誤');}
        return o;
      }
      if(c==='[') {p++;ws();const a=[];if(text[p]===']'){p++;return a;}for(;;){a.push(value(depth+1));if(a.length>100000)throw Error('陣列項目過多');ws();const next=text[p++];if(next===']')break;if(next!==',')throw Error('JSON 格式錯誤');}return a;}
      const m=/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(p));if(!m)throw Error('JSON 格式錯誤');p+=m[0].length;const out=JSON.parse(m[0]);if(typeof out==='number'&&!Number.isFinite(out))throw Error('數值必須有限');return out;
    }
    const out=value(0);ws();if(p!==text.length)throw Error('JSON 結尾有多餘資料');return out;
  }
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  function fields(x, allowed, required) {if(!obj(x))throw Error('紀錄必須是物件');for(const k of Object.keys(x))if(!allowed.includes(k)||BAD_KEYS.has(k))throw Error('未知欄位：'+k);for(const k of required||[])if(!(k in x))throw Error('缺少欄位：'+k);}
  const str=(v,label,max=MAX_STRING)=>{if(typeof v!=='string'||!v.length||new TextEncoder().encode(v).length>max)throw Error(label+' 格式錯誤');};
  const id=v=>{str(v,'ID',200);if(!/^[A-Za-z0-9_.:@-]+$/.test(v))throw Error('ID 含非法字元');};
  const time=v=>{if(!Number.isSafeInteger(v)||v<0||v>8640000000000000)throw Error('時間格式錯誤');};
  function ids(xs) {if(!Array.isArray(xs)||xs.length>100||new Set(xs).size!==xs.length)throw Error('選項 ID 格式錯誤');xs.forEach(id);}
  function validateResult(r) {
    fields(r,['questionId','revision','selectedIds','correct','stem','options','correctOptionIds','diagramText','diagramRevision','assumptionsText'],['questionId','revision','selectedIds','correct','stem','options','correctOptionIds']);
    id(r.questionId);str(r.revision,'題目版本',200);ids(r.selectedIds);ids(r.correctOptionIds);if(typeof r.correct!=='boolean')throw Error('判分格式錯誤');str(r.stem,'題幹');if(r.diagramText!==undefined)str(r.diagramText,'圖例文字');
    if(r.diagramRevision!==undefined)str(r.diagramRevision,'圖模型版本',200);if(r.assumptionsText!==undefined)str(r.assumptionsText,'情境前提');
    if(!Array.isArray(r.options)||r.options.length<2||r.options.length>30)throw Error('選項格式錯誤');
    r.options.forEach(o=>{fields(o,['optionId','text','explanation','sourceRefs'],['optionId','text','explanation','sourceRefs']);id(o.optionId);str(o.text,'選項');str(o.explanation,'解析');if(!Array.isArray(o.sourceRefs)||o.sourceRefs.length>50)throw Error('來源格式錯誤');o.sourceRefs.forEach(u=>{str(u,'來源',4096);if(!/^https:\/\/[^\s]+$/.test(u))throw Error('來源只接受 HTTPS');});});
    if(new Set(r.options.map(o=>o.optionId)).size!==r.options.length)throw Error('選項 ID 重複');
    const options=r.options.map(o=>o.optionId);if([...r.selectedIds,...r.correctOptionIds].some(x=>!options.includes(x))||!r.correctOptionIds.length)throw Error('選項 ID 不存在');
    if(A.grade({options:r.options,correctOptionIds:r.correctOptionIds},r.selectedIds)!==r.correct)throw Error('舊題評分摘要不一致');
  }
  function validateEvent(e,course) {
    const common=['id','type','at'];
    const layouts={attempt:['questionId','revision','selectedIds','correct'],flag:['questionId','revision','flag'],read:['lessonId','read'],exam:['sessionId','startedAt','finishedAt','count','correctCount','passCount','passed','sourceContentVersion','siteContentVersion','results']};
    if(!obj(e)||!layouts[e.type])throw Error('未知紀錄類型');fields(e,common.concat(layouts[e.type]),common.concat(layouts[e.type]));id(e.id);time(e.at);
    if(e.type==='attempt'||e.type==='flag') {
      id(e.questionId);str(e.revision,'題目版本',200);
      if(e.type==='flag'){if(typeof e.flag!=='boolean')throw Error('旗標格式錯誤');}
      else {ids(e.selectedIds);if(typeof e.correct!=='boolean')throw Error('判分格式錯誤');const q=course.questions.find(q=>q.questionId===e.questionId&&q.revision===e.revision);if(q&&(e.selectedIds.some(x=>!q.options.some(o=>o.optionId===x))||A.grade(q,e.selectedIds)!==e.correct))throw Error('題目選項或判分不一致');}
    } else if(e.type==='read') {id(e.lessonId);if(typeof e.read!=='boolean')throw Error('閱讀紀錄格式錯誤');}
    else {
      id(e.sessionId);time(e.startedAt);time(e.finishedAt);if(e.finishedAt<e.startedAt||e.at!==e.finishedAt)throw Error('模考時間不一致');
      ['count','correctCount','passCount'].forEach(k=>{if(!Number.isInteger(e[k])||e[k]<0||e[k]>1000)throw Error('模考數值錯誤');});
      if(e.count!==course.exam.count||e.passCount!==course.exam.passCount||e.correctCount>e.count||typeof e.passed!=='boolean'||e.passed!==(e.correctCount>=e.passCount))throw Error('模考門檻或成績不一致');
      str(e.sourceContentVersion,'來源版本',200);str(e.siteContentVersion,'網站版本',200);
      if(!Array.isArray(e.results)||e.results.length!==e.count||new Set(e.results.map(r=>r.questionId)).size!==e.count)throw Error('模考題數或 ID 不一致');
      e.results.forEach(r=>{validateResult(r);const q=course.questions.find(q=>q.questionId===r.questionId&&q.revision===r.revision);const normalized=options=>options.map(o=>({optionId:o.optionId,text:o.text,explanation:o.explanation,sourceRefs:o.sourceRefs||[]})).sort((a,b)=>a.optionId.localeCompare(b.optionId));if(q&&(q.stem!==r.stem||!same(q.correctOptionIds.slice().sort(),r.correctOptionIds.slice().sort())||!same(normalized(q.options),normalized(r.options))))throw Error('目前題目與快照不一致');});
      if(e.results.filter(r=>r.correct).length!==e.correctCount)throw Error('模考總分不一致');
    }
    return e;
  }
  function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(obj(v))return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
  const same=(a,b)=>canonical(a)===canonical(b);
  function mergeEvents(current, incoming) {
    const map=new Map(current.map(e=>[e.id,e]));let added=0,duplicates=0;
    incoming.forEach(e=>{if(map.has(e.id)){if(!same(map.get(e.id),e))throw Error('紀錄 ID 衝突：'+e.id);duplicates++;}else{map.set(e.id,e);added++;}});
    return {events:[...map.values()],added,duplicates};
  }
  function validateImport(text,course,current=[]) {
    const x=safeParse(text);fields(x,['schemaVersion','examId','blueprintVersion','sourceContentVersion','siteContentVersion','exportedAt','events'],['schemaVersion','examId','blueprintVersion','sourceContentVersion','siteContentVersion','exportedAt','events']);
    if(x.schemaVersion!=='1.0')throw Error('不支援此匯入版本');if(x.examId!==course.examId)throw Error('匯入屬於另一個考試');if(x.blueprintVersion!==course.blueprintVersion)throw Error('考綱版本不同');str(x.sourceContentVersion,'來源版本',200);str(x.siteContentVersion,'網站版本',200);time(x.exportedAt);
    if(!Array.isArray(x.events)||x.events.length>100000||x.events.filter(e=>e.type==='attempt').length>50000)throw Error('紀錄數量超過上限');x.events.forEach(e=>validateEvent(e,course));
    const merged=mergeEvents(current,x.events),archived=x.events.filter(e=>(e.type==='attempt'||e.type==='flag')&&!course.questions.some(q=>q.questionId===e.questionId&&q.revision===e.revision)).length;
    return {incoming:x.events,added:merged.added,duplicates:merged.duplicates,archived};
  }
  function exportState(events,course,now=Date.now()) {
    return JSON.stringify({schemaVersion:'1.0',examId:course.examId,blueprintVersion:course.blueprintVersion,sourceContentVersion:course.sourceContentVersion,siteContentVersion:course.siteContentVersion,exportedAt:now,events},null,2);
  }
  class Store {
    constructor(course, storage, onStatus) {this.course=course;this.prefix=course.examId==='ACP-420'?'acp420codex:':'acp120codex:';this.storage=storage;this.onStatus=onStatus||(()=>{});this.events=[];this.memory=[];this.issue='';this.persistent=true;this.load();}
    status(message){this.issue=message;this.onStatus(message);}
    load() {
      const found=[];
      try {
        for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(!key||!key.startsWith(this.prefix)||!(/:(event|batch):/.test(key)))continue;
          try {const raw=safeParse(this.storage.getItem(key));const events=key.includes(':batch:')?raw:[raw];if(!Array.isArray(events))throw Error('批次損毀');events.forEach(e=>validateEvent(e,this.course));mergeEvents(found,events);found.push(...events);}catch(error){this.status('部分紀錄損毀，已保留原值並隔離：'+key.slice(this.prefix.length));}
        }
      } catch(error){this.persistent=false;this.status('瀏覽器無法保存紀錄；目前僅暫存在本分頁，請匯出 JSON。');}
      try{this.events=mergeEvents(found,this.memory).events;}catch(error){this.events=this.memory.slice();this.status('紀錄衝突，保留原始資料；請匯出目前有效紀錄。');}return this.events;
    }
    persist(key,value) {try {if(!this.persistent)throw Error('記憶體模式');this.storage.setItem(this.prefix+key,JSON.stringify(value));return true;}catch(error){this.persistent=false;this.status('紀錄尚未持久保存（儲存被封鎖或額度已滿）；請匯出 JSON。');return false;}}
    append(event) {validateEvent(event,this.course);this.load();const result=mergeEvents(this.events,[event]);if(!result.added)return false;const saved=this.persist('event:'+event.id,event);if(!saved)this.memory.push(event);this.events=result.events;return true;}
    appendAttempt(q,selected,at=Date.now(),eventId=A.uuid()){return this.append({id:eventId,type:'attempt',at,questionId:q.questionId,revision:q.revision,selectedIds:selected.slice(),correct:A.grade(q,selected)});}
    setFlag(q,flag){return this.append({id:A.uuid(),type:'flag',at:Date.now(),questionId:q.questionId,revision:q.revision,flag});}
    markRead(lessonId,read=true){return this.append({id:A.uuid(),type:'read',at:Date.now(),lessonId,read});}
    import(preview) {this.load();const merged=mergeEvents(this.events,preview.incoming);if(!merged.added)return {saved:this.persistent,...merged};const incoming=preview.incoming.filter(e=>!this.events.some(x=>x.id===e.id));const saved=this.persist('batch:'+A.uuid(),incoming);if(!saved)this.memory.push(...incoming);this.events=merged.events;return {saved,...merged};}
    flags(){const last=new Map();this.events.filter(e=>e.type==='flag').sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id)).forEach(e=>last.set(e.questionId+'@'+e.revision,e.flag));return last;}
    export(){return exportState(this.events,this.course);}
  }
  Object.assign(A,{safeParse,validateEvent,validateImport,exportState,mergeEvents,canonical,Store});root.ACP=A;if(typeof module!=='undefined'&&module.exports)module.exports=A;
})(typeof window!=='undefined'?window:globalThis);
