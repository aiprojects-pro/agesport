const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/assets/talent-map-model');
const people = [
  {
    id: 1,
    nombre: 'María',
    apellidos: 'Núñez',
    entidad: 'Deporte Sur',
    provincia: 'Sevilla',
    lat: 37.3,
    lng: -5.9,
    rol_cluster: 'gestor',
    rol_secundario: 'docente',
    especialidades: ['gestion'],
    disponibilidad: 'Alta',
    tutor_mentor: true,
    ponente: true,
    mensajeria: true,
    b2b_ofrece: true,
    sector: 'publico',
    fecha_registro: '2026-10-01',
  },
  {
    id: 2,
    nombre: 'Juan',
    apellidos: 'García',
    provincia: 'Sevilla',
    lat: 37.3,
    lng: -5.9,
    rol_cluster: 'docente',
    especialidades: ['formacion'],
    disponibilidad: null,
    tutor_mentor: false,
    mensajeria: false,
    sector: 'privado',
    fecha_registro: '2026-09-01',
  },
  {
    id: 3,
    nombre: 'Ana',
    provincia: 'Melilla',
    lat: 35.29,
    lng: -2.93,
    rol_cluster: null,
    disponibilidad: 'Puntual',
    b2b_busca: true,
    mensajeria: true,
    fecha_registro: '2026-10-03',
  },
  {
    id: 4,
    nombre: 'Pendiente',
    lat: null,
    lng: null,
    rol_cluster: null,
    disponibilidad: 'ninguna',
  },
];
test('compound filters include second roles, accents and all search words', () => {
  assert.deepEqual(
    people
      .filter((s) =>
        M.matches(s, {
          search: 'maria nunez',
          role: 'docente',
          province: 'Sevilla',
          specialty: 'gestion',
          sector: 'publico',
          contact: 'messages',
          availability: 'Alta',
        })
      )
      .map((s) => s.id),
    [1]
  );
  assert.equal(people.filter((s) => M.matches(s, { search: 'Maria Barcelona' })).length, 0);
  assert.equal(
    M.matches(
      { ...people[0], searchLabels: 'Gestión de instalaciones' },
      { search: 'gestion instalaciones' }
    ),
    true
  );
});
test('intent counts are factual; undeclared availability is not availability', () => {
  const ids = (intent) => people.filter((s) => M.matches(s, { intent })).map((s) => s.id);
  assert.deepEqual(ids('all'), [1, 2, 3, 4]);
  assert.deepEqual(ids('available'), [1, 3]);
  assert.deepEqual(ids('mentor'), [1]);
  assert.deepEqual(ids('speaker'), [1]);
  assert.deepEqual(ids('collaboration'), [1, 3]);
  assert.deepEqual(
    people.filter((s) => M.matches(s, { availability: 'sin_dato' })).map((s) => s.id),
    [2]
  );
});
test('overlapping and coincident coordinates never drop a person; unlocated profiles stay searchable', () => {
  const groups = M.clusters(people, (s) => ({ x: s.lng * 100, y: s.lat * 100 }));
  assert.equal(groups.length, 2);
  assert.equal(groups[0].members.length, 2);
  assert.deepEqual(groups.flatMap((g) => g.members.map((s) => s.id)).sort(), [1, 2, 3]);
  assert.equal(M.matches(people[3], { search: 'pendiente' }), true);
  assert.equal(M.located({ lat: 91, lng: 0 }), false);
  assert.equal(M.located({ lat: null, lng: null }), false);
  const crowded = Array.from({ length: 300 }, (_, i) => ({
    id: i,
    lat: 37 + i * 0.00001,
    lng: -5,
  }));
  assert.equal(
    M.clusters(crowded, (s) => ({ x: s.lng, y: s.lat })).flatMap((g) => g.members).length,
    300
  );
});
test('sorting makes no changes to the source array and distinguishes recent from available', () => {
  assert.deepEqual(
    M.sort(people, 'availability').map((s) => s.id),
    [1, 3, 4, 2]
  );
  assert.deepEqual(
    M.sort(people, 'recent').map((s) => s.id),
    [3, 1, 2, 4]
  );
  assert.deepEqual(
    people.map((s) => s.id),
    [1, 2, 3, 4]
  );
});
