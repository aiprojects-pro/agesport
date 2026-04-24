// scripts/seed-database.js
const db = require('../config/database');
const { hashPassword, encryptData } = require('../middleware/auth');

const PROVINCIAS = ['Almería', 'Cádiz', 'Córdoba', 'Granada', 'Huelva', 'Jaén', 'Málaga', 'Sevilla'];
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
  'Seguridad y Autoprotección'
];

const ROLES_CLUSTER = ['gestion', 'servicios', 'infra', 'tech'];
const AMBITOS = ['Público', 'Privado', 'Mixto / Otros'];
const DISPONIBILIDAD = ['Alta', 'Media', 'Puntual'];

async function seedDatabase() {
  console.log('🌱 Poblando base de datos con datos de ejemplo...\n');
  
  try {
    // Limpiar datos existentes (cuidado en producción)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🧹 Limpiando datos existentes...');
      await db.query('DELETE FROM mensajes');
      await db.query('DELETE FROM conversaciones');
      await db.query('DELETE FROM auditoria WHERE socio_id IS NOT NULL');
      await db.query('DELETE FROM consentimientos');
      await db.query('DELETE FROM proyectos_innovacion');
      await db.query('DELETE FROM disponibilidad');
      await db.query('DELETE FROM socio_especialidades');
      await db.query('DELETE FROM rol_cluster');
      await db.query('DELETE FROM socios WHERE email != \'admin@agesport.org\'');
      console.log('✅ Datos limpiados');
    }

    // Generar socios de ejemplo
    const sociosEjemplo = [
      {
        email: 'maria.garcia@deportealmeria.com',
        nombre: 'María',
        apellidos: 'García López',
        provincia: 'Almería',
        localidad: 'Almería',
        entidad: 'Centro Deportivo Almería',
        cargo_actual: 'Directora de Instalaciones',
        anos_experiencia: 8,
        rol_cluster: 'gestion',
        especialidades: ['Gestión de Instalaciones', 'Organización de Eventos'],
        disponibilidad: 'Alta'
      },
      {
        email: 'carlos.rodriguez@sevilladeporte.es',
        nombre: 'Carlos',
        apellidos: 'Rodríguez Martín',
        provincia: 'Sevilla', 
        localidad: 'Sevilla',
        entidad: 'Ayuntamiento de Sevilla - Deportes',
        cargo_actual: 'Coordinador de Eventos',
        anos_experiencia: 12,
        rol_cluster: 'servicios',
        especialidades: ['Organización de Eventos', 'Marketing y Patrocinio'],
        disponibilidad: 'Media'
      },
      {
        email: 'ana.fernandez@malagatech.com',
        nombre: 'Ana',
        apellidos: 'Fernández Ruiz',
        provincia: 'Málaga',
        localidad: 'Marbella',
        entidad: 'MálagaTech Sports',
        cargo_actual: 'CTO',
        anos_experiencia: 6,
        rol_cluster: 'tech',
        especialidades: ['Digitalización e IA', 'Gestión de Instalaciones'],
        disponibilidad: 'Alta'
      },
      {
        email: 'jose.martinez@cordobadeporte.org',
        nombre: 'José',
        apellidos: 'Martínez Sánchez',
        provincia: 'Córdoba',
        localidad: 'Córdoba',
        entidad: 'Federación Deportiva Córdoba',
        cargo_actual: 'Responsable Legal',
        anos_experiencia: 15,
        rol_cluster: 'gestion',
        especialidades: ['Derecho Deportivo', 'Contratación y Patrimonio'],
        disponibilidad: 'Puntual'
      },
      {
        email: 'laura.jimenez@cadizports.es',
        nombre: 'Laura',
        apellidos: 'Jiménez Torres',
        provincia: 'Cádiz',
        localidad: 'Jerez de la Frontera',
        entidad: 'CádizPorts Marina',
        cargo_actual: 'Directora de RRHH',
        anos_experiencia: 10,
        rol_cluster: 'servicios',
        especialidades: ['Recursos Humanos', 'Accesibilidad e Inclusión'],
        disponibilidad: 'Media'
      }
    ];

    console.log('👥 Creando socios de ejemplo...');
    
    for (const socioData of sociosEjemplo) {
      await db.transaction(async (client) => {
        // Hash password
        const password = 'demo123'; // Password común para demos
        const passwordHash = await hashPassword(password);
        
        // Coordenadas aproximadas de la provincia
        const coordenadas = {
          'Almería': { lat: 36.8381, lng: -2.4597 },
          'Sevilla': { lat: 37.3891, lng: -5.9845 },
          'Málaga': { lat: 36.7213, lng: -4.4214 },
          'Córdoba': { lat: 37.8882, lng: -4.7794 },
          'Cádiz': { lat: 36.5271, lng: -6.2886 }
        };

        const coords = coordenadas[socioData.provincia] || { lat: 37.0, lng: -4.0 };

        // Crear socio
        const socio = await client.query(`
          INSERT INTO socios (
            email, password_hash, nombre, apellidos, provincia, localidad, 
            entidad, cargo_actual, anos_experiencia, latitud, longitud, estado
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `, [
          socioData.email, passwordHash, socioData.nombre, socioData.apellidos,
          socioData.provincia, socioData.localidad, socioData.entidad, 
          socioData.cargo_actual, socioData.anos_experiencia, 
          coords.lat, coords.lng, 'aprobado'
        ]);

        const socioId = socio.rows[0].id;

        // Crear rol cluster
        await client.query(`
          INSERT INTO rol_cluster (socio_id, rol, b2b_ofrece, b2b_busca, b2b_licita)
          VALUES ($1, $2, $3, $4, $5)
        `, [socioId, socioData.rol_cluster, true, true, false]);

        // Crear especialidades
        for (let i = 0; i < socioData.especialidades.length; i++) {
          await client.query(`
            INSERT INTO socio_especialidades (socio_id, especialidad, orden_prioridad)
            VALUES ($1, $2, $3)
          `, [socioId, socioData.especialidades[i], i + 1]);
        }

        // Crear disponibilidad
        await client.query(`
          INSERT INTO disponibilidad (
            socio_id, nivel, ponente, tutor_mentor, asistente, congreso_almeria
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [socioId, socioData.disponibilidad, true, Math.random() > 0.5, true, true]);

        // Crear consentimientos
        await client.query(`
          INSERT INTO consentimientos (
            socio_id, acepta_mapa_interactivo, acepta_visibilidad_datos,
            acepta_mensajeria, acepta_notificaciones_email,
            visible_telefono, visible_email_directo, visible_web_profesional, visible_linkedin
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [socioId, true, true, true, false, false, false, true, true]);

        console.log(`✅ Socio creado: ${socioData.nombre} ${socioData.apellidos} (${socioData.email})`);
      });
    }

    // Crear algunas conversaciones y mensajes de ejemplo
    console.log('💬 Creando mensajes de ejemplo...');
    
    const socios = await db.query('SELECT id, nombre FROM socios WHERE email != $1', ['admin@agesport.org']);
    
    if (socios.rows.length >= 2) {
      // Conversación entre primeros dos socios
      const socio1 = socios.rows[0];
      const socio2 = socios.rows[1];
      
      const conversacion = await db.insert('conversaciones', {
        socio_1_id: Math.min(socio1.id, socio2.id),
        socio_2_id: Math.max(socio1.id, socio2.id)
      });

      await db.insert('mensajes', {
        conversacion_id: conversacion.id,
        emisor_id: socio1.id,
        receptor_id: socio2.id,
        contenido: '¡Hola! Vi tu perfil en el mapa del talento de AGESPORT. Me interesa mucho tu experiencia en gestión de instalaciones.'
      });

      await db.insert('mensajes', {
        conversacion_id: conversacion.id,
        emisor_id: socio2.id,
        receptor_id: socio1.id,
        contenido: 'Hola, encantado de conectar contigo. Estaré disponible para una llamada esta semana si te interesa colaborar.',
        leido: false
      });

      console.log('✅ Conversación de ejemplo creada');
    }

    console.log('\n🎉 ¡Base de datos poblada correctamente!');
    console.log('\n📋 Datos de prueba creados:');
    console.log(`👥 ${sociosEjemplo.length} socios de ejemplo`);
    console.log('🔑 Password para todos: demo123');
    console.log('💬 1 conversación con mensajes');
    console.log('\n🚀 Ahora puedes ejecutar: npm run dev');

  } catch (error) {
    console.error('❌ Error poblando base de datos:', error);
    process.exit(1);
  } finally {
    await db.close();
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
