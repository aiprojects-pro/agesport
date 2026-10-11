const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const setup = require('../integration/_setup');
setup.setTestEnv();
const db = require('../../config/database');
const email = require('../../services/emailService');
const nodemailer = require('nodemailer');
const sent = [];
before(async () => {
  await setup.resetTestDb();
  await email.ready;
  email.transporter = {
    sendMail: async (m) => {
      sent.push(m);
      return { accepted: [m.to], rejected: [], messageId: 'fake' };
    },
  };
});
after(async () => {
  await db.close();
});
test('normal emails include the association notice in HTML and text without losing reset links', async () => {
  const r = await email.sendEmail(
    'legal@example.invalid',
    'Recuperación',
    '<html><body><p>Enlace https://example.invalid/reset?token=abc</p></body></html>',
    'Enlace https://example.invalid/reset?token=abc'
  );
  assert.equal(r.success, true);
  const m = sent[0];
  assert.match(m.html, /data-agesport-legal-notice/);
  assert.match(m.html, /mailto:agesport@agesport.org/);
  assert.match(m.text, /token=abc/);
  assert.match(m.text, /Protección de datos/);
  assert.match(m.text, /No está permitida su comunicación/);
  const generated = await email.sendEmail('legal@example.invalid', 'Aviso', '<p>Nuevo mensaje</p>');
  assert.equal(generated.success, true);
  assert.match(sent[1].text, /Nuevo mensaje/);
  assert.equal(sent[1].text.split('Este mensaje y sus archivos adjuntos').length - 1, 1);
});
test('SMTP configuration test includes the same notice, with no real transport', async () => {
  const original = nodemailer.createTransport;
  let message;
  nodemailer.createTransport = () => ({
    sendMail: async (m) => {
      message = m;
      return { accepted: [m.to], rejected: [] };
    },
  });
  try {
    const result = await email.sendTestEmail(
      {
        host: 'smtp.example.invalid',
        port: 587,
        user: 'test',
        pass: 'fake',
        fromName: 'AGESPORT',
        fromEmail: 'from@example.invalid',
      },
      'legal@example.invalid'
    );
    assert.equal(result.success, true);
    assert.match(message.html, /data-agesport-legal-notice/);
    assert.match(message.text, /Protección de datos/);
  } finally {
    nodemailer.createTransport = original;
  }
});
test('registration notices use the configured mailbox instead of account login addresses', async () => {
  await db.query("INSERT INTO configuracion(clave,valor) VALUES('smtp_config',$1) ON CONFLICT(clave) DO UPDATE SET valor=EXCLUDED.valor",[JSON.stringify({registrationEmail:'office@example.invalid'})]);
  const beforeCount=sent.length;
  await email.notifyAdminNewRegistration({nombre:'Prueba',apellidos:'Avisos',email:'new@example.invalid'});
  assert.equal(sent.length,beforeCount+1);
  assert.equal(sent.at(-1).to,'office@example.invalid');
  await db.query("DELETE FROM configuracion WHERE clave='smtp_config'");
});
test('without a mailbox override, global registration notices exclude provincial delegates',async()=>{
 await db.query("INSERT INTO administradores(email,password_hash,nombre,rol,provincia_delegacion) VALUES ('root@example.invalid','fake','Root','superadmin',NULL),('delegate@example.invalid','fake','Delegate','delegado_provincial','Sevilla')");
 const admins=await email.getActiveAdmins();
 assert.ok(admins.some(a=>a.email==='root@example.invalid'));
 assert.ok(!admins.some(a=>a.email==='delegate@example.invalid'));
});

test('saving SMTP settings retains stored authentication during hot reload',()=>{
 const original=nodemailer.createTransport;
 const previous=email.transporter;
 let options;
 nodemailer.createTransport=(cfg)=>{options=cfg;return {close(){}};};
 try {
  email.reloadFromConfig({host:'smtp.example.invalid',user:'qa@example.invalid',passEncrypted:require('../../middleware/auth').encryptData('SyntheticPassword')});
  assert.equal(options.auth.user,'qa@example.invalid');
  assert.equal(options.auth.pass,'SyntheticPassword');
 } finally { nodemailer.createTransport=original;email.transporter=previous; }
});
