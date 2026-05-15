// scripts/setup-database.js
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

async function setupDatabase() {
  console.log('🗄️  Configurando base de datos AGESPORT...\n');
  
  // Conectar como superusuario para crear la BD
  const superClient = new Client({
    host: config.database.host,
    port: config.database.port,
    user: 'postgres', // Cambiar si el superusuario es diferente
    password: config.database.password,
    database: 'postgres' // BD por defecto
  });

  try {
    await superClient.connect();
    console.log('✅ Conectado como superusuario');

    // Crear base de datos si no existe
    try {
      await superClient.query(`CREATE DATABASE ${config.database.database}`);
      console.log(`✅ Base de datos '${config.database.database}' creada`);
    } catch (error) {
      if (error.code === '42P04') {
        console.log(`ℹ️  Base de datos '${config.database.database}' ya existe`);
      } else {
        throw error;
      }
    }

    // Crear usuario si no existe
    try {
      await superClient.query(`CREATE USER ${config.database.user} WITH PASSWORD '${config.database.password}'`);
      console.log(`✅ Usuario '${config.database.user}' creado`);
    } catch (error) {
      if (error.code === '42710') {
        console.log(`ℹ️  Usuario '${config.database.user}' ya existe`);
      } else {
        throw error;
      }
    }

    // Otorgar permisos
    await superClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${config.database.database} TO ${config.database.user}`);
    console.log(`✅ Permisos otorgados a '${config.database.user}'`);

    await superClient.end();

    // Conectar a la BD específica para ejecutar el schema
    const client = new Client(config.database);
    await client.connect();
    console.log(`✅ Conectado a '${config.database.database}'`);

    // Leer y ejecutar schema SQL
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋 Ejecutando schema SQL...');
    await client.query(schema);
    console.log('✅ Schema ejecutado correctamente');

    // Crear administrador por defecto
    const bcrypt = require('bcryptjs');
    const defaultAdminPassword = 'Admin2024!'; // Cambiar en producción
    const hashedPassword = await bcrypt.hash(defaultAdminPassword, 12);

    try {
      await client.query(`
        INSERT INTO administradores (email, password_hash, nombre, rol) 
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO NOTHING
      `, ['admin@agesport.org', hashedPassword, 'Administrador Principal', 'superadmin']);
      
      console.log('✅ Administrador por defecto creado');
      console.log('📧 Email: admin@agesport.org');
      console.log('🔑 Password: Admin2024! (CAMBIAR EN PRODUCCIÓN)');
    } catch (error) {
      console.log('ℹ️  Administrador por defecto ya existe o error:', error.message);
    }

    await client.end();

    console.log('\n🎉 ¡Base de datos configurada correctamente!');
    console.log('\nPasos siguientes:');
    console.log('1. Cambiar la contraseña del administrador');
    console.log('2. Configurar variables de entorno (.env)');
    console.log('3. Ejecutar: npm run dev');

  } catch (error) {
    console.error('❌ Error configurando base de datos:', error);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;
