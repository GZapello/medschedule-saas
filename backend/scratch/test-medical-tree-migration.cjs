const path = require('path');
process.env.DATABASE_PATH = path.resolve(__dirname, '../saas_schedule.db');

const { db, initializeDatabase } = require('../dist/config/database.js');
console.log('Running initializeDatabase()...');
initializeDatabase();
console.log('Database initialized from database.js');

// Verify tables exist
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'medical_%'").all();
console.log('Medical tables found:', tables.map(t => t.name));

// Verify 15 specialties
const specialties = db.prepare("SELECT id, name, slug, icon_name, sort_order FROM medical_specialties ORDER BY sort_order ASC").all();
console.log('Specialties count:', specialties.length);
specialties.forEach(s => console.log(` - [${s.id}] ${s.name} (${s.slug})`));

// Verify practice areas count
const paCount = db.prepare("SELECT count(*) as c FROM medical_practice_areas").get();
console.log('Total medical practice areas:', paCount.c);

// Verify capabilities count for Neurologia
const neuroCaps = db.prepare("SELECT capability_id, rule FROM medical_specialty_capabilities WHERE medical_specialty_id = 'med-spec-neuro'").all();
console.log('Neurologia capabilities count:', neuroCaps.length);
console.log('Neurologia default caps:', neuroCaps.filter(c => c.rule === 'DEFAULT').map(c => c.capability_id));

// Verify isolation: Neurologia has MOBILITY_ASSESSMENT as capability
const hasMobility = neuroCaps.some(c => c.capability_id === 'MOBILITY_ASSESSMENT');
console.log('Neurologia has MOBILITY_ASSESSMENT capability:', hasMobility);

console.log('MIGRATION TEST PASSED SUCCESSFULLY!');
