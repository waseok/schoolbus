import { assertDatabase, ensureDatabase } from "../db/runtime";

export type AppRole = "admin" | "driver" | "attendant";
export type AuthUser = { id: number; username: string; display_name: string | null; role: AppRole; demo?: boolean };

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
  const { error } = await db.from("sessions").insert({
    id,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    created_at: createdAt.toISOString(),
  });
  if (error) assertDatabase(null, error, "로그인 세션을 만들지 못했습니다.");
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

export function demoSessionCookie(request: Request, maxAge = 60 * 60) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `school_bus_demo=1; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearDemoSessionCookie(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `school_bus_demo=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function currentUser(request: Request): Promise<AuthUser | null> {
  if (readCookie(request, "school_bus_demo") === "1") {
    return { id: 0, username: "demo", display_name: "체험 관리자", role: "admin", demo: true };
  }
  const token = readCookie(request, "school_bus_session");
  if (!token) return null;
  const db = await ensureDatabase();
  const id = await tokenHash(token);
  const { data: session, error: sessionError } = await db.from("sessions")
    .select("user:app_users!inner(id, username, display_name, role, active)")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .eq("user.active", 1)
    .maybeSingle();
  if (sessionError) assertDatabase(null, sessionError);
  if (!session) return null;
  const relation = session.user as unknown as AuthUser | AuthUser[] | null;
  return (Array.isArray(relation) ? relation[0] : relation) ?? null;
}

export async function revokeCurrentSession(request: Request) {
  const token = readCookie(request, "school_bus_session");
  if (!token) return;
  const db = await ensureDatabase();
  const { error } = await db.from("sessions").delete().eq("id", await tokenHash(token));
  if (error) assertDatabase(null, error);
}

export async function requireUser(request: Request, roles?: AppRole[]) {
  const user = await currentUser(request);
  if (!user || (roles && !roles.includes(user.role))) return null;
  return user;
}

export async function canAccessBus(user: AuthUser, busId: number, date: string) {
  if (user.role === "admin") return true;
  const db = await ensureDatabase();
  const { data: assignment, error } = await db.from("user_bus_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("bus_id", busId)
    .lte("start_date", date)
    .gte("end_date", date)
    .limit(1)
    .maybeSingle();
  if (error) assertDatabase(null, error);
  return Boolean(assignment);
}
