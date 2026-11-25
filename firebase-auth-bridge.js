import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, updatePassword, deleteUser, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const firebaseConfig={
  apiKey:"AIzaSyCfjKjr5rqM8qzpUpgqKfWMx3QsiPMHUeY",
  authDomain:"login-48d79.firebaseapp.com",
  projectId:"login-48d79",
  storageBucket:"login-48d79.firebasestorage.app",
  messagingSenderId:"1081911677152",
  appId:"1:1081911677152:web:dfe5416b6fe656f8994085",
  measurementId:"G-KG2RDVTX9E"
};
const app=getApps().find(value=>value.name==="bbva-v4")||initializeApp(firebaseConfig,"bbva-v4");
const auth=getAuth(app),db=getFirestore(app);
const APP_NAME="BBVA",APP_SOURCE="bbva",DEVICE_KEY="__bbva_device_id_v1";
const CREATED_MESSAGE="Cuenta creada correctamente. Ahora necesita la aprobación del vendedor.";
const DEVICE_CHANGE_PREFILL="__bbva_device_change_prefill_v1";
let stopUserWatch=null;
let stopApprovalWatch=null;
let approvalMessageTimer=null;
let deviceTransition=false;

function seller(value){return String(value??"").trim().toUpperCase()}
function rawUser(value){return String(value??"").trim().replace(/^(?:BBVA|BVA)-\s*/i,"").trim()}
function loginUsername(value){return APP_NAME+"-"+rawUser(value)}
function appUsername(value){return APP_NAME+"_"+rawUser(value)}
function fnv1a(value){let hash=0x811c9dc5;for(let i=0;i<value.length;i++){hash^=value.charCodeAt(i);hash=Math.imul(hash,0x01000193)}return(hash>>>0).toString(16).padStart(8,"0")}
function slug(value){return String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").slice(0,36)||"user"}
function internalEmail(sellerId,username){const s=seller(sellerId),u=rawUser(username),hash=fnv1a(APP_SOURCE+"|"+s+"|"+u.toLowerCase());return `${APP_SOURCE}.${slug(s)}.${slug(u)}.${hash}@users.login-48d79.test`}
function deviceId(){let id="";try{id=localStorage.getItem(DEVICE_KEY)||""}catch(_){}if(!id){try{id=crypto.randomUUID()}catch(_){id="dev-"+Date.now()+"-"+Math.random().toString(36).slice(2)}try{localStorage.setItem(DEVICE_KEY,id)}catch(_){}}return id}
function saveDeviceChangePrefill(sellerId,username,password){
  try{sessionStorage.setItem(DEVICE_CHANGE_PREFILL,JSON.stringify({sellerId:seller(sellerId),username:rawUser(username),password:String(password||"")}))}catch(_){}
}
function prefillChangePassword(){
  const root=document.querySelector("app-cambiarpassword");if(!root||root.dataset.bbvaPrefilled==="1")return;
  let data=null;try{data=JSON.parse(sessionStorage.getItem(DEVICE_CHANGE_PREFILL)||"null")}catch(_){}
  if(!data)return;
  const inputs=Array.from(root.querySelectorAll("input"));if(inputs.length<4)return;
  const values=[String(data.sellerId||"").toUpperCase(),String(data.username||""),String(data.password||"")];
  values.forEach((value,index)=>{
    const input=inputs[index];input.value=value;
    input.dispatchEvent(new Event("input",{bubbles:true}));
    input.dispatchEvent(new Event("change",{bubbles:true}));
  });
  root.dataset.bbvaPrefilled="1";
  inputs[3]?.focus();
}
function errorMessage(error,fallback){
  const code=String(error?.code||error?.message||"");
  if(code.includes("email-already-in-use"))return"El usuario ya existe";
  if(code.includes("invalid-credential")||code.includes("wrong-password")||code.includes("user-not-found"))return"Usuario o contraseña incorrectos";
  if(code.includes("weak-password"))return"La contraseña debe tener al menos 6 caracteres";
  if(code.includes("too-many-requests"))return"Demasiados intentos. Intenta nuevamente más tarde";
  if(code.includes("network-request-failed"))return"Error de conexión. Verifica tu internet";
  if(code.includes("permission-denied"))return"Firebase rechazó el acceso";
  return fallback||"No se pudo completar la operación";
}
function transientFirebaseError(error){
  const value=String(error?.code||error?.message||"").toLowerCase();
  return value.includes("network-request-failed")||value.includes("unavailable")||value.includes("deadline-exceeded")||value.includes("internal")||value.includes("timeout");
}
async function retryFirebase(task,attempts=3){
  let lastError;
  for(let attempt=0;attempt<attempts;attempt++){
    try{return await task()}
    catch(error){
      lastError=error;
      if(!transientFirebaseError(error)||attempt===attempts-1)throw error;
      await new Promise(resolve=>setTimeout(resolve,650*(attempt+1)));
    }
  }
  throw lastError;
}
function registerButton(text,done=false,error=false){
  const root=document.querySelector("app-registrar-user")||document,button=root.querySelector("button.auth-submit");
  if(!button)return;
  const icon=done?"<svg class=\"bbva-btn-check\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><polyline points=\"3 13 9 19 21 5\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"3\" stroke-linecap=\"square\" stroke-linejoin=\"miter\"></polyline></svg>":error?"<span class=\"bbva-btn-error\">!</span>":"<span class=\"bbva-btn-spinner\" aria-hidden=\"true\"></span>";
  button.innerHTML=`${icon}<span>${text}</span>`;
  button.disabled=!error;
  button.dataset.bbvaRegisterState=done?"done":error?"error":"loading";
}
function stopApprovalMessages(){
  if(approvalMessageTimer){clearInterval(approvalMessageTimer);approvalMessageTimer=null}
}
function startApprovalMessages(){
  stopApprovalMessages();
  const messages=[
    "Esperando que el vendedor acepte tu acceso...",
    "Solicitud enviada correctamente...",
    "Manda una captura al vendedor para que acepte tu acceso.",
    "El acceso se activará cuando el vendedor lo apruebe."
  ];
  let index=0;
  registerButton(messages[index]);
  approvalMessageTimer=setInterval(()=>{index=(index+1)%messages.length;registerButton(messages[index])},3200);
}
function hideRegisterNotices(){
  if(document.getElementById("bbva-register-message-style"))return;
  const style=document.createElement("style");style.id="bbva-register-message-style";
  style.textContent="app-registrar-user .toast-msg,app-registrar-user .info-banner{display:none!important}app-registrar-user button.auth-submit{justify-content:center!important;gap:12px!important}app-registrar-user .bbva-btn-spinner{width:20px;height:20px;flex:0 0 20px;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;box-sizing:border-box;animation:bbvaRegisterSpin .7s linear infinite}app-registrar-user .bbva-btn-check{width:23px;height:23px;flex:0 0 23px;color:#fff}app-registrar-user .bbva-btn-error{font-size:21px;font-weight:900}app-registrar-user button.auth-submit[data-bbva-register-state=done]{background:#075b3b!important}app-registrar-user button.auth-submit[data-bbva-register-state=error]{background:#9b2c2c!important}@keyframes bbvaRegisterSpin{to{transform:rotate(360deg)}}";
  document.head.appendChild(style);
}
function showCreatedState(){
  setTimeout(()=>{
    const root=document.querySelector("app-registrar-user")||document;
    const button=root.querySelector("button.auth-submit");
    root.querySelector(".bbva-approval-message")?.remove();
    if(button)startApprovalMessages();
  },120);
}
function createdResponse(){showCreatedState();return{response:CREATED_MESSAGE}}
function failedResponse(message){stopApprovalMessages();setTimeout(()=>registerButton(message,false,true),120);return{response:message}}
function stopWatch(){try{stopUserWatch?.()}catch(_){}stopUserWatch=null}
function watchApproval(ref){
  try{stopApprovalWatch?.()}catch(_){}stopApprovalWatch=null;
  stopApprovalWatch=onSnapshot(ref,snapshot=>{
    if(!snapshot.exists())return;
    const data=snapshot.data()||{};
    if(data.approved===true){
      try{stopApprovalWatch?.()}catch(_){}stopApprovalWatch=null;
      updateDoc(ref,{approvalStatus:"approved",status:"active",updatedAt:serverTimestamp()}).catch(()=>{});
      stopApprovalMessages();
      registerButton("Cuenta aprobada. Ya puedes iniciar sesión",true,false);
    }
  },()=>{});
}
function profileData(sellerId,username,password,recoveryEmail){
  return{
    sellerId,username:appUsername(username),loginUsername:loginUsername(username),appUsername:appUsername(username),
    appName:APP_NAME,appSource:APP_SOURCE,recoveryEmail,password,clave:password,
    approved:false,approvalStatus:"pending",approvedAt:null,approvedBy:"",approvedBySellerId:"",
    active:true,status:"pending",deviceId:deviceId(),sessionVersion:1,
    createdAt:serverTimestamp(),updatedAt:serverTimestamp(),lastLoginAt:null,passwordUpdatedAt:serverTimestamp()
  };
}
async function validSeller(sellerId){const snapshot=await getDoc(doc(db,"sellers",sellerId));return snapshot.exists()&&snapshot.data()?.active===true}
function watchUser(user){
  stopWatch();if(!user)return;
  stopUserWatch=onSnapshot(doc(db,"users",user.uid),snapshot=>{
    const data=snapshot.exists()?snapshot.data():null;
    if(data&&(data.active===false||data.status==="disabled")){
      try{localStorage.removeItem("user-data-xmwiizz")}catch(_){}
      signOut(auth).catch(()=>{});
      return;
    }
    const registered=String(data?.deviceId||"");
    if(!deviceTransition&&data?.approved===true&&registered&&registered!==deviceId()){
      try{localStorage.removeItem("user-data-xmwiizz");localStorage.removeItem("clave");sessionStorage.clear()}catch(_){}
      signOut(auth).catch(()=>{});
      setTimeout(()=>{try{location.href="/user"}catch(_){}},120);
    }
  },()=>{});
}
onAuthStateChanged(auth,user=>{if(user)watchUser(user);else stopWatch()});

const api={
  async register(data){
    stopApprovalMessages();hideRegisterNotices();registerButton("Conectando con Firebase...");
    const sellerId=seller(data.id||data.seller_id),username=String(data.username||"").trim(),password=String(data.password||""),recoveryEmail=String(data.email||"").trim();
    if(!sellerId||!rawUser(username)||!password)return failedResponse("Completa todos los datos");
    if(password.length<6)return failedResponse("La contraseña debe tener al menos 6 caracteres");
    let credential=null;
    try{
      registerButton("Creando cuenta...");
      credential=await createUserWithEmailAndPassword(auth,internalEmail(sellerId,username),password);
      registerButton("Esperando la aprobación del vendedor...");
      if(!await validSeller(sellerId)){try{await deleteUser(credential.user)}catch(_){}return failedResponse("ID Vendedor no válido o inactivo")}
      registerButton("Esperando la aprobación del vendedor...");
      const userRef=doc(db,"users",credential.user.uid);
      await setDoc(userRef,profileData(sellerId,username,password,recoveryEmail));
      watchApproval(userRef);
      return createdResponse();
    }catch(error){
      if(credential?.user){try{await deleteUser(credential.user)}catch(_){}}
      if(String(error?.code||"").includes("email-already-in-use")){
        try{
          registerButton("Completando la cuenta...");
          const existing=await signInWithEmailAndPassword(auth,internalEmail(sellerId,username),password),ref=doc(db,"users",existing.user.uid),snapshot=await getDoc(ref);
          if(snapshot.exists()){
            const current=snapshot.data()||{};
            if(String(current.appSource||"").toLowerCase()!==APP_SOURCE||seller(current.sellerId)!==sellerId)return failedResponse("Ese usuario pertenece a otra cuenta");
            await updateDoc(ref,{username:appUsername(username),appUsername:appUsername(username),loginUsername:loginUsername(username),appName:APP_NAME,appSource:APP_SOURCE,updatedAt:serverTimestamp()}).catch(()=>{});
            if(current.approved===true){stopApprovalMessages();registerButton("Cuenta aprobada. Ya puedes iniciar sesión",true,false);return{response:"Cuenta aprobada. Ya puedes iniciar sesión"}}
            watchApproval(ref);
            return createdResponse();
          }
          if(!await validSeller(sellerId)){await signOut(auth);return failedResponse("ID Vendedor no válido o inactivo")}
          await setDoc(ref,profileData(sellerId,username,password,recoveryEmail));
          watchApproval(ref);
          return createdResponse();
        }catch(_){return failedResponse("El usuario ya existe. Verifica la contraseña o inicia sesión")}
      }
      return failedResponse(errorMessage(error,"Error al registrar"));
    }
  },
  async login(data){
    const sellerId=seller(data.seller_id||data.id),username=String(data.username||"").trim(),password=String(data.password||"");
    if(!sellerId||!rawUser(username)||!password)return{mensaje:"Completa todos los datos"};
    deviceTransition=true;
    try{
      const credential=await retryFirebase(()=>signInWithEmailAndPassword(auth,internalEmail(sellerId,username),password));
      const ref=doc(db,"users",credential.user.uid),snapshot=await retryFirebase(()=>getDoc(ref));
      if(!snapshot.exists()){await signOut(auth);return{mensaje:"Usuario o contraseña incorrectos"}}
      const profile=snapshot.data()||{};
      if(seller(profile.sellerId)!==sellerId||String(profile.appSource||"").toLowerCase()!==APP_SOURCE){await signOut(auth);return{mensaje:"Usuario o contraseña incorrectos"}}
      if(profile.active===false||profile.status==="disabled"){await signOut(auth);return{mensaje:"Cuenta desactivada"}}
      if(profile.approved!==true)return{mensaje:"Cuenta pendiente de aprobación"};
      const currentDevice=deviceId(),registered=String(profile.deviceId||"");
      if(registered&&registered!==currentDevice){saveDeviceChangePrefill(sellerId,username,password);await signOut(auth);return{response:"Nuevo dispositivo detectado. Cambia tu contraseña para continuar y cerrar la sesión del dispositivo anterior.",requires_password_change:true,password_change_required:true,code:"password_change_required"}}
      await updateDoc(ref,{username:appUsername(username),appUsername:appUsername(username),loginUsername:loginUsername(username),appName:APP_NAME,appSource:APP_SOURCE,status:"active",approvalStatus:"approved",deviceId:currentDevice,lastLoginAt:serverTimestamp(),updatedAt:serverTimestamp()}).catch(()=>{});
      watchUser(credential.user);
      return{mensaje:"Inicio de sesión exitoso",usuario:{username:loginUsername(username),seller_id:sellerId,password,activo:true,autorizado:true,cantidad_bbvaos:Number(profile.cantidad_bbvaos||0)}};
    }catch(error){try{await signOut(auth)}catch(_){}return{mensaje:errorMessage(error,"Usuario o contraseña incorrectos")}}
    finally{deviceTransition=false}
  },
  async changePassword(data){
    const sellerId=seller(data.seller_id||data.id),username=String(data.username||"").trim(),password=String(data.password||""),next=String(data.new_password||data.newPassword||"");
    if(next.length<6)return{mensaje:"La nueva contraseña debe tener al menos 6 caracteres"};
    if(next===password)return{mensaje:"La nueva contraseña debe ser diferente a la anterior"};
    deviceTransition=true;
    try{
      const credential=await signInWithEmailAndPassword(auth,internalEmail(sellerId,username),password),ref=doc(db,"users",credential.user.uid),snapshot=await getDoc(ref);
      if(!snapshot.exists()){await signOut(auth);return{mensaje:"Datos incorrectos"}}
      const profile=snapshot.data()||{};if(profile.approved!==true||profile.active===false){await signOut(auth);return{mensaje:"Cuenta pendiente o desactivada"}}
      await updatePassword(credential.user,next);
      await updateDoc(ref,{password:next,clave:next,passwordChangedAt:serverTimestamp(),passwordUpdatedAt:serverTimestamp(),updatedAt:serverTimestamp(),deviceId:deviceId(),sessionVersion:Number(profile.sessionVersion||0)+1});
      try{sessionStorage.removeItem(DEVICE_CHANGE_PREFILL)}catch(_){}
      await signOut(auth);return{mensaje:"Cambio exitoso"};
    }catch(error){try{await signOut(auth)}catch(_){}return{mensaje:errorMessage(error,"Datos incorrectos")}}
    finally{deviceTransition=false}
  },
  async logout(){stopWatch();try{await signOut(auth)}catch(_){}return{success:true}},
  async validate(){return{valid:!!auth.currentUser,success:!!auth.currentUser}},
  async getSession(){const user=auth.currentUser;if(!user)return null;return{token:await user.getIdToken(),uid:user.uid}}
};

function uppercaseSellerInputs(){
  document.querySelectorAll("input").forEach(input=>{
    const field=input.closest(".field,.form-field,.input-group,div"),label=field?.querySelector("label");
    if(!label||!/ID(?: o usuario)?(?: del)? vendedor/i.test(label.textContent||""))return;
    input.style.textTransform="uppercase";input.setAttribute("autocapitalize","characters");
    if(input.dataset.bbvaUppercase)return;input.dataset.bbvaUppercase="1";
    input.addEventListener("input",function(){const upper=String(this.value||"").toUpperCase();if(this.value!==upper){this.value=upper;this.dispatchEvent(new Event("input",{bubbles:true}))}});
  });
}
new MutationObserver(uppercaseSellerInputs).observe(document.documentElement,{childList:true,subtree:true});
new MutationObserver(prefillChangePassword).observe(document.documentElement,{childList:true,subtree:true});
uppercaseSellerInputs();
prefillChangePassword();
window.__BBVA_FIREBASE_AUTH=api;
window.__BBVA_FIREBASE_RESOLVE?.(api);
window.__BBVA_REGISTER_BUTTON_ERROR=message=>{stopApprovalMessages();setTimeout(()=>registerButton(String(message||"No se pudo crear la cuenta"),false,true),120)};
