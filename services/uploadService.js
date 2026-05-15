// services/uploadService.js
// =============================================================================
// Gestión centralizada de subidas de ficheros (multer)
// =============================================================================
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const config = require('../config/config');

// Carpetas destino (creadas si no existen)
const UPLOADS_ROOT = path.resolve(config.uploads.path || './uploads');
const SUBDIRS = ['fotos', 'cvs', 'logos'];

SUBDIRS.forEach((sub) => {
  const dir = path.join(UPLOADS_ROOT, sub);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Generador de nombres únicos
const generateFilename = (originalname) => {
  const ext = path.extname(originalname).toLowerCase().slice(0, 8);
  const stamp = Date.now();
  const rand = crypto.randomBytes(6).toString('hex');
  return `${stamp}-${rand}${ext}`;
};

// Storage genérico parametrizable
const buildStorage = (subdir) => multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(UPLOADS_ROOT, subdir));
  },
  filename: function (req, file, cb) {
    cb(null, generateFilename(file.originalname));
  }
});

// Filtros de tipo
const imageFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Formato de imagen no admitido (JPG, PNG, WEBP, SVG).'));
  }
  cb(null, true);
};

const cvFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (!allowed.includes(file.mimetype)) {
    return cb(new Error('Formato de CV no admitido (PDF, DOC, DOCX).'));
  }
  cb(null, true);
};

// Uploaders preconfigurados
const uploadFoto = multer({
  storage: buildStorage('fotos'),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB para fotos
  fileFilter: imageFilter
}).single('foto');

const uploadCV = multer({
  storage: buildStorage('cvs'),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB para CVs
  fileFilter: cvFilter
}).single('cv');

const uploadLogo = multer({
  storage: buildStorage('logos'),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB para logos
  fileFilter: imageFilter
}).single('logo');

const uploadCSV = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB para CSV
  fileFilter: (req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      return cb(null, true);
    }
    cb(new Error('El fichero debe ser CSV.'));
  }
}).single('archivo');

// URL pública desde la ruta interna
const toPublicUrl = (subdir, filename) => `/uploads/${subdir}/${filename}`;

// Borrado seguro de fichero antiguo cuando se sustituye
const removeFile = (publicUrl) => {
  if (!publicUrl || typeof publicUrl !== 'string' || !publicUrl.startsWith('/uploads/')) return;
  try {
    const filePath = path.join(UPLOADS_ROOT, publicUrl.replace('/uploads/', ''));
    if (fs.existsSync(filePath) && filePath.startsWith(UPLOADS_ROOT)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('No se pudo eliminar fichero antiguo:', publicUrl, err.message);
  }
};

module.exports = {
  UPLOADS_ROOT,
  uploadFoto,
  uploadCV,
  uploadLogo,
  uploadCSV,
  toPublicUrl,
  removeFile
};
