import knex from 'knex';
import pg from 'pg';
import knexConfig from '../../knexfile';

// Return Postgres `date` columns (OID 1082) as raw 'YYYY-MM-DD' strings instead of
// local-midnight Date objects. node-postgres parses a bare date as LOCAL midnight, so
// passing it through toISOString() (UTC) shifts it a day on positive-offset servers
// (e.g. Europe/Paris). All our rowToX mappers already handle the string form via the
// `isoDate` helper, so this keeps date-only values timezone-stable everywhere.
pg.types.setTypeParser(1082, (v) => v);

export const db = knex(knexConfig);
