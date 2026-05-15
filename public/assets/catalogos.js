// public/assets/catalogos.js
// Catálogo browser. Mantener sincronizado con /config/catalogos.js (backend).
// Se carga antes que cualquier otro script de página y expone window.AgesportCatalogos.

(function () {
  const TIPOS_SOCIO = [
    {
      slug: 'numero',
      label: 'Socio/a de número',
      descripcion: 'Persona física admitida por la Junta Directiva tras solicitud, que satisface la cuota vigente. Goza de la plenitud de derechos y es miembro de la Asamblea General.'
    },
    {
      slug: 'asociado_corporativo',
      label: 'Socio/a Asociado Corporativo',
      descripcion: 'Persona jurídica que manifiesta su deseo de coadyuvar en la consecución de los fines de AGESPORT y es admitida por la Junta Directiva.'
    },
    {
      slug: 'fundador',
      label: 'Socio/a fundador/a',
      descripcion: 'Personas que participaron en la constitución de la asociación, promotores y firmantes del Acta Fundacional. Mismos derechos y deberes que los socios de número.'
    },
    {
      slug: 'honor',
      label: 'Socio/a de Honor',
      descripcion: 'Designados por la Junta Directiva por su relevancia en el mundo del deporte, a propuesta de tres miembros y previa relación de méritos.'
    },
    {
      slug: 'colaborador',
      label: 'Socio/a colaborador/a',
      descripcion: 'Personas físicas vinculadas a áreas de la actividad deportiva, sin estar directamente involucradas en su gestión profesional, que aportan fondos, medios o trabajo no remunerado.'
    }
  ];

  const ROLES_CLUSTER = [
    { slug: 'operador_deportivo', label: 'Operador deportivo', color: '#2f7d32', descripcion: 'Gestionas directamente actividad deportiva, programas, clubes, centros, academias, escuelas o servicios vinculados a la práctica deportiva.' },
    { slug: 'gestor_infraestructuras_instalaciones', label: 'Gestor de infraestructuras e instalaciones', color: '#0f895b', descripcion: 'Participas en el diseño, construcción, mantenimiento, explotación o gestión de instalaciones y espacios deportivos.' },
    { slug: 'proveedor_servicios_profesionales', label: 'Proveedor de servicios profesionales', color: '#1c578d', descripcion: 'Ofreces servicios especializados al sector deportivo: consultoría, asesoría legal, fiscal, laboral, seguros, comunicación, gestión o apoyo empresarial.' },
    { slug: 'proveedor_tecnologico_innovacion', label: 'Proveedor tecnológico e innovación', color: '#37964f', descripcion: 'Desarrollas o aplicas soluciones tecnológicas, digitales o innovadoras para mejorar la gestión, el rendimiento, la experiencia o los procesos del sector deportivo.' },
    { slug: 'industria_producto_equipamiento', label: 'Industria, producto y equipamiento', color: '#c08a00', descripcion: 'Fabricas, distribuyes, comercializas o suministras productos, materiales, equipamiento, textil, maquinaria o soluciones físicas para el deporte.' },
    { slug: 'salud_rendimiento_bienestar', label: 'Salud, rendimiento y bienestar', color: '#b8326a', descripcion: 'Trabajas en áreas relacionadas con la salud, condición física, rendimiento, prevención, recuperación, entrenamiento o bienestar.' },
    { slug: 'formacion_talento_investigacion', label: 'Formación, talento e investigación', color: '#6a3aa0', descripcion: 'Desarrollas actividades de formación, capacitación, investigación, transferencia de conocimiento, gestión del talento o desarrollo profesional.' },
    { slug: 'eventos_turismo_experiencias', label: 'Eventos, turismo y experiencias deportivas', color: '#d76a17', descripcion: 'Organizas, promueves o gestionas eventos, competiciones, experiencias, actividades turísticas o propuestas vinculadas al deporte y al territorio.' },
    { slug: 'administracion_gobernanza_impacto', label: 'Administración, gobernanza e impacto', color: '#0d355f', descripcion: 'Representas a una administración, institución o entidad vinculada a políticas deportivas, planificación, financiación, inclusión, sostenibilidad o impacto territorial.' }
  ];

  const ESPECIALIDADES = [
    { slug: 'gestion_instalaciones', label: 'Gestión de instalaciones', descripcion: 'Gestión, explotación, mantenimiento, reservas, eficiencia, accesibilidad u operación diaria de espacios deportivos.' },
    { slug: 'organizacion_eventos', label: 'Organización de eventos', descripcion: 'Diseño, producción, coordinación o gestión de competiciones, torneos, carreras, congresos, campus o eventos deportivos.' },
    { slug: 'derecho_deportivo', label: 'Derecho deportivo', descripcion: 'Asesoramiento jurídico especializado en deporte, contratos, normativa, federaciones, compliance, disciplina o responsabilidad.' },
    { slug: 'contratacion_compras_patrimonio', label: 'Contratación, compras y patrimonio', descripcion: 'Licitaciones, compras públicas, concesiones, gestión patrimonial, contratación de servicios o adquisición de equipamiento.' },
    { slug: 'marketing_comunicacion_patrocinio', label: 'Marketing, comunicación y patrocinio', descripcion: 'Branding, comunicación, contenidos, redes sociales, captación y activación de patrocinadores, medios o posicionamiento de marca.' },
    { slug: 'digitalizacion_datos_ia', label: 'Digitalización, datos e IA', descripcion: 'Software, plataformas, automatización, inteligencia artificial, análisis de datos, sensores, CRM, ticketing o soluciones digitales.' },
    { slug: 'recursos_humanos_talento', label: 'Recursos humanos y talento', descripcion: 'Selección, gestión de equipos, formación interna, liderazgo, cultura organizativa, desarrollo profesional o gestión del talento.' },
    { slug: 'accesibilidad_inclusion_igualdad', label: 'Accesibilidad, inclusión e igualdad', descripcion: 'Deporte adaptado, accesibilidad universal, igualdad, diversidad, inclusión social o programas para colectivos específicos.' },
    { slug: 'actividad_fisica_salud_bienestar', label: 'Actividad física, salud y bienestar', descripcion: 'Promoción de la actividad física, salud comunitaria, ejercicio terapéutico, bienestar corporativo, prevención o hábitos saludables.' },
    { slug: 'seguridad_riesgos_autoproteccion', label: 'Seguridad, riesgos y autoprotección', descripcion: 'Planes de seguridad, autoprotección, emergencias, prevención de riesgos, seguros, protección de menores o gestión de crisis.' },
    { slug: 'formacion_investigacion', label: 'Formación e investigación', descripcion: 'Programas formativos, certificaciones, docencia, investigación aplicada, estudios, transferencia de conocimiento o divulgación.' },
    { slug: 'turismo_activo_deportivo', label: 'Turismo activo y deportivo', descripcion: 'Turismo deportivo, experiencias outdoor, actividades en la naturaleza, destinos deportivos o propuestas turísticas vinculadas al deporte.' },
    { slug: 'financiacion_subvenciones_inversion', label: 'Financiación, subvenciones e inversión', descripcion: 'Ayudas públicas, fondos europeos, subvenciones, inversión, modelos de negocio, financiación de proyectos o captación de recursos.' },
    { slug: 'sostenibilidad_medio_ambiente', label: 'Sostenibilidad y medio ambiente', descripcion: 'Eficiencia energética, reducción de impacto ambiental, economía circular, eventos sostenibles, movilidad o gestión responsable de recursos.' },
    { slug: 'equipamiento_producto_retail', label: 'Equipamiento, producto y retail deportivo', descripcion: 'Material deportivo, textil, maquinaria, equipamiento técnico, distribución, venta, merchandising o soluciones físicas para la práctica deportiva.' }
  ];

  const COMUNIDADES_AUTONOMAS = [
    { slug: 'andalucia', label: 'Andalucía', provincias: ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'] },
    { slug: 'aragon', label: 'Aragón', provincias: ['Huesca', 'Teruel', 'Zaragoza'] },
    { slug: 'asturias', label: 'Principado de Asturias', provincias: ['Asturias'] },
    { slug: 'baleares', label: 'Islas Baleares', provincias: ['Illes Balears'] },
    { slug: 'canarias', label: 'Canarias', provincias: ['Las Palmas', 'Santa Cruz de Tenerife'] },
    { slug: 'cantabria', label: 'Cantabria', provincias: ['Cantabria'] },
    { slug: 'castilla_la_mancha', label: 'Castilla-La Mancha', provincias: ['Albacete', 'Ciudad Real', 'Cuenca', 'Guadalajara', 'Toledo'] },
    { slug: 'castilla_y_leon', label: 'Castilla y León', provincias: ['Ávila', 'Burgos', 'León', 'Palencia', 'Salamanca', 'Segovia', 'Soria', 'Valladolid', 'Zamora'] },
    { slug: 'cataluna', label: 'Cataluña', provincias: ['Barcelona', 'Girona', 'Lleida', 'Tarragona'] },
    { slug: 'extremadura', label: 'Extremadura', provincias: ['Badajoz', 'Cáceres'] },
    { slug: 'galicia', label: 'Galicia', provincias: ['A Coruña', 'Lugo', 'Ourense', 'Pontevedra'] },
    { slug: 'la_rioja', label: 'La Rioja', provincias: ['La Rioja'] },
    { slug: 'madrid', label: 'Comunidad de Madrid', provincias: ['Madrid'] },
    { slug: 'murcia', label: 'Región de Murcia', provincias: ['Murcia'] },
    { slug: 'navarra', label: 'Comunidad Foral de Navarra', provincias: ['Navarra'] },
    { slug: 'pais_vasco', label: 'País Vasco', provincias: ['Álava', 'Gipuzkoa', 'Bizkaia'] },
    { slug: 'valencia', label: 'Comunidad Valenciana', provincias: ['Alicante', 'Castellón', 'Valencia'] },
    { slug: 'ceuta', label: 'Ceuta', provincias: ['Ceuta'] },
    { slug: 'melilla', label: 'Melilla', provincias: ['Melilla'] }
  ];

  const allProvinces = function () {
    return COMUNIDADES_AUTONOMAS.reduce(function (acc, ca) { return acc.concat(ca.provincias); }, []);
  };

  const findRolBySlug = function (slug) {
    return ROLES_CLUSTER.find(function (r) { return r.slug === slug; }) || null;
  };

  const findEspecialidadBySlug = function (slug) {
    return ESPECIALIDADES.find(function (e) { return e.slug === slug; }) || null;
  };

  const findCcaaByProvincia = function (provincia) {
    return COMUNIDADES_AUTONOMAS.find(function (ca) { return ca.provincias.indexOf(provincia) !== -1; }) || null;
  };

  // Helpers de render para selects (devuelven option elements ya construidos)
  const buildOption = function (value, label, selected) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = label;
    if (selected) opt.selected = true;
    return opt;
  };

  // Pinta un select de provincias agrupadas por CCAA
  const fillProvincesSelect = function (selectEl, options) {
    options = options || {};
    const placeholder = options.placeholder !== undefined ? options.placeholder : 'Selecciona provincia';
    const selected = options.selected || '';
    selectEl.innerHTML = '';
    if (placeholder) selectEl.appendChild(buildOption('', placeholder, !selected));
    COMUNIDADES_AUTONOMAS.forEach(function (ca) {
      const group = document.createElement('optgroup');
      group.label = ca.label;
      ca.provincias.forEach(function (p) {
        group.appendChild(buildOption(p, p, p === selected));
      });
      selectEl.appendChild(group);
    });
  };

  const fillRolesSelect = function (selectEl, options) {
    options = options || {};
    const placeholder = options.placeholder !== undefined ? options.placeholder : 'Selecciona rol';
    const selected = options.selected || '';
    selectEl.innerHTML = '';
    if (placeholder) selectEl.appendChild(buildOption('', placeholder, !selected));
    ROLES_CLUSTER.forEach(function (r) {
      selectEl.appendChild(buildOption(r.slug, r.label, r.slug === selected));
    });
  };

  const fillEspecialidadesSelect = function (selectEl, options) {
    options = options || {};
    const selected = options.selected || [];
    selectEl.innerHTML = '';
    ESPECIALIDADES.forEach(function (e) {
      selectEl.appendChild(buildOption(e.slug, e.label, selected.indexOf(e.slug) !== -1));
    });
  };

  const fillTiposSocioSelect = function (selectEl, options) {
    options = options || {};
    const placeholder = options.placeholder !== undefined ? options.placeholder : 'Selecciona tipo de socio';
    const selected = options.selected || '';
    const allowed = options.allowed || null; // array de slugs permitidos (ej. solo 'numero' y 'asociado_corporativo' en alta pública)
    selectEl.innerHTML = '';
    if (placeholder) selectEl.appendChild(buildOption('', placeholder, !selected));
    TIPOS_SOCIO.forEach(function (t) {
      if (allowed && allowed.indexOf(t.slug) === -1) return;
      selectEl.appendChild(buildOption(t.slug, t.label, t.slug === selected));
    });
  };

  window.AgesportCatalogos = {
    TIPOS_SOCIO: TIPOS_SOCIO,
    ROLES_CLUSTER: ROLES_CLUSTER,
    ESPECIALIDADES: ESPECIALIDADES,
    COMUNIDADES_AUTONOMAS: COMUNIDADES_AUTONOMAS,
    allProvinces: allProvinces,
    findRolBySlug: findRolBySlug,
    findEspecialidadBySlug: findEspecialidadBySlug,
    findCcaaByProvincia: findCcaaByProvincia,
    fillProvincesSelect: fillProvincesSelect,
    fillRolesSelect: fillRolesSelect,
    fillEspecialidadesSelect: fillEspecialidadesSelect,
    fillTiposSocioSelect: fillTiposSocioSelect
  };
})();
