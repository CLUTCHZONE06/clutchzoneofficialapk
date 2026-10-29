(function(){
'use strict';
const C=window.CLUTCH_CONFIG||{},$=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let db=window.CLUTCH_SUPABASE||null;if(!db&&window.supabase&&C.SUPABASE_URL?.startsWith('https://')&&!C.SUPABASE_URL.includes('YOUR_')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.includes('YOUR_')){db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);window.CLUTCH_SUPABASE=db;}
function toast(m){let t=$('#toast');if(t){t.textContent=m;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}}
function header(){const back=$('#backButton');if(back)back.onclick=()=>{try{if(history.length>1&&document.referrer&&new URL(document.referrer).origin===location.origin){history.back();return}}catch{}location.href='index.html'};document.querySelectorAll('.clickable-section').forEach(el=>{const go=()=>location.href=el.dataset.go;el.addEventListener('click',e=>{if(e.target.closest('a,button,input,select,textarea'))return;go()});el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})});let b=$('#menu'),n=$('#links');if(b&&n)b.onclick=()=>n.classList.toggle('open')}
async function ensureApkDownloadWorker(){
 try{
  if(!('serviceWorker' in navigator)||location.protocol==='file:')return null;
  const swUrl=new URL('download-sw.js?v=70',location.href);
  const scope=new URL('./',location.href).pathname;
  const reg=await navigator.serviceWorker.register(swUrl.href,{scope});
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller){
   await new Promise(resolve=>{
    const done=()=>{navigator.serviceWorker.removeEventListener('controllerchange',done);resolve()};
    navigator.serviceWorker.addEventListener('controllerchange',done,{once:true});
    setTimeout(done,2500);
   });
  }
  return reg;
 }catch(err){console.warn('APK download worker unavailable:',err);return null}
}
async function streamMultipartApk(urls,fileName,size,partSize=0,totalParts=0,token=''){
 if(!Array.isArray(urls)||!urls.length)throw new Error('APK download source nahi mila.');
 const reg=await ensureApkDownloadWorker();
 const worker=navigator.serviceWorker.controller||reg?.active||reg?.waiting;
 if(!worker)throw new Error('Chrome download service ready nahi hua. Page ko ek baar refresh karke retry karein.');
 const session=token||('apk-'+crypto.randomUUID());
 await new Promise((resolve,reject)=>{
  let settled=false;
  const done=(ok,err)=>{if(settled)return;settled=true;navigator.serviceWorker.removeEventListener('message',onMessage);ok?resolve():reject(new Error(err||'APK prepare failed.'))};
  const onMessage=e=>{const d=e.data||{};if(d.type!=='CZ_APK_STAGE_PROGRESS'||d.token!==session)return;if(d.error)return done(false,d.error);if(d.done&&Number(d.loaded)===Number(d.total||size))done(true)};
  navigator.serviceWorker.addEventListener('message',onMessage);
  worker.postMessage({type:'CZ_STAGE_APK',token:session,urls,fileName,size:Number(size)||0,partSize:Number(partSize)||0,totalParts:Number(totalParts)||urls.length,mime:'application/vnd.android.package-archive'});
  setTimeout(()=>done(false,'APK prepare timeout. Please retry once.'),15*60*1000);
 });
 const downloadUrl=new URL(`__clutch_zone_apk_download__?token=${encodeURIComponent(session)}`,reg.scope).href;
 // Navigate the current tab to the same-origin Service Worker download endpoint.
 // Chrome handles the attachment response as a real file download; this is more
 // reliable than window.open(), which can create a blank tab / popup-blocked tab.
 toast('APK Chrome download start ho raha hai…');
 location.href=downloadUrl;
}

function getPlayerLocal(k){try{const v=localStorage.getItem(k);if(v)return v}catch{};try{const m=document.cookie.match(new RegExp('(?:^|; )'+encodeURIComponent(k)+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}catch{return ''}}
function savePlayerLocal(k,v){try{localStorage.setItem(k,v)}catch{};try{document.cookie=encodeURIComponent(k)+'='+encodeURIComponent(v)+'; max-age=31536000; path=/; SameSite=Lax'}catch{}}
function savedPlayer(){
 try{
  const uid=getPlayerLocal('cz-support-uid'),name=getPlayerLocal('cz-support-name');
  return uid?{uid:String(uid).trim().toUpperCase(),name:name||'Player',id:getPlayerLocal('cz-support-id')||''}:null;
 }catch{return null}
}
function openDownloadIdentity(row){
 const modal=$('#downloadIdentityModal');
 if(!modal)return;
 modal.classList.add('open');
 modal.dataset.rowId=row?.id||'';
 const old=savedPlayer();
 if(old){$('#downloadPlayerName').value=old.name||'';$('#downloadPlayerUid').value=old.uid||''}
 setTimeout(()=>$('#downloadPlayerName')?.focus(),80);
}
function closeDownloadIdentity(){$('#downloadIdentityModal')?.classList.remove('open')}
async function saveDownloadIdentity(name,uid){
 if(!db)throw new Error('Supabase config check karo.');
 const {data,error}=await db.rpc('register_support_user',{p_display_name:name,p_uid:uid});
 if(error)throw error;
 const row=data?.[0];
 if(!row)throw new Error('Registration response nahi mila.');
 const user={id:row.result_id,name:row.result_name||name,uid:String(row.result_uid||uid).trim().toUpperCase()};
 savePlayerLocal('cz-support-uid',user.uid);
 savePlayerLocal('cz-support-name',user.name);
 savePlayerLocal('cz-support-id',user.id);
 return user;
}
async function startApkDownload(row){
 if(!row){toast('APK abhi available nahi hai.');return}
 const urls=Array.isArray(row.part_urls)?row.part_urls.filter(Boolean):[];
 const fileName=row.file_name||`${String(row.title||'clutch-zone').replace(/[^a-z0-9._-]+/gi,'-')}.apk`;
 try{
  if(urls.length>1){
   toast('APK Chrome download ready ho raha hai…');
   await streamMultipartApk(urls,fileName,row.original_file_size_bytes||row.file_size_bytes||null,row.part_size_bytes||0,row.total_parts||urls.length,`apk-${String(row.id||row.version||row.file_name||'latest')}`);
   return;
  }
  const url=urls[0]||row.download_url;
  if(!url){toast('APK download link nahi mila.');return}
  toast('APK Chrome download start ho raha hai…');
  // Do not fetch/Blob the APK here. Navigating to the real file URL lets
  // Chrome handle the download natively and keeps the APK out of page memory.
  const a=document.createElement('a');let downloadUrl=url;try{const u=new URL(url,location.href);if(/supabase\.co|supabase\.in/i.test(u.hostname)){u.searchParams.set('download',fileName);downloadUrl=u.toString()}}catch{}a.href=downloadUrl;a.download=fileName;a.rel='noopener';a.style.display='none';
  document.body.appendChild(a);a.click();a.remove();
  toast('APK Chrome Downloads me start ho gaya ✓');
 }catch(err){console.error(err);toast(err?.message||'APK download failed');}
}
function setupApkLink(a,row){if(!a)return;a.href='download.html?autostart=1';a.onclick=e=>{e.preventDefault();location.href='download.html?autostart=1'};}
async function getActiveApk(){
 if(!db)return null;
 const {data,error}=await db.from('apk_downloads').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1);
 if(error){console.error('APK load:',error);toast('APK load nahi hua.');return null}
 return data?.[0]||null;
}
async function load(){if(!db)return;let p=document.body.dataset.page;if(['home','matches','category-matches'].includes(p)){let r=await db.from('public_match_schedule').select('*').order('match_date',{ascending:true});if(r.error){console.error('Match load:',r.error);const el=$(p==='home'?'#matchPreview':'#matchGrid');if(el)el.innerHTML=`<div class="notice">Match schedule load nahi hua: ${esc(r.error.message)}</div>`}else if(p==='matches'){await initMatchHub(r.data||[])}else if(p==='category-matches'){await initCategoryMatches(r.data||[])}else paintMatches(r.data||[],'#matchPreview',3)}if(['home','social'].includes(p)){let r=await db.from('social_links').select('*').eq('is_visible',true).order('created_at',{ascending:false});if(r.error){console.error('Social load:',r.error);const el=$(p==='home'?'#socialPreview':'#socialGrid');if(el)el.innerHTML=`<div class="notice">Social links load nahi hue: ${esc(r.error.message)}</div>`}else paintSocial(r.data||[],p==='home'?'#socialPreview':'#socialGrid')}if(['home','matches','category-matches'].includes(p)){let r=await db.from('apk_downloads').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1);if(r.data?.[0]){$$('[data-apk]').forEach(a=>setupApkLink(a,r.data[0]));$$('[data-version]').forEach(a=>a.textContent='VERSION '+(r.data[0].version||''))}}if(p==='home'){paintGroupPreview([], '#groupPreview')}}
async function initMatchHub(matches){
 const grid=$('#matchCategoryGrid');
 let categories=[];
 const cr=await db.from('match_categories').select('*').eq('is_visible',true).order('sort_order',{ascending:true}).order('created_at',{ascending:true});
 if(!cr.error)categories=cr.data||[]; else console.warn('Category load:',cr.error);
 if(grid)grid.innerHTML=categories.length?categories.map(c=>{const img=mediaPublicUrl(c.image_url);const count=matches.filter(m=>String(m.category_id||'')===String(c.id)).length;return `<a class="mode-card" href="category-matches.html?id=${encodeURIComponent(c.id)}">${img?`<img src="${esc(img)}" alt="${esc(c.name)}" loading="lazy">`:`<div class="mode-art">CZ</div>`}<span class="mode-overlay"></span><span class="mode-content"><small>TOURNAMENT SECTION</small><b>${esc(c.name)}</b><em>${count} MATCH${count===1?'':'ES'} • OPEN SECTION →</em></span></a>`}).join(''):'<div class="empty">Admin panel se Match Sections add karo.</div>';
}
async function initCategoryMatches(matches){
 const id=new URLSearchParams(location.search).get('id');
 if(!id){location.href='matches.html';return}
 const cr=await db.from('match_categories').select('*').eq('id',id).eq('is_visible',true).maybeSingle();
 if(cr.error||!cr.data){const g=$('#matchGrid');if(g)g.innerHTML='<div class="empty">Ye section available nahi hai.</div>';return}
 const c=cr.data, rows=matches.filter(m=>String(m.category_id||'')===String(id));
 const t=$('#categoryTitle'),d=$('#categoryDescription'),n=$('#categoryCount'),iw=$('#categoryImageWrap');
 if(t)t.textContent=c.name||'Tournament Section'; if(d)d.textContent=`${c.name||'Is section'} ke saare active tournament matches yahan milenge.`; if(n)n.textContent=`${rows.length} MATCH${rows.length===1?'':'ES'}`;
 const img=mediaPublicUrl(c.image_url); if(iw)iw.innerHTML=img?`<img src="${esc(img)}" alt="${esc(c.name)}">`:`<div class="mode-art" style="position:relative;height:220px;border-radius:20px">CZ</div>`;
 document.title=`${c.name||'Tournaments'} | Clutch Zone`; paintMatches(rows,'#matchGrid',99);
}
function paintMatches(rows,target,n){let el=$(target);if(!el)return;rows=(rows||[]).slice(0,n);el.innerHTML=rows.length?rows.map(r=>{let stamp=r.match_date?new Date(r.match_date).getTime():0;let valid=Number.isFinite(stamp)&&stamp>0;let image=mediaPublicUrl(r.match_image_url);let countdown=valid&&stamp>Date.now()?`<div class="countdown match-countdown" data-match-start="${stamp}"><span class="countdown-label">MATCH STARTS IN</span><strong>--:--:--</strong><small>Match start hone tak live countdown.</small></div>`:valid?`<div class="countdown ready"><span class="countdown-label">MATCH STATUS</span><strong>${esc(r.status||'LIVE')}</strong><small>Match time aa chuka hai.</small></div>`:`<div class="countdown"><span class="countdown-label">MATCH STARTS IN</span><strong>TBA</strong><small>Date & time admin panel se set karein.</small></div>`;return `<article class="card match-card">${image?`<img class="card-img" src="${esc(image)}" alt="${esc(r.title)}" loading="lazy" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('div'),{className:'match-placeholder',innerHTML:'<span>IMAGE UNAVAILABLE</span><b>${esc(r.game_mode||'FREE FIRE')}</b><small>TOURNAMENT</small>'}))">`:`<div class="match-placeholder"><span>IMAGE UNAVAILABLE</span><b>${esc(r.game_mode||'FREE FIRE')}</b><small>TOURNAMENT</small></div>`}<div class="body"><div class="match-topline"><span class="pill">${esc(r.status||'UPCOMING')}</span><span class="mode-chip">${esc(r.game_mode||'Free Fire')}</span></div><h3>${esc(r.title||'Tournament')}</h3><div class="match-datetime"><div><span>DATE</span><b>${esc(valid?new Date(stamp).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}):'TBA')}</b></div><div><span>TIME</span><b>${esc(valid?new Date(stamp).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'TBA')}</b></div></div><div class="prize-row tournament-stats"><div><small>ENTRY FEE</small><b>₹${esc(r.entry_fee??0)}</b></div><div><small>PRIZE POOL</small><b>₹${esc(r.prize_pool??0)}</b></div><div><small>TOTAL PLAYER</small><b>${esc(r.total_players??'—')}</b></div><div><small>PER KILL</small><b>₹${esc(r.per_kill_reward??0)}</b></div></div>${countdown}<a class="btn gold match-download" href="index.html#download-top">DOWNLOAD APK ↓</a>${r.description?`<p>${esc(r.description)}</p>`:''}</div></article>`}).join(''):(target==='#matchPreview'?'':'<div class="empty">Abhi koi match schedule nahi hai.</div>');startCountdowns(el)}
function startCountdowns(root){const update=()=>{root.querySelectorAll('[data-match-start]').forEach(box=>{let left=Number(box.dataset.matchStart)-Date.now();let strong=box.querySelector('strong');if(!strong)return;if(left<=0){box.removeAttribute('data-match-start');box.classList.add('ready');strong.textContent='MATCH STARTED';return}let total=Math.floor(left/1000),d=Math.floor(total/86400),h=Math.floor(total%86400/3600),m=Math.floor(total%3600/60),s=total%60;strong.textContent=(d?String(d).padStart(2,'0')+':':'')+[h,m,s].map(x=>String(x).padStart(2,'0')).join(':')})};update();if(root._countdownTimer)clearInterval(root._countdownTimer);root._countdownTimer=setInterval(update,1000)}
function videoSource(raw){
 let u=(raw||'').trim();if(!u)return null;
 try{
  let x=new URL(u),host=x.hostname.replace(/^www\./,'');
  if(host==='youtu.be'||host.endsWith('youtube.com')||host.endsWith('youtube-nocookie.com')){
   let id='',portrait=false;
   if(host==='youtu.be')id=x.pathname.split('/').filter(Boolean)[0]||'';
   else if(x.pathname.startsWith('/shorts/')){id=x.pathname.split('/')[2]||'';portrait=true}
   else if(x.pathname.startsWith('/embed/'))id=x.pathname.split('/')[2]||'';
   else id=x.searchParams.get('v')||'';
   if(id)return {kind:'iframe',src:`https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0`,portrait};
  }
  if(host.endsWith('vimeo.com')){
   let id=x.pathname.split('/').filter(Boolean).find(v=>/^\d+$/.test(v));
   if(id)return {kind:'iframe',src:`https://player.vimeo.com/video/${id}?autoplay=1`,portrait:false};
  }
  if(host==='drive.google.com'){
   let m=x.pathname.match(/\/file\/d\/([^/]+)/),id=m?.[1]||x.searchParams.get('id');
   if(id)return {kind:'iframe',src:`https://drive.google.com/file/d/${encodeURIComponent(id)}/preview`,portrait:false};
  }
  if(host.endsWith('dropbox.com')){
   let dl=new URL(u);dl.searchParams.set('raw','1');return {kind:'video',src:dl.toString(),portrait:null};
  }
  if(/\.(mp4|webm|ogg|m4v)(\?|$)/i.test(x.pathname+x.search))return {kind:'video',src:u,portrait:null};
  return {kind:'iframe',src:u,portrait:false};
 }catch{return null}
}
function ensureVideoModal(){if($('#videoModal'))return;document.body.insertAdjacentHTML('beforeend','<div class="video-modal" id="videoModal" aria-hidden="true"><div class="video-modal-box"><button class="video-close" type="button" aria-label="Close video">×</button><div class="video-stage" id="videoStage"></div><div class="video-modal-title" id="videoModalTitle"></div></div></div>');$('#videoModal').addEventListener('click',e=>{if(e.target.id==='videoModal'||e.target.closest('.video-close'))closeVideo()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeVideo()})}
function closeVideo(){let m=$('#videoModal');if(!m)return;m.classList.remove('open');m.setAttribute('aria-hidden','true');$('#videoStage').innerHTML='';document.body.classList.remove('modal-open')}
function openVideoPlayer(src,title,portrait=null){let s=videoSource(src);if(!s)return toast('Video link valid nahi hai.');ensureVideoModal();let stage=$('#videoStage');stage.className='video-stage '+(s.portrait?'portrait':s.portrait===false?'landscape':'auto-ratio');stage.innerHTML=s.kind==='video'?`<video src="${esc(s.src)}" controls autoplay playsinline></video>`:`<iframe src="${esc(s.src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;$('#videoModalTitle').textContent=title||'Clutch Zone Tutorial';$('#videoModal').classList.add('open');$('#videoModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}
function inferVideoMime(url){try{const path=new URL(url||'',location.href).pathname.toLowerCase();if(path.endsWith('.webm'))return 'video/webm';if(path.endsWith('.ogg')||path.endsWith('.ogv'))return 'video/ogg';if(path.endsWith('.m4v'))return 'video/x-m4v';return 'video/mp4'}catch{return 'video/mp4'}}
function playVideo(url,title){openVideoPlayer(url,title)}
async function playVideoRow(row){
 const parts=Array.isArray(row?.part_urls)?row.part_urls.filter(Boolean):[];
 if(parts.length>1){
  ensureVideoModal();
  const stage=$('#videoStage');stage.className='video-stage auto-ratio';stage.innerHTML='<div class="video-loading"><div class="video-loading-spinner"></div><b>Loading video…</b></div>';$(`#videoModalTitle`).textContent=row.title||'Clutch Zone Tutorial';$('#videoModal').classList.add('open');$('#videoModal').setAttribute('aria-hidden','false');document.body.classList.add('modal-open');
  try{
   const chunks=[];let total=0;
   for(const url of parts){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error('Video load failed');const b=await r.blob();chunks.push(b);total+=b.size;}
   const blob=new Blob(chunks,{type:row.video_mime_type||inferVideoMime(row.video_url)||'video/mp4'});const src=URL.createObjectURL(blob);
   stage.className='video-stage auto-ratio';stage.innerHTML=`<video src="${src}" controls autoplay playsinline></video>`;
   const v=stage.querySelector('video');v.addEventListener('ended',()=>setTimeout(()=>URL.revokeObjectURL(src),1000),{once:true});
  }catch(e){stage.innerHTML='<div class="video-loading"><b>Video load nahi ho saka. Please try again.</b></div>';}
  return;
 }
 openVideoPlayer(row?.video_url||row?.entry_url,row?.title);
}
function paintVideos(rows,target,n){let el=$(target);if(!el)return;rows=rows.slice(0,n);el.innerHTML=rows.length?rows.map((r,i)=>{let url=r.video_url||r.entry_url||'',src=videoSource(url),portrait=src?.portrait===true?'portrait-thumb':'';return `<article class="card video-card" data-video-index="${i}" tabindex="0" role="button" aria-label="Play ${esc(r.title)}">${r.thumbnail_url?`<div class="video-thumb ${portrait}"><img src="${esc(r.thumbnail_url)}" alt="${esc(r.title)}" loading="lazy"><span class="play-badge">▶</span></div>`:`<div class="video-thumb video-placeholder ${portrait}"><span class="play-badge">▶</span><b>CLUTCH ZONE</b></div>`}<div class="body"><h3>${esc(r.title)}</h3>${r.description?`<p>${esc(r.description)}</p>`:''}<button class="btn gold watch-video" type="button">WATCH HERE ▶</button></div></article>`}).join(''):'<div class="empty">Abhi koi tutorial video nahi hai.</div>';el.querySelectorAll('.video-card').forEach((card,i)=>{let go=()=>playVideoRow(rows[i]);card.addEventListener('click',e=>{if(e.target.closest('button')||e.target===card||e.target.closest('.video-thumb')||e.target.closest('.body'))go()});card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go()}})})}
function paintGroupPreview(rows,target){
 let el=$(target);if(!el)return;
 el.innerHTML='<div class="group-home-visual"><span class="group-home-visual-icon">💬</span><b>LIVE COMMUNITY CHAT</b><small>All users + Admin • Tap anywhere to open the full chat</small><span class="group-home-visual-cta">OPEN CHAT →</span></div>';
}
function mediaPublicUrl(raw){
 let u=String(raw||'').trim();
 if(!u)return '';
 if(/^https?:\/\//i.test(u)||u.startsWith('data:')||u.startsWith('blob:'))return u;
 const bucket=String(C.STORAGE_BUCKET||'clutch-zone-media');
 const path=u.replace(/^\/+/, '').replace(new RegExp('^'+bucket.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/'),'');
 if(db?.storage?.from){try{return db.storage.from(bucket).getPublicUrl(path).data.publicUrl||u}catch{}}
 return u;
}
function paintSocial(rows,target){
 let el=$(target);if(!el)return;
 el.innerHTML=rows.length?rows.map(r=>{
  const icon=mediaPublicUrl(r.icon_url);
  const cache=icon?`${icon}${icon.includes('?')?'&':'?'}v=${encodeURIComponent(r.updated_at||r.created_at||Date.now())}`:'';
  return `<a class="card social" href="${esc(r.profile_url)}" target="_blank" rel="noopener"><div class="social-icon-wrap">${cache?`<img src="${esc(cache)}" alt="${esc(r.platform_name)}" loading="lazy" onerror="this.onerror=null;this.style.display='none';this.nextElementSibling?.classList.remove('hide')">`:''}<span class="social-icon-fallback" ${cache?'hidden':''}>${esc((r.platform_name||'S').trim().slice(0,1).toUpperCase())}</span></div><div><h3>${esc(r.platform_name)}</h3><b>OPEN PROFILE ↗</b></div></a>`;
 }).join(''):'<div class="empty">Social links abhi add nahi kiye gaye.</div>'
}
window.ensureApkDownloadWorker=ensureApkDownloadWorker;
window.startApkDownload=startApkDownload;
document.addEventListener('DOMContentLoaded',()=>{header();ensureApkDownloadWorker();load()});

})();
