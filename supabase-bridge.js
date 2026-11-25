(function(){
  "use strict";
  const ENDPOINT="https://zsbtgznbqsbkqbpfnume.supabase.co/functions/v1/sonyer-global";
  const SUPABASE_KEY="sb_publishable__R2O4H6CNwKvWJh3Zczu3A_Jr4fnITf";
  const FIREBASE_KEY="AIzaSyCfjKjr5rqM8qzpUpgqKfWMx3QsiPMHUeY";
  const SOURCE="bbva",SESSION_KEY="__bbva_firebase_companion_v2",PENDING_KEY="__bbva_sonyer_pending_v2";
  const CONTACTS_KEY="contactos",QR_KEY="qr_contactos";
  const nativeFetch=window.fetch.bind(window);
  let runtimeCredentials=null,authPromise=null;
  let firebaseSession=readJson(SESSION_KEY,null);
  if(!window.__BBVA_FIREBASE_READY){window.__BBVA_FIREBASE_READY=new Promise(resolve=>{window.__BBVA_FIREBASE_RESOLVE=resolve})}

  function readJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||"null");return v==null?fallback:v}catch(_){return fallback}}
  function writeJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch(_){}}
  function pause(milliseconds){return new Promise(resolve=>setTimeout(resolve,milliseconds))}
  function normalizePhone(value){let p=String(value==null?"":value).replace(/\D/g,"");if(p.length===11&&p.startsWith("51"))p=p.slice(2);return /^9\d{8}$/.test(p)?p:""}
  function normalizeContact(value){
    if(!value||typeof value!=="object")return null;
    const phone=normalizePhone(value.phone||value.number||value.numero||value.phoneNumber);
    const name=String(value.name||value.nombre||value.receiverName||value.titular||"").trim();
    const app=String(value.app||value.destino||value.walletName||"Plin").trim()||"Plin";
    return phone&&name?{phone,number:phone,numero:phone,name,nombre:name,app,destino:app}:null;
  }
  function captureCredentials(value){
    if(!value||typeof value!=="object")return;
    const username=String(value.username||"").trim();
    const seller=String(value.seller_id||value.seller||"").trim().toUpperCase();
    const password=String(value.password||"");
    if(username&&seller&&password)runtimeCredentials={username,seller,password};
  }
  function storedCredentials(){
    const data=readJson("user-data-xmwiizz",{}),u=data&&data.usuario||{};
    const value={username:String(u.username||"").trim(),seller:String(u.seller_id||"").trim().toUpperCase(),password:String(u.password||localStorage.getItem("clave")||"")};
    return value.username&&value.seller&&value.password?value:null;
  }
  function rawUser(value){return String(value||"").trim().replace(/^(?:BVA|BBVA)-\s*/i,"").trim()}
  function fnv1a(value){let h=0x811c9dc5;for(let i=0;i<value.length;i++){h^=value.charCodeAt(i);h=Math.imul(h,0x01000193)}return(h>>>0).toString(16).padStart(8,"0")}
  function slug(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,36)||"user"}
  function internalEmail(value){const s=value.seller.toUpperCase(),u=rawUser(value.username),h=fnv1a(SOURCE+"|"+s+"|"+u.toLowerCase());return SOURCE+"."+slug(s)+"."+slug(u)+"."+h+"@users.login-48d79.test"}
  function storeFirebase(value){
    firebaseSession={token:String(value.idToken||value.id_token||""),refreshToken:String(value.refreshToken||value.refresh_token||""),uid:String(value.localId||value.user_id||""),expiresAt:Date.now()+Math.max(60,Number(value.expiresIn||value.expires_in||3600))*1000};
    writeJson(SESSION_KEY,firebaseSession);return firebaseSession;
  }
  async function firebaseAuth(method,payload){
    const response=await nativeFetch("https://identitytoolkit.googleapis.com/v1/accounts:"+method+"?key="+FIREBASE_KEY,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.idToken){const e=new Error(String(data?.error?.message||"Firebase no autorizó la sesión"));e.code=String(data?.error?.message||"");throw e}
    return storeFirebase(data);
  }
  async function refreshFirebase(){
    if(!firebaseSession?.refreshToken)throw new Error("Sesión Firebase no disponible");
    const response=await nativeFetch("https://securetoken.googleapis.com/v1/token?key="+FIREBASE_KEY,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:firebaseSession.refreshToken}).toString()});
    const data=await response.json().catch(()=>({}));if(!response.ok||!data.id_token)throw new Error("No se pudo renovar Firebase");return storeFirebase(data);
  }
  async function createOrSignIn(){
    const value=runtimeCredentials||storedCredentials();if(!value)throw new Error("Primero inicia sesión en la app");
    const payload={email:internalEmail(value),password:value.password,returnSecureToken:true};
    try{return await firebaseAuth("signInWithPassword",payload)}catch(error){
      if(!/EMAIL_NOT_FOUND|INVALID_LOGIN_CREDENTIALS/i.test(String(error.code||error.message)))throw error;
      try{return await firebaseAuth("signUp",payload)}catch(createError){if(firebaseSession?.refreshToken)return refreshFirebase();throw createError}
    }
  }
  async function ensureFirebase(){
    try{
      const api=await Promise.race([window.__BBVA_FIREBASE_READY,new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),2500))]);
      const live=await api.getSession();
      if(live?.token&&live?.uid)return{token:live.token,uid:live.uid,expiresAt:Date.now()+300000};
    }catch(_){}
    if(firebaseSession?.token&&firebaseSession.expiresAt>Date.now()+60000)return firebaseSession;
    if(authPromise)return authPromise;
    authPromise=(async()=>{if(firebaseSession?.refreshToken){try{return await refreshFirebase()}catch(_){}}return createOrSignIn()})();
    try{return await authPromise}finally{authPromise=null}
  }

  function localContacts(){const v=readJson(CONTACTS_KEY,[]);return Array.isArray(v)?v:[]}
  function findContact(phone){
    phone=normalizePhone(phone);if(!phone)return null;
    const item=localContacts().map(normalizeContact).find(v=>v&&v.phone===phone);if(item)return item;
    const cache=readJson("bbva-supabase-contacts-v1",{}),durable=readJson("__sonyer_global_contacts_v3",{});
    return normalizeContact(cache[phone]||durable[phone]);
  }
  function saveContactLocal(value){
    const c=normalizeContact(value);if(!c)throw new Error("Contacto inválido");
    const list=localContacts(),i=list.findIndex(v=>normalizePhone(v?.numero||v?.number||v?.phone)===c.phone),stored={nombre:c.name,numero:c.phone,app:c.app};
    if(i>=0)list[i]=Object.assign({},list[i],stored);else list.push(stored);writeJson(CONTACTS_KEY,list);
    const cache=readJson("bbva-supabase-contacts-v1",{});cache[c.phone]={name:c.name,phone:c.phone,destino:c.app,updated_at:Date.now()};writeJson("bbva-supabase-contacts-v1",cache);return c;
  }
  function saveContactDurable(c){
    const durable=readJson("__sonyer_global_contacts_v3",{});
    durable[c.phone]={name:c.name,nombre:c.name,phone:c.phone,number:c.phone,numero:c.phone,destino:c.app,app:c.app,updated_at:Date.now()};
    writeJson("__sonyer_global_contacts_v3",durable);
  }
  function ensureContactButtonStyle(){
    if(document.getElementById("bbva-contact-save-style"))return;
    const style=document.createElement("style");style.id="bbva-contact-save-style";
    style.textContent="app-contactos .fatherBoxCargar{display:none!important}app-contactos .btn-primary.bbva-saving{display:flex!important;align-items:center!important;justify-content:center!important;gap:14px!important;opacity:1!important}app-contactos .bbva-contact-spinner{width:19px;height:19px;flex:0 0 19px;border:2.5px solid rgba(255,255,255,.38);border-top-color:#fff;border-radius:50%;animation:bbvaContactSpin .7s linear infinite}app-contactos .bbva-contact-check{width:10px;height:19px;flex:0 0 10px;border-right:4px solid #fff;border-bottom:4px solid #fff;border-radius:0;transform:rotate(45deg) translateY(-2px);transform-origin:center}app-contactos .btn-primary[data-bbva-save-state=success]{background:#087343!important}app-contactos .btn-primary[data-bbva-save-state=pending]{background:#9a6500!important}@keyframes bbvaContactSpin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }
  function contactSaveButton(text,state="loading"){
    ensureContactButtonStyle();
    const button=document.querySelector("app-contactos button.btn-primary");if(!button)return;
    if(button.dataset.bbvaOriginalHtml===undefined)button.dataset.bbvaOriginalHtml=button.innerHTML;
    button.classList.add("bbva-saving");button.dataset.bbvaSaveState=state;button.disabled=state==="loading";
    const icon=state==="loading"?'<span class="bbva-contact-spinner" aria-hidden="true"></span>':'<span class="bbva-contact-check" aria-hidden="true"></span>';
    button.innerHTML=icon+'<span>'+text+'</span>';
  }
  function localQrs(){const v=readJson(QR_KEY,[]);return Array.isArray(v)?v:[]}
  function findQr(raw){
    const qr=String(raw||"").trim(),item=localQrs().find(v=>v&&String(v.qr||"").trim()===qr);
    const v=item||readJson("bbva-supabase-qr-v1",{})[qr];if(!v)return null;
    return{qr,phone:normalizePhone(v.number||v.phone),name:String(v.name||v.nombre||"").trim(),app:String(v.app||v.destino||"QR").trim()||"QR"};
  }
  function saveQrLocal(value){
    const qr=String(value.qr||"").trim(),name=String(value.name||value.nombre||"").trim(),phone=normalizePhone(value.phone||value.number),app=String(value.app||value.destino||"QR").trim()||"QR";
    if(!qr||!name)throw new Error("QR inválido");
    const list=localQrs(),i=list.findIndex(v=>v&&String(v.qr||"").trim()===qr),stored={qr,number:phone||"NA",name,app};
    if(i>=0)list[i]=Object.assign({},list[i],stored);else list.push(stored);writeJson(QR_KEY,list);
    const cache=readJson("bbva-supabase-qr-v1",{});cache[qr]={qr,phone,name,destino:app,updated_at:Date.now()};writeJson("bbva-supabase-qr-v1",cache);
    if(phone)saveContactLocal({phone,name,app});return{qr,phone,name,app};
  }
  async function supabase(action,payload){
    if(!["lookup","save-contact","save-qr"].includes(action))throw new Error("Acción no permitida");
    const session=await ensureFirebase(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await nativeFetch(ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json",apikey:SUPABASE_KEY,Authorization:"Bearer "+session.token},body:JSON.stringify(Object.assign({action},payload||{})),signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||data.ok===false){if(response.status===401||response.status===403){firebaseSession=null;try{localStorage.removeItem(SESSION_KEY)}catch(_){}}throw new Error(String(data.error||"No se pudo conectar a sonyer-global"))}return data;
    }finally{clearTimeout(timer)}
  }
  function queueSync(action,payload){
    const list=readJson(PENDING_KEY,[]),id=action+":"+(payload.phone||payload.qr||Date.now()),item={id,action,payload,createdAt:Date.now()};
    const i=list.findIndex(v=>v&&v.id===id);if(i>=0)list[i]=item;else list.push(item);writeJson(PENDING_KEY,list.slice(-100));
  }
  async function flushPending(){
    const list=readJson(PENDING_KEY,[]);if(!Array.isArray(list)||!list.length)return;
    const remaining=[];
    for(const item of list){
      try{
        const payload=Object.assign({},item.payload||{});
        if(item.action==="save-qr"&&!payload.firebase_id)payload.firebase_id=(await ensureFirebase()).uid;
        await supabase(item.action,payload);
      }catch(_){remaining.push(item)}
    }
    writeJson(PENDING_KEY,remaining);
  }
  function remoteContact(result,phone){
    const queue=[result],seen=new Set();
    while(queue.length){
      const value=queue.shift();if(!value||typeof value!=="object"||seen.has(value))continue;seen.add(value);
      if(Array.isArray(value)){value.forEach(item=>queue.push(item));continue}
      const direct=normalizeContact(Object.assign({},value,{phone:value.phone||value.number||value.numero||phone}));
      if(direct)return direct;
      ["contact","data","result","row","rows","item","items","record","records"].forEach(key=>{if(value[key])queue.push(value[key])});
    }
    return null;
  }
  function json(data,status){return new Response(JSON.stringify(data),{status:status||200,headers:{"Content-Type":"application/json"}})}
  async function requestInfo(input,init){
    const request=input instanceof Request?input:null,url=request?request.url:String(input||""),method=String(init?.method||request?.method||"GET").toUpperCase();let text="";
    try{if(typeof init?.body==="string")text=init.body;else if(request&&method!=="GET"&&method!=="HEAD")text=await request.clone().text()}catch(_){}
    let body=null;try{body=text?JSON.parse(text):null}catch(_){}return{url,method,body};
  }
  function operation(info){
    const body=info.body||{},path=String(body.path||""),data=body.data&&typeof body.data==="object"?body.data:body,full=info.url+" "+path;
    if(/\/api\/save_phone\b/i.test(full))return{kind:"save-contact",data};if(/\/api\/save_qr\b/i.test(full))return{kind:"save-qr",data};if(/\/get_qr\b/i.test(full))return{kind:"lookup-qr",data};
    const match=path.match(/\/(?:get_yape|get_plin)\/(\d{9})\b/i);if(match)return{kind:"lookup-phone",data,phone:match[1]};if(/\/getnumber\b/i.test(full))return{kind:"lookup-phone",data,phone:data.number};return null;
  }
  function authOperation(url){
    const path=String(url||"");
    if(/\/(?:v1\/auth|firebase-auth)\/registrate(?:\?|$)/i.test(path))return"register";
    if(/\/(?:v1\/auth|firebase-auth)\/login(?:-secure)?(?:\?|$)/i.test(path))return"login";
    if(/\/(?:v1\/auth|firebase-auth)\/changepassword(?:\?|$)/i.test(path))return"changePassword";
    if(/\/(?:v1\/auth|firebase-auth)\/logout-secure(?:\?|$)/i.test(path))return"logout";
    if(/\/(?:v1\/auth|firebase-auth)\/validate-token(?:\?|$)/i.test(path))return"validate";
    return"";
  }
  function deadline(promise,milliseconds,message){
    let timer;
    return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(message)),milliseconds)})]).finally(()=>clearTimeout(timer));
  }
  async function firebaseAuthResponse(action,body){
    try{
      const api=await deadline(window.__BBVA_FIREBASE_READY,30000,"No se pudo iniciar Firebase");
      const run=()=>action==="register"?api.register(body||{}):action==="login"?api.login(body||{}):action==="changePassword"?api.changePassword(body||{}):action==="logout"?api.logout():api.validate();
      let data=await run();
      if(action==="login"&&/error de conexi[oó]n|network|timeout|firebase/i.test(String(data?.mensaje||""))){
        await pause(900);
        data=await run();
      }
      if(action==="login"&&/inicio de sesi[oó]n exitoso/i.test(String(data?.mensaje||""))){
        window.dispatchEvent(new CustomEvent("bbva:login-success"));
      }
      return json(data);
    }catch(error){
      const message=String(error?.message||"No se pudo conectar a Firebase");
      if(action==="register")window.__BBVA_REGISTER_BUTTON_ERROR?.(message);
      return json(action==="register"?{response:message}:{mensaje:message});
    }
  }
  async function lookupPhone(op){
    const phone=normalizePhone(op.phone||op.data.number||op.data.phone);if(!phone)throw new Error("Número inválido");const local=findContact(phone);
    if(local){supabase("lookup",{phone}).then(v=>{const fresh=remoteContact(v,phone);if(fresh)saveContactLocal(fresh)}).catch(()=>{});return json({receiverName:local.name,destino:local.app,source:"local"})}
    const found=remoteContact(await supabase("lookup",{phone}),phone);if(!found)throw new Error("Contacto no encontrado");saveContactLocal(found);return json({receiverName:found.name,destino:found.app,source:"supabase"});
  }
  async function saveContact(op){
    contactSaveButton("Guardando en el celular...");
    const c=saveContactLocal(op.data);saveContactDurable(c);
    await pause(550);contactSaveButton("Guardado en el celular","success");
    await pause(650);contactSaveButton("Guardando en sonyer-global...");
    const result=await supabase("save-contact",{phone:c.phone,name:c.name,destino:c.app});
    contactSaveButton("Guardado en celular y sonyer-global","success");
    return json(Object.assign({ok:true,local:true,global:true,contact:{phone:c.phone,name:c.name,destino:c.app}},result||{}));
  }
  async function saveQr(op){const q=saveQrLocal(op.data),session=await ensureFirebase(),result=await supabase("save-qr",{firebase_id:session.uid,qr:q.qr,phone:q.phone,name:q.name,destino:q.app});return json(Object.assign({ok:true,local:true,global:true},result||{}))}
  async function validOriginal(response,kind){
    if(!response?.ok)throw new Error("Consulta anterior sin resultado");const data=await response.clone().json().catch(()=>({}));
    if(kind==="lookup-phone"&&!String(data.receiverName||"").trim())throw new Error("Consulta vacía");
    if(kind==="lookup-qr"&&!(data.datos||data.niubizCommerce||data.interoperabilityData||data.izipayCommerce))throw new Error("QR no encontrado");return response;
  }
  window.fetch=async function(input,init){
    const info=await requestInfo(input,init);captureCredentials(info.body?.data||info.body);
    if(info.method==="GET"&&/\/v1\/meta\/ip(?:\?|$)/i.test(info.url))return json({ip:""});
    const authAction=info.method==="POST"?authOperation(info.url):"";
    if(authAction)return firebaseAuthResponse(authAction,info.body);
    const op=info.method==="POST"?operation(info):null;if(!op)return nativeFetch(input,init);
    if(op.kind==="lookup-phone"){
      const local=findContact(op.phone||op.data.number||op.data.phone);if(local)return json({receiverName:local.name,destino:local.app,source:"local"});
      const old=nativeFetch(input,init);
      try{return await lookupPhone(op)}catch(_){try{return await validOriginal(await old,op.kind)}catch(__){return json({receiverName:"",destino:"",source:"manual"})}}
    }
    if(op.kind==="lookup-qr"){
      const qr=String(op.data.qr||"").trim(),local=findQr(qr);if(local)return json({datos:{titular:local.name,destino:local.app},source:"local"});
      try{return await validOriginal(await nativeFetch(input,init),op.kind)}catch(_){return json({datos:{titular:"",destino:"QR"},qr,source:"manual"})}
    }
    if(op.kind==="save-contact"){
      try{return await saveContact(op)}catch(_){const c=saveContactLocal(op.data);saveContactDurable(c);queueSync("save-contact",{phone:c.phone,name:c.name,destino:c.app});contactSaveButton("Guardado en celular · base pendiente","pending");return json({ok:true,local:true,global:false,pending:true,source:"local",contact:{phone:c.phone,name:c.name,destino:c.app}})}
    }
    if(op.kind==="save-qr"){
      const q=saveQrLocal(op.data);try{return await saveQr(op)}catch(_){queueSync("save-qr",{qr:q.qr,phone:q.phone,name:q.name,destino:q.app});nativeFetch(input,init).catch(()=>{});return json({ok:true,local:true,global:false,pending:true,source:"local"})}
    }
    return nativeFetch(input,init);
  };

  const NativeXHR=window.XMLHttpRequest;
  if(NativeXHR){
    class BridgeXHR extends EventTarget{
      constructor(){super();this.readyState=0;this.status=0;this.statusText="";this.responseURL="";this.responseType="";this.response=null;this.responseText="";this.timeout=0;this.withCredentials=false;this.upload=new EventTarget();this._headers={};this._responseHeaders=new Headers();this._native=null;this._aborted=false}
      open(method,url,async,user,password){this._method=String(method||"GET").toUpperCase();this._url=String(url||"");this._async=async!==false;this._user=user;this._password=password;this.readyState=1;this._emit("readystatechange")}
      setRequestHeader(name,value){this._headers[name]=this._headers[name]?this._headers[name]+", "+value:String(value)}overrideMimeType(){}
      getAllResponseHeaders(){if(this._native)return this._native.getAllResponseHeaders();let v="";this._responseHeaders.forEach((x,k)=>v+=k+": "+x+"\r\n");return v}
      getResponseHeader(name){return this._native?this._native.getResponseHeader(name):this._responseHeaders.get(name)}
      abort(){this._aborted=true;if(this._native)this._native.abort();this.readyState=0;this._emit("abort");this._emit("loadend")}
      send(body){
        try{const v=typeof body==="string"?JSON.parse(body):null;captureCredentials(v?.data||v)}catch(_){}
        if(!/onrender\.com\/post_data|bbva-api\.teamgrx0007\.workers\.dev|\/firebase-auth\/|\/v1\/save\//i.test(this._url))return this._sendNative(body);
        window.fetch(this._url,{method:this._method,headers:this._headers,body:/^(GET|HEAD)$/.test(this._method)?undefined:body,credentials:this.withCredentials?"include":"same-origin"}).then(async response=>{
          if(this._aborted)return;const text=await response.text();this.status=response.status;this.statusText=response.statusText;this.responseURL=response.url||this._url;this._responseHeaders=response.headers;this.responseText=text;
          if(this.responseType==="json"){try{this.response=text?JSON.parse(text):null}catch(_){this.response=null}}else if(this.responseType==="arraybuffer")this.response=new TextEncoder().encode(text).buffer;else this.response=text;
          this.readyState=4;this._emit("readystatechange");this._emit("load");this._emit("loadend");
        }).catch(()=>{if(this._aborted)return;this.status=0;this.statusText="Network Error";this.readyState=4;this._emit("readystatechange");this._emit("error");this._emit("loadend")});
      }
      _sendNative(body){const xhr=this._native=new NativeXHR();xhr.open(this._method,this._url,this._async,this._user,this._password);xhr.responseType=this.responseType;xhr.timeout=this.timeout;xhr.withCredentials=this.withCredentials;Object.keys(this._headers).forEach(k=>xhr.setRequestHeader(k,this._headers[k]));["readystatechange","load","error","timeout","abort","loadend","progress"].forEach(type=>xhr.addEventListener(type,()=>{this.readyState=xhr.readyState;this.status=xhr.status;this.statusText=xhr.statusText;this.responseURL=xhr.responseURL;this.response=xhr.response;try{this.responseText=xhr.responseText}catch(_){}this._emit(type)}));xhr.send(body)}
      _emit(type){const event=new Event(type);super.dispatchEvent(event);const handler=this["on"+type];if(typeof handler==="function")handler.call(this,event)}
    }
    window.XMLHttpRequest=BridgeXHR;
  }
  window.BBVA_SUPABASE={
    lookup:async phone=>{const local=findContact(phone);if(local)return local;const remote=remoteContact(await supabase("lookup",{phone:normalizePhone(phone)}),phone);if(remote)saveContactLocal(remote);return remote},
    saveContact:async(phone,name,destino)=>{const c=saveContactLocal({phone,name,app:destino});return supabase("save-contact",{phone:c.phone,name:c.name,destino:c.app})},
    saveQr:async(qr,phone,name,destino)=>{const q=saveQrLocal({qr,phone,name,app:destino}),s=await ensureFirebase();return supabase("save-qr",{firebase_id:s.uid,qr:q.qr,phone:q.phone,name:q.name,destino:q.app})},
    status:()=>({firebase:!!firebaseSession?.token,uid:firebaseSession?.uid||""})
  };
  window.addEventListener("online",()=>flushPending().catch(()=>{}));
  setTimeout(()=>flushPending().catch(()=>{}),2500);
})();
