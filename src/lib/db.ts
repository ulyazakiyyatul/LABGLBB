import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
export const db = url ? drizzle(neon(url), { schema }) : null;
export function requireDb() { if (!db) throw new Error("DATABASE_URL belum dikonfigurasi. Isi .env.local."); return db; }
