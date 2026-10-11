const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function portal(status=200) {
  const window={location:{origin:'https://agesport.test', href:'https://agesport.test/mensajes.html?receptor=15',pathname:'/mensajes.html'}};
  vm.runInNewContext(fs.readFileSync('public/assets/portal.js','utf8'),{window,location:window.location,URL,URLSearchParams,document:{querySelectorAll:()=>[]},fetch:async()=>({ok:status===200,status,headers:{get:()=> 'application/json'},json:async()=>({error:'Sesión caducada',type:'socio',user:{id:1}})})});
  return {api:window.AgesportPortal,window};
}
test('member email deep links retain their destination through authentication',async()=>{
 const {api,window}=portal(401);
 await assert.rejects(api.requireSession('socio'),/Sesión caducada/);
 assert.equal(window.location.href,'/acceso.html?next=%2Fmensajes.html%3Freceptor%3D15');
 assert.equal(api.memberReturnUrl('/mensajes.html?receptor=15'),'/mensajes.html?receptor=15');
});
test('return destinations cannot redirect to another site or administrative page',()=>{
 const {api}=portal();
 for(const url of ['//evil.test','https://evil.test/mensajes.html','javascript:alert(1)','/admin.html','/acceso.html','/\\evil.test']) assert.equal(api.memberReturnUrl(url),'/panel.html');
});
test('temporary server errors do not masquerade as an expired session',async()=>{
 const {api,window}=portal(500);
 await assert.rejects(api.requireSession('socio'));
 assert.equal(window.location.href,'https://agesport.test/mensajes.html?receptor=15');
});
