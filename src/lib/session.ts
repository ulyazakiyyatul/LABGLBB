import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "labglbb_session";
function secretKey() { const secret = process.env.SESSION_SECRET; if (!secret || secret.length < 32) throw new Error("SESSION_SECRET harus diisi dan minimal 32 karakter."); return new TextEncoder().encode(secret); }
export type SessionUser = { id: string; nama: string; email: string };
export async function createSession(user: SessionUser) { const token = await new SignJWT(user).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("7d").sign(secretKey()); const jar = await cookies(); jar.set(COOKIE_NAME, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 }); }
export async function getSession(): Promise<SessionUser | null> { try { const jar = await cookies(); const token = jar.get(COOKIE_NAME)?.value; if (!token) return null; const { payload } = await jwtVerify(token, secretKey()); if (typeof payload.id !== "string" || typeof payload.email !== "string" || typeof payload.nama !== "string") return null; return { id: payload.id, email: payload.email, nama: payload.nama }; } catch { return null; } }
export async function destroySession() { const jar = await cookies(); jar.delete(COOKIE_NAME); }
