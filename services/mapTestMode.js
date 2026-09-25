// Backward-compatible status for clients that used the former temporary map.
// Global overrides are retired: visibility is controlled per member.
const KEY = 'mapa_prueba_temporal';
async function getStatus() {
  return { enabled:false, expiresAt:null, permanent:true, individualControl:true };
}
module.exports = { KEY, getStatus };
