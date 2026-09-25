import type { AppEnv } from './state';

type Registry = { version:number; users:Record<string,User>; tenants:Record<string,Tenant>; sessions:Record<string,Session> };
type User = { id:string; email:string; firstName:string; lastName:string; salt:string; passwordHash:string; tenantIds:string[]; createdAt:string };
type Tenant = { id:string; slug:string; coupleNames:string; eventDate:string; language:string; ownerId:string; status:string; createdAt:string; deleteAt:string; plan:{ storageBytes:number; guestLimit:number; retentionMonths:number } };
type Session = { userId:string; expiresAt:string };
const REGISTRY='eclat/system/registry-v2.json';
const ORIGIN='https://eclat.laura-giova.be';
const enc=new TextEncoder();
const clean=(v:unknown,n=200)=>String(v??'').trim().slice(0,n);
const iso=()=>new Date().toISOString();
const slugify=(v:unknown)=>clean(v,60).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const cookie=(token:string,age:number)=>`eclat_session=${encodeURIComponent(token)}; Domain=.laura-giova.be; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
const baseRegistry=():Registry=>({version:2,users:{},tenants:{},sessions:{}});
const defaults=(t:Tenant)=>({version:1,updatedAt:iso(),coupleNames:t.coupleNames,heroTitle:'Bienvenue à notre mariage',welcome:'Nous sommes heureux de partager cette journée avec vous.',language:t.language,theme:{primary:'#d4aa55',secondary:'#08142f',font:'Cormorant Garamond'},modules:{programme:true,menu:true,rsvp:true,galerie:true,videos:true,livreOr:true,hitKiss:true,jeux:true,gazette:true,ceremonie:true,planTable:true,suggestionsDj:true},schedule:[{time:'14:00',label:'Cérémonie'},{time:'17:00',label:'Vin d’honneur'},{time:'19:00',label:'Dîner'},{time:'23:00',label:'Soirée'}],menu:[{title:'Entrée',description:''},{title:'Plat',description:''},{title:'Dessert',description:''}]});
function cors(req:Request,h=new Headers()){const o=req.headers.get('origin');if(o===ORIGIN){h.set('access-control-allow-origin',o);h.set('access-control-allow-credentials','true');h.set('vary','Origin')}h.set('access-control-allow-headers','content-type');h.set('access-control-allow-methods','GET,POST,PUT,OPTIONS');return h}
function json(req:Request,data:unknown,status=200,extra?:HeadersInit){const h=cors(req,new Headers(extra));h.set('content-type','application/json; charset=utf-8');h.set('cache-control','no-store');return new Response(JSON.stringify(data),{status,headers:h})}
async function readJson<T>(b:R2Bucket,key:string,fallback:T):Promise<T>{const o=await b.get(key);if(!o)return structuredClone(fallback);try{return await o.json<T>()}catch{return structuredClone(fallback)}}
async function putJson(b:R2Bucket,key:string,v:unknown){await b.put(key,JSON.stringify(v),{httpMetadata:{contentType:'application/json',cacheControl:'private, no-store'}})}
async function sha(v:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function passwordHash(password:string,salt:string){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:100000,hash:'SHA-256'},key,256);return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function cookies(req:Request){return Object.fromEntries((req.headers.get('cookie')||'').split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
async function registry(env:AppEnv){return readJson(env.WEDDING_BUCKET,REGISTRY,baseRegistry())}
async function saveRegistry(env:AppEnv,db:Registry){await putJson(env.WEDDING_BUCKET,REGISTRY,db)}
async function identity(req:Request,env:AppEnv){const raw=cookies(req).eclat_session;if(!raw)return null;const db=await registry(env),s=db.sessions[await sha(raw)];if(!s||Date.parse(s.expiresAt)<=Date.now())return null;const user=Object.values(db.users).find(u=>u.id===s.userId);return user?{db,user}:null}
function publicTenant(t:Tenant){return{id:t.id,slug:t.slug,coupleNames:t.coupleNames,eventDate:t.eventDate,language:t.language,status:t.status,deleteAt:t.deleteAt,plan:t.plan}}
function tenantFor(a:Awaited<ReturnType<typeof identity>>,id:string){return a?.user.tenantIds.includes(id)?a.db.tenants[id]:null}
async function usage(env:AppEnv,id:string){let bytes=0,objects=0,cursor:string|undefined;do{const p=await env.WEDDING_BUCKET.list({prefix:`eclat/tenants/${id}/media/`,cursor,limit:1000});for(const o of p.objects){bytes+=o.size;objects++}cursor=p.truncated?p.cursor:undefined}while(cursor);return{bytes,objects}}
async function register(req:Request,env:AppEnv){
 const body=await req.json<Record<string,unknown>>(),email=clean(body.email,254).toLowerCase(),password=String(body.password||''),eventDate=new Date(String(body.eventDate||''));
 if(!/^\S+@\S+\.\S+$/.test(email)||password.length<12||!clean(body.firstName)||!clean(body.lastName)||!clean(body.coupleNames)||Number.isNaN(eventDate.valueOf()))return json(req,{ok:false,error:'Vérifiez les champs. Le mot de passe doit contenir au moins 12 caractères.'},400);
 const db=await registry(env);if(db.users[email])return json(req,{ok:false,error:'Un compte existe déjà avec cette adresse.'},409);
 let slug=slugify(body.slug||body.coupleNames)||crypto.randomUUID().slice(0,8),n=2;while(Object.values(db.tenants).some(t=>t.slug===slug))slug=`${slugify(body.slug||body.coupleNames)}-${n++}`;
 const userId=crypto.randomUUID(),tenantId=crypto.randomUUID(),salt=crypto.randomUUID(),createdAt=iso(),deleteAt=new Date(eventDate.getTime()+365*86400000).toISOString();
 const user:User={id:userId,email,firstName:clean(body.firstName,80),lastName:clean(body.lastName,80),salt,passwordHash:await passwordHash(password,salt),tenantIds:[tenantId],createdAt};
 const tenant:Tenant={id:tenantId,slug,coupleNames:clean(body.coupleNames,120),eventDate:eventDate.toISOString(),language:['fr','nl','en','es','it'].includes(clean(body.language,2))?clean(body.language,2):'fr',ownerId:userId,status:'active',createdAt,deleteAt,plan:{storageBytes:5*1024**3,guestLimit:150,retentionMonths:12}};
 const raw=token();db.users[email]=user;db.tenants[tenantId]=tenant;db.sessions[await sha(raw)]={userId,expiresAt:new Date(Date.now()+7*86400000).toISOString()};await saveRegistry(env,db);await putJson(env.WEDDING_BUCKET,`eclat/tenants/${tenantId}/content.json`,defaults(tenant));
 return json(req,{ok:true,user:{firstName:user.firstName,email},tenant:publicTenant(tenant)},201,{'set-cookie':cookie(raw,604800)});
}
async function login(req:Request,env:AppEnv){const b=await req.json<Record<string,unknown>>(),email=clean(b.email,254).toLowerCase(),db=await registry(env),u=db.users[email];if(!u||await passwordHash(String(b.password||''),u.salt)!==u.passwordHash)return json(req,{ok:false,error:'Identifiants incorrects.'},401);const raw=token();db.sessions[await sha(raw)]={userId:u.id,expiresAt:new Date(Date.now()+7*86400000).toISOString()};await saveRegistry(env,db);return json(req,{ok:true},200,{'set-cookie':cookie(raw,604800)})}
async function countPrefix(bucket:R2Bucket,prefix:string){let n=0,cursor:string|undefined;do{const p=await bucket.list({prefix,cursor,limit:1000});n+=p.objects.length;cursor=p.truncated?p.cursor:undefined}while(cursor);return n}
export async function handleEclat(request:Request,env:AppEnv,url:URL):Promise<Response>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
 if(url.pathname==='/api/eclat/health')return json(request,{ok:true,service:'eclat-multitenant',storage:'r2',version:2});
 if(url.pathname==='/api/eclat/register'&&request.method==='POST')return register(request,env);
 if(url.pathname==='/api/eclat/login'&&request.method==='POST')return login(request,env);
 if(url.pathname==='/api/eclat/logout'&&request.method==='POST'){const raw=cookies(request).eclat_session;if(raw){const db=await registry(env);delete db.sessions[await sha(raw)];await saveRegistry(env,db)}return json(request,{ok:true},200,{'set-cookie':cookie('',0)})}
 if(url.pathname==='/api/eclat/session'){const a=await identity(request,env);return a?json(request,{ok:true,authenticated:true,user:{firstName:a.user.firstName,lastName:a.user.lastName,email:a.user.email},tenantId:a.user.tenantIds[0],tenants:a.user.tenantIds.map(x=>a.db.tenants[x]).filter(Boolean).map(publicTenant)}):json(request,{ok:false,authenticated:false},401)}
 const pub=url.pathname.match(/^\/api\/eclat\/public\/([^/]+)$/);if(pub){const db=await registry(env),t=Object.values(db.tenants).find(x=>x.slug===decodeURIComponent(pub[1])&&x.status==='active');if(!t)return json(request,{ok:false,error:'Mariage introuvable.'},404);return json(request,{ok:true,tenant:publicTenant(t),content:await readJson(env.WEDDING_BUCKET,`eclat/tenants/${t.id}/content.json`,defaults(t))})}
 const m=url.pathname.match(/^\/api\/eclat\/tenant\/([^/]+)\/(dashboard|content|backups)$/);if(m){const a=await identity(request,env),t=tenantFor(a,m[1]);if(!a||!t)return json(request,{ok:false,error:'Accès refusé.'},403);const key=`eclat/tenants/${t.id}/content.json`;
  if(m[2]==='dashboard'&&request.method==='GET')return json(request,{ok:true,tenant:publicTenant(t),usage:await usage(env,t.id),content:await readJson(env.WEDDING_BUCKET,key,defaults(t)),quota:t.plan});
  if(m[2]==='content'&&request.method==='PUT'){const body=await request.json<{content?:Record<string,unknown>}>(),raw=JSON.stringify(body.content||{});if(raw.length>700000)return json(request,{ok:false,error:'Configuration trop volumineuse.'},413);const current=await readJson(env.WEDDING_BUCKET,key,defaults(t));await putJson(env.WEDDING_BUCKET,`eclat/tenants/${t.id}/backups/content-${Date.now()}.json`,current);const next={...body.content,version:Number((current as any).version||0)+1,updatedAt:iso()};await putJson(env.WEDDING_BUCKET,key,next);return json(request,{ok:true,content:next})}
  if(m[2]==='backups'&&request.method==='GET'){const p=await env.WEDDING_BUCKET.list({prefix:`eclat/tenants/${t.id}/backups/`,limit:50});return json(request,{ok:true,backups:p.objects.map(x=>({key:x.key,date:x.uploaded,size:x.size})).sort((a,b)=>+new Date(b.date)-+new Date(a.date))})}
 }
 if(url.pathname==='/api/eclat/self-test'){const key=`eclat/system/tests/${crypto.randomUUID()}.txt`;await env.WEDDING_BUCKET.put(key,'ok');const ok=(await env.WEDDING_BUCKET.get(key))!==null;await env.WEDDING_BUCKET.delete(key);return json(request,{ok,registryUsers:Object.keys((await registry(env)).users).length,testObjects:await countPrefix(env.WEDDING_BUCKET,'eclat/system/tests/')},ok?200:503)}
 return json(request,{ok:false,error:'API Éclat inconnue.'},404);
}