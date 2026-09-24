import path from 'path';

export const dbPath = process.env.DATABASE_PATH || path.resolve(__dirname, '../../saas_schedule.db');
