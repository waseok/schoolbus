import { env } from "cloudflare:workers";
import { defaultChecklistItems } from "../lib/checklist";

const createStatements = [
  `CREATE TABLE IF NOT EXISTS school_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    school_year INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    include_labor_day INTEGER NOT NULL DEFAULT 1,
    include_election_day INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_number INTEGER NOT NULL UNIQUE,
    plate_number TEXT,
    driver_name TEXT,
    attendant_name TEXT,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    grade INTEGER NOT NULL,
    class_name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id),
    bus_id INTEGER NOT NULL REFERENCES buses(id),
    stop_name TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS calendar_exclusions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL,
    note TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS daily_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bus_id INTEGER NOT NULL REFERENCES buses(id),
    date TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT,
    note TEXT,
    UNIQUE(bus_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS boarding_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    daily_run_id INTEGER NOT NULL REFERENCES daily_runs(id),
    student_id INTEGER NOT NULL REFERENCES students(id),
    boarded INTEGER NOT NULL DEFAULT 0,
    note TEXT,
    UNIQUE(daily_run_id, student_id)
  )`,
  `CREATE TABLE IF NOT EXISTS monthly_inspections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    bus_id INTEGER REFERENCES buses(id),
    group_id INTEGER REFERENCES inspection_groups(id),
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TEXT,
    UNIQUE(month, group_id)
  )`,
  `CREATE TABLE IF NOT EXISTS inspection_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES monthly_inspections(id),
    item_code TEXT NOT NULL,
    answer TEXT NOT NULL,
    note TEXT,
    UNIQUE(inspection_id, item_code)
  )`,
  `CREATE TABLE IF NOT EXISTS monthly_inspection_buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id INTEGER NOT NULL REFERENCES monthly_inspections(id),
    bus_id INTEGER NOT NULL REFERENCES buses(id),
    UNIQUE(inspection_id, bus_id)
  )`,
  `CREATE TABLE IF NOT EXISTS app_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL,
    pin_salt TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES app_users(id),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS login_throttles (
    username TEXT PRIMARY KEY,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    window_started_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    content TEXT NOT NULL,
    responsible_role TEXT NOT NULL DEFAULT 'all',
    sort_order INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS user_bus_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES app_users(id),
    bus_id INTEGER NOT NULL REFERENCES buses(id),
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS inspection_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  )`,
  `CREATE TABLE IF NOT EXISTS inspection_group_buses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL REFERENCES inspection_groups(id),
    bus_id INTEGER NOT NULL REFERENCES buses(id),
    UNIQUE(group_id, bus_id)
  )`,
];

let schemaPromise: Promise<void> | undefined;

export function getDatabase(): D1Database {
  if (!env.DB) throw new Error("데이터베이스 연결을 사용할 수 없습니다.");
  return env.DB;
}

export async function ensureDatabase(db = getDatabase()) {
  schemaPromise ??= (async () => {
    await db.batch(createStatements.map((statement) => db.prepare(statement)));
    const busCount = await db.prepare("SELECT COUNT(*) AS count FROM buses").first<{ count: number }>();
    if (Number(busCount?.count ?? 0) === 0) {
      await db.batch(Array.from({ length: 18 }, (_, index) => db.prepare("INSERT INTO buses (bus_number) VALUES (?)").bind(index + 1)));
    }
    const groupCount = await db.prepare("SELECT COUNT(*) AS count FROM inspection_groups").first<{ count: number }>();
    if (Number(groupCount?.count ?? 0) === 0) {
      await db.batch(Array.from({ length: 9 }, (_, index) => db.prepare("INSERT INTO inspection_groups (name) VALUES (?)").bind(`${index + 1}세트`)));
    }
    const mappingCount = await db.prepare("SELECT COUNT(*) AS count FROM inspection_group_buses").first<{ count: number }>();
    if (Number(mappingCount?.count ?? 0) === 0) {
      await db.batch(Array.from({ length: 9 }, (_, index) => db.prepare(
        "INSERT OR IGNORE INTO inspection_group_buses (group_id, bus_id) SELECT g.id, b.id FROM inspection_groups g, buses b WHERE g.name = ? AND b.bus_number IN (?, ?)",
      ).bind(`${index + 1}세트`, index * 2 + 1, index * 2 + 2)));
    }
    const checklistCount = await db.prepare("SELECT COUNT(*) AS count FROM checklist_items").first<{ count: number }>();
    if (Number(checklistCount?.count ?? 0) === 0) {
      await db.batch(defaultChecklistItems.map((item) => db.prepare("INSERT INTO checklist_items (code, category, content, responsible_role, sort_order) VALUES (?, ?, ?, 'all', ?)").bind(item.code, item.category, item.content, item.sortOrder)));
    }
    await db.prepare(
      "INSERT OR IGNORE INTO school_settings (id, school_year, start_date, end_date) VALUES (1, ?, ?, ?)",
    ).bind(new Date().getFullYear(), `${new Date().getFullYear()}-03-02`, `${new Date().getFullYear() + 1}-02-28`).run();
  })();
  await schemaPromise;
  return db;
}

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
