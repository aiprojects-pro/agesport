// config/catalogos.js
// =============================================================================
// CATÁLOGOS CENTRALIZADOS DEL MAPA DEL TALENTO AGESPORT
// =============================================================================
// Fuente única de verdad para roles, especialidades, tipos de socio,
// comunidades autónomas y provincias de España.
// El equivalente browser está en public/assets/catalogos.js (mantener sincronizado).
// =============================================================================

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

// Paleta cualitativa con 9 hues distintos (accesibles WCAG contra
// fondo blanco, contraste ≥4.5:1). Antes había 3 verdes casi
// idénticos (operador/infra/tecnológico) y 2 azules muy parecidos
// (servicios/administración) — la usuaria pidió más diferenciación.
const ROLES_CLUSTER = [
  {
    slug: 'operador_deportivo',
    label: 'Operador deportivo',
    color: '#2E7D32', // verde bosque — actividad "en pista"
    descripcion: 'Gestionas directamente actividad deportiva, programas, clubes, centros, academias, escuelas o servicios vinculados a la práctica deportiva.'
  },
  {
    slug: 'gestor_infraestructuras_instalaciones',
    label: 'Gestor de infraestructuras e instalaciones',
    color: '#546E7A', // slate azul-grisáceo — edificios, obra
    descripcion: 'Participas en el diseño, construcción, mantenimiento, explotación o gestión de instalaciones y espacios deportivos.'
  },
  {
    slug: 'proveedor_servicios_profesionales',
    label: 'Proveedor de servicios profesionales',
    color: '#1A4E7A', // navy profundo — consultoría sobria
    descripcion: 'Ofreces servicios especializados al sector deportivo: consultoría, asesoría legal, fiscal, laboral, seguros, comunicación, gestión o apoyo empresarial.'
  },
  {
    slug: 'proveedor_tecnologico_innovacion',
    label: 'Proveedor tecnológico e innovación',
    color: '#00838F', // teal/cyan — tech, innovación
    descripcion: 'Desarrollas o aplicas soluciones tecnológicas, digitales o innovadoras para mejorar la gestión, el rendimiento, la experiencia o los procesos del sector deportivo.'
  },
  {
    slug: 'industria_producto_equipamiento',
    label: 'Industria, producto y equipamiento',
    color: '#8D6E4A', // marrón/bronce — industrial, material físico
    descripcion: 'Fabricas, distribuyes, comercializas o suministras productos, materiales, equipamiento, textil, maquinaria o soluciones físicas para el deporte.'
  },
  {
    slug: 'salud_rendimiento_bienestar',
    label: 'Salud, rendimiento y bienestar',
    color: '#C62828', // rojo intenso — vitalidad, salud
    descripcion: 'Trabajas en áreas relacionadas con la salud, condición física, rendimiento, prevención, recuperación, entrenamiento o bienestar.'
  },
  {
    slug: 'formacion_talento_investigacion',
    label: 'Formación, talento e investigación',
    color: '#6A1B9A', // púrpura — académico
    descripcion: 'Desarrollas actividades de formación, capacitación, investigación, transferencia de conocimiento, gestión del talento o desarrollo profesional.'
  },
  {
    slug: 'eventos_turismo_experiencias',
    label: 'Eventos, turismo y experiencias deportivas',
    color: '#E65100', // naranja fuerte — energía, festivo
    descripcion: 'Organizas, promueves o gestionas eventos, competiciones, experiencias, actividades turísticas o propuestas vinculadas al deporte y al territorio.'
  },
  {
    slug: 'administracion_gobernanza_impacto',
    label: 'Administración, gobernanza e impacto',
    color: '#37474F', // grafito — institucional
    descripcion: 'Representas a una administración, institución o entidad vinculada a políticas deportivas, planificación, financiación, inclusión, sostenibilidad o impacto territorial.'
  }
];

// Especialidades ORDENADAS ALFABÉTICAMENTE por `label` (auditoría 19 jun
// mejora #10 — antes estaban en orden semi-arbitrario y costaba localizar
// una concreta). Se ha añadido "Empleado público" (planificación,
// programación, ejecución, control y evaluación en administración o
// empresa pública).
const ESPECIALIDADES = [
  {
    slug: 'accesibilidad_inclusion_igualdad',
    label: 'Accesibilidad, inclusión e igualdad',
    descripcion: 'Deporte adaptado, accesibilidad universal, igualdad, diversidad, inclusión social o programas para colectivos específicos.'
  },
  {
    slug: 'actividad_fisica_salud_bienestar',
    label: 'Actividad física, salud y bienestar',
    descripcion: 'Promoción de la actividad física, salud comunitaria, ejercicio terapéutico, bienestar corporativo, prevención o hábitos saludables.'
  },
  {
    slug: 'contratacion_compras_patrimonio',
    label: 'Contratación, compras y patrimonio',
    descripcion: 'Licitaciones, compras públicas, concesiones, gestión patrimonial, contratación de servicios o adquisición de equipamiento.'
  },
  {
    slug: 'derecho_deportivo',
    label: 'Derecho deportivo',
    descripcion: 'Asesoramiento jurídico especializado en deporte, contratos, normativa, federaciones, compliance, disciplina o responsabilidad.'
  },
  {
    slug: 'digitalizacion_datos_ia',
    label: 'Digitalización, datos e IA',
    descripcion: 'Software, plataformas, automatización, inteligencia artificial, análisis de datos, sensores, CRM, ticketing o soluciones digitales.'
  },
  {
    slug: 'empleado_publico',
    label: 'Empleado público',
    descripcion: 'Planificación, programación, ejecución, control y evaluación de actividades en la administración pública o empresa pública del ámbito deportivo.'
  },
  {
    slug: 'equipamiento_producto_retail',
    label: 'Equipamiento, producto y retail deportivo',
    descripcion: 'Material deportivo, textil, maquinaria, equipamiento técnico, distribución, venta, merchandising o soluciones físicas para la práctica deportiva.'
  },
  {
    slug: 'financiacion_subvenciones_inversion',
    label: 'Financiación, subvenciones e inversión',
    descripcion: 'Ayudas públicas, fondos europeos, subvenciones, inversión, modelos de negocio, financiación de proyectos o captación de recursos.'
  },
  {
    slug: 'formacion_investigacion',
    label: 'Formación e investigación',
    descripcion: 'Programas formativos, certificaciones, docencia, investigación aplicada, estudios, transferencia de conocimiento o divulgación.'
  },
  {
    slug: 'gestion_instalaciones',
    label: 'Gestión de instalaciones',
    descripcion: 'Gestión, explotación, mantenimiento, reservas, eficiencia, accesibilidad u operación diaria de espacios deportivos.'
  },
  {
    slug: 'marketing_comunicacion_patrocinio',
    label: 'Marketing, comunicación y patrocinio',
    descripcion: 'Branding, comunicación, contenidos, redes sociales, captación y activación de patrocinadores, medios o posicionamiento de marca.'
  },
  {
    slug: 'organizacion_eventos',
    label: 'Organización de eventos',
    descripcion: 'Diseño, producción, coordinación o gestión de competiciones, torneos, carreras, congresos, campus o eventos deportivos.'
  },
  {
    slug: 'recursos_humanos_talento',
    label: 'Recursos humanos y talento',
    descripcion: 'Selección, gestión de equipos, formación interna, liderazgo, cultura organizativa, desarrollo profesional o gestión del talento.'
  },
  {
    slug: 'seguridad_riesgos_autoproteccion',
    label: 'Seguridad, riesgos y autoprotección',
    descripcion: 'Planes de seguridad, autoprotección, emergencias, prevención de riesgos, seguros, protección de menores o gestión de crisis.'
  },
  {
    slug: 'sostenibilidad_medio_ambiente',
    label: 'Sostenibilidad y medio ambiente',
    descripcion: 'Eficiencia energética, reducción de impacto ambiental, economía circular, eventos sostenibles, movilidad o gestión responsable de recursos.'
  },
  {
    slug: 'turismo_activo_deportivo',
    label: 'Turismo activo y deportivo',
    descripcion: 'Turismo deportivo, experiencias outdoor, actividades en la naturaleza, destinos deportivos o propuestas turísticas vinculadas al deporte.'
  }
];

// 17 Comunidades Autónomas + 2 Ciudades Autónomas con sus provincias
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

// Helpers
const allProvinces = () =>
  COMUNIDADES_AUTONOMAS.flatMap((ca) => ca.provincias);

const findRolBySlug = (slug) =>
  ROLES_CLUSTER.find((r) => r.slug === slug) || null;

const findEspecialidadBySlug = (slug) =>
  ESPECIALIDADES.find((e) => e.slug === slug) || null;

const findCcaaByProvincia = (provincia) =>
  COMUNIDADES_AUTONOMAS.find((ca) => ca.provincias.includes(provincia)) || null;

// Normaliza texto para comparación tolerante: quita acentos, colapsa espacios
// y baja a minúsculas. Sin esto, "ALMERÍA" (tal cual viene en muchos CSV
// de administraciones públicas) no encajaba con "Almería" del catálogo.
const _norm = (s) => (s || '')
  .toString()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .trim()
  .replace(/\s+/g, ' ');

// Devuelve el nombre canónico de la provincia (respetando mayúsculas
// del catálogo) a partir de cualquier variante razonable; null si no
// se reconoce.
const canonicalProvincia = (raw) => {
  if (!raw) return null;
  const n = _norm(raw);
  return allProvinces().find((p) => _norm(p) === n) || null;
};

// Validadores
const isValidProvincia = (provincia) => canonicalProvincia(provincia) !== null;
const isValidRolSlug = (slug) => ROLES_CLUSTER.some((r) => r.slug === slug);
const isValidEspecialidadSlug = (slug) => ESPECIALIDADES.some((e) => e.slug === slug);
const isValidTipoSocio = (slug) => TIPOS_SOCIO.some((t) => t.slug === slug);

module.exports = {
  canonicalProvincia,
  TIPOS_SOCIO,
  ROLES_CLUSTER,
  ESPECIALIDADES,
  COMUNIDADES_AUTONOMAS,
  allProvinces,
  findRolBySlug,
  findEspecialidadBySlug,
  findCcaaByProvincia,
  isValidProvincia,
  isValidRolSlug,
  isValidEspecialidadSlug,
  isValidTipoSocio
};
