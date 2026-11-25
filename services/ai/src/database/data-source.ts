// DataSource para la CLI de TypeORM (generar/ejecutar/revertir migraciones manualmente).
// Uso: npx typeorm migration:run -d dist/database/data-source.js
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.options';

export default new DataSource(buildDataSourceOptions(process.env));
