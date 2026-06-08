// services/messageSentinels.js
// Centraliza los textos que sustituyen al contenido de un mensaje
// cuando éste se "elimina" por algún motivo. Ambos flujos (baja
// voluntaria y baja administrativa) terminan con el mismo texto desde
// el punto de vista del receptor — éste no necesita saber si el otro
// usuario se fue por su cuenta o si lo dio de baja un admin.
//
// El sentinel de moderación se mantiene SEPARADO porque
// `mensajeriaController.getMensajesConversacion` lo filtra del listado
// (mensajes moderados desaparecen de la vista), mientras que los
// mensajes de un socio dado de baja SÍ se muestran (sólo se anonimiza
// el contenido para no exponer texto personal del que se fue).

module.exports = {
  // Aparece en el thread cuando el emisor se ha dado de baja
  // (voluntaria o administrativa).
  USUARIO_BAJA: '[Mensaje eliminado - usuario dado de baja]',

  // Aparece reemplazando contenido moderado. La vista de conversación
  // lo filtra explícitamente — no es visible para el receptor.
  MODERACION: '[Mensaje eliminado por moderación]',
};
