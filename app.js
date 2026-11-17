(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { view:'latest', topic:'all', query:'', period:'all', order:'newest', hideWatched:false };
  let data = JSON.parse($('snapshot').textContent);
  const storageKey = 'my-video-radar-v1';
  let local = { saved:[], watched:[] };
  try { local = { ...local, ...JSON.parse(localStorage.getItem(storageKey) || '{}') }; } catch (_) {}
  const persist = () => { try { localStorage.setItem(storageKey,JSON.stringify(local)); } catch(_) {} };
  const clean = s => String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const videoUrl = id => /^[\w-]{11}$/.test(id||'') ? 'https://www.youtube.com/watch?v='+id : '';
  const channelUrl = id => /^UC[\w-]{22}$/.test(id||'') ? 'https://www.youtube.com/channel/'+id : '';
  const toMillis = s => Date.parse(s||'') || 0;
  const relative = s => {let delta=Date.now()-toMillis(s);if (!toMillis(s))return 'Date unknown';if(delta<0)return 'Upcoming';if(delta<3600000)return `${Math.max(1,Math.floor(delta/60000))}m ago`;if(delta<86400000)return `${Math.floor(delta/3600000)}h ago`;if(delta<604800000)return `${Math.floor(delta/86400000)}d ago`;if(delta<2592000000)return `${Math.floor(delta/604800000)}w ago`;return `${Math.floor(delta/2592000000)}mo ago`;};
  const displayDate = v => {
    if(!v.published)return 'Date not available';
    const dt=new Date(v.published);
    if(Number.isNaN(+dt))return 'Date not available';
    let opts={timeZone:'Australia/Adelaide',day:'numeric',month:'short',year:'numeric'};
    if(v.precision !== 'day')opts={...opts,hour:'numeric',minute:'2-digit'};
    return new Intl.DateTimeFormat('en-AU',opts).format(dt)+(v.precision==='day'?' · day only':'');
  };
  const normal = s => String(s||'').toLocaleLowerCase();
  const includesQuery = (v,q) => normal([v.title,v.channel,v.topic].join(' ')).includes(q);
  const latestPerChannel = () => {
    const results = new Map();
    for(const v of data.subscriptions||[]) {
      if(v.origin!=='subscribed')continue;
      const old=results.get(normal(v.channel));
      if(!old || toMillis(v.published)>toMillis(old.published))results.set(normal(v.channel),v);
    }
    return results;
  };
  const isTopic = (v,t) => {
    if(!t || t.id==='all') return true;
    const hay=normal([v.title,v.topic].join(' '));
    const k=t.keywords||[];
    if(t.id==='ai')return /\bai\b|artificial intelligence|chatgpt|claude|gemini|automation|agent|qwen/i.test(hay);
    if(t.id==='ai-agents' && /agent|automation|n8n|workflow/i.test(hay))return true;
    if(t.id==='ai-business' && /ai.*(agency|business|clients|income|websites)|business.*ai/i.test(hay))return true;
    return k.some(x=>hay.includes(normal(x))) || normal(v.topic).includes(normal(t.name));
  };
  const allTopics = () => [{id:'all',name:'All topics'},...(data.niches||[])];
  const topicObject = () => allTopics().find(n=>n.id===state.topic) || allTopics()[0];
  function renderNav() {
    for(const el of document.querySelectorAll('[data-view]'))el.classList.toggle('active',el.dataset.view===state.view);
    const nSubs=(data.subscriptions||[]).filter(x=>x.origin==='subscribed').length;
    $('nav-latest-count').textContent=nSubs;
    $('nav-channel-count').textContent=(data.channels||[]).length;
    $('nav-topic-count').textContent=(data.niches||[]).length;
    $('nav-saved-count').textContent=local.saved.length;
    $('sidebar-topics').innerHTML=(data.niches||[]).map(n=>`<button class="topic-link ${state.view==='discover'&&state.topic===n.id?'active':''}" data-topic="${clean(n.id)}">${clean(n.name)}</button>`).join('');
  }
  function renderStats() {
    $('stat-channels').textContent=(data.channels||[]).length;
    $('stat-verified').textContent=(data.channels||[]).filter(x=>x.channel_id).length;
    $('stat-videos').textContent=(data.subscriptions||[]).length;
    $('stat-topics').textContent=(data.niches||[]).length;
    $('generated').textContent='Last data update: '+(data.generated_at ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.generated_at)) : 'not available');
    const attempted = data.last_attempt_at ? new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.last_attempt_at)):'not yet';
    $('sync-status').textContent='Last checked: '+attempted;
  }
  function renderTopics() {
    $('topic-pills').hidden=state.view!=='discover';
    $('topic-pills').innerHTML=allTopics().map(n=>`<button class="topic-pill ${state.topic===n.id?'active':''}" data-topic="${clean(n.id)}">${clean(n.name)}</button>`).join('');
  }
  function itemsForView(){
    let arr=(data.subscriptions||[]).filter(x=>videoUrl(x.id));
    if(state.view==='latest')arr=arr.filter(v=>v.origin==='subscribed');
    if(state.view==='saved')arr=arr.filter(v=>local.saved.includes(v.id));
    if(state.view==='discover')arr=arr.filter(v=>isTopic(v,topicObject()));
    if(state.hideWatched)arr=arr.filter(v=>!local.watched.includes(v.id));
    if(state.period!=='all')arr=arr.filter(v=>Date.now()-toMillis(v.published)<=Number(state.period)*86400000&&Date.now()-toMillis(v.published)>=-86400000);
    if(state.query.trim())arr=arr.filter(v=>includesQuery(v,normal(state.query.trim())));
    arr.sort((a,b)=>state.order==='channel'?a.channel.localeCompare(b.channel):state.order==='oldest'?toMillis(a.published)-toMillis(b.published):toMillis(b.published)-toMillis(a.published));
    return arr;
  }
  function videoRow(v){
    const saved=local.saved.includes(v.id),watched=local.watched.includes(v.id);
    return `<article class="entry"><div class="entry-date">${clean(displayDate(v))}<small>${clean(relative(v.published))}</small></div><div class="entry-main"><h3 class="entry-title"><a href="${videoUrl(v.id)}" data-watch="${clean(v.id)}" target="_blank" rel="noopener noreferrer">${clean(v.title)}</a></h3><div class="entry-channel">${clean(v.channel)}${v.origin==='niche'?'<span class="kind">Topic discovery</span>':''}${watched?'<span class="kind">Watched</span>':''}</div></div><div class="entry-actions"><button class="mini-action ${saved?'selected':''}" data-save="${clean(v.id)}" title="${saved?'Remove saved video':'Save for later'}" aria-label="${saved?'Remove from saved':'Save'}">${saved?'★':'☆'}</button><a class="watch" href="${videoUrl(v.id)}" data-watch="${clean(v.id)}" target="_blank" rel="noopener noreferrer">▶ Watch</a></div></article>`;
  }
  function channelRow(c,byChannel){
    const video=byChannel.get(normal(c.name));
    let url=channelUrl(c.channel_id);
    let goto=url||'https://www.youtube.com/results?search_query='+encodeURIComponent(c.name);
    return `<article class="channel-entry"><div><h3>${clean(c.name)}</h3><p>${video?clean(video.title):'Channel identity / latest upload not yet verified'}</p></div><span class="channel-status ${url?'':'pending'}">${url?'● Matched':'◌ Pending'}</span><a class="channel-link" href="${goto}" target="_blank" rel="noopener noreferrer">${url?'View channel ↗':'Find on YouTube ↗'}</a></article>`;
  }
  function render(){
    renderNav(); renderStats(); renderTopics();
    let title={latest:'Latest videos',channels:'My subscribed channels',discover:'Discover by topic',saved:'Saved for later'}[state.view];
    let subtitles={latest:'New video titles from matched channels. No thumbnails or distractions.',channels:'Your complete list of channels, including those still awaiting a confirmed ID.',discover:'Explore niche collections drawn from subscribed uploads and YouTube searches.',saved:'Your personal watchlist, saved only on this browser.'};
    $('view-title').textContent=title;$('view-eyebrow').textContent=state.view==='discover'?'DISCOVERY COLLECTIONS':state.view==='channels'?'CHANNEL DIRECTORY':state.view==='saved'?'YOUR WATCHLIST':'YOUR SUBSCRIPTIONS';$('view-desc').textContent=subtitles[state.view];
    $('period-wrap').style.display=state.view==='channels'?'none':'';
    $('search').placeholder=state.view==='channels'?'Search channel names…':'Search video titles or channels…';
    let q=state.query|| (state.view==='discover'?topicObject().query:'');
    $('search-youtube').href='https://www.youtube.com/results?search_query='+encodeURIComponent(q||'latest videos')+'&sp=CAI%3D';
    let alert='';
    const verified=(data.channels||[]).filter(x=>x.channel_id).length;
    if(verified<(data.channels||[]).length && state.view!=='saved')alert=`${verified} of ${data.channels.length} channels are matched to verified IDs. The others remain visible in My 99 channels. To match them automatically, add a YouTube API key as a GitHub Actions secret.`;
    const h=data.health||{};
    if(h.note&&h.note.toLowerCase().includes('error'))alert+=` ${h.note}`;
    $('alert').hidden=!alert;$('alert').textContent=alert;
    if(state.view==='channels'){
      const byChannel=latestPerChannel(); let chans=[...(data.channels||[])].filter(c=>normal(c.name).includes(normal(state.query))).sort((a,b)=>a.name.localeCompare(b.name));
      $('result-count').textContent=`${chans.length} channels · ${verified} matched · ${(data.channels||[]).length-verified} awaiting verification`;
      $('results').innerHTML=chans.length?chans.map(c=>channelRow(c,byChannel)).join(''):'<div class="empty"><b>No channels match your search</b>Try a shorter name.</div>';
      return;
    }
    const videos=itemsForView();
    $('result-count').textContent=videos.length+' video'+(videos.length===1?'':'s')+' found'+(state.view==='discover'&&state.topic!=='all'?' · '+topicObject().name:'');
    $('results').innerHTML=videos.length?videos.map(videoRow).join(''):'<div class="empty"><b>No videos found</b>Try a different keyword or date range. You can also search all YouTube above.</div>';
  }
  async function loadRemote(){
    if(location.protocol==='file:')return;
    try {const res=await fetch('data/index.json?reload='+Date.now(),{cache:'no-store'});if(!res.ok)throw new Error('HTTP '+res.status);const d=await res.json();if(!Array.isArray(d.channels)||!Array.isArray(d.subscriptions))throw new Error('Invalid index data');data=d;render();}
    catch(e){$('sync-status').textContent='Showing last saved snapshot';$('alert').hidden=false;$('alert').textContent='Automatic data update could not be loaded. Showing the built-in snapshot.';}
  }
  for(const button of document.querySelectorAll('[data-view]')) button.addEventListener('click',()=>{state.view=button.dataset.view;state.query='';$('search').value='';render();});
  document.addEventListener('click',e=>{
    const tp=e.target.closest('[data-topic]');if(tp){state.view='discover';state.topic=tp.dataset.topic;state.query='';$('search').value='';render();return;}
    const save=e.target.closest('[data-save]');if(save){const id=save.dataset.save;local.saved=local.saved.includes(id)?local.saved.filter(x=>x!==id):[...local.saved,id];persist();render();return;}
    const watched=e.target.closest('[data-watch]');if(watched){const id=watched.dataset.watch;if(!local.watched.includes(id)){local.watched.push(id);persist();setTimeout(render,150);}}
  });
  $('search').addEventListener('input',e=>{state.query=e.target.value;render();});
  $('period').addEventListener('change',e=>{state.period=e.target.value;render();});
  $('order').addEventListener('change',e=>{state.order=e.target.value;render();});
  $('hide-watched').addEventListener('change',e=>{state.hideWatched=e.target.checked;render();});
  $('refresh-button').addEventListener('click',()=>loadRemote());
  render();loadRemote();
})();
