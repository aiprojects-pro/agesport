const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const setup=require('../integration/_setup');setup.setTestEnv();
process.env.UPLOADS_PATH=fs.mkdtempSync('/tmp/agesport-review-');
const db=require('../../config/database');const bcrypt=require('bcryptjs');
const geo=require('../../services/geocodingService');const email=require('../../services/emailService');
const cat=require('../../config/catalogos');
let server,base,admin,tokens=[],ids=[],geoCalls=0,sent=[];
const password='ReviewLocal2026!';
async function call(url,token,body,method=body?'POST':'GET'){
 const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const text=await r.text();let data;try{data=JSON.parse(text)}catch{data=text}return {status:r.status,body:data,headers:r.headers};
}
before(async()=>{
 await setup.resetTestDb();await setup.seedAdmin('admin@example.invalid',password);
 const hash=await bcrypt.hash(password,4);
 for(const [i,province] of ['Sevilla','Granada','Almería','Cádiz','Córdoba','Huelva','Jaén','Málaga'].entries()){
  const row=(await db.query(`INSERT INTO socios(email,password_hash,nombre,apellidos,provincia,localidad,estado,activo,tipo_socio,sector) VALUES($1,$2,$3,'Sintético',$4,$4,'aprobado',true,$5,'privado') RETURNING id`,['review'+i+'@example.invalid',hash,'Persona '+i,province,i===1?'asociado_corporativo':'numero'])).rows[0];ids.push(row.id);
  await db.query('INSERT INTO consentimientos(socio_id,acepta_mapa_interactivo,acepta_visibilidad_datos,acepta_mensajeria) VALUES($1,$2,true,true)',[row.id,i===0]);
 }
 await email.ready;email.transporter={async sendMail(m){sent.push(m);return {accepted:[m.to],rejected:[],messageId:'synthetic'};}};
 geo.geocode=async()=>{geoCalls++;return null};
 server=setup.getTestApp().listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
 admin=(await call('/api/auth/login/admin',null,{email:'admin@example.invalid',password})).body.token;
 for(let i=0;i<3;i++)tokens[i]=(await call('/api/auth/login/socio',null,{email:'review'+i+'@example.invalid',password})).body.token;
});
after(async()=>{if(server)await new Promise(r=>server.close(r));await db.close();fs.rmSync(process.env.UPLOADS_PATH,{recursive:true,force:true});});
test('temporary map includes all eight provinces, excludes inactive and restores original consents',async()=>{
 const original=(await db.query('SELECT * FROM consentimientos ORDER BY socio_id')).rows;
 assert.equal((await call('/api/socios/mapa')).status,401);
 assert.equal((await call('/api/admin/mapa-prueba',tokens[0],{enabled:true},'PUT')).status,403);
 assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios.length,1);
 assert.equal((await call('/api/admin/mapa-prueba',admin,{enabled:'true'},'PUT')).status,400);
 assert.equal((await call('/api/admin/mapa-prueba',admin,{enabled:true},'PUT')).status,200);
 for(const token of tokens.slice(0,2)){
  const m=await call('/api/socios/mapa',token);assert.equal(m.body.socios.length,8);assert.equal(new Set(m.body.socios.map(s=>s.provincia)).size,8);assert.ok(m.body.socios.every(s=>s.precision==='provincia'));assert.equal(m.body.modo_prueba.enabled,true);
 }
 await db.query('UPDATE socios SET activo=false WHERE id=$1',[ids[7]]);assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios.length,7);await db.query('UPDATE socios SET activo=true WHERE id=$1',[ids[7]]);
 await call('/api/admin/mapa-prueba',admin,{enabled:false},'PUT');assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios.length,1);
 assert.deepEqual((await db.query('SELECT * FROM consentimientos ORDER BY socio_id')).rows,original);
 await db.query(`UPDATE configuracion SET valor=$1 WHERE clave='mapa_prueba_temporal'`,[JSON.stringify({enabled:true,expiresAt:'2020-01-01T00:00:00Z'})]);assert.equal((await call('/api/socios/mapa',tokens[0])).body.modo_prueba.enabled,false);
});
test('missing coordinates retry on unchanged location; failed new location clears old coordinates',async()=>{
 geo.geocode=async()=>{geoCalls++;return {lat:37.389,lng:-5.984}};
 let r=await call('/api/socios/perfil',tokens[0],{localidad:'Sevilla',provincia:'Sevilla'},'PUT');assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(geoCalls,1);
 assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios[0].precision,'municipio');
 geo.geocode=async()=>null;
 r=await call('/api/socios/perfil',tokens[0],{localidad:'Carmona'},'PUT');assert.equal(r.status,200);
 const coords=(await db.query('SELECT latitud,longitud FROM socios WHERE id=$1',[ids[0]])).rows[0];assert.equal(coords.latitud,null);assert.equal(coords.longitud,null);
 assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios[0].precision,'provincia');
});
test('member can disable normal map and cannot self-assign privileged category',async()=>{
 assert.equal((await call('/api/socios/perfil',tokens[0],{acepta_mapa_interactivo:false},'PUT')).status,200);
 assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios.length,0);
 assert.equal((await call('/api/socios/perfil',tokens[0],{tipo_socio:'honor'},'PUT')).status,403);
 assert.equal((await call('/api/socios/perfil',tokens[0],{acepta_mapa_interactivo:true},'PUT')).status,200);
});
test('professional email visible only when permitted; B2B edit changes search filters',async()=>{
 let r=await call('/api/socios/perfil',tokens[0],{visible_email_directo:true,rol_cluster:cat.ROLES_CLUSTER[0].slug,b2b_ofrece:true,anos_experiencia:null},'PUT');assert.equal(r.status,200,JSON.stringify(r.body));
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.email,'review0@example.invalid');
 assert.equal((await call('/api/socios/directorio?search=Persona&b2b_ofrece=true',tokens[1])).body.socios.length,1);
 await call('/api/socios/perfil',tokens[0],{visible_email_directo:false,b2b_ofrece:false},'PUT');
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.email,undefined);
 assert.equal((await call('/api/socios/directorio?search=Persona&b2b_ofrece=true',tokens[1])).body.socios.length,0);
});
test('CV direct URL requires authentication and relationship; all static bypasses fail',async()=>{
 const cv='/uploads/cvs/synthetic.pdf';fs.mkdirSync(path.join(process.env.UPLOADS_PATH,'cvs'),{recursive:true});fs.writeFileSync(path.join(process.env.UPLOADS_PATH,'cvs/synthetic.pdf'),'Synthetic CV, no personal information');
 await db.query('UPDATE socios SET cv_url=$1 WHERE id=$2',[cv,ids[0]]);
 assert.equal((await call(cv)).status,401);assert.equal((await call(cv,tokens[1])).status,403);
 assert.equal((await call(cv,tokens[0])).status,200);assert.equal((await call(cv,admin)).status,200);
 assert.match((await call(cv,admin)).headers.get('cache-control'),/no-store/);
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.cv_url,undefined);
 await db.query('INSERT INTO conversaciones(socio_1_id,socio_2_id) VALUES($1,$2)',[ids[0],ids[1]]);
 assert.equal((await call(cv,tokens[1])).status,200);assert.equal((await call(cv,tokens[2])).status,403);
 assert.equal((await call('/api/socios/perfil/'+ids[0],tokens[1])).body.socio.cv_url,cv);
 for(const url of ['/uploads/cvs%2fsynthetic.pdf','/uploads/fotos/%2e%2e%2fcvs%2fsynthetic.pdf','/uploads//cvs/synthetic.pdf']) assert.notEqual((await call(url)).status,200);
});
test('preferred email is used; SMTP failure is distinct from stored internal message',async()=>{
 await db.query("UPDATE socios SET email_personal='preferred@example.invalid',email_preferido='personal' WHERE id=$1",[ids[1]]);
 await db.query('UPDATE consentimientos SET acepta_notificaciones_email=true WHERE socio_id=$1',[ids[1]]);
 let r=await call('/api/mensajeria/mensajes',tokens[0],{receptorId:ids[1],contenido:'Mensaje sintético'});assert.equal(r.status,201);assert.equal(r.body.aviso_email,'aceptado');assert.equal(sent.at(-1).to,'preferred@example.invalid');
 email.transporter={async sendMail(){throw new Error('Synthetic SMTP failure');}};
 r=await call('/api/mensajeria/mensajes',tokens[0],{receptorId:ids[1],contenido:'Mensaje guardado aunque falle el aviso'});assert.equal(r.status,201);assert.equal(r.body.aviso_email,'fallido');
 assert.equal(Number((await db.query('SELECT count(*) FROM mensajes WHERE receptor_id=$1',[ids[1]])).rows[0].count),2);
 await db.query('UPDATE consentimientos SET acepta_notificaciones_email=false WHERE socio_id=$1',[ids[1]]);
 r=await call('/api/mensajeria/mensajes',tokens[0],{receptorId:ids[1],contenido:'Sin aviso'});assert.equal(r.body.aviso_email,'no_solicitado');
});
test('admin diagnoses and recovers location; member cannot invoke repair',async()=>{
 assert.equal((await call('/api/admin/mapa-diagnostico',tokens[0])).status,403);
 const d=await call('/api/admin/mapa-diagnostico',admin);assert.equal(d.body.socios.length,8);
 assert.equal((await call('/api/admin/mapa',admin)).body.socios.length,8);
 assert.equal((await call('/api/admin/mapa-diagnostico/'+ids[0]+'/ubicacion',tokens[0],{})).status,403);
 geo.geocode=async()=>({lat:37.389,lng:-5.984});
 const r=await call('/api/admin/mapa-diagnostico/'+ids[0]+'/ubicacion',admin,{});assert.equal(r.status,200);assert.equal(r.body.actualizado,true);
 assert.equal((await call('/api/socios/mapa',tokens[0])).body.socios[0].precision,'municipio');
});
