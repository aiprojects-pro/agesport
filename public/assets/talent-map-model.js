(function (root) {
  const fold = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const available = (s) => ['Alta', 'Media', 'Puntual'].includes(s.disponibilidad);
  function intent(s, key) {
    return key === 'mentor'
      ? !!s.tutor_mentor
      : key === 'speaker'
        ? !!s.ponente
        : key === 'collaboration'
          ? !!(s.b2b_ofrece || s.b2b_busca || s.b2b_licita)
          : key === 'available'
            ? available(s)
            : true;
  }
  function matches(s, f = {}) {
    if (f.province && s.provincia !== f.province) return false;
    if (f.role === 'sin_rol' && (s.rol_cluster || s.rol_secundario)) return false;
    if (f.role && f.role !== 'sin_rol' && s.rol_cluster !== f.role && s.rol_secundario !== f.role)
      return false;
    if (f.specialty && !(s.especialidades || []).includes(f.specialty)) return false;
    if (
      f.availability &&
      (f.availability === 'sin_dato' ? !!s.disponibilidad : s.disponibilidad !== f.availability)
    )
      return false;
    if (f.sector && s.sector !== f.sector) return false;
    if (f.contact === 'messages' && !s.mensajeria) return false;
    if (!intent(s, f.intent)) return false;
    const words = fold(f.search).split(/\s+/).filter(Boolean);
    const text = fold(
      [s.nombre, s.apellidos, s.entidad, s.provincia, s.localidad, s.searchLabels].join(' ')
    );
    return words.every((word) => text.includes(word));
  }
  function located(s) {
    return (
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng) &&
      Math.abs(s.lat) <= 90 &&
      Math.abs(s.lng) <= 180
    );
  }
  // Screen-space grouping: coincident and overlapping markers contain every person once.
  function clusters(items, project, distance = 44) {
    const groups = [];
    for (const s of items.filter(located)) {
      const p = project(s);
      let group = groups.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < distance);
      if (!group) {
        group = { x: p.x, y: p.y, members: [], lat: s.lat, lng: s.lng };
        groups.push(group);
      }
      group.members.push(s);
    }
    return groups;
  }
  function sort(items, key) {
    const levels = { Alta: 0, Media: 1, Puntual: 2, ninguna: 3 };
    const byName = (a, b) =>
      [a.nombre, a.apellidos].join(' ').localeCompare([b.nombre, b.apellidos].join(' '), 'es');
    return [...items].sort((a, b) =>
      key === 'availability'
        ? (levels[a.disponibilidad] ?? 4) - (levels[b.disponibilidad] ?? 4) || byName(a, b)
        : key === 'recent'
          ? (Date.parse(b.fecha_registro) || 0) - (Date.parse(a.fecha_registro) || 0) ||
            byName(a, b)
          : byName(a, b)
    );
  }
  const api = { fold, intent, matches, located, clusters, sort };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgesportTalentModel = api;
})(typeof window === 'undefined' ? globalThis : window);
