import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const buses = sqliteTable("buses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  busNumber: integer("bus_number").notNull(),
  plateNumber: text("plate_number"),
  driverName: text("driver_name"),
  attendantName: text("attendant_name"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("buses_number_idx").on(table.busNumber)]);

export const students = sqliteTable("students", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  grade: integer("grade").notNull(),
  className: text("class_name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const assignments = sqliteTable("assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  studentId: integer("student_id").notNull().references(() => students.id),
  busId: integer("bus_id").notNull().references(() => buses.id),
  stopName: text("stop_name"),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
});

export const calendarExclusions = sqliteTable("calendar_exclusions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),
  kind: text("kind", { enum: ["public_holiday", "discretionary_holiday", "emergency", "other"] }).notNull(),
  note: text("note"),
}, (table) => [uniqueIndex("calendar_date_idx").on(table.date)]);

export const dailyRuns = sqliteTable("daily_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  busId: integer("bus_id").notNull().references(() => buses.id),
  date: text("date").notNull(),
  status: text("status", { enum: ["operated", "not_operated"] }).notNull(),
  reason: text("reason"),
  note: text("note"),
}, (table) => [uniqueIndex("daily_runs_unique_idx").on(table.busId, table.date)]);

export const appUsers = sqliteTable("app_users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull(),
  displayName: text("display_name"),
  role: text("role", { enum: ["admin", "driver", "attendant"] }).notNull(),
  pinSalt: text("pin_salt").notNull(),
  pinHash: text("pin_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("app_users_username_idx").on(table.username)]);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const loginThrottles = sqliteTable("login_throttles", {
  username: text("username").primaryKey(),
  attemptCount: integer("attempt_count").notNull().default(0),
  windowStartedAt: text("window_started_at").notNull(),
});

export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull(),
  category: text("category").notNull(),
  content: text("content").notNull(),
  responsibleRole: text("responsible_role", { enum: ["all", "driver", "attendant"] }).notNull().default("all"),
  sortOrder: integer("sort_order").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("checklist_items_code_idx").on(table.code)]);

export const userBusAssignments = sqliteTable("user_bus_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => appUsers.id),
  busId: integer("bus_id").notNull().references(() => buses.id),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
});

export const inspectionGroups = sqliteTable("inspection_groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const inspectionGroupBuses = sqliteTable("inspection_group_buses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  groupId: integer("group_id").notNull().references(() => inspectionGroups.id),
  busId: integer("bus_id").notNull().references(() => buses.id),
}, (table) => [uniqueIndex("inspection_group_bus_idx").on(table.groupId, table.busId)]);

export const boardingRecords = sqliteTable("boarding_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dailyRunId: integer("daily_run_id").notNull().references(() => dailyRuns.id),
  studentId: integer("student_id").notNull().references(() => students.id),
  boarded: integer("boarded", { mode: "boolean" }).notNull().default(false),
  note: text("note"),
}, (table) => [uniqueIndex("boarding_unique_idx").on(table.dailyRunId, table.studentId)]);

export const monthlyInspections = sqliteTable("monthly_inspections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: text("month").notNull(),
  busId: integer("bus_id").references(() => buses.id),
  groupId: integer("group_id").references(() => inspectionGroups.id),
  status: text("status", { enum: ["draft", "complete", "submitted"] }).notNull().default("draft"),
  submittedAt: text("submitted_at"),
}, (table) => [uniqueIndex("monthly_group_inspection_idx").on(table.month, table.groupId)]);

export const monthlyInspectionBuses = sqliteTable("monthly_inspection_buses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull().references(() => monthlyInspections.id),
  busId: integer("bus_id").notNull().references(() => buses.id),
}, (table) => [uniqueIndex("monthly_inspection_bus_idx").on(table.inspectionId, table.busId)]);

export const inspectionResponses = sqliteTable("inspection_responses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inspectionId: integer("inspection_id").notNull().references(() => monthlyInspections.id),
  itemCode: text("item_code").notNull(),
  answer: text("answer", { enum: ["yes", "no", "not_applicable"] }).notNull(),
  note: text("note"),
}, (table) => [uniqueIndex("inspection_response_idx").on(table.inspectionId, table.itemCode)]);
