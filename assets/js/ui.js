(function(root){
  'use strict';const A=root.ACP||(typeof require==='function'?require('./core.js'):{});
  function el(tag,text,attrs={}) {const n=root.document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=text;for(const [k,v]of Object.entries(attrs)){if(k==='class')n.className=v;else if(k==='checked')n.checked=v;else n.setAttribute(k,String(v));}return n;}
  function button(text,fn,id){const b=el('button',text,{type:'button',...(id?{id}:{})});b.addEventListener('click',fn);return b;}
  function mountCommon(store) {
    const doc=root.document,media=root.matchMedia('(prefers-color-scheme: dark)'),theme=doc.getElementById('theme-control');let mode='system';
    try{const saved=store.storage.getItem(store.prefix+'theme');if(['system','light','dark'].includes(saved))mode=saved;}catch(error){}
    const apply=()=>{doc.documentElement.dataset.theme=A.resolveTheme(mode,media.matches);doc.documentElement.style.colorScheme=A.resolveTheme(mode,media.matches);if(theme)theme.value=mode;};
    if(theme)theme.addEventListener('change',()=>{mode=['system','light','dark'].includes(theme.value)?theme.value:'system';try{store.storage.setItem(store.prefix+'theme',mode);}catch(error){}apply();});
    media.addEventListener('change',()=>{if(mode==='system')apply();});apply();
    const toggle=doc.getElementById('nav-toggle'),drawer=doc.getElementById('nav-drawer');
    if(toggle&&drawer){
      const narrow=root.matchMedia('(max-width: 767px)');
      const focusables=()=>Array.from(drawer.querySelectorAll('a[href],button,select,input,[tabindex="0"]')).filter(n=>!n.disabled&&n.getClientRects().length);
      const close=()=>{if(!narrow.matches)return;drawer.hidden=true;drawer.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.focus();};
      const open=()=>{drawer.hidden=false;drawer.classList.add('is-open');toggle.setAttribute('aria-expanded','true');(focusables()[0]||drawer).focus();};
      toggle.addEventListener('click',()=>toggle.getAttribute('aria-expanded')==='true'?close():open());
      drawer.addEventListener('keydown',e=>{if(!narrow.matches)return;if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const xs=focusables();if(!xs.length){e.preventDefault();return;}if(e.shiftKey&&doc.activeElement===xs[0]){e.preventDefault();xs[xs.length-1].focus();}else if(!e.shiftKey&&doc.activeElement===xs[xs.length-1]){e.preventDefault();xs[0].focus();}}});
      drawer.addEventListener('click',e=>{if(e.target.closest('a[href]'))close();});
      const layout=()=>{drawer.hidden=narrow.matches;drawer.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');};narrow.addEventListener('change',layout);layout();
    }
    doc.querySelectorAll('[data-mark-read]').forEach(b=>{const update=()=>{const id=b.dataset.markRead;const entries=store.events.filter(e=>e.type==='read'&&e.lessonId===id).sort((a,c)=>a.at-c.at||a.id.localeCompare(c.id));const read=entries.length&&entries[entries.length-1].read;b.textContent=read?'已讀過此節 ✓':'標記已讀';b.setAttribute('aria-pressed',read?'true':'false');};b.addEventListener('click',()=>{store.markRead(b.dataset.markRead,b.getAttribute('aria-pressed')!=='true');update();});update();});
    doc.querySelectorAll('.diagram-interactive').forEach(host=>{
      const frames=Array.from(host.querySelectorAll('.diagram-step'));if(!frames.length)return;let index=0;
      const render=()=>{frames.forEach((f,i)=>{f.hidden=i!==index;f.setAttribute('aria-hidden',i===index?'false':'true');});const result=host.querySelector('[data-step-status]');if(result)result.textContent='步驟 '+(index+1)+' / '+frames.length;host.querySelectorAll('[data-step="prev"]').forEach(b=>b.disabled=index===0);host.querySelectorAll('[data-step="next"]').forEach(b=>b.disabled=index===frames.length-1);};
      host.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>{const kind=b.dataset.step;index=kind==='prev'?Math.max(0,index-1):kind==='next'?Math.min(frames.length-1,index+1):0;render();}));render();
    });
  }
  function diagram(question,container){const templates=root.document.querySelectorAll('template[data-question-diagram]');for(const t of templates){if(t.dataset.questionDiagram===question.questionId&&t.dataset.questionRevision===question.revision&&question.diagramRevision&&t.dataset.questionDiagramRevision===question.diagramRevision){container.append(t.content.cloneNode(true));return;}}if(question.diagram||question.diagramText){container.append(el('p',question.diagramText||A.diagramText(question.diagram)||'本題圖例請參考課文中的靜態說明。',{class:'diagram-description'}));}}
  function renderQuestion(q, container, selected=[], disabled=false) {
    container.replaceChildren();const card=el('article',null,{class:'question-card'});card.append(el('p',q.objectiveIds.join(' · ')+' · '+q.questionId,{class:'question-meta'}),el('h2',q.stem),el('p',q.selectionInstruction||('Select '+q.selectCount+' option(s).')));
    const assumptions=q.assumptionsText||A.assumptionsText(q.assumptions);if(assumptions){const note=el('section',null,{class:'question-assumptions note'});note.append(el('h3','Scenario assumptions'),el('p',assumptions));card.append(note);}diagram(q,card);
    const field=el('fieldset',null,{class:'options'});field.append(el('legend','作答選項'));
    q.options.forEach((o,i)=>{const label=el('label',null,{class:'option'}),input=el('input',null,{type:q.answerMode==='single'?'radio':'checkbox',name:'question-'+q.questionId,value:o.optionId,checked:selected.includes(o.optionId)});input.disabled=disabled;label.append(input,el('span',String.fromCharCode(65+i)+'. '+o.text));field.append(label);});card.append(field);container.append(card);return card;
  }
  function selectedIds(container){return Array.from(container.querySelectorAll('input:checked')).map(n=>n.value);}
  function renderFeedback(q,selected,container){
    const correct=A.grade(q,selected),host=el('section',null,{class:'feedback',tabindex:'-1'});host.append(el('h3',correct?'回答正確':'回答未完全正確',{class:correct?'correct':'incorrect'}));
    if(q.overallExplanation)host.append(el('p',q.overallExplanation));
    q.options.forEach((o,i)=>{const row=el('div',null,{class:'option-explanation'});row.append(el('h4',String.fromCharCode(65+i)+'. '+o.text+(q.correctOptionIds.includes(o.optionId)?'（正確選項）':'（不正確選項）')),el('p',o.explanation));const refs=el('ul',null,{class:'source-links'});(o.sourceRefs||[]).forEach((url,j)=>{if(!/^https:\/\/[^\s]+$/.test(url))return;const item=el('li'),a=el('a','官方來源 '+(j+1),{href:url,target:'_blank',rel:'noopener noreferrer'});item.append(a);refs.append(item);});row.append(refs);host.append(row);});container.append(host);return host;
  }
  function mountTransfer(host,store,onImport){
    const panel=el('section',null,{class:'study-transfer'});panel.append(el('h2','保存與匯入學習紀錄'),el('p','紀錄只保存在此瀏覽器。匯出含已完成模考與學習紀錄；不包含正在作答的模考。請定期保存 JSON。'));
    const actions=el('div',null,{class:'button-row'});actions.append(button('匯出 JSON',()=>{store.load();const blob=new Blob([store.export()],{type:'application/json'}),url=root.URL.createObjectURL(blob),a=el('a',null,{href:url,download:store.course.slug+'-study-'+new Date().toISOString().slice(0,10)+'.json'});a.click();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);},'study-export'));
    const input=el('input',null,{id:'study-import-input',type:'file',accept:'.json,application/json'}),label=el('label','選擇要合併的 JSON',{for:'study-import-input'}),status=el('p','尚未選擇檔案',{role:'status'});let preview=null;
    const confirm=button('確認合併',()=>{if(!preview)return;try{const result=store.import(preview);status.textContent='已合併 '+result.added+' 筆；'+(result.saved?'已保存在瀏覽器。':'僅暫存在本分頁，請立即匯出。');preview=null;confirm.disabled=true;if(onImport)onImport();}catch(error){status.textContent='未匯入：'+error.message;confirm.disabled=true;}},'study-import-confirm');confirm.disabled=true;
    input.addEventListener('change',async()=>{preview=null;confirm.disabled=true;const f=input.files[0];if(!f)return;try{if(f.size>5242880)throw Error('檔案超過 5 MiB');store.load();preview=A.validateImport(await f.text(),store.course,store.events);status.textContent='預覽：新增 '+preview.added+' 筆、重複 '+preview.duplicates+' 筆、舊版封存 '+preview.archived+' 筆。確認後才會合併。';confirm.disabled=false;}catch(error){status.textContent='未匯入：'+error.message;}});
    actions.append(label,input,confirm);panel.append(actions,status);host.append(panel);
  }
  Object.assign(A,{el,button,mountCommon,renderQuestion,selectedIds,renderFeedback,mountTransfer});root.ACP=A;if(typeof module!=='undefined'&&module.exports)module.exports=A;
})(typeof window!=='undefined'?window:globalThis);
