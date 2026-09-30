// Regresiones de las incidencias detectadas por la junta directiva (sep 2026):
// límites por IP, sexo, email de contacto editable, visibilidad/búsqueda,
// decisiones obligatorias del perfil, visor público, emails configurables,
// histórico de comunicaciones y protección de CV.
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const setup=require('../integration/_setup');setup.setTestEnv();
// Límite anónimo bajo para comprobar que las sesiones no lo comparten.
process.env.RATE_LIMIT_MAX_REQUESTS='40';
process.env.RATE_LIMIT_MAX_AUTHENTICATED='1000';
process.env.UPLOADS_PATH=fs.mkdtempSync('/tmp/agesport-junta-');
const db=require('../../config/database');const bcrypt=require('bcryptjs');
const geo=require('../../services/geocodingService');const email=require('../../services/emailService');
const cat=require('../../config/catalogos');
const ROL_A=cat.ROLES_CLUSTER[0].slug, ROL_B=cat.ROLES_CLUSTER[1].slug;
let server,base,admin,tokens=[],ids=[],sent=[];
const password='JuntaLocal2026!';
async function call(url,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,body:data,headers:r.headers};
}
async function waitFor(fn){for(let i=0;i<100;i++){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,20));}assert.fail('timeout');}
const fullProfile=(extra={})=>({confirmar_preferencias:true,nombre:'Rosario',apellidos:'Núñez Pérez',provincia:'Sevilla',localidad:'Sevilla',cargo_actual:'Gerente',anos_experiencia:12,
 rol_cluster:ROL_A,rol_secundario:null,disponibilidad:'ninguna',b2b_ofrece:false,b2b_busca:false,b2b_licita:false,
 acepta_visibilidad_datos:true,acepta_mapa_interactivo:true,acepta_mensajeria:true,acepta_notificaciones_email:true,
 visible_email_directo:true,email_visible:'profesional',email_preferido:'profesional',email_profesional:'rosario.trabajo@example.invalid',...extra});

before(async()=>{
 await setup.resetTestDb();await setup.seedAdmin('admin@example.invalid',password);
 const hash=await bcrypt.hash(password,4);
 const people=[['Rosario','Núñez Pérez','Sevilla',ROL_A],['José','García','Granada',ROL_A],['Ana','López','Granada',ROL_A],['Luis','Martín','Granada',ROL_B]];
 for(const [i,[nombre,apellidos,prov,rol]] of people.entries()){
  const row=(await db.query(`INSERT INTO socios(email,password_hash,nombre,apellidos,provincia,localidad,estado,activo,tipo_socio) VALUES($1,$2,$3,$4,$5,$5,'aprobado',true,'numero') RETURNING id`,['acceso'+i+'@example.invalid',hash,nombre,apellidos,prov])).rows[0];ids.push(row.id);
  await db.query('INSERT INTO consentimientos(socio_id,acepta_mapa_interactivo,acepta_visibilidad_datos,acepta_mensajeria) VALUES($1,true,true,true)',[row.id]);
  await db.query('INSERT INTO rol_cluster(socio_id,rol) VALUES($1,$2)',[row.id,rol]);
 }
 await email.ready;email.transporter={async sendMail(m){sent.push(m);return {accepted:[m.to],rejected:[],messageId:'synthetic'};}};
 geo.geocode=async()=>null;
 server=setup.getTestApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 admin=(await call('/api/auth/login/admin',null,{email:'admin@example.invalid',password})).body.token;
 for(let i=0;i<4;i++)tokens[i]=(await call('/api/auth/login/socio',null,{email:'acceso'+i+'@example.invalid',password})).body.token;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.close();fs.rmSync(process.env.UPLOADS_PATH,{recursive:true,force:true});});

test('sexo is returned to the owner and survives a later save',async()=>{
 assert.equal((await call('/api/socios/perfil',tokens[0],{sexo:'masculino'},'PUT')).status,200);
 let own=await call('/api/socios/perfil/'+ids[0],tokens[0]);assert.equal(own.body.socio.sexo,'masculino');
 assert.equal((await call('/api/socios/perfil',tokens[0],{localidad:'Sevilla'},'PUT')).status,200);
 own=await call('/api/socios/perfil/'+ids[0],tokens[0]);assert.equal(own.body.socio.sexo,'masculino');
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.sexo,undefined);
 assert.equal((await call('/api/socios/perfil',tokens[0],{sexo:'otro-valor'},'PUT')).status,400);
});

test('full profile save requires every decision and records it',async()=>{
 const r=await call('/api/socios/perfil',tokens[0],{confirmar_preferencias:true,nombre:'Rosario'},'PUT');
 assert.equal(r.status,400);assert.match(JSON.stringify(r.body),/Decide antes de guardar/);
 for(const key of ['acepta_visibilidad_datos','acepta_mapa_interactivo','disponibilidad','email_preferido']){
  const p=fullProfile();delete p[key];assert.equal((await call('/api/socios/perfil',tokens[0],p,'PUT')).status,400,key);
 }
 const ok=await call('/api/socios/perfil',tokens[0],fullProfile(),'PUT');assert.equal(ok.status,200,JSON.stringify(ok.body));
 const c=(await db.query('SELECT preferencias_revisadas_at FROM consentimientos WHERE socio_id=$1',[ids[0]])).rows[0];assert.ok(c.preferencias_revisadas_at);
 assert.equal((await db.query('SELECT count(*)::int n FROM disponibilidad WHERE socio_id=$1',[ids[0]])).rows[0].n,0);
 assert.equal((await call('/api/socios/perfil',tokens[0],fullProfile({tutor_mentor:true}),'PUT')).status,400);
 const own=await call('/api/socios/perfil/'+ids[0],tokens[0]);assert.ok(own.body.socio.preferencias_revisadas_at);
 assert.equal(own.body.socio.email_profesional,'rosario.trabajo@example.invalid');assert.equal(own.body.socio.email,'acceso0@example.invalid');
});

test('professional email is editable, shown instead of the access email and receives notifications',async()=>{
 const other=await call('/api/socios/perfil/'+ids[0],tokens[1]);assert.equal(other.body.socio.email,'rosario.trabajo@example.invalid');
 let start=sent.length;
 assert.equal((await call('/api/mensajeria/mensajes',tokens[1],{receptorId:ids[0],contenido:'Hola <b>Rosario</b>'})).status,201);
 let mail=await waitFor(()=>sent.slice(start).find(m=>/Nuevo mensaje/.test(m.subject)));
 assert.equal(mail.to,'rosario.trabajo@example.invalid');assert.ok(!mail.html.includes('<b>Rosario'));
 // Personal email for notifications and for the directory card.
 assert.equal((await call('/api/socios/perfil',tokens[0],{email_preferido:'personal'},'PUT')).status,400);
 assert.equal((await call('/api/socios/perfil',tokens[0],{email_personal:'rosario.casa@example.invalid',email_preferido:'personal',email_visible:'personal'},'PUT')).status,200);
 start=sent.length;
 await call('/api/mensajeria/mensajes',tokens[1],{receptorId:ids[0],contenido:'Segundo mensaje'});
 mail=await waitFor(()=>sent.slice(start).find(m=>/Nuevo mensaje/.test(m.subject)));assert.equal(mail.to,'rosario.casa@example.invalid');
 const dir=await call('/api/socios/directorio?search=rosario',tokens[1]);
 const card=dir.body.socios.find(s=>s.id===ids[0]);assert.equal(card.email,'rosario.casa@example.invalid');
 assert.equal(card.email_personal,undefined);assert.equal(card.email_profesional,undefined);
 assert.equal((await call('/api/socios/perfil',tokens[0],{email_profesional:'no-es-email'},'PUT')).status,400);
 await call('/api/socios/perfil',tokens[0],{visible_email_directo:false},'PUT');
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.email,undefined);
});

test('directory search matches partial names ignoring case and accents, with filters',async()=>{
 for(const q of ['ros','ROSARIO','nunez','Núñez','rosario perez']){
  const r=await call('/api/socios/directorio?search='+encodeURIComponent(q),tokens[1]);assert.equal(r.status,200);
  assert.ok(r.body.socios.some(s=>s.id===ids[0]),q);
 }
 const jose=await call('/api/socios/directorio?search=jose&provincia=Granada',tokens[0]);assert.deepEqual(jose.body.socios.map(s=>s.id),[ids[1]]);
 assert.equal((await call('/api/socios/directorio?search=100%25',tokens[0])).status,200);
 // Hidden from the directory: not found by others, still on the map if chosen.
 await call('/api/socios/perfil',tokens[1],{acepta_visibilidad_datos:false},'PUT');
 assert.equal((await call('/api/socios/directorio?search=jose',tokens[0])).body.socios.length,0);
 assert.ok((await call('/api/socios/mapa',tokens[0])).body.socios.some(s=>s.id===ids[1]&&!s.perfil_visible));
 await call('/api/socios/perfil',tokens[1],{acepta_visibilidad_datos:true},'PUT');
});

test('public visor counts every approved member by province and hides small role groups',async()=>{
 const r=await call('/api/public/visor-talento');assert.equal(r.status,200);
 assert.equal(r.body.total,4);assert.equal(r.body.total_provincias,2);
 const granada=r.body.provincias.find(p=>p.provincia==='Granada');
 assert.equal(granada.count,3);assert.deepEqual(granada.roles,[]);assert.equal(granada.otros,3);
 assert.ok(granada.lat&&granada.lng);assert.ok(!JSON.stringify(r.body).includes('José'));
 await db.query('UPDATE socios SET latitud=37.1,longitud=-3.6 WHERE id=$1',[ids[1]]);
 await db.query('UPDATE consentimientos SET mapa_visible=false WHERE socio_id=$1',[ids[1]]);
 assert.equal((await call('/api/public/mapa-puntos')).body.total,0);
 const pg=(await db.query('SELECT ST_X(punto_geografico) x FROM socios WHERE id=$1',[ids[1]])).rows[0];assert.equal(Number(pg.x).toFixed(1),'-3.6');
});

test('registration confirmation and rejection emails use editable templates and escape the reason',async()=>{
 await db.query("UPDATE landing_content SET valor='Solicitud recibida, {nombre}' WHERE clave='email.confirmation.heading'");
 let start=sent.length;
 const reg=await call('/api/auth/register',null,{email:'nueva@example.invalid',password,nombre:'Nueva',apellidos:'Solicitante',provincia:'Sevilla',localidad:'Sevilla',cargo_actual:'Técnica',anos_experiencia:3,acepta_mapa_interactivo:true,acepta_visibilidad_datos:true});
 assert.equal(reg.status,201,JSON.stringify(reg.body));
 const conf=await waitFor(()=>sent.slice(start).find(m=>m.to==='nueva@example.invalid'));assert.match(conf.html,/Solicitud recibida, Nueva/);
 start=sent.length;
 const rej=await call('/api/admin/socios/'+reg.body.socio.id+'/rechazar',admin,{motivo:'Cuota "pendiente" & datos'});
 assert.equal(rej.status,200);assert.equal(rej.body.notification_sent,true);
 const mail=await waitFor(()=>sent.slice(start).find(m=>m.to==='nueva@example.invalid'));
 assert.match(mail.html,/Cuota &quot;pendiente&quot; &amp; datos/);assert.match(mail.subject,/solicitud/i);
});

test('mass communication is segmented, sent to the contact email and kept in the history',async()=>{
 const start=sent.length;
 const r=await call('/api/admin/comunicaciones/enviar',admin,{asunto:'Aviso Granada',cuerpo:'Hola {nombre}, esto es una prueba.',filtros:{provincia:'Granada'}});
 assert.equal(r.status,200);assert.equal(r.body.destinatarios,3);
 await waitFor(async()=>(await db.query("SELECT estado FROM comunicaciones WHERE id=$1",[r.body.comunicacion_id])).rows[0].estado==='completada');
 assert.equal(sent.slice(start).length,3);
 const hist=await call('/api/admin/comunicaciones?provincia=Granada',admin);assert.equal(hist.status,200);
 const c=hist.body.comunicaciones.find(x=>x.id===r.body.comunicacion_id);assert.equal(c.enviados,3);assert.deepEqual(c.por_provincia,[{provincia:'Granada',total:3}]);
 const det=await call('/api/admin/comunicaciones/'+r.body.comunicacion_id+'/destinatarios',admin);assert.equal(det.body.destinatarios.length,3);
 assert.ok(det.body.destinatarios.every(d=>d.estado==='aceptado'));
 assert.equal((await call('/api/admin/comunicaciones',tokens[0])).status,403);
 assert.equal((await call('/api/admin/comunicaciones?provincia=Sevilla',admin)).body.comunicaciones.length,0);
});

test('CV uploads must really be PDF/DOC/DOCX and first access is recorded once',async()=>{
 const upload=async(content,name,type)=>{const f=new FormData();f.append('cv',new Blob([content],{type}),name);
  const r=await fetch(base+'/api/socios/perfil/cv',{method:'POST',headers:{Authorization:'Bearer '+tokens[3]},body:f});return {status:r.status,body:await r.json()};};
 const bad=await upload('<html>not a pdf</html>','cv.pdf','application/pdf');assert.equal(bad.status,400);
 assert.equal(fs.readdirSync(path.join(process.env.UPLOADS_PATH,'cvs')).length,0);
 const good=await upload('%PDF-1.4 synthetic','cv.pdf','application/pdf');assert.equal(good.status,200);assert.match(good.body.cv_url,/^\/uploads\/cvs\/\d+-[0-9a-f]{32}\.pdf$/);
 assert.equal((await call('/api/socios/perfil/'+ids[3],tokens[3])).body.socio.bienvenida_vista_at,null);
 assert.equal((await call('/api/socios/bienvenida-vista',tokens[3],{})).status,200);
 assert.ok((await call('/api/socios/perfil/'+ids[3],tokens[3])).body.socio.bienvenida_vista_at);
});

// Last: it exhausts the anonymous quota of the test IP.
test('authenticated sessions are not throttled by a shared IP; anonymous traffic still is',async()=>{
 for(let i=0;i<45;i++) assert.equal((await call('/api/socios/mapa',tokens[i%4])).status,200);
 let limited=false;
 for(let i=0;i<60&&!limited;i++) limited=(await call('/api/socios/directorio')).status===429;
 assert.ok(limited,'anonymous requests must eventually be limited');
 const r=await call('/api/socios/directorio',tokens[2]);assert.equal(r.status,200);
 assert.ok(!/desde esta IP/.test(JSON.stringify((await call('/api/socios/directorio')).body)));
 assert.equal((await call('/api/public/visor-talento')).status,200);
});


test('member-type sheets from AGESPORT replace the provisional texts and are public',async()=>{
 const r=await call('/api/public/landing');assert.equal(r.status,200);const c=r.body.content;
 assert.equal(c['fichas.fisica.title'],'Socio/a de número');assert.equal(c['fichas.juridica.title'],'Socio corporativo');
 assert.equal(c['fichas.juridica.cuota'],'250 € / año');assert.equal(c['fichas.fisica.cuota'],'100 € / año');assert.match(c['fichas.juridica.link'],/^https:\/\/agesport\.org\//);
 const blocks=c['fichas.juridica.bloques'].split('\n');assert.equal(blocks.length,4);assert.ok(blocks.every(b=>/^[^:]+: .+/.test(b)));
 assert.equal(c['fichas.fisica.compromisos'].split('|').length,2);assert.equal(c['fichas.juridica.compromisos'].split('|').length,5);
 assert.ok(!Object.keys(c).some(k=>k.startsWith('email.')));
});
