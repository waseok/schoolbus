import { ensureDatabase } from "../db/runtime";

export type AppRole = "admin" | "driver" | "attendant";
export type AuthUser = { id: number; username: string; display_name: string | null; role: AppRole };

const encoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string) {
  return new Uint8Array(hex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
}

export async function createPinHash(pin: string, saltHex?: string) {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const material = await crypto.subtle.importKey("raw", encoder.encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 }, material, 256);
  return { salt: bytesToHex(salt), hash: bytesToHex(new Uint8Array(bits)) };
}

export async function verifyPin(pin: string, salt: string, expectedHash: string) {
  const actual = await createPinHash(pin, salt);
  if (actual.hash.length !== expectedHash.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.hash.length; index += 1) difference |= actual.hash.charCodeAt(index) ^ expectedHash.charCodeAt(index);
  return difference === 0;
}

export function validUsername(username: string) {
  return /^[a-zA-Z0-9가-힣_-]{3,24}$/.test(username);
}

export function validPin(pin: string) {
  return /^\d{4,12}$/.test(pin);
}

async function tokenHash(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export async function createSession(userId: number) {
  const db = await ensureDatabase();
  const rawToken = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const id = await tokenHash(rawToken);
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 1000 * 60 * 60 * 24 * 14);
  await db.prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, userId, expiresAt.toISOString(), createdAt.toISOString()).run();
  return { token: rawToken, maxAge: 60 * 60 * 24 * 14 };
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  const entry = cookies.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry?.slice(name.length + 1) ?? null;
}

export function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `school_bus_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearSessionCookie(request: Request) {
  return sessionCookie(request, "", 0);
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  const token = readCookie(request, "school_bus_session");
  if (!token) return null;
  const db = await ensureDatabase();
  const id = await tokenHash(token);
  const user = await db.prepare(
    "SELECT u.id, u.username, u.display_name, u.role FROM sessions s JOIN app_users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.active = 1",
  ).bind(id, new Date().toISOString()).first<AuthUser>();
  return user ?? null;
}

export async function revokeCurrentSession(request: Request) {
  const token = readCookie(request, "school_bus_session");
  if (!token) return;
  const db = await ensureDatabase();
  await db.prepare("DELETE FROM sessions WHERE id = ?").bind(await tokenHash(token)).run();
}

export async function requireUser(request: Request, roles?: AppRole[]) {
  const user = await currentUser(request);
  if (!user || (roles && !roles.includes(user.role))) return null;
  return user;
}

export async function canAccessBus(user: AuthUser, busId: number, date: string) {
  if (user.role === "admin") return true;
  const db = await ensureDatabase();
  const assignment = await db.prepare("SELECT id FROM user_bus_assignments WHERE user_id = ? AND bus_id = ? AND start_date <= ? AND end_date >= ? LIMIT 1")
    .bind(user.id, busId, date, date).first();
  return Boolean(assignment);
}
