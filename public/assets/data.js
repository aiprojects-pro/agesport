window.AgesportData = (function () {
  const PROVINCIAS = [
    { nombre: 'Almería', lat: 36.8381, lng: -2.4597 },
    { nombre: 'Cádiz', lat: 36.5271, lng: -6.2886 },
    { nombre: 'Córdoba', lat: 37.8882, lng: -4.7794 },
    { nombre: 'Granada', lat: 37.1773, lng: -3.5986 },
    { nombre: 'Huelva', lat: 37.2571, lng: -6.9495 },
    { nombre: 'Jaén', lat: 37.7796, lng: -3.7849 },
    { nombre: 'Málaga', lat: 36.7213, lng: -4.4214 },
    { nombre: 'Sevilla', lat: 37.3891, lng: -5.9845 }
  ];

  const ROLES_CLUSTER = [
    { id: 'gestion', nombre: 'Gestión Directa', color: '#0d355f' },
    { id: 'servicios', nombre: 'Servicios Profesionales', color: '#a8cf2f' },
    { id: 'infra', nombre: 'Infraestructuras', color: '#e07b5e' },
    { id: 'tech', nombre: 'Tecnología e Innovación', color: '#4ea7d6' }
  ];

  const ESPECIALIDADES = [
    'Gestión de Instalaciones',
    'Organización de Eventos',
    'Derecho Deportivo',
    'Contratación y Patrimonio',
    'Marketing y Patrocinio',
    'Digitalización e IA',
    'Recursos Humanos',
    'Accesibilidad e Inclusión',
    'Actividad Física y Salud',
    'Seguridad y Autoprotección',
    'Formación',
    'Turismo Activo'
  ];

  const TIPOS_SOCIO = [
    { id: 'numero', etiqueta: 'Socio de Número' },
    { id: 'corporativo', etiqueta: 'Socio Corporativo' }
  ];

  const TIPOS_CORPORATIVO = [
    { id: 'empresa', etiqueta: 'Empresa privada' },
    { id: 'admin_publica', etiqueta: 'Administración Pública' },
    { id: 'ong', etiqueta: 'ONG / Asociación sin ánimo de lucro' },
    { id: 'fundacion', etiqueta: 'Fundación' },
    { id: 'club', etiqueta: 'Club deportivo' },
    { id: 'federacion', etiqueta: 'Federación deportiva' },
    { id: 'cooperativa', etiqueta: 'Cooperativa / Sociedad Laboral' },
    { id: 'universidad', etiqueta: 'Universidad / Centro de investigación' },
    { id: 'otra', etiqueta: 'Otra entidad' }
  ];

  const DISPONIBILIDADES = [
    { id: 'Alta', etiqueta: 'Alta · disponible ahora', color: '#a8cf2f' },
    { id: 'Media', etiqueta: 'Media · esporádica', color: '#e9b94d' },
    { id: 'Puntual', etiqueta: 'Puntual · solo proyectos', color: '#9aa5af' }
  ];

  const PROV_INDEX = {};
  PROVINCIAS.forEach(function (provincia) {
    PROV_INDEX[provincia.nombre] = provincia;
  });

  function rolMeta(id) {
    return ROLES_CLUSTER.find(function (rol) { return rol.id === id; }) || ROLES_CLUSTER[0];
  }

  function tipoSocioMeta(id) {
    return TIPOS_SOCIO.find(function (tipo) { return tipo.id === id; }) || TIPOS_SOCIO[0];
  }

  function tipoCorpMeta(id) {
    return TIPOS_CORPORATIVO.find(function (tipo) { return tipo.id === id; }) || null;
  }

  function dispMeta(id) {
    return DISPONIBILIDADES.find(function (disp) { return disp.id === id; }) || DISPONIBILIDADES[1];
  }

  function initials(nombre, apellidos) {
    return ((nombre || '').charAt(0) + (apellidos || '').charAt(0)).toUpperCase();
  }

  function provincePoint(nombre, seed) {
    const base = PROV_INDEX[nombre] || PROVINCIAS[0];
    const deltaLng = ((((seed || 1) * 13) % 90) - 45) / 600;
    const deltaLat = ((((seed || 1) * 17) % 90) - 45) / 600;
    return {
      lat: base.lat + deltaLat,
      lng: base.lng + deltaLng
    };
  }

  return {
    PROVINCIAS: PROVINCIAS,
    ROLES_CLUSTER: ROLES_CLUSTER,
    ESPECIALIDADES: ESPECIALIDADES,
    TIPOS_SOCIO: TIPOS_SOCIO,
    TIPOS_CORPORATIVO: TIPOS_CORPORATIVO,
    DISPONIBILIDADES: DISPONIBILIDADES,
    rolMeta: rolMeta,
    tipoSocioMeta: tipoSocioMeta,
    tipoCorpMeta: tipoCorpMeta,
    dispMeta: dispMeta,
    initials: initials,
    provincePoint: provincePoint
  };
})();
