const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const setup = require('../integration/_setup');
setup.setTestEnv();
process.env.PUBLIC_BASE_URL='https://qa.example.invalid';
const db=require('../../config/database');
const email=require('../../services/emailService');
const cat=require('../../config/catalogos');
let server,base,admin,owner,member,ownerId;
const password='TestFeedback2026!';
const deliveryOk={async sendMail(){return {messageId:'qa',accepted:['qa@example.invalid'],rejected:[]};}};
const payload={email:'feedback@example.invalid',password,nombre:'Feedback',apellidos:'Prueba',provincia:'Sevilla',localidad:'Sevilla',cargo_actual:'Gestora',anos_experiencia:10,
  telefono:'+34 600 111 222',telefono_personal:'+34 600 333 444',email_personal:'personal@example.invalid',sector:'tercer_sector',
  rol_cluster:cat.ROLES_CLUSTER[0].slug,rol_secundario:cat.ROLES_CLUSTER[1].slug,
  especialidades:cat.ESPECIALIDADES.map(e=>e.slug),acepta_mapa_interactivo:true,acepta_visibilidad_datos:true,acepta_mensajeria:true};
async function call(url,body,token=admin,method='POST') {
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})});
 const text=await r.text(); let data;try{data=JSON.parse(text)}catch{data=text}
 return {status:r.status,body:data};
}
before(async()=>{
 await setup.resetTestDb(); await setup.seedAdmin('admin@example.invalid',password);
 await email.ready; email.transporter=deliveryOk;
 require('../../services/geocodingService').geocode=async()=>null;
 server=setup.getTestApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 admin=(await call('/api/auth/login/admin',{email:'admin@example.invalid',password},null)).body.token;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.close();});
test('physical and corporate registrations accept every specialty and preserve new fields',async()=>{
 for(const type of ['numero','asociado_corporativo']) {
  const input={...payload,email:type==='numero'?payload.email:'corp@example.invalid',tipo_socio:type,nombre_organizacion:type==='numero'?null:'Empresa QA'};
  const created=await call('/api/auth/register',input,null);assert.equal(created.status,201,JSON.stringify(created.body));
  const id=created.body.socio.id;
  assert.equal((await db.query('SELECT * FROM socio_especialidades WHERE socio_id=$1',[id])).rows.length,cat.ESPECIALIDADES.length);
  const stored=(await db.query('SELECT * FROM socios WHERE id=$1',[id])).rows[0];
  assert.equal(stored.sector,'tercer_sector');assert.equal(stored.anos_experiencia,10);assert.equal(stored.cargo_actual,'Gestora');
  assert.ok(stored.telefono_personal_encrypted);assert.notEqual(stored.telefono_personal_encrypted,payload.telefono_personal);
  assert.equal((await call(`/api/admin/socios/${id}/aprobar`,{})).status,200);
  if(type==='numero') ownerId=id;
 }
 owner=(await call('/api/auth/login/socio',{email:payload.email,password},null)).body.token;
 member=(await call('/api/auth/login/socio',{email:'corp@example.invalid',password},null)).body.token;
});
test('owner can read both phones; others cannot read private contacts or ciphertext',async()=>{
 const own=await call('/api/socios/perfil/'+ownerId,null,owner,'GET');assert.equal(own.status,200);
 assert.equal(own.body.socio.telefono_personal,payload.telefono_personal);assert.equal(own.body.socio.sector,'tercer_sector');
 assert.equal(own.body.socio.rol_secundario,payload.rol_secundario);assert.equal(own.body.socio.telefono_personal_encrypted,undefined);
 const other=await call('/api/socios/perfil/'+ownerId,null,member,'GET');assert.equal(other.status,200);
 assert.equal(other.body.socio.telefono_personal,undefined);assert.equal(other.body.socio.email_personal,undefined);assert.equal(other.body.socio.telefono_personal_encrypted,undefined);
});
test('profile save retains all specialties, secondary role and independent phone visibility',async()=>{
 const saved=await call('/api/socios/perfil',{especialidades:payload.especialidades,visible_telefono_personal:true,visible_telefono:false,rol_cluster:payload.rol_cluster},owner,'PUT');assert.equal(saved.status,200,JSON.stringify(saved.body));
 let other=await call('/api/socios/perfil/'+ownerId,null,member,'GET');
 assert.equal(other.body.socio.especialidades.length,payload.especialidades.length);assert.equal(other.body.socio.rol_secundario,payload.rol_secundario);
 assert.equal(other.body.socio.telefono_personal,payload.telefono_personal);assert.equal(other.body.socio.telefono,undefined);
 assert.equal((await call('/api/socios/perfil',{rol_secundario:payload.rol_cluster},owner,'PUT')).status,400);
 await call('/api/socios/perfil',{visible_telefono_personal:false},owner,'PUT');
 other=await call('/api/socios/perfil/'+ownerId,null,member,'GET');assert.equal(other.body.socio.telefono_personal,undefined);
});
test('directory filters by either role with and without text search and sector',async()=>{
 for(const search of ['', '&search=Feedback']) {
  const r=await call('/api/socios/directorio?rol_cluster='+payload.rol_secundario+'&sector=tercer_sector'+search,null,member,'GET');
  assert.equal(r.status,200,JSON.stringify(r.body));assert.ok(r.body.socios.some(s=>s.id===ownerId));
  const none=await call('/api/socios/directorio?rol_cluster='+payload.rol_secundario+'&sector=publico'+search,null,member,'GET');
  assert.equal(none.status,200);assert.equal(none.body.socios.length,0);
 }
});
test('invalid values and duplicate specialties return validation errors, not server errors',async()=>{
 for(const patch of [{nombre:[]},{nombre:'x'.repeat(101)},{anos_experiencia:2.5},{anos_experiencia:51},{email_personal:'bad'},{telefono_personal:'abc'},{rol_secundario:payload.rol_cluster},{sector:'wrong'},{especialidades:[payload.especialidades[0],payload.especialidades[0]]},{especialidades:'wrong'},{acepta_mapa_interactivo:false}]) {
  const r=await call('/api/auth/register',{...payload,email:'bad@example.invalid',...patch},null);assert.equal(r.status,400,JSON.stringify({patch,r}));
 }
});
test('reuse of a deactivated email returns a recoverable conflict instead of 500',async()=>{
 const created=await call('/api/auth/register',{...payload,email:'inactive@example.invalid'},null);assert.equal(created.status,201);
 await db.query('UPDATE socios SET activo=false WHERE id=$1',[created.body.socio.id]);
 assert.equal((await call('/api/auth/register',{...payload,email:'inactive@example.invalid'},null)).status,409);
});
test('table and CSV use identical state and active filters',async()=>{
 const pending=(await call('/api/auth/register',{...payload,email:'pending@example.invalid'},null)).body.socio.id;
 const suspended=(await call('/api/auth/register',{...payload,email:'suspended@example.invalid'},null)).body.socio.id;
 await db.query("UPDATE socios SET estado='suspendido' WHERE id=$1",[suspended]);
 for(const estado of ['','aprobado','pendiente','suspendido']) {
  const rows=await call('/api/admin/socios/accesos?estado='+estado,null,admin,'GET');assert.equal(rows.status,200);
  const csv=await call('/api/admin/socios/exportar?estado='+estado,null,admin,'GET');assert.equal(csv.status,200);
  for(const s of rows.body.socios){if(estado)assert.equal(s.estado,estado);assert.equal(s.activo,true);assert.ok(csv.body.includes(s.email));}
  assert.equal(csv.body.trim().split('\n').length-1,rows.body.socios.length);
  if(estado==='pendiente')assert.deepEqual(rows.body.socios.map(s=>s.id),[pending]);
  if(estado==='suspendido')assert.deepEqual(rows.body.socios.map(s=>s.id),[suspended]);
 }
 assert.equal((await call('/api/admin/socios/accesos?estado=wrong',null,admin,'GET')).status,400);
 const csv=(await call('/api/admin/socios/exportar?estado=aprobado',null,admin,'GET')).body;
 assert.ok(csv.includes('Teléfono personal'));assert.ok(csv.includes(payload.telefono_personal));assert.ok(csv.includes(cat.ROLES_CLUSTER[1].label));
});
test('SMTP connection/auth failures are recorded and never reported as successful administrative emails',async()=>{
 email.transporter={async sendMail(){const e=new Error('sensitive-provider-detail');e.code='EAUTH';e.responseCode=535;throw e;}};
 try {
  for(const url of [`/api/admin/socios/${ownerId}/reenviar-bienvenida`,`/api/admin/socios/${ownerId}/reset-password`,'/api/admin/administradores/1/reset-password']) {
   const r=await call(url,{});assert.equal(r.status,502,JSON.stringify(r));assert.ok(!JSON.stringify(r).includes('sensitive-provider-detail'));
  }
  email.transporter={async sendMail(){const e=new Error('offline');e.code='ECONNECTION';throw e;}};
  assert.equal((await call(`/api/admin/socios/${ownerId}/reenviar-bienvenida`,{})).status,502);
  const logs=await call('/api/admin/config/smtp/deliveries',null,admin,'GET');assert.equal(logs.status,200);
  assert.equal(logs.body.deliveries[0].status,'failed');assert.equal(logs.body.deliveries[0].error_code,'smtp_unreachable');
  assert.equal((await call('/api/admin/config/smtp/deliveries',null,member,'GET')).status,403);
  const publicReset=await call('/api/auth/forgot-password',{email:payload.email},null);
  const unknownReset=await call('/api/auth/forgot-password',{email:'absent@example.invalid'},null);assert.deepEqual(publicReset,unknownReset);
 } finally {email.transporter=deliveryOk;}
});
test('CSV missing province is rejected early; corrected import preserves new fields and is atomic',async()=>{
 const form=new FormData();form.append('archivo',new Blob(['nombre,apellidos,email,provincia,rol_cluster,rol_secundario,sector,telefono_personal\nPrueba,Importada,import@example.invalid,,'+payload.rol_cluster+','+payload.rol_secundario+',privado,+34 600 444 555\n'],{type:'text/csv'}),'test.csv');
 const r=await fetch(base+'/api/admin/socios/importar',{method:'POST',headers:{Authorization:'Bearer '+admin},body:form});const result=await r.json();assert.equal(r.status,201,JSON.stringify(result));
 const id=result.filas[0].id;assert.equal(result.filas[0].estado,'con_errores');assert.match(JSON.stringify(result.filas[0].errores),/provincia/);
 assert.equal((await call(`/api/admin/socios/invitados/${id}/aprobar`,{})).status,409);
 const fixed=await call(`/api/admin/socios/invitados/${id}`,{provincia:'Sevilla'},admin,'PUT');assert.equal(fixed.status,200);assert.equal(fixed.body.fila.estado,'pendiente');
 email.transporter=null;
 const approval=await call(`/api/admin/socios/invitados/${id}/aprobar`,{});email.transporter=deliveryOk;
 assert.equal(approval.status,200,JSON.stringify(approval));assert.equal(approval.body.notification_sent,false);
 assert.equal((await call(`/api/admin/socios/invitados/${id}/aprobar`,{})).status,409);
 const imported=(await db.query('SELECT s.*,r.rol_secundario FROM socios s JOIN rol_cluster r ON r.socio_id=s.id WHERE s.id=$1',[approval.body.socio_id])).rows[0];
 assert.equal(imported.sector,'privado');assert.equal(imported.rol_secundario,payload.rol_secundario);assert.ok(imported.telefono_personal_encrypted);
});
test('additive migration can be applied again without losing profile data',async()=>{
 await db.query(fs.readFileSync(path.resolve(__dirname,'../../database/migrations/018_profile_fields_and_specialties.sql'),'utf8'));
 const profile=await call('/api/socios/perfil/'+ownerId,null,owner,'GET');assert.equal(profile.status,200);assert.equal(profile.body.socio.especialidades.length,cat.ESPECIALIDADES.length);assert.equal(profile.body.socio.telefono_personal,payload.telefono_personal);
});
test('old emailed paths redirect to valid login pages',async()=>{
 for(const [url,target] of [['/login','/acceso.html'],['/admin/socios/pendientes','/acceso-admin.html']]){
  const r=await fetch(base+url,{redirect:'manual'});assert.equal(r.status,302);assert.equal(r.headers.get('location'),target);
 }
});

test('a member can withdraw and restore directory visibility independently of the map',async()=>{
 assert.equal((await call('/api/socios/perfil',{acepta_visibilidad_datos:false,acepta_mapa_interactivo:false},owner,'PUT')).status,200);
 for (const suffix of ['', '?search=Feedback']) {
  const r=await call('/api/socios/directorio'+suffix,null,member,'GET');assert.equal(r.status,200);assert.ok(!r.body.socios.some(s=>s.id===ownerId));
 }
 assert.equal((await call('/api/socios/perfil/'+ownerId,null,member,'GET')).status,403);
 assert.equal((await call('/api/socios/perfil/'+ownerId,null,owner,'GET')).status,200);
 assert.equal((await call('/api/socios/perfil',{acepta_visibilidad_datos:true},owner,'PUT')).status,200);
 assert.equal((await call('/api/socios/perfil/'+ownerId,null,member,'GET')).status,200);
});
