(function(){
  'use strict';
  const CFG=window.CLUTCH_CONFIG||{};
  const $=s=>document.querySelector(s);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let db=null,lastSignature='',currentUser=null;
  const configReady=()=>window.supabase&&CFG.SUPABASE_URL?.startsWith('https://')&&CFG.SUPABASE_ANON_KEY&&!CFG.SUPABASE_ANON_KEY.includes('YOUR_');
  const notice=t=>{const el=$('#chatNotice');if(el)el.textContent=t};
  const saveLocal=(k,v)=>{try{localStorage.setItem(k,v)}catch{};try{document.cookie=encodeURIComponent(k)+'='+encodeURIComponent(v)+'; max-age=31536000; path=/; SameSite=Lax'}catch{}};
  const getLocal=k=>{try{const v=localStorage.getItem(k);if(v)return v}catch{};try{const m=document.cookie.match(new RegExp('(?:^|; )'+encodeURIComponent(k)+'=([^;]*)'));return m?decodeURIComponent(m[1]):''}catch{return ''}};
  function setState(state){
    $('#registerPanel')?.classList.toggle('hide',state!=='register');
    $('#chatPanelInner')?.classList.toggle('hide',state!=='chat');
  }
  function showChat(user){
    currentUser=user;
    saveLocal('cz-support-uid',user.uid);
    saveLocal('cz-support-name',user.display_name||'Player');
    saveLocal('cz-support-id',user.id||'');
    setState('chat');
    notice('24/7 private support chat open hai.');
    loadChat();
  }
  async function register(){
    const name=$('#regName')?.value.trim(),uid=$('#regUid')?.value.trim();
    if(!name||!uid){notice('Name aur UID dono bharna zaroori hai.');return}
    if(name.length>32||uid.length>64){notice('Name/UID length limit check karo.');return}
    if(!db){notice('Supabase config check karo.');return}
    const {data,error}=await db.rpc('register_support_user',{p_display_name:name,p_uid:uid});
    if(error){console.error('register_support_user RPC error',error);notice('Save nahi hua: '+(error.message||'Database error'));return}
    const row=data?.[0];
    if(!row){notice('Registration response nahi mila. Latest supabase_setup.sql run karo.');return}
    const user={id:row.result_id,display_name:row.result_name,uid:row.result_uid};
    if(row.already_registered){
      showChat(user);
      notice('Ye UID pehle se registered hai. Tumhara 24/7 group chat direct open ho gaya.');
      return;
    }
    showChat(user);
    notice('Registration saved ✓ 24/7 group chat direct open ho gaya.');
  }
  async function loadChat(){
    if(!db||!currentUser)return;
    const {data:identity,error:identityError}=await db.rpc('verify_support_identity',{p_display_name:currentUser.display_name,p_uid:currentUser.uid});
    if(identityError){console.error('identity check error',identityError);return}
    if(!identity?.[0]){clearIdentity();return}
    let {data,error}=await db.rpc('get_support_messages',{p_display_name:currentUser.display_name,p_uid:currentUser.uid});
    if(error){console.error('group chat load error',error);notice(error.message||'Chat load nahi ho raha.');return}
    const sig=(data||[]).map(x=>`${x.id}|${x.message}|${x.is_admin}|${x.created_at}`).join('\u0001');
    if(sig===lastSignature)return;
    lastSignature=sig;
    const box=$('#chatMessages');if(!box)return;
    box.innerHTML=(data||[]).map(m=>`<article class="chat-bubble ${m.is_admin?'admin-bubble':''}"><div class="chat-meta"><b>${m.is_admin?'👑 ':''}${esc(m.display_name||'Player')}</b><time>${new Date(m.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})}</time></div><p>${esc(m.message)}</p></article>`).join('')||'<div class="empty">Chat shuru karo — pehla message bhejo!</div>';
    box.scrollTop=box.scrollHeight;
  }
  function clearIdentity(){
    currentUser=null;
    lastSignature='';
    ['cz-support-uid','cz-support-name','cz-support-id'].forEach(k=>{
      try{localStorage.removeItem(k)}catch{}
      try{document.cookie=encodeURIComponent(k)+'=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax'}catch{}
    });
    setState('register');
    notice('Is UID ka registration ab available nahi hai. Chat karne ke liye Name + UID dobara save karo.');
  }
  async function sendMessage(message){
    if(!currentUser){notice('Chat access ke liye Name + UID save karo.');setState('register');return false}
    const {data:check,error:checkError}=await db.rpc('verify_support_identity',{p_display_name:currentUser.display_name,p_uid:currentUser.uid});
    if(checkError){notice(checkError.message||'Account verify nahi ho raha.');return false}
    if(!check?.[0]){clearIdentity();return false}
    currentUser={id:check[0].result_id,display_name:check[0].result_name,uid:check[0].result_uid};
    const {error}=await db.rpc('send_support_message',{p_display_name:currentUser.display_name,p_uid:currentUser.uid,p_message:message});
    if(error){
      if(/registered uid required|not registered|user.*not found/i.test(error.message||''))clearIdentity();
      else notice(error.message||'Message send nahi hua.');
      return false;
    }
    return true;
  }
  async function restore(){
    const uid=getLocal('cz-support-uid');
    if(!uid){setState('register');return}
    try{
      const {data,error}=await db.rpc('verify_support_identity',{p_display_name:getLocal('cz-support-name')||'',p_uid:uid});
      if(error){
        const name=getLocal('cz-support-name')||'Player',id=getLocal('cz-support-id')||'';
        showChat({id,display_name:name,uid});
        return;
      }
      if(!data?.[0]){clearIdentity();return}
      showChat({id:data[0].result_id,display_name:data[0].result_name,uid:data[0].result_uid});
    }catch(err){
      console.error('identity restore error',err);
      const name=getLocal('cz-support-name')||'Player',id=getLocal('cz-support-id')||'';
      showChat({id,display_name:name,uid});
    }
  }
  async function init(){
    if(!configReady()){notice('Pehle config.js mein Supabase URL/key set karo.');setState('register');return}
    db=window.CLUTCH_SUPABASE||window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY);
    window.CLUTCH_SUPABASE=db;
    $('#registerForm')?.addEventListener('submit',e=>{e.preventDefault();register()});
    $('#chatForm')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const input=form?.elements?.message;const msg=input?.value?.trim()||'';if(!msg)return;const ok=await sendMessage(msg);if(ok){form.reset();if(input)input.value='';lastSignature='';await loadChat()}});
    await restore();
    setInterval(()=>{if(currentUser)loadChat()},4000);
  }
  document.addEventListener('DOMContentLoaded',init);
})();
