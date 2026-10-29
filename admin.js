(function(){
'use strict';
const C=window.CLUTCH_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db=null;
const fileState=new WeakMap();
const tableMap={apk:'apk_downloads',category:'match_categories',match:'match_schedule',social:'social_links'};

// Admin page does not load common.js, so mediaPublicUrl must live here too.
// Accept both a complete public URL and a Supabase storage path.
function mediaPublicUrl(raw){
  const u=String(raw||'').trim();
  if(!u)return '';
  if(/^https?:\/\//i.test(u)||u.startsWith('data:')||u.startsWith('blob:'))return u;
  const bucket=String(C.STORAGE_BUCKET||'clutch-zone-media');
  const escaped=bucket.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const path=u.replace(/^\/+/, '').replace(new RegExp('^'+escaped+'/'),'');
  try{
    return db?.storage?.from(bucket).getPublicUrl(path).data.publicUrl||u;
  }catch{return u}
}
const targetMap={apk:'#apkItems',category:'#categoryItems',match:'#matchItems',social:'#socialItems'};

function toast(message){const t=$('#toast');if(!t)return;t.textContent=message;t.classList.add('show');clearTimeout(t._timer);t._timer=setTimeout(()=>t.classList.remove('show'),3200)}
function field(form,name){return form?.querySelector(`[name="${CSS.escape(name)}"]`)||null}
function value(form,name){return String(field(form,name)?.value??'').trim()}
function numberValue(form,name){const x=value(form,name);return x===''?0:Number(x)}
function checked(form,name){return !!field(form,name)?.checked}
function selectedFile(form,key){return fileState.get(form)?.[key]||null}
function setFile(form,key,file){const state=fileState.get(form)||{};state[key]=file||null;fileState.set(form,state)}
function clearFiles(form){fileState.set(form,{})}
function setSelectedLabel(input){const label=input.closest('.field')?.querySelector('label');if(label){label.dataset.selectedFile=input.files?.[0]?.name||''}}

function askConfirm(title,text='This action cannot be undone.'){
 return new Promise(resolve=>{
  const modal=$('#confirmModal');
  if(!modal)return resolve(window.confirm(text));
  const titleEl=$('#confirmTitle'),textEl=$('#confirmText'),ok=$('#confirmOk'),cancel=$('#confirmCancel');
  titleEl.textContent=title;textEl.textContent=text;
  modal.classList.add('open');modal.setAttribute('aria-hidden','false');
  let closed=false;
  const done=v=>{if(closed)return;closed=true;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');ok.onclick=null;cancel.onclick=null;document.removeEventListener('keydown',onKey);resolve(v)};
  const onKey=e=>{if(e.key==='Escape')done(false)};
  ok.onclick=()=>done(true);cancel.onclick=()=>done(false);document.addEventListener('keydown',onKey);setTimeout(()=>cancel.focus(),0);
 });
}
function setupBackButton(){const b=$('#backButton');if(!b)return;b.onclick=()=>{try{if(history.length>1&&document.referrer&&new URL(document.referrer).origin===location.origin){history.back();return}}catch(e){}location.href='index.html'}}

async function init(){
 setupBackButton();
 const loginPanel=$('#adminLogin'),loginForm=$('#adminLoginForm'),loginNotice=$('#loginNotice'),content=$('#content'),notice=$('#notice');
 const showLogin=(message='Admin login required.')=>{loginPanel?.classList.remove('hide');content?.classList.add('hide');notice?.classList.add('hide');if(loginNotice)loginNotice.textContent=message};
 const showDashboard=()=>{loginPanel?.classList.add('hide');notice?.classList.add('hide');content?.classList.remove('hide')};
 if(!window.supabase||!C.SUPABASE_URL?.startsWith('https://')||!C.SUPABASE_ANON_KEY){showLogin('Admin configuration is incomplete.');return}
 db=window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);
 loginForm?.addEventListener('submit',async e=>{
   e.preventDefault();
   const button=$('#adminLoginButton'); if(button){button.disabled=true;button.textContent='CHECKING…'}
   try{
     const email=String($('#adminEmail')?.value||'').trim();
     const password=String($('#adminPassword')?.value||'');
     if(!email||!password){showLogin('Email aur password dono enter karein.');return}
     const {data,error}=await db.auth.signInWithPassword({email,password});
     if(error||!data.user){await db.auth.signOut();showLogin(error?.message||'Login failed.');return}
     const admin=await db.from('admin_users').select('user_id').eq('user_id',data.user.id).maybeSingle();
     if(admin.error||!admin.data){await db.auth.signOut();showLogin('Is account ko admin access nahi hai.');return}
     showDashboard();
     $$('[data-tab]').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
     $('#logout').onclick=async()=>{await db.auth.signOut();location.href='admin.html'};
     bindFileInputs();bindForms();bindAdminChat();await refresh();
   }catch(err){console.error('Admin login flow failed.');showLogin('Login nahi ho saka. Credentials aur Supabase configuration check karein.')}
   finally{if(button){button.disabled=false;button.textContent='LOGIN TO ADMIN'}}
 });
 const {data:userData,error:userError}=await db.auth.getUser();
 if(userError||!userData.user){showLogin('Admin email aur password se login karein.');return}
 const admin=await db.from('admin_users').select('user_id').eq('user_id',userData.user.id).maybeSingle();
 if(admin.error||!admin.data){await db.auth.signOut();showLogin('Is account ko admin access nahi hai.');return}
 showDashboard();
 $$('[data-tab]').forEach(btn=>btn.onclick=()=>showTab(btn.dataset.tab));
 $('#logout').onclick=async()=>{await db.auth.signOut();location.href='admin.html'};
 bindFileInputs();bindForms();bindAdminChat();await refresh();
}
function showTab(tab){$$('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));['apk','categories','matches','social','users','support','groupchat'].forEach(t=>$('#tab-'+t)?.classList.toggle('hide',t!==tab));if(tab==='categories')loadCategories();if(tab==='matches')loadCategoryOptions();if(tab==='users')loadUserData();if(tab==='support')loadSupportRequests();if(tab==='groupchat')loadAdminGroupChat()}
function bindFileInputs(){
 $$('input[type="file"]').forEach(input=>input.addEventListener('change',()=>{setSelectedLabel(input);const form=input.form;if(!form)return;const key=input.name;setFile(form,key,input.files?.[0]||null);if(input.files?.[0])toast(`${input.files[0].name} selected`) }));
 $$('form').forEach(form=>form.addEventListener('reset',()=>{setTimeout(()=>{clearFiles(form);form.querySelectorAll('input[type="file"]').forEach(i=>{i.value='';setSelectedLabel(i)})},0)}));
}
function bindForms(){
 const apk=$('#apkForm');
 apk.onsubmit=async e=>{e.preventDefault();const file=selectedFile(apk,'file'),id=value(apk,'id'),url=value(apk,'download_url');if(!file&&!url){toast('APK file ya direct download link me se koi ek dijiye.');return}await saveRecord(apk,'apk',async()=>{let oldRow=null; if(id){const old=await db.from('apk_downloads').select('download_url,part_urls,total_parts,part_size_bytes,original_file_size_bytes,file_name,file_size_bytes,storage_provider,storage_path').eq('id',id).maybeSingle();if(old.error)throw new Error('Existing APK metadata load nahi hua: '+old.error.message);oldRow=old.data||null;}let upload;if(file){toast('APK ka ORIGINAL size same rahega. Upload parts mein ho raha hai…');upload=await uploadFile(file,'APK upload')}else{const sameSource=!!oldRow&&(!url||url===oldRow.download_url);upload={download_url:url||oldRow?.download_url||null,part_urls:sameSource&&Array.isArray(oldRow?.part_urls)?oldRow.part_urls:[],total_parts:sameSource?Number(oldRow?.total_parts||oldRow?.part_urls?.length||1):1,part_size_bytes:sameSource?Number(oldRow?.part_size_bytes||0):0,original_file_size_bytes:sameSource?Number(oldRow?.original_file_size_bytes||oldRow?.file_size_bytes||0)||null:null};}const isMultipart=Array.isArray(upload.part_urls)&&upload.part_urls.length>1;if(isMultipart&&(!upload.original_file_size_bytes||!upload.part_size_bytes||upload.total_parts!==upload.part_urls.length))throw new Error('Multipart APK metadata incomplete hai. APK ko dobara upload karein.');return{title:value(apk,'title')||'Clutch Zone',version:value(apk,'version')||'1.0.0',download_url:upload.download_url||upload.part_urls?.[0]||null,is_active:checked(apk,'is_active'),storage_provider:file?'supabase':(upload.part_urls?.length?'supabase':'external'),storage_path:null,file_name:file?.name||(oldRow?.file_name||null),file_size_bytes:file?.size||upload.original_file_size_bytes||null,original_file_size_bytes:upload.original_file_size_bytes,total_parts:upload.total_parts,part_size_bytes:upload.part_size_bytes,part_urls:upload.part_urls}})};

 const category=$('#categoryForm');
 if(category)category.onsubmit=async e=>{e.preventDefault();const name=value(category,'name');if(!name){toast('Section name dijiye.');return}await saveRecord(category,'category',async()=>{let image=value(category,'image_url');const file=selectedFile(category,'category_image_file');if(file){const normalized=await normalizeImage(file,16/9,'Section image');toast('Section image upload ho raha hai…');image=(await uploadFile(normalized,'Section image upload')).download_url}let slug=value(category,'slug')||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return{name,slug,image_url:image||null,is_visible:checked(category,'is_visible')}});await loadCategoryOptions()};

 const match=$('#matchForm');
 match.onsubmit=async e=>{e.preventDefault();const title=value(match,'title'),mode=value(match,'game_mode'),rawDate=value(match,'match_date');if(!title){toast('Tournament name dijiye.');field(match,'title')?.focus();return}if(!mode){toast('Game mode/type dijiye. Example: 1v1, 2v2, Lone Wolf');field(match,'game_mode')?.focus();return}if(!rawDate){toast('Match date aur time dijiye.');field(match,'match_date')?.focus();return}const d=new Date(rawDate);if(Number.isNaN(d.getTime())){toast('Date & time valid nahi hai.');return}await saveRecord(match,'match',async()=>{let image=value(match,'match_image_url');const file=selectedFile(match,'image_file');if(file){const normalized=await normalizeImage(file,16/9,'Match thumbnail');toast('Match thumbnail upload ho raha hai…');image=(await uploadFile(normalized,'Match image upload')).download_url}return{title,description:value(match,'description')||null,category_id:value(match,'category_id')||null,game_mode:mode,entry_fee:numberValue(match,'entry_fee'),prize_pool:numberValue(match,'prize_pool'),total_players:numberValue(match,'total_players')||null,per_kill_reward:numberValue(match,'per_kill_reward'),match_image_url:image||null,match_date:d.toISOString(),status:['UPCOMING','LIVE','COMPLETED','CANCELLED'].includes(value(match,'status').toUpperCase())?value(match,'status').toUpperCase():'UPCOMING',is_visible:checked(match,'is_visible')}})};

 const social=$('#socialForm');
 social.onsubmit=async e=>{e.preventDefault();const platform=value(social,'platform_name'),profile=value(social,'profile_url');if(!platform||!profile){toast('Platform name aur profile link dijiye.');return}await saveRecord(social,'social',async()=>{let icon=value(social,'icon_url');const file=selectedFile(social,'icon_file');if(file){const normalized=await normalizeImage(file,1,'Social icon');const up=await uploadFile(normalized,'Social icon upload');icon=up.download_url||'';if(!icon)throw new Error('Social icon upload URL nahi mila.')}return{platform_name:platform,profile_url:profile,icon_url:icon||null,is_visible:checked(social,'is_visible')}})};
}
function ensureUploadProgress(){
 let el=$('#uploadProgress');
 if(el)return el;
 el=document.createElement('div');
 el.id='uploadProgress';
 el.className='cz-upload-progress';
 el.innerHTML=`<div class=cz-upload-card><div class=cz-upload-top><div><b id=uploadTitle>Uploading…</b><small id=uploadFileName></small></div><strong id=uploadPercent>0%</strong></div><div class=cz-upload-track><div id=uploadBar class=cz-upload-bar></div></div><div class=cz-upload-meta><span id=uploadStatus>Preparing upload…</span><span id=uploadSize></span></div></div>`;
 document.body.appendChild(el);
 return el;
}
function setUploadProgress(title,file,percent,status,totalFile){
 const el=ensureUploadProgress();
 el.classList.add('show');
 $('#uploadTitle').textContent=title||'Uploading…';
 $('#uploadFileName').textContent=file?.name||'';
 $('#uploadPercent').textContent=`${Math.max(0,Math.min(100,Math.round(percent||0)))}%`;
 $('#uploadBar').style.width=`${Math.max(0,Math.min(100,percent||0))}%`;
 $('#uploadStatus').textContent=status||'Uploading…';
 if(totalFile||file)$('#uploadSize').textContent=`${((totalFile||file)?.size/1024/1024).toFixed(1)} MB TOTAL`;
}
function hideUploadProgress(delay=350){
 const el=$('#uploadProgress');
 if(el)setTimeout(()=>el.classList.remove('show'),delay);
}
const APK_CHUNK_SIZE=49000000;
const APK_MAX_SIZE=300*1024*1024;
const VIDEO_CHUNK_SIZE=10*1024*1024;
const VIDEO_MAX_SIZE=300*1024*1024;

async function normalizeImage(file, ratio, label){
 if(!file)return null;
 if(!file.type?.startsWith('image/'))throw new Error('Valid image file select karein.');
 const img=await new Promise((resolve,reject)=>{
  const url=URL.createObjectURL(file),im=new Image();
  im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};
  im.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Image read nahi ho saki.'))};
  im.src=url;
 });
 const sw=img.naturalWidth||img.width, sh=img.naturalHeight||img.height;
 if(!sw||!sh)throw new Error('Image dimensions invalid hain.');
 const targetW=ratio===1?1200:1600, targetH=Math.round(targetW/ratio);
 const scale=Math.max(targetW/sw,targetH/sh);
 const dw=Math.ceil(sw*scale),dh=Math.ceil(sh*scale);
 const canvas=document.createElement('canvas');canvas.width=targetW;canvas.height=targetH;
 const ctx=canvas.getContext('2d',{alpha:false});
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const x=(targetW-dw)/2,y=(targetH-dh)/2;
 ctx.fillStyle='#111';ctx.fillRect(0,0,targetW,targetH);ctx.drawImage(img,x,y,dw,dh);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Image processing failed.')),'image/webp',.92));
 const ext='.webp';
 const out=new File([blob],`${file.name.replace(/\.[^.]+$/,'')}-${ratio===1?'square':'landscape'}${ext}`,{type:'image/webp',lastModified:Date.now()});
 toast(`${label||'Image'} auto-fit ho gayi ✓`);
 return out;
}

async function uploadSingleObject(file,path,label,overallStart=0,overallTotal=1,totalFile=null,partIndex=0,totalParts=1){
 const bucket=C.STORAGE_BUCKET||'clutch-zone-media';
 const {data:sessionData,error:sessionError}=await db.auth.getSession();
 if(sessionError||!sessionData.session?.access_token)throw new Error('Admin session expired. Please login again.');
 return await new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();
  const url=`${String(C.SUPABASE_URL).replace(/\/$/,'')}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`;
  xhr.open('POST',url,true);
  xhr.setRequestHeader('Authorization',`Bearer ${sessionData.session.access_token}`);
  xhr.setRequestHeader('apikey',C.SUPABASE_ANON_KEY);
  xhr.setRequestHeader('Content-Type',file.type||'application/octet-stream');
  xhr.setRequestHeader('Cache-Control','3600');
  xhr.setRequestHeader('x-upsert','true');
  xhr.upload.onprogress=e=>{if(e.lengthComputable){const pct=overallStart+(e.loaded/e.total)*(1/overallTotal*100);setUploadProgress(label,totalFile||file,pct,`Part ${partIndex}/${totalParts} • ${(e.loaded/1024/1024).toFixed(1)} / ${(e.total/1024/1024).toFixed(1)} MB`,totalFile||file)}};
  xhr.onerror=()=>reject(new Error('Network error while uploading. Internet connection check karke retry karein.'));
  xhr.onabort=()=>reject(new Error('Upload cancelled.'));
  xhr.onload=()=>{
   if(xhr.status>=200&&xhr.status<300)resolve();
   else{let msg=`Upload failed (${xhr.status})`;try{const j=JSON.parse(xhr.responseText);msg=j.message||j.error||msg}catch(e){}reject(new Error(msg))}
  };
  xhr.send(file);
 });
}

async function uploadFile(file,label='Uploading file',options={}){
 if(!file)throw new Error('File select nahi hui.');
 const kind=options.kind||'';
 const maxSize=kind==='video'?VIDEO_MAX_SIZE:APK_MAX_SIZE;
 if(file.size>maxSize)throw new Error(`${file.name} ${Math.round(maxSize/1024/1024)} MB se bada hai.`);
 const bucket=C.STORAGE_BUCKET||'clutch-zone-media';
 const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
 const base=`admin/${Date.now()}-${crypto.randomUUID()}-${safe}`;
 setUploadProgress(label,file,0,`Preparing ${ (file.size/1024/1024).toFixed(1) } MB APK upload…`,file);
 const isApk=/\.apk$/i.test(file.name)||file.type==='application/vnd.android.package-archive';
 const isVideo=kind==='video'||file.type?.startsWith('video/');
 const forceSingle=options.forceSingle===true;
 if((isApk||isVideo)&&!forceSingle){
  let chunkSize=isApk?APK_CHUNK_SIZE:VIDEO_CHUNK_SIZE;
  let totalParts=Math.max(1,Math.ceil(file.size/chunkSize));
  // APK: keep the ORIGINAL file size unchanged. Split it into the minimum
  // number of storage parts, then rebalance the fixed chunk size so a 124 MB
  // APK becomes 3 nearly-equal parts instead of a 49/49/26 MB split.
  if(isApk){
   totalParts=Math.max(1,Math.ceil(file.size/APK_CHUNK_SIZE));
   chunkSize=Math.ceil(file.size/totalParts);
  }
  const urls=[];
  for(let i=0;i<totalParts;i++){
   const start=i*chunkSize,end=Math.min(file.size,start+chunkSize);
   const chunk=file.slice(start,end,file.type||'application/octet-stream');
   const path=`${base}.part-${String(i+1).padStart(4,'0')}`;
   let lastErr=null;
   for(let attempt=1;attempt<=2;attempt++){
    try{await uploadSingleObject(chunk,path,label,(i/totalParts)*100,totalParts,file,i+1,totalParts);lastErr=null;break}catch(err){lastErr=err;if(attempt===1)await new Promise(r=>setTimeout(r,700))}
   }
   if(lastErr)throw lastErr;
   urls.push(db.storage.from(bucket).getPublicUrl(path).data.publicUrl);
   setUploadProgress(label,file,((i+1)/totalParts)*100,`Part ${i+1}/${totalParts} complete • ${(Math.min(file.size,(i+1)*chunkSize)/1024/1024).toFixed(1)} / ${(file.size/1024/1024).toFixed(1)} MB`,file);
  }
  hideUploadProgress(900);
  return {download_url:urls[0]||null,part_urls:urls,total_parts:totalParts,part_size_bytes:chunkSize,original_file_size_bytes:file.size};
 }
 const path=base;
 await uploadSingleObject(file,path,label,0,1);
 setUploadProgress(label,file,100,`Upload complete • ${(file.size/1024/1024).toFixed(1)} / ${(file.size/1024/1024).toFixed(1)} MB`,file);
 hideUploadProgress(700);
 return {download_url:db.storage.from(bucket).getPublicUrl(path).data.publicUrl,part_urls:[],total_parts:1,part_size_bytes:file.size,original_file_size_bytes:file.size};
}
async function saveRecord(form,type,builder){
 if(form._busy)return;form._busy=true;const btn=form.querySelector('button[type="submit"]');const old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='SAVING…'}
 try{
  const table=tableMap[type],id=value(form,'id'),payload=await builder();payload.updated_at=new Date().toISOString();
  if(type==='apk'&&payload.is_active){
   const q=db.from(table).update({is_active:false,updated_at:new Date().toISOString()}).eq('is_active',true);
   const off=id?q.neq('id',id):q;
   const {error:deactivateError}=await off;
   if(deactivateError)throw new Error(`Could not deactivate previous APK: ${deactivateError.message}`);
  }
  let res;
  if(id)res=await db.from(table).update(payload).eq('id',id).select('*').single();else res=await db.from(table).insert(payload).select('*').single();
  // Older Clutch Zone databases may not yet have the video multipart columns.
  // For URL/small-video saves, retry once with the legacy tutorial schema so the
  // admin panel does not get blocked by a stale PostgREST schema cache.
  if(res.error && type==='video' && /original_file_size_bytes|total_parts|part_size_bytes|part_urls|video_mime_type/i.test(res.error.message||'')){
   const legacy={...payload};
   delete legacy.original_file_size_bytes;delete legacy.total_parts;delete legacy.part_size_bytes;delete legacy.part_urls;delete legacy.video_mime_type;
   if(id)res=await db.from(table).update(legacy).eq('id',id).select('*').single();
   else res=await db.from(table).insert(legacy).select('*').single();
   if(res.error)throw new Error(`Database save failed: ${res.error.message}${res.error.hint?' — '+res.error.hint:''}`);
   if(payload.part_urls?.length>1)toast('Video save ho gaya, lekin multipart columns DB me missing hain. Complete video playback ke liye latest supabase_setup.sql ek baar run karein.');
  } else if(res.error){
   throw new Error(`Database save failed: ${res.error.message}${res.error.hint?' — '+res.error.hint:''}`);
  }
  const saved=res.data||{};
  if(type==='match'&&(!saved.title||!saved.match_date||!saved.game_mode))throw new Error('Match save verify failed: title/game mode/date database se wapas nahi mile.');
  if(type==='apk'&&(!saved.download_url&&!Array.isArray(saved.part_urls)))throw new Error('APK save verify failed: download data database se wapas nahi mila.');
  if(type==='video'&&(!saved.video_url&&!Array.isArray(saved.part_urls)))throw new Error('Video save verify failed: video data database se wapas nahi mila.');
  form.reset();if(field(form,'id'))field(form,'id').value='';if(field(form,'is_visible'))field(form,'is_visible').checked=true;if(field(form,'is_active'))field(form,'is_active').checked=true;clearFiles(form);
  toast(id?'Updated successfully':'Saved successfully');await refresh();
 }catch(err){console.error(err);toast(err?.message||'Save failed')}finally{form._busy=false;if(btn){btn.disabled=false;btn.textContent=old||'SAVE'}}
}
async function loadCategoryOptions(){const sel=$('#matchCategorySelect');if(!sel||!db)return;const current=sel.value;const {data,error}=await db.from('match_categories').select('id,name,is_visible').order('sort_order',{ascending:true}).order('created_at',{ascending:true});if(error)return;sel.innerHTML='<option value="">SELECT SECTION</option>'+((data||[]).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}${c.is_visible?'':' (Hidden)'}</option>`).join(''));if(current)sel.value=current}
async function loadCategories(){await list('match_categories','#categoryItems','category');await loadCategoryOptions()}
async function refresh(){await Promise.all([list('apk_downloads','#apkItems','apk'),list('match_categories','#categoryItems','category'),list('match_schedule','#matchItems','match'),list('social_links','#socialItems','social'),loadCategoryOptions()])}
function detailFor(type,r){if(type==='category')return [r.slug||'SECTION',r.is_visible?'VISIBLE':'HIDDEN'].join(' · ');
 if(type==='apk'){const total=Number(r.original_file_size_bytes||r.file_size_bytes||0);const mb=total?(total/1000000).toFixed(1)+' MB':'';const parts=Array.isArray(r.part_urls)?r.part_urls.length:Number(r.total_parts||1);return `${r.version?'v'+r.version+' · ':''}${mb?mb+' TOTAL · ':''}${parts>1?`${parts} PARTS · `:'SINGLE · '}${r.download_url||parts?'DOWNLOAD READY':'NO DOWNLOAD'}`;}
 if(type==='video')return `${r.video_url?'VIDEO READY':'NO VIDEO'}${r.thumbnail_url?' · THUMBNAIL OK':''}`;
 if(type==='social')return r.profile_url||'NO LINK';
 const date=r.match_date?new Date(r.match_date):null;const valid=date&&!Number.isNaN(date.getTime());return [r.game_mode||'NO GAME MODE',r.status||'UPCOMING',valid?date.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'}):'NO DATE',r.match_image_url?'THUMBNAIL OK':'NO THUMBNAIL',`ENTRY ₹${r.entry_fee??0}`,`PRIZE ₹${r.prize_pool??0}`,`PLAYERS ${r.total_players??'—'}`,`KILL ₹${r.per_kill_reward??0}`].join(' · ')
}
async function list(table,target,type){const el=$(target);if(!el)return;const {data,error}=await db.from(table).select('*').order('created_at',{ascending:false});if(error){el.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return}if(!data?.length){el.innerHTML='<div class="empty">No items added.</div>';return}el.innerHTML=data.map(r=>{const title=r.title||r.platform_name||r.file_name||'Untitled';const vis=type==='apk'?!!r.is_active:!!r.is_visible;let thumb='';if(type==='category'&&r.image_url){const src=mediaPublicUrl(r.image_url);thumb=src?`<img class="admin-item-thumb" src="${esc(src)}" alt="" loading="lazy">`:''}if(type==='match'&&r.match_image_url){const src=mediaPublicUrl(r.match_image_url);thumb=src?`<img class="admin-item-thumb" src="${esc(src)}" alt="" loading="lazy" onerror="this.onerror=null;this.style.display='none'">`:''}return `<div class="item admin-item"><div class="admin-item-main">${thumb}<div><b>${esc(title)}</b><small>${esc(detailFor(type,r))}</small></div></div><div class="row-actions"><button class="light" data-edit="${esc(r.id)}" data-type="${type}">EDIT</button><button class="light" data-toggle="${esc(r.id)}" data-type="${type}" data-vis="${vis}">${vis?'HIDE':'SHOW'}</button><button class="dark" data-del="${esc(r.id)}" data-type="${type}">DELETE</button></div></div>`}).join('');
 el.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>edit(type,data.find(r=>r.id===b.dataset.edit)));
 el.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>toggle(type,b.dataset.toggle,b.dataset.vis==='true'));
 el.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteRecord(type,b.dataset.del,b));
}
function edit(type,r){if(!r)return;const form=$({apk:'#apkForm',category:'#categoryForm',match:'#matchForm',social:'#socialForm'}[type]);field(form,'id').value=r.id;const keys={apk:['title','version','download_url','is_active'],category:['name','slug','image_url','is_visible'],match:['title','description','category_id','game_mode','entry_fee','prize_pool','total_players','per_kill_reward','match_image_url','match_date','status','is_visible'],social:['platform_name','profile_url','icon_url','is_visible']}[type];keys.forEach(k=>{const x=field(form,k);if(!x)return;if(x.type==='checkbox')x.checked=!!r[k];else if(k==='match_date'&&r[k])x.value=new Date(r[k]).toISOString().slice(0,16);else x.value=r[k]??''});clearFiles(form);const tab=type==='match'?'matches':type==='category'?'categories':type;showTab(tab);form.scrollIntoView({behavior:'auto',block:'center'})}
async function toggle(type,id,current){const table=tableMap[type],col=type==='apk'?'is_active':'is_visible';if(type==='apk'&&!current){const {error:offError}=await db.from(table).update({is_active:false,updated_at:new Date().toISOString()}).eq('is_active',true).neq('id',id);if(offError){toast(offError.message);return}}const {error}=await db.from(table).update({[col]:!current,updated_at:new Date().toISOString()}).eq('id',id);if(error)toast(error.message);else{toast(!current?'Shown':'Hidden');await refresh()}}
async function deleteRecord(type,id,button){if(!id||button?.disabled)return;const ok=await askConfirm('DELETE THIS ITEM?','Ye item permanently delete ho jayega. Continue karna hai?');if(!ok)return;button.disabled=true;button.textContent='DELETING…';const {error}=await db.from(tableMap[type]).delete().eq('id',id);if(error){button.disabled=false;button.textContent='DELETE';toast(`Delete failed: ${error.message}`);return}button.closest('.admin-item')?.remove();toast('Deleted successfully');const box=$(targetMap[type]);if(box&&!box.querySelector('.admin-item'))box.innerHTML='<div class="empty">No items added.</div>'}

let selectedSupportUser=null;
async function loadSupportRequests(){const listEl=$('#supportRequestUsers'),count=$('#supportTotalCount');if(!listEl||!db)return;const {data:users,error:uerr}=await db.from('support_users').select('id,display_name,uid,created_at').order('created_at',{ascending:false}).limit(1000);if(uerr){listEl.innerHTML=`<div class="notice">${esc(uerr.message)}</div>`;return}const {data:msgs,error:merr}=await db.from('support_messages').select('id,support_user_id,is_admin,admin_read_at,created_at').eq('is_admin',false).eq('is_group',false).order('created_at',{ascending:false}).limit(5000);if(merr){listEl.innerHTML=`<div class="notice">${esc(merr.message)}</div>`;return}const counts={};(msgs||[]).forEach(m=>{if(!m.admin_read_at)counts[m.support_user_id]=(counts[m.support_user_id]||0)+1});if(count)count.textContent=String(Object.values(counts).reduce((a,b)=>a+b,0));listEl.innerHTML=(users||[]).map(u=>{const c=counts[u.id]||0;return `<button type="button" class="support-request-user ${c?'has-unread':''}" data-support-user="${esc(u.id)}"><span class="support-avatar">${esc((u.display_name||'P').trim().slice(0,1).toUpperCase())}</span><span class="support-user-main"><b>${esc(u.display_name||'Player')}</b><small>PRIVATE SUPPORT${c?' • NEW MESSAGE':''}</small></span><span class="support-message-count">${c}</span></button>`}).join('')||'<div class="empty">Abhi koi support request nahi hai.</div>';listEl.querySelectorAll('[data-support-user]').forEach(b=>b.onclick=()=>location.href='support-chat.html?user='+encodeURIComponent(b.dataset.supportUser))}
async function loadAdminGroupChat(){const box=$('#adminGroupChat');if(!box||!db)return;const {data,error}=await db.rpc('get_admin_group_chat_messages');if(error){box.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return}box.innerHTML=(data||[]).map(m=>`<article class="chat-bubble ${m.is_admin?'admin-bubble':''}"><div class="chat-meta"><b>${m.is_admin?'👑 ':''}${esc(m.display_name||'Player')}</b><time>${new Date(m.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}</time></div><p>${esc(m.message)}</p><button class="chat-delete" data-group-delete="${esc(m.id)}">DELETE</button></article>`).join('')||'<div class="empty">Group chat abhi empty hai.</div>';box.scrollTop=box.scrollHeight;box.querySelectorAll('[data-group-delete]').forEach(b=>b.onclick=async()=>{if(b.disabled)return;const ok=await askConfirm('DELETE GROUP MESSAGE?','Ye message permanently delete ho jayega.');if(!ok)return;b.disabled=true;b.textContent='DELETING…';const {error}=await db.from('support_messages').delete().eq('id',b.dataset.groupDelete);if(error){b.disabled=false;b.textContent='DELETE';toast(error.message);return}toast('Message deleted');loadAdminGroupChat()})}
async function loadUserData(){let el=$('#userDataList');if(!el||!db)return;let {data,error}=await db.from('support_users').select('*').order('created_at',{ascending:false}).limit(1000);if(error){el.innerHTML=`<div class="notice">${esc(error.message)}</div>`;return}el.innerHTML=(data||[]).map((u,i)=>{const created=u.created_at?new Date(u.created_at).toLocaleString('en-IN',{dateStyle:'full',timeStyle:'medium'}):'—';const updated=u.updated_at?new Date(u.updated_at).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'medium'}):'—';return `<article class="item user-data-card"><div class="user-data-head"><div><span class="user-number">#${i+1}</span><b>${esc(u.display_name||'Unknown')}</b></div><span class="status-pill">REGISTERED</span></div><div class="support-user-details user-data-grid"><div class="protected-user-field"><label>USER ID</label><code class="masked-value">••••••••••••••••••••••••</code><code class="real-value hidden-value">${esc(u.id||'—')}</code><button type="button" class="user-secret-toggle" data-user-secret-toggle>SHOW</button></div><div class="protected-user-field"><label>FREE FIRE UID</label><code class="masked-value">••••••••••••</code><code class="real-value hidden-value">${esc(u.uid||'—')}</code><button type="button" class="user-secret-toggle" data-user-secret-toggle>SHOW</button></div><div><label>PLAYER NAME</label><span>${esc(u.display_name||'—')}</span></div><div class="protected-user-field"><label>REGISTERED AT</label><span class="masked-value">••••••••••••••••</span><span class="real-value hidden-value">${esc(created)}</span><button type="button" class="user-secret-toggle" data-user-secret-toggle>SHOW</button></div><div class="protected-user-field"><label>LAST UPDATED</label><span class="masked-value">••••••••••••••••</span><span class="real-value hidden-value">${esc(updated)}</span><button type="button" class="user-secret-toggle" data-user-secret-toggle>SHOW</button></div></div><div class="row-actions user-data-actions"><button class="light" data-user-edit="${esc(u.id)}">EDIT</button><button class="dark" data-user-delete="${esc(u.id)}">DELETE</button></div></article>`}).join('')||'<div class="empty">Abhi koi player registered nahi hai.</div>';el.querySelectorAll('[data-user-edit]').forEach(b=>b.onclick=()=>editUser(data.find(u=>u.id===b.dataset.userEdit)));el.querySelectorAll('[data-user-delete]').forEach(b=>b.onclick=()=>deleteUser(b.dataset.userDelete));el.querySelectorAll('[data-user-secret-toggle]').forEach(b=>b.onclick=()=>{const box=b.closest('.protected-user-field'),masked=box.querySelector('.masked-value'),real=box.querySelector('.real-value'),show=real.classList.contains('hidden-value');masked.classList.toggle('hidden-value',show);real.classList.toggle('hidden-value',!show);b.textContent=show?'HIDE':'SHOW'})}
function editUser(u){if(!u)return;const name=prompt('Player Name:',u.display_name||'');if(name===null)return;const uid=prompt('Free Fire UID:',u.uid||'');if(uid===null)return;const cleanName=name.trim(),cleanUid=uid.trim().toUpperCase();if(!cleanName||cleanName.length>32||!cleanUid||cleanUid.length>64){toast('Name/UID invalid hai.');return}updateUser(u.id,cleanName,cleanUid)}
async function updateUser(id,name,uid){const {error}=await db.from('support_users').update({display_name:name,uid,updated_at:new Date().toISOString()}).eq('id',id);if(error){toast(error.message||'User update failed');return}toast('User data updated');loadUserData()}
async function deleteUser(id){if(!id)return;const ok=await askConfirm('DELETE PLAYER DATA?','Player ka USER DATA aur private support chat permanently delete ho jayega.');if(!ok)return;const button=document.querySelector(`[data-user-delete="${CSS.escape(id)}"]`);if(button){button.disabled=true;button.textContent='DELETING…'}const {error}=await db.rpc('delete_support_user',{p_user_id:id});if(error){if(button){button.disabled=false;button.textContent='DELETE'}toast(error.message||'User delete failed');return}button?.closest('.user-data-card')?.remove();toast('User deleted successfully');loadSupportRequests()}
function bindAdminChat(){const gf=$('#adminGroupForm');if(gf)gf.onsubmit=async e=>{e.preventDefault();const input=field(gf,'message'),msg=value(gf,'message');if(!msg)return;if(gf._busy)return;gf._busy=true;const btn=gf.querySelector('button[type=submit]');if(btn){btn.disabled=true;btn.textContent='SENDING…'}const {error}=await db.rpc('send_admin_group_message',{p_message:msg});if(error)toast(error.message||'Group message send nahi hua');else{gf.reset();input?.focus();toast('Message sent')}if(btn){btn.disabled=false;btn.textContent='SEND TO GROUP'}gf._busy=false;loadAdminGroupChat()};setInterval(()=>{if(!$('#tab-support')?.classList.contains('hide'))loadSupportRequests();if(!$('#tab-groupchat')?.classList.contains('hide'))loadAdminGroupChat()},5000)}

document.addEventListener('DOMContentLoaded',init);
})();
