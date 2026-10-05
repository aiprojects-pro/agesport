// Texto facilitado por AGESPORT. No cambia las preferencias de comunicación.
const { render } = require('../public/assets/policy-format');
const confidentiality =
  'Este mensaje y sus archivos adjuntos van dirigidos exclusivamente a su destinatario, pudiendo contener información confidencial sometida a secreto profesional. No está permitida su comunicación, reproducción o distribución sin la autorización expresa de AGESPORT. Si usted no es el destinatario final, por favor elimínelo e infórmenos por esta vía.';
const protection =
  'Conforme a lo establecido en el Artículo 13 del Reglamento (UE) 2016/679 del Parlamento Europeo y del Consejo y la Ley Orgánica 3/2018 de 5 de diciembre (LOPDGDD), le informamos que los datos personales recabados del propio interesado serán tratados bajo la responsabilidad del Responsable del Tratamiento, AGESPORT, para el envío de comunicaciones sobre nuestros productos y servicios y se conservarán mientras ninguna de las partes se oponga a ello o durante el período necesario para cumplir con las obligaciones legales. Se garantiza un tratamiento de datos leal y transparente. Los datos no se cederán a terceros salvo en los casos en que exista una obligación legal.';
const rights =
  'Le informamos que los derechos de acceso, rectificación, supresión, limitación de tratamiento u oposición al tratamiento, así como el derecho a la portabilidad de los datos podrán ser ejercitados ante el Responsable del tratamiento por cualquier medio sujeto en derecho, acompañando de copia de documento oficial que le identifique, dirigiéndose a: [agesport@agesport.org](mailto:agesport@agesport.org), según los términos que la normativa aplicable establece. Puede consultar la información adicional y detallada sobre Protección de Datos en nuestra página web [www.agesport.org](https://www.agesport.org/). Si considera que el tratamiento no se ajusta a la normativa vigente, podrá presentar una reclamación ante la autoridad de control en [www.aepd.es](https://www.aepd.es/).';
const markdown =
  '# Aviso legal\n\n' +
  confidentiality +
  '\n\n# Protección de datos\n\n' +
  protection +
  '\n\n' +
  rights;
const text = markdown
  .replace(/^# /gm, '')
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    url.startsWith('mailto:') ? label : label + ' (' + url + ')'
  );
const html =
  '<aside data-agesport-legal-notice="1" style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#4d5963;padding:20px 28px;border-top:1px solid #dce5e9;max-width:820px;margin:0 auto">' +
  render(markdown) +
  '</aside>';
function append(htmlBody, plainBody) {
  const source = String(htmlBody || '');
  const body = source.includes('data-agesport-legal-notice="1"')
    ? source
    : /<\/body\s*>/i.test(source)
      ? source.replace(/<\/body\s*>/i, html + '</body>')
      : source + html;
  const plain = String(plainBody || '');
  return { html: body, text: plain.endsWith(text) ? plain : plain + '\n\n—\n\n' + text };
}
module.exports = { confidentiality, protection, rights, markdown, text, html, append };
