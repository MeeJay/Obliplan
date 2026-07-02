import dotenv from 'dotenv';
import path from 'path';

// Load env from the server working dir first, then fall back to the repo root.
// process.cwd() is the server/ directory in dev (tsx) and in Docker (WORKDIR /app/server).
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '..', '.env') });
