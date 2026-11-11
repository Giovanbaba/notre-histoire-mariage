// Isolated Conubia RSVP records. Never reads or modifies the existing wedding data.
const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
const token=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const txt=(v:unknown,n=150)=>String(v||'').trim().slice(0,n);
async function input(r:Request){const t=await r.text();if(t.length>30000)throw Error('Formulaire trop volumineux');return JSON.parse(t)}
function eventData(b:any){return {names:txt(b.names),date:txt(b.date,20),place:txt(b.place),message:txt(b.message,1500),bg:/^#[0-9a-f]{6}$/i.test(b.bg)?b.bg:'#faf8f1',text:/^#[0-9a-f]{6}$/i.test(b.text)?b.text:'#233e35',accent:/^#[0-9a-f]{6}$/i.test(b.accent)?b.accent:'#233e35',theme:txt(b.theme,30)}}
export async function handlePlanner(r:Request,env:any,url:URL){
 const prefix='conubia-rsvp-v1/';const bucket=env.WEDDING_BUCKET;
 try{
 if(url.pathname==='/api/conubia/events'&&r.method==='POST'){
  const b=eventData(await input(r));if(!b.names||!b.date)return reply({error:'Prénoms et date requis.'},400);
  const id=crypto.randomUUID(),admin=token(),guest=token();await bucket.put(prefix+id+'/event.json',JSON.stringify({...b,adminHash:await hash(admin),guestHash:await hash(guest),createdAt:Date.now()}));return reply({id,admin,guest});
 }
 const m=url.pathname.match(/^\/api\/conubia\/events\/([a-f0-9-]{36})(?:\/(responses))?$/);if(!m)return reply({error:'Adresse inconnue'},404);
 const base=prefix+m[1]+'/',o=await bucket.get(base+'event.json');if(!o)return reply({error:'Invitation introuvable'},404);const e:any=await o.json();const auth=r.headers.get('authorization')?.replace(/^Bearer /,'')||'';const digest=await hash(auth);const admin=digest===e.adminHash,guest=digest===e.guestHash;if(!admin&&!guest)return reply({error:'Accès refusé'},401);
 if(!m[2]&&r.method==='GET')return reply(eventData(e));
 if(!m[2]&&r.method==='PUT'&&admin){await bucket.put(base+'event.json',JSON.stringify({...e,...eventData(await input(r))}));return reply({ok:true})}
 if(m[2]&&r.method==='GET'&&admin){let cursor:string|undefined,objects:any[]=[];do{const p=await bucket.list({prefix:base+'responses/',cursor});objects.push(...p.objects);cursor=p.truncated?p.cursor:undefined}while(cursor);const rows=await Promise.all(objects.map(async o=>{const v=await bucket.get(o.key);return v?await v.json():null}));return reply({rows:rows.filter(Boolean)})}
 if(m[2]&&r.method==='POST'){
  const b=await input(r);if(!/^[a-f0-9-]{36}$/.test(b.id||''))return reply({error:'Identifiant de réponse manquant'},400);
  const edit=txt(b.editToken,100);if(!/^[a-f0-9]{64}$/.test(edit))return reply({error:'Clé de réponse manquante'},400);
  const key=base+'responses/'+b.id+'.json',old=await bucket.get(key),eh=await hash(edit);if(old){const prev:any=await old.json();if(prev.editHash!==eh&&!admin)return reply({error:'Cette réponse ne vous appartient pas'},403)}
  if(!['yes','no'].includes(b.attending))return reply({error:'Choisissez votre présence'},400);
  const people=b.attending==='yes'&&Array.isArray(b.people)?b.people.slice(0,30).map((p:any)=>({name:txt(p.name,80),kind:p.kind==='child'?'child':'adult',allergies:txt(p.allergies,300)})):[];
  if(!txt(b.family)||b.attending==='yes'&&(!people.length||people.some((p:any)=>!p.name)))return reply({error:'Complétez le nom de famille et chaque invité'},400);
  if(b.consent!==true)return reply({error:'Votre accord pour transmettre ces informations est requis'},400);
  const data={id:b.id,family:txt(b.family,100),attending:b.attending,people,note:txt(b.note,500),updatedAt:Date.now(),editHash:eh};await bucket.put(key,JSON.stringify(data));return reply({ok:true});
 }
 return reply({error:'Action non disponible'},405);
 }catch{return reply({error:'Impossible de traiter cette demande. Vérifiez les champs et réessayez.'},400)}
}
