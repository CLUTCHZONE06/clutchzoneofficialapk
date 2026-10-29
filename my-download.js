(function(){
  'use strict';
  const C=window.CLUTCH_CONFIG||{};
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PART_KEY='cz-my-download-parts-v1';
  const ID_KEY='cz-my-download-identity-v1';
  const getLocal=k=>{try{const v=localStorage.getItem(k);if(v)return v}catch{};try{const m=document.cookie.match(new RegExp('(?:^|; )'+encodeURIComponent(k)+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}catch{return ''}};
  const setLocal=(k,v)=>{try{localStorage.setItem(k,v)}catch{};try{document.cookie=encodeURIComponent(k)+'='+encodeURIComponent(v)+'; max-age=31536000; path=/; SameSite=Lax'}catch{}};
  let db=null,current=null,controller=null,stopped=false,partsDb=null;

  function toast(m){const t=$('#toast');if(t){t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2800)}}
  function configReady(){return window.supabase&&C.SUPABASE_URL?.startsWith('https://')&&C.SUPABASE_ANON_KEY&&!C.SUPABASE_ANON_KEY.includes('YOUR_')}
  function fmtBytes(n){n=Number(n)||0;if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;if(n<1024*1024*1024)return `${(n/1048576).toFixed(n>=10485760?0:1)} MB`;return `${(n/1073741824).toFixed(2)} GB`}
  function pct(a,b){return b?Math.min(100,Math.max(0,(a/b)*100)):0}
  function setProgress(done,total,status){const p=pct(done,total);$('#downloadPercent').textContent=`${p.toFixed(0)}%`;$('#downloadProgress').style.width=`${p}%`;$('#downloadDone').textContent=fmtBytes(done);$('#downloadTotal').textContent=fmtBytes(total);$('#downloadStatus').textContent=status||''}
  function identity(){try{const saved=JSON.parse(getLocal(ID_KEY)||'null');if(saved?.uid)return saved;const uid=getLocal('cz-support-uid'),name=getLocal('cz-support-name');if(uid){const x={uid:String(uid).trim().toUpperCase(),name:name||'Player',id:getLocal('cz-support-id')||''};setLocal(ID_KEY,JSON.stringify(x));return x}return null}catch{return null}}
  function showIdentityModal(){const m=$('#downloadIdentityModal');if(!m)return;const uid=getLocal('cz-support-uid'),name=getLocal('cz-support-name');if($('#downloadPlayerName'))$('#downloadPlayerName').value=name||'';if($('#downloadPlayerUid'))$('#downloadPlayerUid').value=uid||'';m.classList.add('open');setTimeout(()=>$('#downloadPlayerName')?.focus(),80)}
  function closeIdentityModal(){$('#downloadIdentityModal')?.classList.remove('open')}
  async function saveIdentity(name,uid){if(!db)throw new Error('Supabase config check karo.');const {data,error}=await db.rpc('register_support_user',{p_display_name:name,p_uid:uid});if(error)throw error;const row=data?.[0];if(!row)throw new Error('Registration response nahi mila.');const user={id:row.result_id||'',name:row.result_name||name,uid:String(row.result_uid||uid).trim().toUpperCase()};setLocal('cz-support-uid',user.uid);setLocal('cz-support-name',user.name);setLocal('cz-support-id',user.id);setLocal(ID_KEY,JSON.stringify(user));return user}


  function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('clutch-zone-downloads',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('parts'))d.createObjectStore('parts',{keyPath:'key'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
  function partKey(uid,apkId,index){return `${uid}:${apkId}:${index}`}
  async function getSavedPart(uid,apkId,index){if(!partsDb)return null;return new Promise((resolve,reject)=>{const r=partsDb.transaction('parts','readonly').objectStore('parts').get(partKey(uid,apkId,index));r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
  async function putSavedPart(uid,apkId,index,blob,size){return new Promise((resolve,reject)=>{const r=partsDb.transaction('parts','readwrite').objectStore('parts').put({key:partKey(uid,apkId,index),uid,apkId,index,blob,size,created_at:Date.now()});r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}
  async function deleteSavedParts(uid,apkId){if(!partsDb)return;return new Promise((resolve,reject)=>{const tx=partsDb.transaction('parts','readwrite'),store=tx.objectStore('parts'),req=store.openCursor();req.onsuccess=()=>{const c=req.result;if(!c){return}if(c.value?.uid===uid&&String(c.value?.apkId)===String(apkId))c.delete();c.continue()};req.onerror=()=>reject(req.error);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error||new Error('Delete failed'))})}
  async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch{}}

  function getUrls(row){const parts=Array.isArray(row.part_urls)?row.part_urls.filter(Boolean):[];return parts.length?parts:(row.download_url?[row.download_url]:[])}
  function rowSize(row,urls){return Number(row.original_file_size_bytes)||Number(row.file_size_bytes)||0}
  function expectedPartSize(row,urls,total,i){const part=Number(row.part_size_bytes)||0;if(!total||!part)return 0;return i<urls.length-1?part:Math.max(0,total-part*(urls.length-1))}
  function fileName(row){return (row.file_name||`clutch-zone-${row.version||'latest'}.apk`).replace(/[\\/:*?"<>|]+/g,'_')}

  function renderNoIdentity(){
    $('#apkArea').innerHTML=`<div class="notice premium-download-notice"><b>PLAYER PROFILE NOT SAVED</b><br><span>पहले Home के <strong>DOWNLOAD APK</strong> या <strong>24/7 SUPPORT</strong> में अपना Name + UID save करो। उसके बाद My Download में यही saved profile अपने-आप इस्तेमाल होगी।</span><div class="download-notice-actions"><a class="btn gold" href="index.html#download-top">DOWNLOAD APK</a><a class="btn light" href="support.html">24/7 SUPPORT</a></div></div>`;
  }

  function renderCard(row){
    const urls=getUrls(row), total=rowSize(row,urls), sizeLabel=total?fmtBytes(total):'Size unavailable';
    $('#apkArea').innerHTML=`<article class="my-download-card">
      <div class="apk-icon"><img src="clutch-zone-logo.png" alt="Clutch Zone"></div>
      <div class="apk-main"><div class="apk-kicker">OFFICIAL ANDROID PACKAGE</div><h2>${esc(row.title||'Clutch Zone APK')}</h2><div class="apk-meta"><span>VERSION ${esc(row.version||'LATEST')}</span><b>${esc(sizeLabel)}</b><span>${urls.length>1?esc(urls.length+' PARTS'): 'DIRECT APK'}</span></div><div class="download-progress-wrap"><div class="progress-line"><span id="downloadProgress"></span></div><div class="progress-row"><b id="downloadPercent">0%</b><span><span id="downloadDone">0 KB</span> / <span id="downloadTotal">${esc(sizeLabel)}</span></span></div></div><div class="download-status" id="downloadStatus">Ready to download</div><div class="download-actions"><button class="btn gold" id="startDownload">⬇ START DOWNLOAD</button><button class="btn stop-btn" id="stopDownload" disabled>■ STOP</button><button class="btn install-btn" id="installDownload" disabled>📦 INSTALL APK</button><button class="btn delete-download-btn" id="deleteDownload" type="button">🗑 DELETE SAVED APK</button></div><p class="download-note">Complete APK parts isi device/browser mein saved rahenge, isliye 10 din ya uske baad wapas aane par dobara download ki zarurat nahi hogi. Delete Saved APK se sirf is device ka saved APK/progress delete hoga; Name + UID profile safe rahegi.</p></div>
    </article>`;
    setProgress(0,total,'Ready to download');
    $('#startDownload').onclick=()=>download(row,urls,total);
    $('#stopDownload').onclick=()=>{stopped=true;controller?.abort();$('#downloadStatus').textContent='Download stopped. Resume ke liye START dabao.';$('#stopDownload').disabled=true;$('#startDownload').disabled=false};
    $('#installDownload').onclick=()=>installApk(row,urls,total);
    $('#deleteDownload').onclick=async()=>{if(!confirm('Is device se saved APK aur download progress delete karna hai?'))return;try{stopped=true;controller?.abort();await deleteSavedParts(identity().uid,row.id);setProgress(0,total,'Saved APK deleted. Dobara download kar sakte ho.');$('#installDownload').disabled=true;$('#stopDownload').disabled=true;$('#startDownload').disabled=false;$('#startDownload').textContent='⬇ START DOWNLOAD';toast('SAVED APK DELETED ✓')}catch(e){toast('Saved APK delete nahi hua.')}};
    restoreProgress(row,urls,total);
  }

  async function restoreProgress(row,urls,total){
    const id=identity(); if(!id||!urls.length)return;
    let done=0;let singleSavedSize=0;for(let i=0;i<urls.length;i++){const p=await getSavedPart(id.uid,row.id,i);if(p?.blob){const n=Number(p.size)||p.blob.size||0;done+=n;if(urls.length===1)singleSavedSize=n}}
    const displayTotal=total||((urls.length===1&&singleSavedSize)?singleSavedSize:0);
    setProgress(done,displayTotal,done?'Saved download found — resume ready':'Ready to download');
    if(displayTotal>0&&done===displayTotal){await requestPersistentStorage();setProgress(displayTotal,displayTotal,'APK SAVED ON THIS DEVICE ✓');$('#installDownload').disabled=false;$('#startDownload').disabled=true;$('#startDownload').textContent='✓ SAVED ON DEVICE'}
  }

  async function download(row,urls,total){
    if(!urls.length){toast('APK download link available nahi hai.');return}
    const id=identity();if(!id){renderNoIdentity();return}
    if(urls.length>1&&(!Number(total)||!Number(row.part_size_bytes))) {toast('Multipart APK ka original size/part size missing hai. Admin Panel se APK dobara upload karein.');return}
    stopped=false;controller=new AbortController();$('#startDownload').disabled=true;$('#stopDownload').disabled=false;$('#installDownload').disabled=true;toast('DOWNLOAD STARTED ✓');
    try{
      let done=0;let targetTotal=Number(total)||0;
      const saved=[];for(let i=0;i<urls.length;i++){const p=await getSavedPart(id.uid,row.id,i);if(p?.blob){const expected=expectedPartSize(row,urls,total,i);if(expected&&p.blob.size!==expected){await deleteSavedParts(id.uid,row.id);throw new Error(`Saved part ${i+1} size mismatch. Purane saved parts delete karke retry karein.`)}saved[i]=p;done+=Number(p.size)||p.blob.size}}
      if(!targetTotal&&urls.length===1&&saved[0]?.blob)targetTotal=saved[0].blob.size;
      setProgress(done,targetTotal,'Download resume ho raha hai…');
      for(let i=0;i<urls.length;i++){
        if(stopped)break;if(saved[i])continue;
        const r=await fetch(urls[i],{cache:'no-store',signal:controller.signal});if(!r.ok)throw new Error(`Part ${i+1} download failed (${r.status})`);
        if(!targetTotal&&urls.length===1){const cl=Number(r.headers.get('content-length')||0);if(cl>0){targetTotal=cl;setProgress(done,targetTotal,'APK download ho raha hai…')}}
        const reader=r.body?.getReader();let chunks=[],partDone=0;
        if(reader){while(true){const {done:rd,value}=await reader.read();if(rd)break;if(stopped){reader.cancel();throw new DOMException('Stopped','AbortError')}chunks.push(value);partDone+=value.byteLength;setProgress(done+partDone,targetTotal||done+partDone,urls.length>1?`Part ${i+1}/${urls.length} download ho raha hai…`:'APK download ho raha hai…')}}
        else{const b=await r.blob();chunks=[new Uint8Array(await b.arrayBuffer())];partDone=b.size}
        const expected=expectedPartSize(row,urls,total,i);if(expected&&partDone!==expected)throw new Error(`Part ${i+1} size mismatch: ${partDone}/${expected} bytes. Admin me APK size/parts check karein.`);
        if(urls.length===1&&!targetTotal)targetTotal=partDone;
        const blob=new Blob(chunks,{type:'application/vnd.android.package-archive'});await putSavedPart(id.uid,row.id,i,blob,partDone);saved[i]={blob,size:partDone};done+=partDone;setProgress(done,targetTotal||done,urls.length>1?`Part ${i+1}/${urls.length} complete ✓`:'APK download complete ✓');
      }
      if(targetTotal>0&&done===targetTotal&&!stopped){setProgress(targetTotal,targetTotal,'Download complete ✓');$('#stopDownload').disabled=true;$('#installDownload').disabled=false;$('#startDownload').disabled=false;toast('DOWNLOAD COMPLETE ✓ INSTALL APK dabao.');}
      else {$('#startDownload').disabled=false;if(targetTotal&&done>targetTotal)throw new Error(`APK size mismatch: ${done}/${targetTotal} bytes`);}
    }catch(e){if(e?.name!=='AbortError')toast(e?.message||'APK download failed');$('#startDownload').disabled=false;$('#stopDownload').disabled=true;$('#downloadStatus').textContent=e?.name==='AbortError'?'Download stopped.':'Download failed. Try again.'}
    finally{controller=null}
  }

  function isAndroid(){return /Android/i.test(navigator.userAgent||'')}
  function directApkUrl(row,urls){return urls.length===1 && /^https?:\/\//i.test(urls[0]) ? urls[0] : ''}
  function openAndroidInstallerIntent(url){
    try{
      const u=new URL(url,location.href);
      const intent=`intent://${u.host}${u.pathname}${u.search||''}#Intent;scheme=${u.protocol.replace(':','')};action=android.intent.action.VIEW;type=application/vnd.android.package-archive;end`;
      location.href=intent;
      return true;
    }catch{return false}
  }
  function showInstallHelp(message){
    const old=document.querySelector('#apkInstallHelp');
    if(old)old.remove();
    const el=document.createElement('div');
    el.id='apkInstallHelp';
    el.className='modal open';
    el.innerHTML=`<div class="modalbox install-help-box"><button class="modal-close" type="button" aria-label="Close">×</button><div class="install-help-icon">📦</div><div class="eyebrow">ANDROID INSTALL</div><h2>APK READY TO INSTALL</h2><p>${esc(message||'Android installer ko open karne ki koshish ki gayi hai.')}</p><div class="install-help-steps"><div><b>1</b><span>APK download complete hai.</span></div><div><b>2</b><span>Agar installer automatically na khule, <strong>Downloads</strong> me APK file open karo.</span></div><div><b>3</b><span>Android ka asli <strong>Install</strong> button dabao. Install hone ke baad app App Drawer/Home Screen me aa jayega, agar APK me launcher icon/activity configured hai.</span></div></div><button class="btn gold" type="button" id="closeInstallHelp">OK, GOT IT</button></div>`;
    document.body.appendChild(el);
    el.querySelector('.modal-close').onclick=()=>el.remove();
    el.querySelector('#closeInstallHelp').onclick=()=>el.remove();
  }
  async function installApk(row,urls,total){
    const id=identity();if(!id){renderNoIdentity();return}
    try{
      const direct=directApkUrl(row,urls);
      if(isAndroid() && direct){
        $('#downloadStatus').textContent='Opening Android installer…';
        toast('ANDROID INSTALLER OPEN HO RAHA HAI…');
        const ok=openAndroidInstallerIntent(direct);
        if(ok){setTimeout(()=>showInstallHelp('Agar Android installer screen nahi khuli, Chrome ne external intent ko block kiya ho sakta hai. Aise me Downloads se isi APK ko open karo.'),900);return}
      }
      const blobs=[];let size=0;
      for(let i=0;i<urls.length;i++){
        const p=await getSavedPart(id.uid,row.id,i);
        if(!p?.blob){toast(`Part ${i+1} missing hai. Pehle download complete karo.`);return}
        blobs.push(p.blob);size+=Number(p.size)||p.blob.size;
      }
      const expectedTotal=Number(total)||(urls.length===1?size:0);if(!expectedTotal||size!==expectedTotal){toast(expectedTotal?`APK size mismatch: ${size}/${expectedTotal} bytes`:'Original APK size metadata missing hai. Admin me size set karein.');return}
      const blob=new Blob(blobs,{type:'application/vnd.android.package-archive'});
      const file=new File([blob],fileName(row),{type:'application/vnd.android.package-archive',lastModified:Date.now()});
      if(isAndroid() && navigator.share && navigator.canShare?.({files:[file]})){
        $('#downloadStatus').textContent='APK Android share/open flow ready…';
        try{
          await navigator.share({title:file.name,text:'Clutch Zone APK',files:[file]});
          toast('APK FILE OPEN/SHARE HO GAYA ✓');
          return;
        }catch(e){if(e?.name==='AbortError')return;}
      }
      const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=file.name;a.type='application/vnd.android.package-archive';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(href),120000);
      $('#downloadStatus').textContent='APK saved. Downloads se APK open karke Install dabao.';
      showInstallHelp('Browser se direct Android Package Installer open karna guaranteed nahi hai. APK ko Downloads me open karoge to Android ka real Install screen aayega.');
    }catch(e){console.error(e);toast('APK install handoff nahi ho paya.');showInstallHelp('APK ready hai, lekin browser ne installer handoff allow nahi kiya. Downloads se APK open karke Install karo.')}
  }

  async function loadApk(autoStart){
    const id=identity();
    if(!id){showIdentityModal();return}
    const {data,error}=await db.from('apk_downloads').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(1);
    if(error){$('#apkArea').innerHTML=`<div class="notice">APK load nahi hua: ${esc(error.message)}</div>`;return}
    current=data?.[0]||null;
    if(!current){$('#apkArea').innerHTML='<div class="empty">Abhi koi active APK available nahi hai.</div>';return}
    renderCard(current);
    if(autoStart)setTimeout(async()=>{const urls=getUrls(current),total=rowSize(current,urls),id=identity();let done=0;if(id){for(let i=0;i<urls.length;i++){const p=await getSavedPart(id.uid,current.id,i);if(p?.blob)done+=Number(p.size)||p.blob.size||0}}if(done>=total&&total){toast('APK ALREADY SAVED ✓');return}toast('DOWNLOADING STARTED ✓');download(current,urls,total)},120);
  }

  async function load(){
    if(!configReady()){toast('Supabase config check karo.');renderNoIdentity();return}
    db=window.CLUTCH_SUPABASE||window.supabase.createClient(C.SUPABASE_URL,C.SUPABASE_ANON_KEY);window.CLUTCH_SUPABASE=db;
    partsDb=await openDb();
    $('#downloadIdentityClose')?.addEventListener('click',closeIdentityModal);
    $('#downloadIdentityModal')?.addEventListener('click',e=>{if(e.target.id==='downloadIdentityModal')closeIdentityModal()});
    $('#downloadIdentityForm')?.addEventListener('submit',async e=>{e.preventDefault();const name=$('#downloadPlayerName')?.value.trim(),uid=$('#downloadPlayerUid')?.value.trim();if(!name||!uid)return toast('Name aur UID dono bharo.');const btn=e.currentTarget.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='SAVING…'}try{await saveIdentity(name,uid);closeIdentityModal();await loadApk(new URLSearchParams(location.search).get('autostart')==='1')}catch(err){toast(err?.message||'Profile save nahi hua.')}finally{if(btn){btn.disabled=false;btn.textContent='SAVE PROFILE & CONTINUE →'}}});
    await loadApk(new URLSearchParams(location.search).get('autostart')==='1');
  }
  document.addEventListener('DOMContentLoaded',load);
})();
