#!/usr/bin/env node

// scripts/create-admin.js
// Script para crear usuarios administradores

const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function createAdmin(email, password, nombre) {
  try {
    console.log('🔧 Creando usuario administrador...');
    
    // Verificar que no existe ya
    const existingAdmin = await db.query(
      'SELECT id FROM administradores WHERE email = $1',
      [email]
    );
    
    if (existingAdmin.rows.length > 0) {
      console.error('❌ Ya existe un administrador con ese email');
      process.exit(1);
    }
    
    // Hash del password
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Crear admin
    await db.query(`
      INSERT INTO administradores (
        email, 
        password_hash, 
        nombre, 
        rol, 
        activo
      ) VALUES ($1, $2, $3, $4, $5)
    `, [
      email, 
      passwordHash, 
      nombre, 
      'super_admin', 
      true
    ]);
    
    console.log('✅ Administrador creado exitosamente');
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Nombre: ${nombre}`);
    console.log(`🔑 Rol: super_admin`);
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error creando administrador:', error.message);
    process.exit(1);
  }
}

// Manejar argumentos de línea de comandos
const args = process.argv.slice(2);

if (args.length < 3) {
  console.log(`
🔧 Crear Administrador - Mapa del Talento AGESPORT

Uso: node scripts/create-admin.js <email> <password> <nombre>

Ejemplo:
  node scripts/create-admin.js admin@agesport.org miPassword123 "Juan Pérez"
  
Notas:
- El password debe tener al menos 8 caracteres
- El email debe ser válido
- El rol será super_admin por defecto
`);
  process.exit(1);
}

const [email, password, nombre] = args;

// Validaciones básicas
if (!email.includes('@')) {
  console.error('❌ Email inválido');
  process.exit(1);
}

if (password.length < 8) {
  console.error('❌ Password debe tener al menos 8 caracteres');
  process.exit(1);
}

if (!nombre.trim()) {
  console.error('❌ Nombre no puede estar vacío');
  process.exit(1);
}

// Crear admin
createAdmin(email, password, nombre.trim());
