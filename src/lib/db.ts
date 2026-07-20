/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Database file path — stored in project root /data directory
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'alisio.db');

// EUR conversion rate
export const CZK_TO_EUR = 23.5;

let db: any = null;

// Force re-initialization (for migrations after hot-reload)
export function _resetDb() {
  if (db) {
    try { db.close(); } catch { /* ignore */ }
  }
  db = null;
}

export function getDb(): any {
  if (db) return db;

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Dynamic require to avoid webpack bundling issues
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  db = new Database(DB_PATH);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema if needed
  initSchema(db);

  // Run migrations for existing databases
  runMigrations(db);

  // PR #8: run recurring templates if 24h has elapsed since last tick
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runRecurringTickIfDue } = require('@/modules/finance/data/recurring-engine');
    runRecurringTickIfDue(db);
  } catch (e: any) {
    console.log('[Recurring] tick-if-due error:', e.message);
  }

  // PR #11: poll bank inboxes if 15min elapsed (async, fire-and-forget)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runBankInboxTickIfDue } = require('@/modules/finance/data/bank-inbox-engine');
    runBankInboxTickIfDue(db);
  } catch (e: any) {
    console.log('[BankInbox] tick-if-due error:', e.message);
  }

  // PR #25: Teya transaction sync if 4h elapsed (async, fire-and-forget,
  // skipped silently when TEYA_CLIENT_ID env missing)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runTeyaSyncTickIfDue } = require('@/modules/finance/data/teya-reconcile-engine');
    runTeyaSyncTickIfDue(db);
  } catch (e: any) {
    console.log('[Teya] tick-if-due error:', e.message);
  }

  // PR #27: receipt inboxes — IMAP poll for forwarded invoices (15 min)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { runReceiptInboxTickIfDue } = require('@/modules/finance/data/receipt-inbox-engine');
    runReceiptInboxTickIfDue(db);
  } catch (e: any) {
    console.log('[ReceiptInbox] tick-if-due error:', e.message);
  }

  return db;
}

function initSchema(database: any) {
  // Check if tables exist
  const tableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='organizations'"
  ).get();

  if (tableExists) return; // Already initialized

  // ─── Create all tables ──────────────────────────────────
  database.exec(`
    -- Organizations
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      timezone TEXT NOT NULL DEFAULT 'Europe/Prague',
      default_currency TEXT NOT NULL DEFAULT 'CZK',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Properties
    CREATE TABLE properties (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      address TEXT,
      city TEXT,
      country TEXT DEFAULT 'CZ',
      phone TEXT,
      email TEXT,
      check_in_time TEXT NOT NULL DEFAULT '15:00',
      check_out_time TEXT NOT NULL DEFAULT '10:00',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, slug)
    );

    -- Categories
    CREATE TABLE categories (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('glamping', 'resort', 'camping', 'facility', 'area', 'zone')),
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      icon TEXT,
      color TEXT,
      show_in_tasks INTEGER NOT NULL DEFAULT 1,
      show_in_finance INTEGER NOT NULL DEFAULT 0,
      show_in_booking INTEGER NOT NULL DEFAULT 1,
      show_in_investor INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Buildings / SubGroups
    CREATE TABLE buildings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Unit Types
    CREATE TABLE unit_types (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      description TEXT,
      max_adults INTEGER NOT NULL DEFAULT 2,
      max_children INTEGER NOT NULL DEFAULT 2,
      max_occupancy INTEGER NOT NULL DEFAULT 4,
      base_occupancy INTEGER NOT NULL DEFAULT 2,
      beds_single INTEGER NOT NULL DEFAULT 0,
      beds_double INTEGER NOT NULL DEFAULT 1,
      beds_sofa INTEGER NOT NULL DEFAULT 0,
      extra_bed_available INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      photos TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Units
    CREATE TABLE units (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      floor INTEGER,
      zone TEXT,
      beds INTEGER NOT NULL DEFAULT 2,
      room_status TEXT NOT NULL DEFAULT 'available' CHECK (room_status IN ('available', 'occupied', 'maintenance', 'blocked')),
      cleaning_status TEXT NOT NULL DEFAULT 'clean' CHECK (cleaning_status IN ('clean', 'dirty', 'in_progress')),
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      -- Virtual "staging pool" unit used by the room-allocation modal to
      -- park bookings without a real room. Hidden from regular listings.
      is_pool INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(property_id, code)
    );

    -- Rate Plans
    CREATE TABLE rate_plans (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      pricing_model TEXT NOT NULL DEFAULT 'standard',
      fixed_price REAL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      is_active INTEGER NOT NULL DEFAULT 1,
      cancellation_policy TEXT,
      meal_plan TEXT,
      priority INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      included_services_json TEXT NOT NULL DEFAULT '[]',
      is_hidden INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(property_id, code)
    );

    -- Guests
    CREATE TABLE guests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      country TEXT,
      city TEXT,
      address TEXT,
      document_type TEXT,
      document_number TEXT,
      date_of_birth TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Reservations
    CREATE TABLE reservations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      unit_id TEXT NOT NULL REFERENCES units(id),
      guest_id TEXT NOT NULL REFERENCES guests(id),
      rate_plan_id TEXT REFERENCES rate_plans(id),
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      adults INTEGER NOT NULL DEFAULT 1,
      children INTEGER NOT NULL DEFAULT 0,
      infants INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'payment_requested', 'prepaid', 'paid')),
      source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'phone', 'whatsapp', 'booking_com', 'airbnb', 'other_ota')),
      total_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      notes TEXT,
      internal_notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Payments
    CREATE TABLE payments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'invoice', 'online', 'booking_platform')),
      type TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'partial', 'refund', 'service')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
      paid_at TEXT,
      notes TEXT,
      auto_created INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Fees & Taxes
    CREATE TABLE fees_taxes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('per_night', 'per_stay', 'per_person', 'per_person_per_night', 'percentage')),
      amount REAL NOT NULL DEFAULT 0,
      is_included_in_price INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- App Users
    CREATE TABLE app_users (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT,
      password_hash TEXT,
      avatar_url TEXT,
      role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('owner', 'director', 'manager', 'receptionist', 'housekeeper', 'maintenance', 'accountant')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Sessions
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Per-user permission overrides
    CREATE TABLE user_permissions (
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission)
    );

    -- Audit Log
    CREATE TABLE audit_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES app_users(id),
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      old_values TEXT,
      new_values TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes
    CREATE INDEX idx_units_property ON units(property_id);
    CREATE INDEX idx_units_category ON units(category_id);
    CREATE INDEX idx_units_unit_type ON units(unit_type_id);
    CREATE INDEX idx_reservations_property ON reservations(property_id);
    CREATE INDEX idx_reservations_unit ON reservations(unit_id);
    CREATE INDEX idx_reservations_guest ON reservations(guest_id);
    CREATE INDEX idx_reservations_dates ON reservations(check_in, check_out);
    CREATE INDEX idx_reservations_status ON reservations(status);
    CREATE INDEX idx_guests_org ON guests(organization_id);
    CREATE INDEX idx_guests_name ON guests(last_name, first_name);
  `);

  // ─── Seed initial data ────────────────────────────────  // Seed data
  seedData(database);
}

// Migrate existing databases — add new columns safely
function runMigrations(database: any) {
  // --- Finance PR #6: check if we have migrated to unified fin_operations ---
  // Used below to guard legacy table re-creation after DROP in migration block.
  const finOpsMigrated = !!database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='fin_operations'"
  ).get();

  // --- Check if app_users needs role migration ---
  try {
    // Test INSERT to check if new CHECK constraint is in place
    // (SQLite CHECK only fires on INSERT/UPDATE, not SELECT)
    database.prepare("INSERT INTO app_users (id, organization_id, email, full_name, role) VALUES ('__role_test__', 'org_alisio_001', '__test__', '__test__', 'owner')").run();
    database.prepare("DELETE FROM app_users WHERE id = '__role_test__'").run();
  } catch {
    // CHECK constraint is old — need to recreate app_users table
    console.log('[DB] Migrating app_users table to new role system');
    try {
      const existingUsers = database.prepare('SELECT * FROM app_users').all();
      database.exec('DROP TABLE IF EXISTS audit_log'); // depends on app_users
      database.exec('DROP TABLE IF EXISTS app_users');
      database.exec(`
        CREATE TABLE app_users (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          email TEXT NOT NULL,
          full_name TEXT NOT NULL,
          phone TEXT,
          password_hash TEXT,
          avatar_url TEXT,
          role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('owner', 'director', 'manager', 'receptionist', 'housekeeper', 'maintenance', 'accountant')),
          is_active INTEGER NOT NULL DEFAULT 1,
          last_login TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      database.exec(`
        CREATE TABLE audit_log (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES app_users(id),
          action TEXT NOT NULL,
          entity_type TEXT NOT NULL,
          entity_id TEXT,
          old_values TEXT,
          new_values TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Re-insert with role mapping
      const ins = database.prepare('INSERT INTO app_users (id, organization_id, email, full_name, role, is_active, last_login, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)');
      for (const u of existingUsers as any[]) {
        let newRole = u.role;
        if (newRole === 'admin') newRole = 'owner';
        if (newRole === 'operator') newRole = 'receptionist';
        ins.run(u.id, u.organization_id, u.email, u.full_name, newRole, u.is_active, u.last_login, u.created_at, u.updated_at);
      }
      console.log('[DB] app_users table migrated successfully');
    } catch (e: any) {
      console.error('[DB] app_users migration error:', e.message);
    }
  }

  // --- Migration: add new columns if missing ---
  try {
    const userCols = database.prepare("PRAGMA table_info(app_users)").all() as { name: string }[];
    const hasPasswordHash = userCols.some((c: any) => c.name === 'password_hash');
    if (!hasPasswordHash) {
      database.exec("ALTER TABLE app_users ADD COLUMN password_hash TEXT");
      database.exec("ALTER TABLE app_users ADD COLUMN phone TEXT");
      database.exec("ALTER TABLE app_users ADD COLUMN avatar_url TEXT");
      console.log('[DB] Added password_hash, phone, avatar_url to app_users');
    }
  } catch (e: any) {
    console.log('[DB] columns migration note:', e.message);
  }

  // --- Migration: set secure random password for users without one ---
  try {
    const usersWithoutPw: any[] = database.prepare(
      "SELECT id FROM app_users WHERE password_hash IS NULL OR password_hash = ''"
    ).all();
    if (usersWithoutPw.length > 0) {
      const randomPw = crypto.randomBytes(16).toString('hex');
      const hash = bcrypt.hashSync(randomPw, 10);
      const stmt = database.prepare('UPDATE app_users SET password_hash = ? WHERE id = ?');
      for (const u of usersWithoutPw) {
        stmt.run(hash, u.id);
      }
      console.warn(`[DB] ⚠️ Set random password for ${usersWithoutPw.length} user(s). Reset passwords manually via admin panel.`);
    }
  } catch (e: any) {
    console.log('[DB] password hash note:', e.message);
  }

  // --- Migration: add default_cash_account_id to app_users ---
  // Each admin can have their own cash account so that when they record
  // a cash payment from a booking, it goes to their register, not the
  // first one in sort order (which happens to be Олег's).
  try {
    const userCols2 = database.prepare("PRAGMA table_info(app_users)").all() as { name: string }[];
    if (!userCols2.some((c: any) => c.name === 'default_cash_account_id')) {
      database.exec("ALTER TABLE app_users ADD COLUMN default_cash_account_id TEXT REFERENCES finance_accounts(id)");
      console.log('[DB] Added default_cash_account_id to app_users');
    }

    // Backfill: runs every startup for users with NULL default_cash_account_id.
    // Safe to re-run — only updates rows where the column is still NULL.
    const NAME_TO_ACCOUNT: Record<string, string> = {
      'Андрій': 'Андріїв cash',
      'Андрей': 'Андріїв cash',
      'Andrii': 'Андріїв cash',
      'Andrey': 'Андріїв cash',
      'Олег':  'Олег наличные',
      'Oleg':  'Олег наличные',
      'Наталія': 'Каса Кемпінг і проживання',
      'Наташа': 'Каса Кемпінг і проживання',
      'Natasha': 'Каса Кемпінг і проживання',
      'Nataly': 'Каса Кемпінг і проживання',
      'Антон': 'Антон Готівка',
      'Anton': 'Антон Готівка',
    };
    const usersToBackfill = database.prepare(
      'SELECT id, full_name, organization_id FROM app_users WHERE default_cash_account_id IS NULL'
    ).all() as any[];
    for (const u of usersToBackfill) {
      for (const [namePart, acctName] of Object.entries(NAME_TO_ACCOUNT)) {
        if (u.full_name && u.full_name.includes(namePart)) {
          const acct = database.prepare(
            "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND is_active = 1 LIMIT 1"
          ).get(u.organization_id, acctName) as any;
          if (acct) {
            database.prepare('UPDATE app_users SET default_cash_account_id = ? WHERE id = ?').run(acct.id, u.id);
            console.log(`[DB] Mapped ${u.full_name} → ${acctName} (${acct.id})`);
          }
          break;
        }
      }
    }
  } catch (e: any) {
    console.log('[DB] default_cash_account_id migration:', e.message);
  }

  // --- Migration: add telegram_chat_id to app_users ---
  try {
    const userColsTg = database.prepare("PRAGMA table_info(app_users)").all() as { name: string }[];
    if (!userColsTg.some((c: any) => c.name === 'telegram_chat_id')) {
      database.exec("ALTER TABLE app_users ADD COLUMN telegram_chat_id TEXT");
      console.log('[DB] Added telegram_chat_id to app_users');
    }
  } catch (e: any) {
    console.log('[DB] telegram_chat_id migration:', e.message);
  }

  // --- Migration: create sessions table if not exists ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Finance security: opt-in step-up passphrase ---------------------------
  // Second password protecting the finance module. Stored as a bcrypt hash plus
  // a KDF salt reserved for at-rest encryption (future phase). Per-session unlock
  // state lives in sessions.finance_unlocked_until.
  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_security (
      user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      passphrase_hash TEXT NOT NULL,
      kdf_salt TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  try {
    const sessCols = database.prepare("PRAGMA table_info(sessions)").all() as { name: string }[];
    if (!sessCols.some((c: any) => c.name === 'finance_unlocked_until')) {
      database.exec("ALTER TABLE sessions ADD COLUMN finance_unlocked_until TEXT");
      console.log('[DB] Added finance_unlocked_until to sessions');
    }
  } catch (e: any) {
    console.log('[DB] finance_unlocked_until migration note:', e.message);
  }

  // --- Migration: create user_permissions table if not exists ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, permission)
    )
  `);

  // --- Migration: create booking_sources table if not exists ---
  const bsExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='booking_sources'"
  ).get();
  if (!bsExists) {
    console.log('[DB] Creating booking_sources table');
    database.exec(`
      CREATE TABLE booking_sources (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        code TEXT NOT NULL,
        icon_letter TEXT NOT NULL DEFAULT '?',
        color TEXT NOT NULL DEFAULT '#6c7086',
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default sources
    const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
    if (propRow) {
      const ins = database.prepare('INSERT INTO booking_sources (id, property_id, name, code, icon_letter, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)');
      ins.run('bs_direct', propRow.id, 'Direct', 'direct', 'D', '#22c55e', 1);
      ins.run('bs_phone', propRow.id, 'Phone', 'phone', '📞', '#3b82f6', 2);
      ins.run('bs_whatsapp', propRow.id, 'WhatsApp', 'whatsapp', 'W', '#25D366', 3);
      ins.run('bs_booking_com', propRow.id, 'Booking.com', 'booking_com', 'B', '#003580', 4);
      ins.run('bs_airbnb', propRow.id, 'Airbnb', 'airbnb', 'A', '#FF5A5F', 5);
      ins.run('bs_other_ota', propRow.id, 'Other OTA', 'other_ota', 'O', '#f59e0b', 6);
      console.log('[DB] Seeded 6 default booking sources');
    }
  }

  // --- Migration: remove CHECK constraint from reservations.source ---
  // Check if reservations table still has the old CHECK constraint
  try {
    const createSql = database.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='reservations'"
    ).get() as any;
    if (createSql?.sql && createSql.sql.includes("CHECK (source IN")) {
      console.log('[DB] Removing CHECK constraint from reservations.source');
      const rows = database.prepare('SELECT * FROM reservations').all();
      database.exec('DROP TABLE reservations');
      database.exec(`
        CREATE TABLE reservations (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          unit_id TEXT NOT NULL REFERENCES units(id),
          guest_id TEXT NOT NULL REFERENCES guests(id),
          rate_plan_id TEXT REFERENCES rate_plans(id),
          check_in TEXT NOT NULL,
          check_out TEXT NOT NULL,
          nights INTEGER NOT NULL DEFAULT 1,
          adults INTEGER NOT NULL DEFAULT 1,
          children INTEGER NOT NULL DEFAULT 0,
          infants INTEGER NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft', 'tentative', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show')),
          payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'payment_requested', 'prepaid', 'paid')),
          source TEXT NOT NULL DEFAULT 'direct',
          total_price REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'CZK',
          notes TEXT,
          internal_notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Restore data
      const insR = database.prepare('INSERT INTO reservations (id, property_id, unit_id, guest_id, rate_plan_id, check_in, check_out, nights, adults, children, infants, status, payment_status, source, total_price, currency, notes, internal_notes, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
      for (const r of rows as any[]) {
        insR.run(r.id, r.property_id, r.unit_id, r.guest_id, r.rate_plan_id, r.check_in, r.check_out, r.nights, r.adults, r.children, r.infants, r.status, r.payment_status, r.source, r.total_price, r.currency, r.notes, r.internal_notes, r.created_at, r.updated_at);
      }
      // Recreate indexes
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_property ON reservations(property_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_unit ON reservations(unit_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_guest ON reservations(guest_id)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_dates ON reservations(check_in, check_out)');
      database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)');
      console.log('[DB] reservations table migrated (source CHECK removed)');
    }
  } catch (e: any) {
    console.error('[DB] reservations migration error:', e.message);
  }

  // --- Migration: create reservation_groups table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_groups (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      guest_id TEXT NOT NULL REFERENCES guests(id),
      group_type TEXT NOT NULL DEFAULT 'custom' CHECK (group_type IN ('building', 'custom')),
      building_id TEXT REFERENCES buildings(id),
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      nights INTEGER NOT NULL DEFAULT 1,
      total_price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      source TEXT NOT NULL DEFAULT 'direct',
      status TEXT NOT NULL DEFAULT 'confirmed',
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add group_id column to reservations ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols.some((c: any) => c.name === 'group_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN group_id TEXT REFERENCES reservation_groups(id) ON DELETE SET NULL");
      console.log('[DB] Added group_id column to reservations');
    }
  } catch (e: any) {
    console.log('[DB] group_id migration note:', e.message);
  }

  // --- Migration: add commission_percent to booking_sources ---
  try {
    const bsCols = database.prepare("PRAGMA table_info(booking_sources)").all() as { name: string }[];
    if (!bsCols.some((c: any) => c.name === 'commission_percent')) {
      database.exec("ALTER TABLE booking_sources ADD COLUMN commission_percent REAL NOT NULL DEFAULT 0");
      // Set default commissions for known OTAs
      database.exec("UPDATE booking_sources SET commission_percent = 15 WHERE code = 'booking_com'");
      database.exec("UPDATE booking_sources SET commission_percent = 15 WHERE code = 'airbnb'");
      database.exec("UPDATE booking_sources SET commission_percent = 10 WHERE code = 'other_ota'");
      console.log('[DB] Added commission_percent to booking_sources');
    }
  } catch (e: any) {
    console.log('[DB] commission_percent migration note:', e.message);
  }

  // --- Migration: add commission_amount to reservations ---
  try {
    const resCols2 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols2.some((c: any) => c.name === 'commission_amount')) {
      database.exec("ALTER TABLE reservations ADD COLUMN commission_amount REAL NOT NULL DEFAULT 0");
      console.log('[DB] Added commission_amount to reservations');
    }
  } catch (e: any) {
    console.log('[DB] commission_amount migration note:', e.message);
  }

  // --- Migration: add guest_page_token to reservations ---
  try {
    const resCols3 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols3.some((c: any) => c.name === 'guest_page_token')) {
      database.exec("ALTER TABLE reservations ADD COLUMN guest_page_token TEXT");
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_guest_token ON reservations(guest_page_token)");
      // Generate tokens for existing confirmed/checked_in bookings
      const existing = database.prepare("SELECT id FROM reservations WHERE status IN ('confirmed', 'checked_in') AND (guest_page_token IS NULL OR guest_page_token = '')").all() as any[];
      if (existing.length > 0) {
        const upd = database.prepare("UPDATE reservations SET guest_page_token = ? WHERE id = ?");
        for (const r of existing) {
          const token = generateGuestToken();
          upd.run(token, r.id);
        }
        console.log(`[DB] Generated guest_page_token for ${existing.length} existing booking(s)`);
      }
      console.log('[DB] Added guest_page_token to reservations');
    }
  } catch (e: any) {
    console.log('[DB] guest_page_token migration note:', e.message);
  }

  // --- Migration: create reservation_guests table (for check-in registration) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_guests (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      date_of_birth TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add photos column to unit_types ---
  try {
    const utCols = database.prepare("PRAGMA table_info(unit_types)").all() as { name: string }[];
    if (!utCols.some((c: any) => c.name === 'photos')) {
      database.exec("ALTER TABLE unit_types ADD COLUMN photos TEXT");
      console.log('[DB] Added photos column to unit_types');
    }
  } catch (e: any) {
    console.log('[DB] unit_types photos migration note:', e.message);
  }

  // --- Migration: add photos column to site_listings ---
  try {
    const slCols = database.prepare("PRAGMA table_info(site_listings)").all() as { name: string }[];
    if (!slCols.some((c: any) => c.name === 'photos')) {
      database.exec("ALTER TABLE site_listings ADD COLUMN photos TEXT");
      console.log('[DB] Added photos column to site_listings');
    }
  } catch (e: any) {
    console.log('[DB] site_listings photos migration note:', e.message);
  }

  // --- Migration: add document & nationality fields to reservation_guests ---
  const rgCols = database.prepare("PRAGMA table_info(reservation_guests)").all().map((c: any) => c.name);
  if (!rgCols.includes('nationality')) {
    try { database.exec("ALTER TABLE reservation_guests ADD COLUMN nationality TEXT"); } catch { /* already exists */ }
  }
  if (!rgCols.includes('document_type')) {
    try { database.exec("ALTER TABLE reservation_guests ADD COLUMN document_type TEXT"); } catch { /* already exists */ }
  }
  if (!rgCols.includes('document_number')) {
    try { database.exec("ALTER TABLE reservation_guests ADD COLUMN document_number TEXT"); } catch { /* already exists */ }
  }
  // --- Migration: add guest_id column to reservation_guests ---
  if (!rgCols.includes('guest_id')) {
    try { database.exec("ALTER TABLE reservation_guests ADD COLUMN guest_id TEXT REFERENCES guests(id)"); } catch { /* already exists */ }
  }

  // --- Migration: add reg_status and doc_photo_url to guest_registrations ---
  // reg_status tracks per-guest registration progress: not_started / draft / completed
  // doc_photo_url stores the local path to the uploaded document photo
  try {
    const grCols2 = database.prepare("PRAGMA table_info(guest_registrations)").all().map((c: any) => c.name);
    if (!grCols2.includes('reg_status')) {
      database.exec("ALTER TABLE guest_registrations ADD COLUMN reg_status TEXT NOT NULL DEFAULT 'not_started'");
      console.log('[DB] Added reg_status to guest_registrations');
    }
    if (!grCols2.includes('doc_photo_url')) {
      database.exec("ALTER TABLE guest_registrations ADD COLUMN doc_photo_url TEXT");
      console.log('[DB] Added doc_photo_url to guest_registrations');
    }
  } catch (e: any) {
    console.log('[DB] guest_registrations reg_status migration note:', e.message);
  }

  // --- Migration: add payment_id to reservations ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols.some((c: any) => c.name === 'payment_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN payment_id TEXT");
      console.log('[DB] Added payment_id column to reservations');
    }
  } catch (e: any) {
    console.log('[DB] payment_id migration note:', e.message);
  }

  // --- Migration: create additional_services table ---
  const asExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='additional_services'"
  ).get();
  if (!asExists) {
    database.exec(`
      CREATE TABLE additional_services (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        description TEXT,
        price REAL NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'CZK',
        unit_label TEXT NOT NULL DEFAULT 'за послугу',
        icon TEXT,
        category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('food', 'wellness', 'sport', 'entertainment', 'other')),
        available_for TEXT NOT NULL DEFAULT 'all' CHECK (available_for IN ('glamping', 'resort', 'camping', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default services
    const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
    if (propRow) {
      const insAS = database.prepare('INSERT INTO additional_services (id, property_id, name, name_en, description, price, unit_label, icon, category, available_for, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      insAS.run('svc_breakfast', propRow.id, 'Сніданок', 'Breakfast', 'Повноцінний сніданок у ресторані', 250, 'за особу/день', '🍳', 'food', 'all', 1);
      insAS.run('svc_sauna', propRow.id, 'Сауна', 'Sauna', 'Фінська сауна (2 години)', 800, 'за сеанс', '🧖', 'wellness', 'all', 2);
      insAS.run('svc_pool', propRow.id, 'Купіль', 'Plunge Pool', 'Холодна купіль після сауни', 400, 'за сеанс', '🏊', 'wellness', 'all', 3);
      insAS.run('svc_bicycle', propRow.id, 'Велосипед', 'Bicycle', 'Оренда велосипеда на день', 350, 'за день', '🚲', 'sport', 'all', 4);
      insAS.run('svc_ebike', propRow.id, 'Електровелосипед', 'E-Bike', 'Оренда електровелосипеда на день', 600, 'за день', '⚡', 'sport', 'all', 5);
      insAS.run('svc_sup', propRow.id, 'SUP борд', 'SUP Board', 'Оренда SUP борду', 300, 'за годину', '🏄', 'sport', 'all', 6);
      insAS.run('svc_bbq', propRow.id, 'Мангал', 'BBQ Grill', 'Набір для барбекю з вугіллям', 200, 'за раз', '🔥', 'food', 'camping', 7);
      insAS.run('svc_parking', propRow.id, 'Паркінг VIP', 'VIP Parking', 'Закрите паркомісце біля будівлі', 150, 'за день', '🅿️', 'other', 'resort', 8);
      console.log('[DB] Created additional_services table with 8 services');
    }
  }

  // --- Migration: create service_orders table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1,
      total_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create unit_type_photos table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS unit_type_photos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create property_photos table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS property_photos (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      caption TEXT,
      photo_type TEXT NOT NULL DEFAULT 'common' CHECK (photo_type IN ('building', 'territory', 'common', 'aerial')),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create guest_page_config table ---
  const gpcExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='guest_page_config'"
  ).get();
  if (!gpcExists) {
    database.exec(`
      CREATE TABLE guest_page_config (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        unit_type_id TEXT NOT NULL UNIQUE REFERENCES unit_types(id) ON DELETE CASCADE,
        amenities TEXT,
        check_in_instructions TEXT,
        external_amenities TEXT,
        faq_items TEXT,
        rules TEXT,
        wifi_network TEXT DEFAULT 'ALiSiO_Guest',
        wifi_password TEXT DEFAULT 'ALiSiO2026!',
        restaurant_name TEXT DEFAULT 'Ресторан ALiSiO',
        restaurant_hours TEXT,
        restaurant_menu_url TEXT,
        useful_info TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed default configs for all existing unit types
    const utRows = database.prepare('SELECT id, category_id FROM unit_types').all() as any[];
    const catRows = database.prepare('SELECT id, type FROM categories').all() as any[];
    const catTypeMap: Record<string, string> = {};
    for (const c of catRows) catTypeMap[c.id] = c.type;

    const defaultRestaurantHours = '📅 Щодня: 8:00 – 22:00\n🍳 Сніданок: 8:00 – 10:30\n🥘 Обід: 12:00 – 15:00\n🍷 Вечеря: 18:00 – 22:00';

    const glampingAmenities = JSON.stringify([
      { icon: '🛏️', name: 'Комфортне ліжко' }, { icon: '🚿', name: 'Душ' }, { icon: '🚽', name: 'Туалет' },
      { icon: '❄️', name: 'Кондиціонер' }, { icon: '🔥', name: 'Опалення' }, { icon: '☕', name: 'Чайник' },
      { icon: '🧊', name: 'Міні-холодильник' }, { icon: '📶', name: 'Wi-Fi' }, { icon: '🌿', name: 'Тераса' },
      { icon: '🔒', name: 'Замок' }, { icon: '🧴', name: 'Рушники' }, { icon: '💡', name: 'Освітлення' },
    ]);
    const resortAmenities = JSON.stringify([
      { icon: '🛏️', name: 'Комфортне ліжко' }, { icon: '🚿', name: 'Душ/Ванна' }, { icon: '🚽', name: 'Туалет' },
      { icon: '❄️', name: 'Кондиціонер' }, { icon: '📺', name: 'Телевізор' }, { icon: '🔥', name: 'Опалення' },
      { icon: '☕', name: 'Чайник/Кавоварка' }, { icon: '🧊', name: 'Холодильник' }, { icon: '📶', name: 'Wi-Fi' },
      { icon: '🧴', name: 'Рушники та білизна' }, { icon: '🪥', name: 'Косметика' }, { icon: '🔒', name: 'Сейф' },
    ]);
    const campingAmenities = JSON.stringify([
      { icon: '⛺', name: 'Місце для намету' }, { icon: '🔌', name: 'Електрика 220V' },
      { icon: '🚿', name: 'Спільний душ' }, { icon: '🚽', name: 'Спільний туалет' },
      { icon: '🚰', name: 'Вода' }, { icon: '📶', name: 'Wi-Fi' },
      { icon: '🅿️', name: 'Паркомісце' }, { icon: '🔥', name: 'Місце для вогнища' },
    ]);

    const defaultFaq = JSON.stringify([
      { q: 'Як дістатися до комплексу?', a: 'ALiSiO Resort & Glamping знаходиться в Лугачовіце. GPS: 49.1122°N, 17.7531°E. Від Брно ~1.5 год, від Праги ~3.5 год. Безкоштовна парковка.' },
      { q: 'О котрій годині заселення та виселення?', a: 'Заселення з 15:00, виселення до 10:00. Ранній заїзд / пізній виїзд за запитом.' },
      { q: 'Чи можна з тваринами?', a: 'Так, у деяких типах. 200 CZK/ніч. Повідомте заздалегідь.' },
      { q: 'Чи є сніданок?', a: 'Не включено, але можна замовити. Ресторан з 8:00.' },
      { q: 'Де магазин?', a: 'Penny Market / COOP — 5 хв їзди. Базові товари — на рецепції.' },
      { q: 'Чи є дитяче ліжечко?', a: 'Так, безкоштовно за запитом.' },
    ]);
    const defaultRules = JSON.stringify([
      { icon: '🔇', text: 'Насолоджуйся тишею — не вмикай музику та не галасуй.' },
      { icon: '🤝', text: 'Поважай сусідів — зберігай тишу протягом перебування на території.' },
      { icon: '🚗', text: 'Не перевищуй швидкість на локації більш ніж 20 км/год.' },
      { icon: '🍃', text: 'Бережи природу — не залишай їжу та сміття на вулиці.' },
      { icon: '🌲', text: 'Шануй ліс — не ламай дерева і не пали дрова з лісу. Їх завжди можна привезти з собою чи придбати у нас.' },
      { icon: '🗑️', text: 'Не спалюй сміття в багатті. Для нього у будинку є симпатичний сміттєвий бак.' },
      { icon: '🐾', text: 'Слідкуй за своїми тваринами — ти несеш відповідальність за своїх чотирилапих друзів та шкоду, яку вони можуть завдати.' },
      { icon: '🚭', text: 'Не пали, будь ласка, в будинку. Оселі мають пахнути свіжістю та лісом.' },
      { icon: '✨', text: 'Залишай чистоту — щоб наступні гості теж відчули затишок.' },
    ]);
    const defaultUsefulInfo = JSON.stringify([
      { icon: '🏪', title: 'Магазини', desc: 'Penny Market та COOP — 5 хв їзди.' },
      { icon: '🏥', title: 'Аптека та лікарня', desc: 'Аптека в центрі (5 хв). Лікарня — Злін (25 хв).' },
      { icon: '🏔️', title: 'Пішохідні маршрути', desc: 'Маршрути прямо від комплексу. Карти на рецепції.' },
      { icon: '🚴', title: 'Велосипедні маршрути', desc: 'Велодоріжки вздовж річки. Оренда на рецепції.' },
      { icon: '♨️', title: 'Курортна зона', desc: 'Лугачовіце — курорт з мінеральними джерелами.' },
      { icon: '🎭', title: 'Екскурсії', desc: 'Замок Бухлов, зоопарк Лешна. Запитуйте на рецепції.' },
    ]);

    const insGPC = database.prepare(`
      INSERT INTO guest_page_config (unit_type_id, amenities, check_in_instructions, faq_items, rules, wifi_network, wifi_password, restaurant_name, restaurant_hours, useful_info)
      VALUES (?, ?, ?, ?, ?, 'ALiSiO_Guest', 'ALiSiO2026!', 'Ресторан ALiSiO', ?, ?)
    `);
    for (const ut of utRows) {
      const catType = catTypeMap[ut.category_id];
      const amenities = catType === 'glamping' ? glampingAmenities : catType === 'camping' ? campingAmenities : resortAmenities;
      const instructions = catType === 'glamping'
        ? 'Зустріч на рецепції. Ми покажемо ваш будиночок та розкажемо про територію.'
        : catType === 'camping'
          ? 'Зареєструйтесь на рецепції, вам покажуть ваше місце та видадуть картку доступу до санітарного блоку.'
          : 'Зустріч на рецепції будови. Ключі та інструктаж на місці.';
      insGPC.run(ut.id, amenities, instructions, defaultFaq, defaultRules, defaultRestaurantHours, defaultUsefulInfo);
    }
    console.log('[DB] Created guest_page_config table with defaults for', utRows.length, 'unit types');
  }

  // --- Migration: add lock_code, maps_url, territory_map_url to guest_page_config ---
  const gpcCols = database.prepare("PRAGMA table_info(guest_page_config)").all().map((c: any) => c.name);
  if (!gpcCols.includes('lock_code')) {
    try { database.exec("ALTER TABLE guest_page_config ADD COLUMN lock_code TEXT DEFAULT '4971#'"); } catch { /* */ }
  }
  if (!gpcCols.includes('maps_url')) {
    try { database.exec("ALTER TABLE guest_page_config ADD COLUMN maps_url TEXT DEFAULT 'https://maps.app.goo.gl/WH2CKhTydtDx9EBe7'"); } catch { /* */ }
  }
  if (!gpcCols.includes('territory_map_url')) {
    try { database.exec("ALTER TABLE guest_page_config ADD COLUMN territory_map_url TEXT"); } catch { /* */ }
  }

  // --- Migration: add guest_page_expires_at to reservations ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all().map((c: any) => c.name);
    if (!resCols.includes('guest_page_expires_at')) {
      database.exec("ALTER TABLE reservations ADD COLUMN guest_page_expires_at TEXT");
      // Backfill: set expiry to check_out + 2 days for existing reservations
      database.exec("UPDATE reservations SET guest_page_expires_at = datetime(check_out, '+2 days') WHERE guest_page_expires_at IS NULL AND guest_page_token IS NOT NULL");
    }
  } catch { /* */ }

  // --- Migration: create early_bookings table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS early_bookings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      guest_id TEXT REFERENCES guests(id),
      guest_name TEXT NOT NULL,
      guest_email TEXT,
      guest_phone TEXT,
      unit_type_id TEXT REFERENCES unit_types(id),
      discount_percent INTEGER NOT NULL DEFAULT 30,
      min_nights INTEGER NOT NULL DEFAULT 2,
      base_price_at_booking REAL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'used', 'expired', 'cancelled')),
      source_reservation_id TEXT REFERENCES reservations(id),
      notes TEXT,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create rate_limits table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      token TEXT NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Clean old rate limit entries (older than 1 hour)
  try { database.exec("DELETE FROM rate_limits WHERE created_at < datetime('now', '-1 hour')"); } catch { /* */ }

  // --- Migration: create ical_channels table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ical_channels (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK (channel_type IN ('building', 'unit')),
      building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,
      unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
      source_code TEXT NOT NULL DEFAULT 'vrbo',
      ical_url TEXT,
      export_token TEXT UNIQUE,
      sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
      is_active INTEGER NOT NULL DEFAULT 1,
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create ical_sync_log table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ical_sync_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      channel_id TEXT NOT NULL REFERENCES ical_channels(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('success', 'error')),
      events_found INTEGER NOT NULL DEFAULT 0,
      events_created INTEGER NOT NULL DEFAULT 0,
      events_updated INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      synced_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add external_uid to reservations ---
  try {
    const resCols4 = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols4.some((c: any) => c.name === 'external_uid')) {
      database.exec("ALTER TABLE reservations ADD COLUMN external_uid TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_reservations_external_uid ON reservations(external_uid)");
      console.log('[DB] Added external_uid column to reservations');
    }
  } catch (e: any) {
    console.log('[DB] external_uid migration note:', e.message);
  }

  // --- Migration: add VRBO booking source ---
  try {
    const vrboExists = database.prepare("SELECT id FROM booking_sources WHERE code = 'vrbo'").get();
    if (!vrboExists) {
      const propRow = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
      if (propRow) {
        database.prepare(
          'INSERT INTO booking_sources (id, property_id, name, code, icon_letter, color, sort_order, commission_percent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('bs_vrbo', propRow.id, 'VRBO', 'vrbo', 'V', '#1E40AF', 7, 8);
        console.log('[DB] Added VRBO booking source');
      }
    }
  } catch (e: any) {
    console.log('[DB] VRBO source migration note:', e.message);
  }

  // --- Migration: add included_services_json and is_hidden to rate_plans ---
  try {
    const rpCols = database.prepare("PRAGMA table_info(rate_plans)").all().map((c: any) => c.name);
    if (!rpCols.includes('included_services_json')) {
      database.exec("ALTER TABLE rate_plans ADD COLUMN included_services_json TEXT NOT NULL DEFAULT '[]'");
      console.log('[DB] Added included_services_json to rate_plans');
    }
    if (!rpCols.includes('is_hidden')) {
      database.exec("ALTER TABLE rate_plans ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0");
      console.log('[DB] Added is_hidden to rate_plans');
    }
    if (!rpCols.includes('fixed_price')) {
      database.exec("ALTER TABLE rate_plans ADD COLUMN fixed_price REAL");
      console.log('[DB] Added fixed_price to rate_plans');
    }
  } catch (e: any) {
    console.log('[DB] rate_plans migration note:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  // BOOKING SERVICE v2 TABLES
  // ═══════════════════════════════════════════════════════

  // --- Migration: add gender column to guests ---
  try {
    const guestsCols = database.prepare("PRAGMA table_info(guests)").all().map((c: any) => c.name);
    if (!guestsCols.includes('gender')) {
      database.exec("ALTER TABLE guests ADD COLUMN gender TEXT CHECK (gender IN ('female', 'male', 'other'))");
      console.log('[DB] Added gender column to guests');
    }
  } catch (e: any) {
    console.log('[DB] gender migration note:', e.message);
  }

  // --- Migration: add is_pool column to units + seed pool unit for Building F ---
  // The room-allocation modal uses pool units as a "staging" location for
  // bookings without a confirmed room. Pool units are real DB rows so the
  // existing PATCH unit_id flow works unchanged, but they are filtered out
  // of every regular list (calendar, bookings, etc.) so they never show up
  // as bookable rooms.
  try {
    const unitsCols = database.prepare("PRAGMA table_info(units)").all().map((c: any) => c.name);
    if (!unitsCols.includes('is_pool')) {
      database.exec("ALTER TABLE units ADD COLUMN is_pool INTEGER NOT NULL DEFAULT 0");
      console.log('[DB] Added is_pool column to units');
    }
    // Seed pool unit for Building F (idempotent).
    const fBldg = database.prepare("SELECT id, property_id, category_id FROM buildings WHERE code = 'F' LIMIT 1").get() as { id: string; property_id: string; category_id: string } | undefined;
    if (fBldg) {
      const fUtAny = database.prepare("SELECT id FROM unit_types WHERE building_id = ? LIMIT 1").get(fBldg.id) as { id: string } | undefined;
      const existing = database.prepare("SELECT id FROM units WHERE building_id = ? AND is_pool = 1 LIMIT 1").get(fBldg.id) as { id: string } | undefined;
      if (!existing && fUtAny) {
        database.prepare(
          "INSERT INTO units (id, unit_type_id, property_id, category_id, building_id, name, code, beds, sort_order, is_pool, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)"
        ).run('u_f_pool', fUtAny.id, fBldg.property_id, fBldg.category_id, fBldg.id, 'Чорновик F', 'F-POOL', 99, 9999);
        console.log('[DB] Seeded staging pool unit for Building F');
      }
    }
  } catch (e: any) {
    console.log('[DB] is_pool migration note:', e.message);
  }

  // --- Migration: extend additional_services with service_type, duration, photo ---
  try {
    const asCols = database.prepare("PRAGMA table_info(additional_services)").all().map((c: any) => c.name);
    if (!asCols.includes('service_type')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN service_type TEXT DEFAULT 'simple'");
      // simple | slot_booking | menu_selection | per_day
    }
    if (!asCols.includes('duration_minutes')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN duration_minutes INTEGER");
    }
    if (!asCols.includes('photo_url')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN photo_url TEXT");
    }
    if (!asCols.includes('min_quantity')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN min_quantity INTEGER DEFAULT 0");
    }
    if (!asCols.includes('max_quantity')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN max_quantity INTEGER DEFAULT 10");
    }
    if (!asCols.includes('options_schema')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN options_schema TEXT");
    }
    if (!asCols.includes('name_cs')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN name_cs TEXT");
    }
    if (!asCols.includes('name_de')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN name_de TEXT");
    }
    // Update existing services with correct types
    database.exec("UPDATE additional_services SET service_type = 'slot_booking', duration_minutes = 60 WHERE id = 'svc_sauna'");
    database.exec("UPDATE additional_services SET service_type = 'slot_booking', duration_minutes = 60 WHERE id = 'svc_pool'");
    database.exec("UPDATE additional_services SET service_type = 'menu_selection' WHERE id = 'svc_breakfast'");
    // Update sauna price to 600 CZK/hour as specified
    database.exec("UPDATE additional_services SET price = 600, unit_label = 'за годину', name_cs = 'Sauna', name_de = 'Sauna' WHERE id = 'svc_sauna'");
    database.exec("UPDATE additional_services SET name_cs = 'Studená lázeň', name_de = 'Kalttauchbecken' WHERE id = 'svc_pool'");
    database.exec("UPDATE additional_services SET name_cs = 'Snídaně', name_de = 'Frühstück' WHERE id = 'svc_breakfast'");
    console.log('[DB] Extended additional_services with service_type columns');
  } catch (e: any) {
    console.log('[DB] additional_services extension note:', e.message);
  }

  // --- Migration: create service_time_slots table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_time_slots (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      max_capacity INTEGER NOT NULL DEFAULT 1,
      booked_count INTEGER NOT NULL DEFAULT 0,
      is_available INTEGER NOT NULL DEFAULT 1,
      reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
      booking_session_id TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(service_id, date, start_time)
    )
  `);

  // --- Migration: create menu_items table ---
  const miExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='menu_items'"
  ).get();
  if (!miExists) {
    database.exec(`
      CREATE TABLE menu_items (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_en TEXT,
        name_cs TEXT,
        name_de TEXT,
        description TEXT,
        weight_grams INTEGER,
        price REAL NOT NULL DEFAULT 0,
        photo_url TEXT,
        is_available INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed 3 breakfast menu items
    const insMI = database.prepare(
      'INSERT INTO menu_items (id, service_id, name, name_en, name_cs, name_de, description, weight_grams, price, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    insMI.run('mi_breakfast_1', 'svc_breakfast', 'Класичний сніданок', 'Classic Breakfast', 'Klasická snídaně', 'Klassisches Frühstück',
      'Яєчня, тости, масло, джем, свіжі овочі, кава/чай', 400, 250, 1);
    insMI.run('mi_breakfast_2', 'svc_breakfast', 'Млинці з ягодами', 'Pancakes with Berries', 'Lívanečky s ovocem', 'Pfannkuchen mit Beeren',
      'Пухкі млинці з сезонними ягодами, медом та сметаною', 350, 280, 2);
    insMI.run('mi_breakfast_3', 'svc_breakfast', 'Гранола боул', 'Granola Bowl', 'Granola mísa', 'Granola Schüssel',
      'Домашня гранола з йогуртом, фруктами та медом', 300, 220, 3);
    console.log('[DB] Created menu_items table with 3 breakfast items');
  }

  // --- Migration: create booking_service_orders table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS booking_service_orders (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT REFERENCES reservations(id) ON DELETE CASCADE,
      service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      menu_item_id TEXT REFERENCES menu_items(id) ON DELETE SET NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      service_date TEXT,
      time_slot_id TEXT REFERENCES service_time_slots(id) ON DELETE SET NULL,
      options_json TEXT,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: add Teya payment columns to booking_service_orders ---
  try {
    database.exec(`ALTER TABLE booking_service_orders ADD COLUMN payment_id TEXT`);
    database.exec(`ALTER TABLE booking_service_orders ADD COLUMN payment_status TEXT DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'paid', 'failed', 'refunded'))`);
    console.log('[DB] Added payment columns to booking_service_orders');
  } catch {
    // Columns already exist — ignore
  }

  // --- Migration: add coupon_code column to booking_service_orders ---
  try {
    database.exec(`ALTER TABLE booking_service_orders ADD COLUMN coupon_code TEXT`);
    console.log('[DB] Added coupon_code column to booking_service_orders');
  } catch {
    // Column already exists — ignore
  }

  // --- Migration: create coupons table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS coupons (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'fixed_price' CHECK (discount_type IN ('fixed_price', 'percentage', 'fixed_amount')),
      offer_amount REAL NOT NULL,
      applicable_services TEXT,
      valid_from TEXT,
      valid_until TEXT,
      max_uses INTEGER,
      current_uses INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Seed GLAMPING promo code: 310 CZK/hour for sauna (instead of 600)
  try {
    const glamExists = database.prepare("SELECT id FROM coupons WHERE code = 'GLAMPING'").get();
    if (!glamExists) {
      database.prepare(`
        INSERT INTO coupons (id, code, description, discount_type, offer_amount, applicable_services, is_active)
        VALUES ('promo_glamping', 'GLAMPING', 'Glamping guest sauna discount — 310 CZK/hr', 'fixed_price', 310, '["svc_sauna"]', 1)
      `).run();
      console.log('[DB] Seeded GLAMPING promo code (310 CZK/hr for sauna)');
    }
  } catch (e) {
    console.warn('[DB] Promo seed error:', e);
  }

  // --- Migration: create sauna_addons table for broom etc ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS service_addons (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      service_id TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      name_en TEXT,
      name_cs TEXT,
      name_de TEXT,
      price REAL NOT NULL DEFAULT 0,
      icon TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  // Seed sauna addon: broom (віник)
  try {
    const broomExists = database.prepare("SELECT id FROM service_addons WHERE id = 'addon_broom'").get();
    if (!broomExists) {
      database.prepare(
        'INSERT INTO service_addons (id, service_id, name, name_en, name_cs, name_de, price, icon, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run('addon_broom', 'svc_sauna', 'Віник', 'Broom', 'Metla', 'Besen', 300, '🧹', 1);
      console.log('[DB] Seeded sauna addon: broom (300 CZK)');
    }
  } catch { /* already exists */ }

  // --- Migration: add extra_person_charge, pet_allowed, pet_charge to unit_types ---
  try {
    const utCols = (database.prepare("PRAGMA table_info(unit_types)").all() as any[]).map(c => c.name);
    if (!utCols.includes('extra_person_charge')) {
      database.exec("ALTER TABLE unit_types ADD COLUMN extra_person_charge INTEGER NOT NULL DEFAULT 1000");
      console.log('[DB] Added extra_person_charge to unit_types (default 1000 CZK)');
    }
    if (!utCols.includes('pet_allowed')) {
      database.exec("ALTER TABLE unit_types ADD COLUMN pet_allowed INTEGER NOT NULL DEFAULT 1");
      console.log('[DB] Added pet_allowed to unit_types');
    }
    if (!utCols.includes('pet_charge')) {
      database.exec("ALTER TABLE unit_types ADD COLUMN pet_charge INTEGER NOT NULL DEFAULT 400");
      console.log('[DB] Added pet_charge to unit_types (default 400 CZK)');
    }
  } catch (e: any) {
    console.log('[DB] unit_types extension note:', e.message);
  }

  // --- Migration: add parking_photo_url to property_guest_config ---
  try {
    database.exec(`ALTER TABLE property_guest_config ADD COLUMN parking_photo_url TEXT`);
    console.log('[DB] Added parking_photo_url to property_guest_config');
  } catch {
    // Column already exists — ignore
  }

  // --- Migration: add payment columns to service_orders ---
  try {
    database.exec(`ALTER TABLE service_orders ADD COLUMN payment_id TEXT`);
    database.exec(`ALTER TABLE service_orders ADD COLUMN payment_status TEXT DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'paid', 'failed', 'refunded'))`);
    console.log('[DB] Added payment columns to service_orders');
  } catch {
    // Columns already exist — ignore
  }

  // --- Migration: add description_en/cs/de to menu_items ---
  try {
    database.exec(`ALTER TABLE menu_items ADD COLUMN description_en TEXT`);
    database.exec(`ALTER TABLE menu_items ADD COLUMN description_cs TEXT`);
    database.exec(`ALTER TABLE menu_items ADD COLUMN description_de TEXT`);
    console.log('[DB] Added description_en/cs/de to menu_items');
  } catch {
    // Columns already exist — ignore
  }
  // Backfill English/Czech/German descriptions for the 3 seed breakfast items
  try {
    const bfDesc: Record<string, { en: string; cs: string; de: string }> = {
      'mi_breakfast_1': {
        en: 'Scrambled eggs, toast, butter, jam, fresh vegetables, coffee/tea',
        cs: 'Míchaná vejce, toast, máslo, džem, čerstvá zelenina, káva/čaj',
        de: 'Rührei, Toast, Butter, Marmelade, frisches Gemüse, Kaffee/Tee',
      },
      'mi_breakfast_2': {
        en: 'Fluffy pancakes with seasonal berries, honey and sour cream',
        cs: 'Nadýchané lívanečky se sezónním ovocem, medem a zakysanou smetanou',
        de: 'Lockere Pfannkuchen mit Saisonbeeren, Honig und saurer Sahne',
      },
      'mi_breakfast_3': {
        en: 'Homemade granola with yoghurt, fruits and honey',
        cs: 'Domácí granola s jogurtem, ovocem a medem',
        de: 'Hausgemachte Granola mit Joghurt, Früchten und Honig',
      },
    };
    const upd = database.prepare('UPDATE menu_items SET description_en=?, description_cs=?, description_de=? WHERE id=? AND description_en IS NULL');
    for (const [id, d] of Object.entries(bfDesc)) {
      upd.run(d.en, d.cs, d.de, id);
    }
  } catch (e: any) {
    console.warn('[DB] menu_items backfill note:', e.message);
  }

  // --- Migration: seed new services (tub, late checkout, early checkin) ---
  try {
    const propRow2 = database.prepare("SELECT id FROM properties LIMIT 1").get() as any;
    if (propRow2) {
      const tubExists = database.prepare("SELECT id FROM additional_services WHERE id = 'svc_tub'").get();
      if (!tubExists) {
        database.prepare(
          'INSERT INTO additional_services (id, property_id, name, name_en, name_cs, name_de, description, price, unit_label, icon, category, available_for, sort_order, service_type, duration_minutes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('svc_tub', propRow2.id, 'Чан', 'Hot Tub', 'Káď', 'Badefass', 'Дерев\'яний чан під відкритим небом. Мінімальне бронювання — 2 години.', 600, 'за годину', '🛁', 'wellness', 'all', 3, 'slot_booking', 60);
        console.log('[DB] Seeded service: svc_tub (600 CZK/hr)');
      }
      const lateExists = database.prepare("SELECT id FROM additional_services WHERE id = 'svc_late_checkout'").get();
      if (!lateExists) {
        database.prepare(
          'INSERT INTO additional_services (id, property_id, name, name_en, name_cs, name_de, description, price, unit_label, icon, category, available_for, sort_order, service_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('svc_late_checkout', propRow2.id, 'Пізнє виселення', 'Late Checkout', 'Pozdní odhlášení', 'Später Check-out', 'Виселення до 14:00 замість 11:00', 500, 'разово', '🕐', 'other', 'all', 10, 'toggle');
        console.log('[DB] Seeded service: svc_late_checkout (500 CZK)');
      }
      const earlyExists = database.prepare("SELECT id FROM additional_services WHERE id = 'svc_early_checkin'").get();
      if (!earlyExists) {
        database.prepare(
          'INSERT INTO additional_services (id, property_id, name, name_en, name_cs, name_de, description, price, unit_label, icon, category, available_for, sort_order, service_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run('svc_early_checkin', propRow2.id, 'Раннє заселення', 'Early Check-in', 'Brzký příjezd', 'Früher Check-in', 'Заселення з 12:00 замість 15:00', 500, 'разово', '🕛', 'other', 'all', 11, 'toggle');
        console.log('[DB] Seeded service: svc_early_checkin (500 CZK)');
      }
    }
  } catch (e: any) {
    console.log('[DB] New services seed note:', e.message);
  }

  // --- Migration: create content_translations table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS content_translations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      text_hash   TEXT NOT NULL,
      source_text TEXT NOT NULL,
      lang        TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(text_hash, lang)
    )
  `);

  // --- Migration: add per-language columns to additional_services ---
  const svcLangCols = [
    'name_pl', 'name_nl', 'name_fr',
    'description_en', 'description_de', 'description_cs', 'description_pl', 'description_nl', 'description_fr',
    'unit_label_en', 'unit_label_de', 'unit_label_cs', 'unit_label_pl', 'unit_label_nl', 'unit_label_fr',
  ];
  for (const col of svcLangCols) {
    try { database.exec(`ALTER TABLE additional_services ADD COLUMN ${col} TEXT`); }
    catch { /* already exists */ }
  }

  // ═══════════════════════════════════════════════════════
  // FINANCE MODULE TABLES
  // ═══════════════════════════════════════════════════════

  // --- Migration: create business_units table ---
  const buExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='business_units'"
  ).get();
  if (!buExists) {
    database.exec(`
      CREATE TABLE business_units (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        unit_type TEXT,
        is_shared INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed BUs from Proj_Map
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insBU = database.prepare('INSERT INTO business_units (id, organization_id, name, unit_type, is_shared, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
      insBU.run('bu_glamping', orgRow.id, 'Глемпинг', 'Глемпинг', 0, 1);
      insBU.run('bu_budova_fd', orgRow.id, 'Будова F/D', 'Міні-готель / 16 номерів', 0, 2);
      insBU.run('bu_camping', orgRow.id, 'Кемпинг', 'Кемпинг', 0, 3);
      insBU.run('bu_restaurant', orgRow.id, 'Ресторан', 'Ресторан', 0, 4);
      insBU.run('bu_sauna', orgRow.id, 'Сауна', 'Сауна', 0, 5);
      insBU.run('bu_pool', orgRow.id, 'Купель', 'Купель', 0, 6);
      insBU.run('bu_shared', orgRow.id, 'Загальне', 'Shared / HQ', 1, 7);
      insBU.run('bu_review', orgRow.id, 'На перегляд', 'Списання / review', 0, 8);
      console.log('[DB] Created business_units table with 8 BUs');
    }
  }

  // --- Migration: add parent_id to business_units for hierarchy (Finmap PR #3) ---
  try {
    const buCols = database.prepare("PRAGMA table_info(business_units)").all() as { name: string }[];
    const hasParent = buCols.some((c) => c.name === 'parent_id');
    if (!hasParent) {
      database.exec("ALTER TABLE business_units ADD COLUMN parent_id TEXT REFERENCES business_units(id)");
      database.exec("CREATE INDEX IF NOT EXISTS idx_bu_parent ON business_units(parent_id)");
      console.log('[DB] Added parent_id column to business_units for hierarchy');
    }
  } catch (e: any) {
    console.log('[DB] business_units hierarchy migration note:', e.message);
  }

  // --- Migration: create expense_categories table ---
  const ecExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='expense_categories'"
  ).get();
  if (!ecExists) {
    database.exec(`
      CREATE TABLE expense_categories (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        std_group TEXT NOT NULL DEFAULT 'OPEX',
        pnl_line TEXT NOT NULL,
        include_in_pnl INTEGER NOT NULL DEFAULT 1,
        include_in_cash INTEGER NOT NULL DEFAULT 1,
        alloc_method TEXT NOT NULL DEFAULT 'DIRECT',
        is_capex INTEGER NOT NULL DEFAULT 0,
        icon TEXT,
        color TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed categories from Cat_Map
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insEC = database.prepare('INSERT INTO expense_categories (id, organization_id, name, std_group, pnl_line, include_in_pnl, include_in_cash, alloc_method, is_capex, icon, color, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      // Revenue
      insEC.run('ec_accommodation', orgRow.id, 'Проживання', 'Revenue', 'Проживання', 1, 1, 'DIRECT', 0, '🏠', '#22c55e', 1);
      insEC.run('ec_sauna', orgRow.id, 'Сауна', 'Revenue', 'Сауна', 1, 1, 'DIRECT', 0, '🧖', '#f59e0b', 2);
      insEC.run('ec_restaurant', orgRow.id, 'Ресторан', 'Revenue', 'Ресторан', 1, 1, 'DIRECT', 0, '🍽️', '#ef4444', 3);
      insEC.run('ec_breakfast', orgRow.id, 'Сніданки', 'Revenue', 'Сніданки', 1, 1, 'DIRECT', 0, '🍳', '#f97316', 4);
      insEC.run('ec_other_rev', orgRow.id, 'Інші доходи', 'Revenue', 'Інші доходи', 1, 1, 'DIRECT', 0, '💰', '#84cc16', 5);
      // COGS
      insEC.run('ec_food', orgRow.id, 'Харчування', 'COGS', 'Харчування', 1, 1, 'DIRECT', 0, '🥘', '#dc2626', 6);
      insEC.run('ec_products', orgRow.id, 'Продукти', 'COGS', 'Продукти', 1, 1, 'DIRECT', 0, '🛒', '#b91c1c', 7);
      insEC.run('ec_variable', orgRow.id, 'Змінні витрати', 'COGS', 'Змінні витрати', 1, 1, 'DIRECT', 0, '📦', '#991b1b', 8);
      // OPEX
      insEC.run('ec_rent', orgRow.id, 'Оренда', 'OPEX', 'Оренда', 1, 1, 'RENT', 0, '🏢', '#6366f1', 9);
      insEC.run('ec_utilities', orgRow.id, 'Комунальні', 'OPEX', 'Комунальні', 1, 1, 'UTILITIES', 0, '🔌', '#8b5cf6', 10);
      insEC.run('ec_payroll', orgRow.id, 'Зарплати', 'OPEX', 'Зарплати', 1, 1, 'SHARED_PAYROLL', 0, '👥', '#a855f7', 11);
      insEC.run('ec_marketing', orgRow.id, 'Маркетинг', 'OPEX', 'Маркетинг', 1, 1, 'HQ', 0, '📢', '#ec4899', 12);
      insEC.run('ec_professional', orgRow.id, 'Профпослуги', 'OPEX', 'Профпослуги', 1, 1, 'HQ', 0, '💼', '#14b8a6', 13);
      insEC.run('ec_other_exp', orgRow.id, 'Інші витрати', 'OPEX', 'Інші витрати', 1, 1, 'HQ', 0, '📋', '#6b7280', 14);
      insEC.run('ec_consumables', orgRow.id, 'Розхідники', 'OPEX', 'Розхідники', 1, 1, 'HQ', 0, '🧹', '#78716c', 15);
      // Taxes
      insEC.run('ec_taxes', orgRow.id, 'Податки', 'Taxes', 'Податки', 1, 1, 'HQ', 0, '🏛️', '#334155', 16);
      // CAPEX
      insEC.run('ec_capex', orgRow.id, 'Стройка', 'CAPEX', 'CAPEX', 0, 1, 'NONE', 1, '🏗️', '#0ea5e9', 17);
      // Financing
      insEC.run('ec_investors', orgRow.id, 'Інвесторські кошти', 'Financing', 'Інвесторські кошти', 0, 1, 'NONE', 0, '🏦', '#059669', 18);
      // Transfer
      insEC.run('ec_transfer', orgRow.id, 'Переказ', 'Transfer', 'Переказ', 0, 1, 'NONE', 0, '↔️', '#94a3b8', 19);
      console.log('[DB] Created expense_categories table with 19 categories from Cat_Map');
    }
  }

  // --- Migration: add hierarchy + op_type + classifier to expense_categories (Finmap PR #2) ---
  try {
    const ecCols = database.prepare("PRAGMA table_info(expense_categories)").all() as { name: string }[];
    const hasOpType = ecCols.some((c) => c.name === 'op_type');
    if (!hasOpType) {
      database.exec("ALTER TABLE expense_categories ADD COLUMN parent_id TEXT REFERENCES expense_categories(id)");
      database.exec("ALTER TABLE expense_categories ADD COLUMN op_type TEXT");
      database.exec("ALTER TABLE expense_categories ADD COLUMN classifier TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_ec_parent ON expense_categories(parent_id)");

      // Backfill: map existing std_group → op_type + classifier
      database.exec("UPDATE expense_categories SET op_type = 'income',    classifier = 'other'       WHERE std_group = 'Revenue'");
      database.exec("UPDATE expense_categories SET op_type = 'expense',   classifier = 'cogs'        WHERE std_group = 'COGS'");
      database.exec("UPDATE expense_categories SET op_type = 'expense',   classifier = 'operational' WHERE std_group = 'OPEX'");
      database.exec("UPDATE expense_categories SET classifier = 'variable' WHERE id = 'ec_variable'");
      database.exec("UPDATE expense_categories SET op_type = 'expense',   classifier = 'tax'         WHERE std_group = 'Taxes'");
      database.exec("UPDATE expense_categories SET op_type = 'expense',   classifier = 'capex'       WHERE std_group = 'CAPEX'");
      database.exec("UPDATE expense_categories SET op_type = 'income',    classifier = 'financing'   WHERE id = 'ec_investors'");
      database.exec("UPDATE expense_categories SET op_type = 'transfer',  classifier = 'other'       WHERE id = 'ec_transfer'");
      database.exec("UPDATE expense_categories SET op_type = 'other',     classifier = 'other'       WHERE op_type IS NULL");

      console.log('[DB] Extended expense_categories with parent_id/op_type/classifier + backfilled seed rows');
    }
  } catch (e: any) {
    console.log('[DB] expense_categories hierarchy migration note:', e.message);
  }

  // --- Every-startup backfill: categories created via the legacy CRUD used to
  // get NULL op_type/classifier, making them invisible to matrix reports.
  // Idempotent — only touches rows that are still unclassified.
  try {
    const fixes: string[] = [
      "UPDATE expense_categories SET op_type='income',   classifier=COALESCE(NULLIF(classifier,''),'revenue')     WHERE std_group='Revenue'   AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='expense',  classifier=COALESCE(NULLIF(classifier,''),'cogs')        WHERE std_group='COGS'      AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='expense',  classifier=COALESCE(NULLIF(classifier,''),'operational') WHERE std_group='OPEX'      AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='expense',  classifier=COALESCE(NULLIF(classifier,''),'tax')         WHERE std_group='Taxes'     AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='expense',  classifier=COALESCE(NULLIF(classifier,''),'capex')       WHERE std_group='CAPEX'     AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='expense',  classifier=COALESCE(NULLIF(classifier,''),'financing')   WHERE std_group='Financing' AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='transfer', classifier=COALESCE(NULLIF(classifier,''),'other')       WHERE std_group='Transfer'  AND (op_type IS NULL OR op_type='')",
      "UPDATE expense_categories SET op_type='other',    classifier=COALESCE(NULLIF(classifier,''),'other')       WHERE op_type IS NULL OR op_type=''",
      "UPDATE expense_categories SET classifier='other' WHERE classifier IS NULL OR classifier=''",
    ];
    let fixed = 0;
    for (const sql of fixes) fixed += database.prepare(sql).run().changes;
    if (fixed > 0) console.log(`[DB] Classified ${fixed} legacy expense_categories rows (op_type/classifier backfill)`);
  } catch (e: any) {
    console.log('[DB] expense_categories classifier backfill note:', e.message);
  }

  // --- One-shot: attribute reservation income to the STAY period ------------
  // Historically accrued_at defaulted to paid_at, so the "accrual" P&L basis
  // was a fiction. Point reservation-linked income at check_in (stay month)
  // and fill period_from/to. paid_at (cash truth) is untouched. Guarded via
  // fin_system_state so it runs once.
  try {
    const done = database.prepare(
      "SELECT value FROM fin_system_state WHERE key = 'accrued_at_stay_backfilled'"
    ).get() as { value: string } | undefined;
    if (!done) {
      const r = database.prepare(`
        UPDATE fin_operations SET
          accrued_at = (SELECT r.check_in FROM reservations r WHERE r.id = fin_operations.reservation_id),
          period_from = COALESCE(period_from, (SELECT r.check_in FROM reservations r WHERE r.id = fin_operations.reservation_id)),
          period_to = COALESCE(period_to, (SELECT r.check_out FROM reservations r WHERE r.id = fin_operations.reservation_id))
        WHERE op_type = 'income'
          AND reservation_id IS NOT NULL
          AND accrued_at = paid_at
          AND EXISTS (SELECT 1 FROM reservations r WHERE r.id = fin_operations.reservation_id AND r.check_in IS NOT NULL)
      `).run();
      database.prepare(
        "INSERT OR REPLACE INTO fin_system_state (key, value, updated_at) VALUES ('accrued_at_stay_backfilled', ?, datetime('now'))"
      ).run(`re-attributed ${r.changes} reservation income ops to stay period`);
      if (r.changes > 0) console.log(`[DB] Accrual backfill: ${r.changes} reservation income ops now accrue on check-in date`);
    }
  } catch (e: any) {
    console.log('[DB] accrued_at stay backfill note:', e.message);
  }

  // --- Migration: create expenses table (skipped after fin_operations migration) ---
  if (!finOpsMigrated) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        category_id TEXT NOT NULL REFERENCES expense_categories(id),
        business_unit_id TEXT REFERENCES business_units(id),
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CZK',
        description TEXT NOT NULL,
        counterparty TEXT,
        method TEXT CHECK (method IN ('cash', 'card', 'bank_transfer', 'invoice')),
        expense_date TEXT NOT NULL,
        month TEXT NOT NULL,
        receipt_id TEXT,
        needs_review INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_by TEXT REFERENCES app_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_bu ON expenses(business_unit_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date)');
  }

  // --- Migration: create receipts table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      expense_id TEXT REFERENCES expenses(id) ON DELETE SET NULL,
      file_path TEXT NOT NULL,
      file_type TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create cost_allocations table ---
  const caExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='cost_allocations'"
  ).get();
  if (!caExists) {
    database.exec(`
      CREATE TABLE cost_allocations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        month TEXT NOT NULL,
        alloc_method TEXT NOT NULL,
        business_unit_id TEXT NOT NULL REFERENCES business_units(id),
        percentage REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(organization_id, month, alloc_method, business_unit_id)
      )
    `);
    // Seed default allocations from Allocations sheet (for 2026-03)
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
    if (orgRow) {
      const insAlloc = database.prepare('INSERT INTO cost_allocations (organization_id, month, alloc_method, business_unit_id, percentage) VALUES (?, ?, ?, ?, ?)');
      const allocData: [string, string, number][] = [
        // [method, bu_id, percentage]
        ['RENT', 'bu_glamping', 30], ['RENT', 'bu_budova_fd', 30], ['RENT', 'bu_camping', 5],
        ['RENT', 'bu_restaurant', 20], ['RENT', 'bu_sauna', 10], ['RENT', 'bu_pool', 5],
        ['UTILITIES', 'bu_glamping', 25], ['UTILITIES', 'bu_budova_fd', 30], ['UTILITIES', 'bu_camping', 5],
        ['UTILITIES', 'bu_restaurant', 20], ['UTILITIES', 'bu_sauna', 15], ['UTILITIES', 'bu_pool', 5],
        ['SHARED_PAYROLL', 'bu_glamping', 30], ['SHARED_PAYROLL', 'bu_budova_fd', 25], ['SHARED_PAYROLL', 'bu_camping', 5],
        ['SHARED_PAYROLL', 'bu_restaurant', 20], ['SHARED_PAYROLL', 'bu_sauna', 10], ['SHARED_PAYROLL', 'bu_pool', 10],
        ['HQ', 'bu_glamping', 30], ['HQ', 'bu_budova_fd', 25], ['HQ', 'bu_camping', 5],
        ['HQ', 'bu_restaurant', 20], ['HQ', 'bu_sauna', 10], ['HQ', 'bu_pool', 10],
      ];
      for (const [method, buId, pct] of allocData) {
        insAlloc.run(orgRow.id, '2026-03', method, buId, pct);
      }
      console.log('[DB] Created cost_allocations table with default allocations');
    }
  }

  // ═══════════════════════════════════════════════════════
  // FINANCE MODULE PHASE 2 TABLES
  // ═══════════════════════════════════════════════════════

  // --- Migration: create capex_items table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS capex_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      business_unit_id TEXT REFERENCES business_units(id),
      name TEXT NOT NULL,
      asset_type TEXT DEFAULT 'construction',
      amount REAL NOT NULL,
      counterparty TEXT,
      purchase_date TEXT NOT NULL,
      month TEXT NOT NULL,
      useful_life_months INTEGER,
      depreciation_monthly REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_by TEXT REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_org ON capex_items(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_bu ON capex_items(business_unit_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_capex_month ON capex_items(month)');

  // --- Migration: create accruals table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS accruals (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      business_unit_id TEXT REFERENCES business_units(id),
      category_id TEXT REFERENCES expense_categories(id),
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL,
      accrual_type TEXT NOT NULL DEFAULT 'expense',
      status TEXT NOT NULL DEFAULT 'pending',
      paid_expense_id TEXT REFERENCES expenses(id),
      notes TEXT,
      created_by TEXT REFERENCES app_users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_org ON accruals(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_month ON accruals(month)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_accruals_status ON accruals(status)');

  // --- Migration: create bank_statements table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS bank_statements (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      bank_name TEXT,
      account_number TEXT,
      period_from TEXT,
      period_to TEXT,
      total_transactions INTEGER NOT NULL DEFAULT 0,
      matched_transactions INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create bank_transactions table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      statement_id TEXT NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      transaction_date TEXT NOT NULL,
      amount REAL NOT NULL,
      counterparty TEXT,
      description TEXT,
      reference TEXT,
      matched_category_id TEXT REFERENCES expense_categories(id),
      matched_business_unit_id TEXT REFERENCES business_units(id),
      matched_expense_id TEXT REFERENCES expenses(id),
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      confidence REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_bank_tx_statement ON bank_transactions(statement_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_bank_tx_status ON bank_transactions(match_status)');

  // --- Migration: add matched_payment_id to bank_transactions ---
  try {
    database.exec("ALTER TABLE bank_transactions ADD COLUMN matched_payment_id TEXT REFERENCES payments(id)");
  } catch { /* column already exists */ }

  // ═══════════════════════════════════════════════════════
  // FINANCE MODULE PHASE 3 — Accounts, Income, Transfers
  // ═══════════════════════════════════════════════════════

  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_accounts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'bank', 'card', 'investment', 'other')),
      currency TEXT NOT NULL DEFAULT 'CZK',
      initial_balance REAL NOT NULL DEFAULT 0,
      credit_limit REAL,
      color TEXT DEFAULT '#6366f1',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_fin_acct_org ON finance_accounts(organization_id)');

  // Migration: rebuild finance_accounts to add 'card' to type CHECK and credit_limit column.
  // SQLite cannot ALTER a CHECK constraint, so we rebuild via swap-and-rename.
  try {
    const acctCols = database.prepare("PRAGMA table_info(finance_accounts)").all() as { name: string }[];
    const hasCreditLimit = acctCols.some((c) => c.name === 'credit_limit');
    if (!hasCreditLimit) {
      database.exec(`
        CREATE TABLE finance_accounts_new (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'bank', 'card', 'investment', 'other')),
          currency TEXT NOT NULL DEFAULT 'CZK',
          initial_balance REAL NOT NULL DEFAULT 0,
          credit_limit REAL,
          color TEXT DEFAULT '#6366f1',
          is_active INTEGER NOT NULL DEFAULT 1,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO finance_accounts_new
          (id, organization_id, name, type, currency, initial_balance, color, is_active, sort_order, created_at)
        SELECT id, organization_id, name, type, currency, initial_balance, color, is_active, sort_order, created_at
        FROM finance_accounts;
        DROP TABLE finance_accounts;
        ALTER TABLE finance_accounts_new RENAME TO finance_accounts;
        CREATE INDEX IF NOT EXISTS idx_fin_acct_org ON finance_accounts(organization_id);
      `);
      console.log('[DB] Rebuilt finance_accounts: added card type and credit_limit column');
    }
  } catch (e: any) {
    console.log('[DB] finance_accounts rebuild note:', e.message);
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_exchange_rates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      from_currency TEXT NOT NULL,
      to_currency TEXT NOT NULL,
      rate REAL NOT NULL CHECK (rate > 0),
      effective_from TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, from_currency, to_currency, effective_from)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_fx_org ON finance_exchange_rates(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_fx_pair ON finance_exchange_rates(from_currency, to_currency, effective_from)');

  // --- Finance PR #4: counterparties with hierarchy and aliases for auto-matching ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_counterparties (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      parent_id TEXT REFERENCES finance_counterparties(id),
      kind TEXT,
      note TEXT,
      aliases_json TEXT NOT NULL DEFAULT '[]',
      icon TEXT,
      color TEXT DEFAULT '#6b7280',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_cp_org ON finance_counterparties(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_cp_parent ON finance_counterparties(parent_id)');

  // --- Finance PR #11: bank inbox (IMAP poller for KB statements) ---
  // Add iban column to finance_accounts so XML statements auto-route to correct account
  try {
    const acctCols = database.prepare("PRAGMA table_info(finance_accounts)").all() as { name: string }[];
    if (!acctCols.some((c) => c.name === 'iban')) {
      database.exec("ALTER TABLE finance_accounts ADD COLUMN iban TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_fin_acct_iban ON finance_accounts(iban)");
    }
  } catch (e: any) { console.log('[DB] finance_accounts iban migration note:', e.message); }

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_bank_inboxes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_user TEXT NOT NULL,
      imap_password_encrypted TEXT NOT NULL,
      imap_folder TEXT NOT NULL DEFAULT 'INBOX',
      use_tls INTEGER NOT NULL DEFAULT 1,
      sender_filter TEXT,
      subject_filter TEXT,
      attachment_format TEXT NOT NULL DEFAULT 'auto',
      last_uid INTEGER,
      last_synced_at TEXT,
      last_error TEXT,
      last_email_at TEXT,
      emails_processed INTEGER NOT NULL DEFAULT 0,
      operations_imported INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_inbox_org ON fin_bank_inboxes(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_inbox_active ON fin_bank_inboxes(is_active, last_synced_at)');

  // --- Finance PR #10: budgets (plan/fact) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_budgets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      year INTEGER NOT NULL,
      month INTEGER NOT NULL,
      category_id TEXT REFERENCES expense_categories(id),
      project_id TEXT REFERENCES business_units(id),
      planned_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, year, month, category_id, project_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_budgets_period ON fin_budgets(organization_id, year, month)');

  // --- Finance PR #8: recurring templates + system state ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_recurring_templates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      op_type TEXT NOT NULL CHECK (op_type IN ('income','expense','transfer')),
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      account_from_id TEXT REFERENCES finance_accounts(id),
      account_to_id TEXT REFERENCES finance_accounts(id),
      category_id TEXT REFERENCES expense_categories(id),
      project_id TEXT REFERENCES business_units(id),
      counterparty_id TEXT REFERENCES finance_counterparties(id),
      comment TEXT,
      schedule TEXT NOT NULL CHECK (schedule IN ('daily','weekly','monthly','yearly')),
      schedule_day INTEGER,
      next_run_at TEXT NOT NULL,
      end_at TEXT,
      last_run_at TEXT,
      runs_created INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_rt_org ON fin_recurring_templates(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_rt_next_run ON fin_recurring_templates(next_run_at, is_active)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_system_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // --- Finance PR #7: auto-rules + match log ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_auto_rules (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      op_type TEXT NOT NULL CHECK (op_type IN ('income','expense','any')),
      conditions_json TEXT NOT NULL DEFAULT '[]',
      actions_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      stop_on_match INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ar_org ON fin_auto_rules(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ar_active ON fin_auto_rules(is_active, sort_order)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_auto_rule_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id TEXT NOT NULL REFERENCES fin_auto_rules(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
      matched_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_arm_rule ON fin_auto_rule_matches(rule_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_arm_op ON fin_auto_rule_matches(operation_id)');

  // --- Finance PR #5: flat tags table (cross-cutting labels on operations) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_tags (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6b7280',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_org_name ON finance_tags(organization_id, LOWER(name))');
  database.exec('CREATE INDEX IF NOT EXISTS idx_tags_org ON finance_tags(organization_id)');

  if (!finOpsMigrated) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS income (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES finance_accounts(id),
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CZK',
        category TEXT,
        counterparty TEXT,
        description TEXT NOT NULL,
        income_date TEXT NOT NULL,
        month TEXT NOT NULL,
        business_unit_id TEXT REFERENCES business_units(id),
        notes TEXT,
        created_by TEXT REFERENCES app_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_income_org ON income(organization_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_income_date ON income(income_date)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_income_month ON income(month)');

    database.exec(`
      CREATE TABLE IF NOT EXISTS transfers (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        from_account_id TEXT REFERENCES finance_accounts(id),
        to_account_id TEXT REFERENCES finance_accounts(id),
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'CZK',
        transfer_date TEXT NOT NULL,
        notes TEXT,
        created_by TEXT REFERENCES app_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_transfers_org ON transfers(organization_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_transfers_date ON transfers(transfer_date)');

    try {
      database.exec("ALTER TABLE expenses ADD COLUMN account_id TEXT REFERENCES finance_accounts(id)");
    } catch { /* column already exists */ }
    try {
      database.exec("ALTER TABLE payments ADD COLUMN account_id TEXT REFERENCES finance_accounts(id)");
    } catch { /* column already exists */ }
  }

  // ═══════════════════════════════════════════════════════
  // FINANCE PR #6: UNIFIED fin_operations TABLE
  // One-time hard migration from payments + expenses + income + transfers
  // ═══════════════════════════════════════════════════════
  if (!finOpsMigrated) {
    // 1) Create fin_operations table
    database.exec(`
      CREATE TABLE fin_operations (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

        op_type TEXT NOT NULL CHECK (op_type IN ('income', 'expense', 'transfer')),

        account_from_id TEXT REFERENCES finance_accounts(id),
        account_to_id   TEXT REFERENCES finance_accounts(id),

        amount         REAL NOT NULL,
        currency       TEXT NOT NULL DEFAULT 'CZK',
        amount_to      REAL,
        currency_to    TEXT,
        fx_rate        REAL,
        amount_company REAL NOT NULL,

        paid_at      TEXT NOT NULL,
        accrued_at   TEXT NOT NULL,
        period_from  TEXT,
        period_to    TEXT,

        category_id     TEXT REFERENCES expense_categories(id),
        project_id      TEXT REFERENCES business_units(id),
        counterparty_id TEXT REFERENCES finance_counterparties(id),

        reservation_id  TEXT REFERENCES reservations(id) ON DELETE CASCADE,
        status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','pending','failed','refunded')),
        method          TEXT,
        payment_subtype TEXT,

        comment     TEXT,
        is_planned  INTEGER NOT NULL DEFAULT 0,
        source      TEXT NOT NULL DEFAULT 'manual',
        source_ref  TEXT,

        created_by TEXT REFERENCES app_users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_org ON fin_operations(organization_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_type ON fin_operations(op_type)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_paid ON fin_operations(paid_at)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_accrued ON fin_operations(accrued_at)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_acct_from ON fin_operations(account_from_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_acct_to ON fin_operations(account_to_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_reservation ON fin_operations(reservation_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_status ON fin_operations(status)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_source_ref ON fin_operations(source, source_ref)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_category ON fin_operations(category_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_project ON fin_operations(project_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_fop_counterparty ON fin_operations(counterparty_id)');

    database.exec(`
      CREATE TABLE fin_operation_tags (
        operation_id TEXT NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
        tag_id TEXT NOT NULL REFERENCES finance_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (operation_id, tag_id)
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_fot_tag ON fin_operation_tags(tag_id)');

    // 2) Migration: copy rows from legacy tables.
    // Income → op_type='income'
    database.exec(`
      INSERT INTO fin_operations
        (id, organization_id, op_type, account_to_id, amount, currency, amount_company,
         paid_at, accrued_at, project_id,
         comment, status, source, created_by, created_at, updated_at)
      SELECT
        id, organization_id, 'income', account_id, amount, COALESCE(currency, 'CZK'), amount,
        income_date, income_date, business_unit_id,
        COALESCE(notes, description), 'completed', 'manual', created_by, created_at, updated_at
      FROM income
    `);

    // Expenses → op_type='expense'
    database.exec(`
      INSERT INTO fin_operations
        (id, organization_id, op_type, account_from_id, amount, currency, amount_company,
         paid_at, accrued_at, category_id, project_id,
         comment, method, source, created_by, created_at, updated_at)
      SELECT
        id, organization_id, 'expense', account_id, amount, COALESCE(currency, 'CZK'), amount,
        expense_date, expense_date, category_id, business_unit_id,
        COALESCE(notes, description, counterparty), method, 'manual', created_by, created_at, updated_at
      FROM expenses
    `);

    // Transfers → op_type='transfer'
    database.exec(`
      INSERT INTO fin_operations
        (id, organization_id, op_type, account_from_id, account_to_id,
         amount, currency, amount_company, paid_at, accrued_at,
         comment, source, created_by, created_at, updated_at)
      SELECT
        id, organization_id, 'transfer', from_account_id, to_account_id,
        amount, COALESCE(currency, 'CZK'), amount, transfer_date, transfer_date,
        notes, 'manual', created_by, created_at, created_at
      FROM transfers
    `);

    // Payments → op_type='income' (or 'expense' for refund). Derive source from notes.
    // reservations has no organization_id — pull it through properties.
    database.exec(`
      INSERT INTO fin_operations
        (id, organization_id, op_type, account_from_id, account_to_id,
         amount, currency, amount_company, paid_at, accrued_at,
         reservation_id, status, method, payment_subtype,
         comment, source, source_ref, created_at, updated_at)
      SELECT
        p.id, prop.organization_id,
        CASE WHEN p.type = 'refund' THEN 'expense' ELSE 'income' END,
        CASE WHEN p.type = 'refund' THEN p.account_id ELSE NULL END,
        CASE WHEN p.type = 'refund' THEN NULL ELSE p.account_id END,
        p.amount, COALESCE(p.currency, 'CZK'), p.amount,
        COALESCE(p.paid_at, p.created_at), COALESCE(p.paid_at, p.created_at),
        p.reservation_id, COALESCE(p.status, 'completed'), p.method, p.type,
        p.notes,
        CASE
          WHEN p.auto_created = 1 AND p.notes LIKE '%Hostex%' THEN 'hostex'
          WHEN p.auto_created = 1 AND (p.notes LIKE '%Teya%' OR p.notes LIKE '%Teia%') THEN 'teia'
          WHEN p.auto_created = 1 AND p.method = 'online' THEN 'booking_widget'
          WHEN p.auto_created = 1 THEN 'booking_widget'
          ELSE 'manual'
        END,
        p.reservation_id,
        p.created_at, p.created_at
      FROM payments p
      JOIN reservations r ON p.reservation_id = r.id
      JOIN properties prop ON r.property_id = prop.id
    `);

    // 3) Rename bank_transactions FK: matched_expense_id + matched_payment_id → matched_operation_id
    const btxCols = database.prepare("PRAGMA table_info(bank_transactions)").all() as { name: string }[];
    if (!btxCols.some((c) => c.name === 'matched_operation_id')) {
      database.exec('ALTER TABLE bank_transactions ADD COLUMN matched_operation_id TEXT REFERENCES fin_operations(id)');
      database.exec(`
        UPDATE bank_transactions
        SET matched_operation_id = COALESCE(matched_expense_id, matched_payment_id)
        WHERE matched_expense_id IS NOT NULL OR matched_payment_id IS NOT NULL
      `);
      database.exec('CREATE INDEX IF NOT EXISTS idx_btx_matched_op ON bank_transactions(matched_operation_id)');
    }

    // 4) Add link-columns to capex_items / accruals / invoices (placeholders for future)
    for (const tbl of ['capex_items', 'accruals', 'invoices']) {
      try {
        const cols = database.prepare(`PRAGMA table_info(${tbl})`).all() as { name: string }[];
        if (!cols.some((c) => c.name === 'fin_operation_id')) {
          database.exec(`ALTER TABLE ${tbl} ADD COLUMN fin_operation_id TEXT REFERENCES fin_operations(id)`);
        }
      } catch { /* table may not exist on fresh DBs */ }
    }

    // 5) Verification. Use the same JOIN chain as the INSERT (payments → reservations → properties)
    const counts = database.prepare(`
      SELECT
        (SELECT COUNT(*) FROM income) +
        (SELECT COUNT(*) FROM expenses) +
        (SELECT COUNT(*) FROM transfers) +
        (SELECT COUNT(*) FROM payments p
           JOIN reservations r ON p.reservation_id = r.id
           JOIN properties prop ON r.property_id = prop.id) AS old_total,
        (SELECT COUNT(*) FROM fin_operations) AS new_total
    `).get() as { old_total: number; new_total: number };
    if (counts.old_total !== counts.new_total) {
      throw new Error(`[DB] fin_operations migration count mismatch: old=${counts.old_total}, new=${counts.new_total}`);
    }
    const sums = database.prepare(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM income) +
        (SELECT COALESCE(SUM(amount), 0) FROM expenses) +
        (SELECT COALESCE(SUM(amount), 0) FROM transfers) +
        (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
           JOIN reservations r ON p.reservation_id = r.id
           JOIN properties prop ON r.property_id = prop.id) AS old_sum,
        (SELECT COALESCE(SUM(amount), 0) FROM fin_operations) AS new_sum
    `).get() as { old_sum: number; new_sum: number };
    if (Math.abs(sums.old_sum - sums.new_sum) > 0.01) {
      throw new Error(`[DB] fin_operations migration sum mismatch: old=${sums.old_sum}, new=${sums.new_sum}`);
    }
    console.log(`[DB] fin_operations migration verified: ${counts.new_total} rows, sum=${sums.new_sum.toFixed(2)} ✓`);

    // 6) DROP legacy tables
    database.exec('DROP TABLE payments');
    database.exec('DROP TABLE expenses');
    database.exec('DROP TABLE income');
    database.exec('DROP TABLE transfers');
    console.log('[DB] Dropped legacy tables: payments, expenses, income, transfers');
  }

  // ═══════════════════════════════════════════════════════
  // PRICING MODULE
  // ═══════════════════════════════════════════════════════

  // --- Migration: create price_calendar table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS price_calendar (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      base_price REAL NOT NULL DEFAULT 0,
      weekend_price REAL,
      min_stay INTEGER NOT NULL DEFAULT 1,
      max_stay INTEGER,
      closed INTEGER NOT NULL DEFAULT 0,
      cta INTEGER NOT NULL DEFAULT 0,
      ctd INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(unit_type_id, date)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_ut ON price_calendar(unit_type_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_date ON price_calendar(date)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_price_cal_ut_date ON price_calendar(unit_type_id, date)');

  // ═══════════════════════════════════════════════════════
  // CHANNEL MANAGER MODULE (Booking.com, Airbnb, VRBO...)
  // ═══════════════════════════════════════════════════════

  // --- Migration: create channel_connections table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_connections (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      external_property_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      connection_types TEXT NOT NULL DEFAULT '[]',
      pricing_model TEXT NOT NULL DEFAULT 'Standard',
      credentials_id TEXT,
      last_synced_at TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_org ON channel_connections(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_channel ON channel_connections(channel)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_conn_status ON channel_connections(status)');

  // --- Migration: create channel_credentials table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_credentials (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      environment TEXT NOT NULL DEFAULT 'test',
      client_id TEXT NOT NULL DEFAULT '',
      client_secret TEXT NOT NULL DEFAULT '',
      access_token TEXT,
      token_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(organization_id, channel, environment)
    )
  `);

  // --- Migration: create channel_room_mapping table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS channel_room_mapping (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      unit_type_id TEXT NOT NULL REFERENCES unit_types(id) ON DELETE CASCADE,
      external_room_type_id TEXT NOT NULL DEFAULT '',
      external_rate_plan_id TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(connection_id, unit_type_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ch_room_conn ON channel_room_mapping(connection_id)');

  // --- Migration: create ari_sync_queue table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ari_sync_queue (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      sync_type TEXT NOT NULL DEFAULT 'full',
      unit_type_id TEXT,
      date_from TEXT NOT NULL,
      date_to TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      priority INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_status ON ari_sync_queue(status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_conn ON ari_sync_queue(connection_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_queue_priority ON ari_sync_queue(priority, created_at)');

  // --- Migration: create ari_sync_log table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS ari_sync_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      connection_id TEXT NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
      direction TEXT NOT NULL DEFAULT 'outbound',
      endpoint TEXT NOT NULL DEFAULT '',
      request_body TEXT,
      response_status INTEGER,
      response_body TEXT,
      ruid TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_conn ON ari_sync_log(connection_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_created ON ari_sync_log(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_ari_log_ruid ON ari_sync_log(ruid)');

  // --- Migration: add Booking.com fields to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN bcom_reservation_id TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN price_per_night_json TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN smoking_preference TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN promotions_applied TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN rate_rewriting_info TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN cancellation_policy TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN meal_plan TEXT");
  } catch { /* column already exists */ }

  // --- Migration: Renumber Building F rooms (F7..F23 → F1..F17) ---
  try {
    const hasOldF7 = database.prepare("SELECT id FROM units WHERE id = 'u_f7' AND building_id = 'bldg_f'").get();
    if (hasOldF7) {
      console.log('[DB] Renumbering Building F rooms: F7..F23 → F1..F17');
      const oldNums = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
      // Step 1: rename to temporary IDs/names to avoid conflicts
      for (const n of oldNums) {
        const newN = n - 6;
        database.prepare("UPDATE units SET id = ?, name = ?, code = ?, sort_order = ? WHERE id = ?")
          .run(`u_f_tmp${newN}`, `F${newN}`, `F${newN}`, newN, `u_f${n}`);
        // Also update FK references
        database.prepare("UPDATE reservations SET unit_id = ? WHERE unit_id = ?")
          .run(`u_f_tmp${newN}`, `u_f${n}`);
      }
      // Step 2: rename from temporary to final IDs
      for (let newN = 1; newN <= 17; newN++) {
        database.prepare("UPDATE units SET id = ? WHERE id = ?")
          .run(`u_f${newN}`, `u_f_tmp${newN}`);
        database.prepare("UPDATE reservations SET unit_id = ? WHERE unit_id = ?")
          .run(`u_f${newN}`, `u_f_tmp${newN}`);
      }
      console.log('[DB] Building F renumbered successfully');
    }
  } catch (e: any) {
    console.error('[DB] Building F renumbering error:', e.message);
  }

  // --- Migration: add city_tax fields to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_amount REAL DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_included INTEGER DEFAULT 0");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN city_tax_paid TEXT DEFAULT 'pending'");
  } catch { /* column already exists */ }

  // --- Migration: add city_tax_included_default to booking_sources ---
  try {
    database.exec("ALTER TABLE booking_sources ADD COLUMN city_tax_included_default INTEGER DEFAULT 0");
  } catch { /* column already exists */ }

  // --- Migration: booking_activity_log table ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS booking_activity_log (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE
      )
    `);
  } catch { /* already exists */ }

  // --- Migration: add internal_notes to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN internal_notes TEXT");
  } catch { /* column already exists */ }

  // --- Migration: guest_registrations table (multi-guest per reservation) ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS guest_registrations (
        id TEXT PRIMARY KEY,
        reservation_id TEXT NOT NULL,
        guest_id TEXT NOT NULL,
        is_primary INTEGER DEFAULT 0,
        registered_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE CASCADE,
        FOREIGN KEY (guest_id) REFERENCES guests(id) ON DELETE CASCADE
      )
    `);
  } catch { /* already exists */ }

  // --- Migration: add registration_status to reservations ---
  try {
    database.exec("ALTER TABLE reservations ADD COLUMN registration_status TEXT DEFAULT 'not_registered'");
  } catch { /* column already exists */ }

  // --- Migration: add nationality to guests ---
  try {
    database.exec("ALTER TABLE guests ADD COLUMN nationality TEXT");
  } catch { /* column already exists */ }

  // ═══════════════════════════════════════════════════════
  // CRM MODULE
  // ═══════════════════════════════════════════════════════

  // --- Migration: create crm_channels table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_channels (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL CHECK (channel_type IN (
        'whatsapp', 'email', 'phone', 'guest_page', 'telegram',
        'booking_com', 'airbnb', 'web_form', 'manual'
      )),
      name TEXT NOT NULL,
      config_json TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_default_outbound INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_channels_org ON crm_channels(organization_id)');

  // Seed default channels
  try {
    const chExists = database.prepare("SELECT id FROM crm_channels WHERE id = 'ch_manual'").get();
    if (!chExists) {
      const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as any;
      if (orgRow) {
        const insCh = database.prepare('INSERT INTO crm_channels (id, organization_id, channel_type, name, is_default_outbound) VALUES (?, ?, ?, ?, ?)');
        insCh.run('ch_manual', orgRow.id, 'manual', 'Вручну', 0);
        insCh.run('ch_phone', orgRow.id, 'phone', 'Телефон', 0);
        insCh.run('ch_whatsapp', orgRow.id, 'whatsapp', 'WhatsApp', 1);
        insCh.run('ch_email_main', orgRow.id, 'email', 'Email (основний)', 0);
        insCh.run('ch_guest_page', orgRow.id, 'guest_page', 'Guest Page', 0);
        insCh.run('ch_telegram', orgRow.id, 'telegram', 'Telegram Bot', 0);
        insCh.run('ch_booking_com', orgRow.id, 'booking_com', 'Booking.com', 0);
        insCh.run('ch_airbnb', orgRow.id, 'airbnb', 'Airbnb', 0);
        insCh.run('ch_web_form', orgRow.id, 'web_form', 'Форми з сайтів', 0);
        console.log('[DB] Created crm_channels with 9 default channels');
      }
    }
  } catch (e: any) {
    console.log('[DB] crm_channels seed note:', e.message);
  }

  // --- Migration: create crm_leads table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_leads (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      guest_id TEXT REFERENCES guests(id),
      channel_id TEXT REFERENCES crm_channels(id),
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      whatsapp TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      external_booking_id TEXT,
      stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN (
        'new', 'inquiry', 'info_needed', 'quote_sent', 'negotiation',
        'deposit_paid', 'booked', 'pre_stay', 'check_in', 'in_stay',
        'check_out', 'post_stay', 'lost', 'spam'
      )),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      assigned_to TEXT REFERENCES app_users(id),
      reservation_id TEXT REFERENCES reservations(id),
      guest_page_token TEXT,
      check_in_date TEXT,
      check_out_date TEXT,
      adults INTEGER NOT NULL DEFAULT 0,
      children INTEGER NOT NULL DEFAULT 0,
      unit_type_preference TEXT,
      estimated_value REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CZK',
      camping_children_json TEXT,
      camping_vehicle_type TEXT,
      camping_tent_type TEXT,
      camping_electricity INTEGER NOT NULL DEFAULT 0,
      camping_pets_json TEXT,
      tags TEXT,
      notes TEXT,
      last_message_at TEXT,
      last_message_preview TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_org ON crm_leads(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_stage ON crm_leads(stage)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_guest ON crm_leads(guest_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_reservation ON crm_leads(reservation_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_last_msg ON crm_leads(last_message_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_email ON crm_leads(email)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_phone ON crm_leads(phone)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_leads_external ON crm_leads(external_booking_id)');

  // --- Migration: add country/nationality to crm_leads for lead-guest parity ---
  const leadCols = database.prepare("PRAGMA table_info(crm_leads)").all().map((c: any) => c.name);
  if (!leadCols.includes('country')) {
    try { database.exec("ALTER TABLE crm_leads ADD COLUMN country TEXT"); } catch { /* */ }
  }
  if (!leadCols.includes('nationality')) {
    try { database.exec("ALTER TABLE crm_leads ADD COLUMN nationality TEXT"); } catch { /* */ }
  }
  if (!leadCols.includes('language')) {
    try { database.exec("ALTER TABLE crm_leads ADD COLUMN language TEXT"); } catch { /* */ }
  }

  // --- Migration: add whatsapp to guests for sync with leads ---
  const guestCols2 = database.prepare("PRAGMA table_info(guests)").all().map((c: any) => c.name);
  if (!guestCols2.includes('whatsapp')) {
    try { database.exec("ALTER TABLE guests ADD COLUMN whatsapp TEXT"); } catch { /* */ }
  }
  if (!guestCols2.includes('language')) {
    try { database.exec("ALTER TABLE guests ADD COLUMN language TEXT"); } catch { /* */ }
  }

  // --- Migration: create settings table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // --- Migration: create crm_conversations table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_conversations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      guest_id TEXT REFERENCES guests(id),
      reservation_id TEXT REFERENCES reservations(id),
      subject TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'waiting', 'resolved', 'archived')),
      last_message_at TEXT,
      last_channel TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_conv_lead ON crm_conversations(lead_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_conv_status ON crm_conversations(status)');

  // --- Migration: create crm_messages table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_messages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      conversation_id TEXT NOT NULL REFERENCES crm_conversations(id) ON DELETE CASCADE,
      channel_type TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
      sender_type TEXT NOT NULL CHECK (sender_type IN ('guest', 'staff', 'ai', 'system')),
      sender_id TEXT,
      sender_name TEXT,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text' CHECK (content_type IN ('text', 'image', 'file', 'template', 'system')),
      metadata_json TEXT,
      external_id TEXT,
      is_ai_generated INTEGER NOT NULL DEFAULT 0,
      ai_approved INTEGER NOT NULL DEFAULT 1,
      read_at TEXT,
      delivered_at TEXT,
      status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('draft', 'queued', 'sent', 'delivered', 'read', 'failed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_msg_conv ON crm_messages(conversation_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_msg_created ON crm_messages(created_at)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_msg_channel ON crm_messages(channel_type)');

  // --- Migration: create crm_prompt_configs table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_prompt_configs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      stage TEXT,
      trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'auto', 'stage_change')),
      system_prompt TEXT NOT NULL,
      context_instructions TEXT,
      variables TEXT,
      temperature REAL NOT NULL DEFAULT 0.7,
      model TEXT NOT NULL DEFAULT 'gpt-4o',
      is_active INTEGER NOT NULL DEFAULT 1,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_prompts_org ON crm_prompt_configs(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_prompts_stage ON crm_prompt_configs(stage)');

  // --- Migration: create crm_stage_history table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_stage_history (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      lead_id TEXT NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
      from_stage TEXT,
      to_stage TEXT NOT NULL,
      changed_by TEXT REFERENCES app_users(id),
      trigger TEXT NOT NULL DEFAULT 'manual',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_stage_lead ON crm_stage_history(lead_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_stage_created ON crm_stage_history(created_at)');

  // --- Migration: create crm_ai_training table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_ai_training (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      conversation_id TEXT REFERENCES crm_conversations(id),
      guest_message TEXT NOT NULL,
      guest_language TEXT,
      lead_stage TEXT,
      guest_context_json TEXT,
      ai_draft TEXT NOT NULL,
      final_response TEXT,
      was_approved INTEGER NOT NULL DEFAULT 0,
      was_edited INTEGER NOT NULL DEFAULT 0,
      edit_reason TEXT,
      rating INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_training_approved ON crm_ai_training(was_approved)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_training_stage ON crm_ai_training(lead_stage)');

  // --- Migration: create crm_automation_rules table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_automation_rules (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      trigger_stage TEXT,
      trigger_condition TEXT,
      action_type TEXT NOT NULL CHECK (action_type IN ('send_message', 'change_stage', 'notify_admin', 'send_tg')),
      action_config TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_auto_org ON crm_automation_rules(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_auto_stage ON crm_automation_rules(trigger_stage)');

  // --- Migration: crm_knowledge_base — AI training knowledge articles ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_knowledge_base (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      topic TEXT NOT NULL,
      keywords TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      language TEXT DEFAULT 'all',
      is_active INTEGER NOT NULL DEFAULT 1,
      usage_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_kb_org ON crm_knowledge_base(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_kb_category ON crm_knowledge_base(category)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_crm_kb_active ON crm_knowledge_base(is_active)');

  // ═══════════════════════════════════════════════════════
  // GUEST PAGE V3 — BATCH 3 MIGRATIONS
  // ═══════════════════════════════════════════════════════

  // --- Migration: property_guest_config (shared property-level settings) ---
  const pgcExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='property_guest_config'"
  ).get();
  if (!pgcExists) {
    database.exec(`
      CREATE TABLE property_guest_config (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        property_id TEXT NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,
        wifi_network TEXT DEFAULT 'ALiSiO_Guest',
        wifi_password TEXT DEFAULT 'ALiSiO2026!',
        restaurant_name TEXT DEFAULT 'Ресторан ALiSiO',
        restaurant_hours TEXT,
        restaurant_menu_url TEXT,
        rules TEXT,
        useful_info TEXT,
        faq_items TEXT,
        maps_url TEXT DEFAULT 'https://maps.app.goo.gl/WH2CKhTydtDx9EBe7',
        territory_map_url TEXT,
        pets_policy TEXT DEFAULT 'welcome',
        parking_info TEXT DEFAULT 'Free parking at the entrance',
        video_guide_url TEXT,
        emergency_phone TEXT,
        weather_lat REAL,
        weather_lon REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Seed from first existing guest_page_config
    try {
      const firstCfg = database.prepare('SELECT * FROM guest_page_config LIMIT 1').get() as any;
      const props = database.prepare('SELECT id FROM properties').all() as any[];
      if (firstCfg && props.length > 0) {
        for (const p of props) {
          database.prepare(`
            INSERT INTO property_guest_config (property_id, wifi_network, wifi_password, restaurant_name, restaurant_hours, restaurant_menu_url, rules, useful_info, faq_items, maps_url, territory_map_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(p.id, firstCfg.wifi_network, firstCfg.wifi_password, firstCfg.restaurant_name, firstCfg.restaurant_hours, firstCfg.restaurant_menu_url, firstCfg.rules, firstCfg.useful_info, firstCfg.faq_items, firstCfg.maps_url, firstCfg.territory_map_url);
        }
      }
    } catch { /* seed silently */ }
    console.log('[DB] Created property_guest_config table');
  }

  // --- Migration: guest_chat_messages ---
  const gcmExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='guest_chat_messages'"
  ).get();
  if (!gcmExists) {
    database.exec(`
      CREATE TABLE guest_chat_messages (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
        sender TEXT NOT NULL CHECK (sender IN ('guest', 'host', 'system')),
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_gcm_res ON guest_chat_messages(reservation_id)');
    console.log('[DB] Created guest_chat_messages table');
  }

  // --- Migration: add pets_policy, entry_photo_url to guest_page_config ---
  try {
    const gpcCols2 = database.prepare("PRAGMA table_info(guest_page_config)").all().map((c: any) => c.name);
    if (!gpcCols2.includes('pets_policy')) {
      database.exec("ALTER TABLE guest_page_config ADD COLUMN pets_policy TEXT DEFAULT 'welcome'");
    }
    if (!gpcCols2.includes('entry_photo_url')) {
      database.exec("ALTER TABLE guest_page_config ADD COLUMN entry_photo_url TEXT");
    }
  } catch { /* ok */ }

  // --- Migration: content_translations table (pre-computed translations) ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS content_translations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text_hash TEXT NOT NULL,
        source_text TEXT NOT NULL,
        lang TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(text_hash, lang)
      )
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_ct_hash ON content_translations(text_hash)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_ct_lang ON content_translations(text_hash, lang)');
  } catch { /* ok */ }

  // ═══════════════════════════════════════════════════════
  // CRITICAL FIX: Recreate payments table with extended CHECK constraints
  // Old table rejected type='service' (Teya) and method='booking_platform' (Hostex)
  // causing INSERT OR IGNORE to silently discard payment records
  // Skipped after PR #6 — payments table no longer exists, replaced by fin_operations.
  // ═══════════════════════════════════════════════════════
  if (!finOpsMigrated) try {
    // Check if payments table has restrictive CHECK by trying an insert with 'service' type
    const testId = '_check_test_' + Date.now();
    const testRes = database.prepare("SELECT id FROM reservations LIMIT 1").get() as any;
    if (testRes) {
      try {
        database.prepare(
          "INSERT INTO payments (id, reservation_id, amount, currency, method, type, status) VALUES (?, ?, 0, 'CZK', 'online', 'service', 'pending')"
        ).run(testId, testRes.id);
        // If it succeeded, constraint is already OK — clean up
        database.prepare("DELETE FROM payments WHERE id = ?").run(testId);
      } catch {
        // CHECK constraint blocked 'service' type — need to recreate table
        console.log('[DB] Recreating payments table with extended CHECK constraints...');
        database.exec(`
          CREATE TABLE payments_new (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
            amount REAL NOT NULL,
            currency TEXT NOT NULL DEFAULT 'CZK',
            method TEXT NOT NULL CHECK (method IN ('cash', 'card', 'bank_transfer', 'invoice', 'online', 'booking_platform')),
            type TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'partial', 'refund', 'service')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
            paid_at TEXT,
            notes TEXT,
            auto_created INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);
        // Copy all existing data
        const cols = (database.prepare("PRAGMA table_info(payments)").all() as any[]).map((c: any) => c.name);
        const hasAutoCreated = cols.includes('auto_created');
        const selectCols = hasAutoCreated
          ? 'id, reservation_id, amount, currency, method, type, status, paid_at, notes, auto_created, created_at'
          : 'id, reservation_id, amount, currency, method, type, status, paid_at, notes, 0, created_at';
        database.exec(`INSERT INTO payments_new (id, reservation_id, amount, currency, method, type, status, paid_at, notes, auto_created, created_at) SELECT ${selectCols} FROM payments`);
        database.exec('DROP TABLE payments');
        database.exec('ALTER TABLE payments_new RENAME TO payments');
        console.log('[DB] Payments table recreated with service/booking_platform support');
      }
    }
  } catch (e: any) {
    console.error('[DB] Payments migration error:', e.message);
  }

  // ═══════════════════════════════════════════════════════
  // BOOKING SITES MODULE
  // ═══════════════════════════════════════════════════════

  // --- Migration: create booking_sites table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS booking_sites (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id   TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name          TEXT NOT NULL,
      slug          TEXT,
      site_url      TEXT,
      type          TEXT NOT NULL DEFAULT 'widget'
                      CHECK (type IN ('widget', 'self-hosted')),
      currency      TEXT NOT NULL DEFAULT 'CZK',
      status        TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'paused', 'deleted')),
      design_config TEXT,
      widget_config TEXT,
      created_by    TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_booking_sites_property ON booking_sites(property_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_booking_sites_status ON booking_sites(status)');

  // --- Migration: add slug and site_url to booking_sites if missing ---
  try {
    const bsCols = database.prepare("PRAGMA table_info(booking_sites)").all().map((c: any) => c.name);
    if (!bsCols.includes('slug')) {
      database.exec("ALTER TABLE booking_sites ADD COLUMN slug TEXT");
      // Generate slugs for existing sites
      const sites = database.prepare("SELECT id, name FROM booking_sites").all() as any[];
      const upd = database.prepare("UPDATE booking_sites SET slug = ? WHERE id = ?");
      for (const s of sites) {
        const slug = s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        upd.run(slug || s.id, s.id);
      }
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_sites_slug ON booking_sites(slug)");
      console.log('[DB] Added slug to booking_sites');
    } else {
      // For fresh DBs or already migrated ones, just ensure index exists
      database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_sites_slug ON booking_sites(slug)");
    }
    if (!bsCols.includes('site_url')) {
      database.exec("ALTER TABLE booking_sites ADD COLUMN site_url TEXT");
      console.log('[DB] Added site_url to booking_sites');
    }
    if (!bsCols.includes('payment_config')) {
      database.exec("ALTER TABLE booking_sites ADD COLUMN payment_config TEXT");
      console.log('[DB] Added payment_config to booking_sites');
    }
  } catch (e: any) {
    console.log('[DB] booking_sites extension note:', e.message);
  }

  // --- Migration: create site_listings table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_listings (
      id                 TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id            TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
      unit_id            TEXT REFERENCES units(id)      ON DELETE CASCADE,
      unit_type_id       TEXT REFERENCES unit_types(id) ON DELETE CASCADE,
      price_override     REAL,
      rules_override     TEXT,
      has_rules_override INTEGER NOT NULL DEFAULT 0,
      max_inventory      INTEGER,
      external_url       TEXT,
      sort_order         INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_site_listings_site ON site_listings(site_id)');
  try { database.exec('ALTER TABLE site_listings ADD COLUMN thank_you_url TEXT'); } catch { /* already exists */ }
  try { database.exec('ALTER TABLE site_listings ADD COLUMN default_lang TEXT'); } catch { /* already exists */ }

  // --- Migration: create site_rate_plans table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_rate_plans (
      id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id                 TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
      name                    TEXT NOT NULL,
      is_default              INTEGER NOT NULL DEFAULT 0,
      cancellation_policy     TEXT NOT NULL DEFAULT 'non_refundable'
                                CHECK (cancellation_policy IN ('non_refundable', 'full_refund', 'flexible')),
      payment_schedule        TEXT NOT NULL DEFAULT '[{"percent": 100, "trigger": "on_booking"}]',
      meals_included          TEXT NOT NULL DEFAULT '[]',
      min_days_before_checkin INTEGER NOT NULL DEFAULT 0,
      same_day_cutoff_hour    INTEGER,
      min_stay                INTEGER NOT NULL DEFAULT 1,
      max_stay                INTEGER NOT NULL DEFAULT 999,
      pricing_mode            TEXT NOT NULL DEFAULT 'independent'
                                CHECK (pricing_mode IN ('independent', 'dependent')),
      applied_listings        TEXT NOT NULL DEFAULT '[]',
      is_active               INTEGER NOT NULL DEFAULT 1,
      created_at              TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_site_rate_plans_site ON site_rate_plans(site_id)');

  // --- Migration: add pricing dependent fields to site_rate_plans ---
  try { database.exec('ALTER TABLE site_rate_plans ADD COLUMN pricing_modifier_percent REAL'); } catch { /* */ }
  try { database.exec("ALTER TABLE site_rate_plans ADD COLUMN pricing_modifier_type TEXT DEFAULT 'less'"); } catch { /* */ }
  try { database.exec('ALTER TABLE site_rate_plans ADD COLUMN derived_from_plan_id TEXT'); } catch { /* */ }
  try { database.exec('ALTER TABLE site_rate_plans ADD COLUMN valid_weekdays TEXT'); } catch { /* */ }


  // --- Migration: create site_services table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_services (
      id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id        TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
      service_id     TEXT NOT NULL REFERENCES additional_services(id) ON DELETE CASCADE,
      is_enabled     INTEGER NOT NULL DEFAULT 1,
      price_override REAL,
      sort_order     INTEGER NOT NULL DEFAULT 0,
      photo_override TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(site_id, service_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_site_services_site ON site_services(site_id)');

  // --- Migration: site_id columns for related tables ---
  try { database.exec('ALTER TABLE payment_accounts ADD COLUMN site_id TEXT REFERENCES booking_sites(id) ON DELETE SET NULL'); } catch { /* */ }
  try { database.exec('ALTER TABLE payment_accounts ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0'); } catch { /* */ }

  try { database.exec('ALTER TABLE coupons ADD COLUMN site_id TEXT REFERENCES booking_sites(id) ON DELETE SET NULL'); } catch { /* */ }
  try { database.exec('ALTER TABLE coupons ADD COLUMN redemption_limit INTEGER'); } catch { /* */ }
  try { database.exec('ALTER TABLE coupons ADD COLUMN applied_listings TEXT'); } catch { /* */ }
  try { database.exec('ALTER TABLE coupons ADD COLUMN max_nights INTEGER'); } catch { /* */ }
  try { database.exec('ALTER TABLE coupons ADD COLUMN allowed_days TEXT'); } catch { /* */ }
  try { database.exec("ALTER TABLE coupons ADD COLUMN applies_to TEXT DEFAULT 'services'"); } catch { /* */ }

  try { database.exec('ALTER TABLE booking_service_orders ADD COLUMN site_id TEXT REFERENCES booking_sites(id) ON DELETE SET NULL'); } catch { /* */ }
  try { database.exec('ALTER TABLE site_services ADD COLUMN photo_override TEXT'); } catch { /* */ }
  console.log('[DB] Booking Sites module tables ready');

  // --- Migration: add allowed_domains to booking_sites ---
  try {
    const bsSiteCols = database.prepare("PRAGMA table_info(booking_sites)").all().map((c: any) => c.name);
    if (!bsSiteCols.includes('allowed_domains')) {
      database.exec("ALTER TABLE booking_sites ADD COLUMN allowed_domains TEXT");
      console.log('[DB] Added allowed_domains to booking_sites');
    }
  } catch (e: any) { console.log('[DB] allowed_domains migration note:', e.message); }

  // --- Migration: create site_capture_scripts table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_capture_scripts (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id     TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
      name        TEXT NOT NULL DEFAULT 'Основний скрипт',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_capture_scripts_site ON site_capture_scripts(site_id)');

  // --- Migration: create site_incoming_leads table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS site_incoming_leads (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id     TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
      script_id   TEXT REFERENCES site_capture_scripts(id) ON DELETE SET NULL,
      full_name   TEXT,
      email       TEXT,
      phone       TEXT,
      message     TEXT,
      status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
      source_url  TEXT,
      raw_data    TEXT,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_incoming_leads_site ON site_incoming_leads(site_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_incoming_leads_status ON site_incoming_leads(status)');
  console.log('[DB] Site Form Capture tables ready');


  // --- Migration: create invoices table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      invoice_number TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL DEFAULT (datetime('now')),
      due_date TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CZK',
      status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_invoices_reservation ON invoices(reservation_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_invoices_issued ON invoices(issued_at)');

  // --- Migration: per-channel invoice series + monthly period locking ---
  // Additive only — existing invoices keep their invoice_number; they default to
  // the HOUSE series and remain editable.
  try {
    const invCols = (database.prepare('PRAGMA table_info(invoices)').all() as any[]).map((c: any) => c.name);
    if (!invCols.includes('series')) database.exec("ALTER TABLE invoices ADD COLUMN series TEXT DEFAULT 'HOUSE'");
    if (!invCols.includes('period')) database.exec('ALTER TABLE invoices ADD COLUMN period TEXT'); // YYYY-MM of the document date
    if (!invCols.includes('locked')) database.exec('ALTER TABLE invoices ADD COLUMN locked INTEGER NOT NULL DEFAULT 0');

    database.exec(`
      CREATE TABLE IF NOT EXISTS invoice_counters (
        series  TEXT NOT NULL,
        year    INTEGER NOT NULL,
        last_no INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (series, year)
      )
    `);
    database.exec(`
      CREATE TABLE IF NOT EXISTS invoice_periods (
        series    TEXT NOT NULL,
        month     TEXT NOT NULL,
        status    TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked')),
        locked_at TEXT,
        PRIMARY KEY (series, month)
      )
    `);

    // Seed the HOUSE counter from existing plain "YYYY-NNN" numbers so new
    // allocations never collide with legacy invoices.
    const yr = new Date().getFullYear();
    const seed = database.prepare(
      "SELECT MAX(CAST(substr(invoice_number, instr(invoice_number,'-')+1) AS INTEGER)) AS mx " +
      "FROM invoices WHERE invoice_number LIKE ?"
    ).get(`${yr}-%`) as { mx: number | null } | undefined;
    if (seed?.mx) {
      database.prepare(
        "INSERT INTO invoice_counters (series, year, last_no) VALUES ('HOUSE', ?, ?) " +
        "ON CONFLICT(series, year) DO UPDATE SET last_no = MAX(last_no, excluded.last_no)"
      ).run(yr, seed.mx);
    }
  } catch (e: any) {
    console.error('[db] invoice series/lock migration:', e.message);
  }

  // --- Migration: invoice confirmation (only Teya/cash-confirmed invoices count) ---
  // An invoice is "confirmed" when backed by a real payment: Teya webhook, Teya
  // CSV/POSLink reconciliation, an OTA statement, or operator-marked cash. A bare
  // "mark paid" in PMS is NOT confirmed and is excluded from the monthly ISDOC
  // export until reconciled. Existing invoices are grandfathered as confirmed so
  // historical exports are unaffected.
  try {
    const invCols2 = (database.prepare('PRAGMA table_info(invoices)').all() as any[]).map((c: any) => c.name);
    if (!invCols2.includes('confirmed')) {
      database.exec('ALTER TABLE invoices ADD COLUMN confirmed INTEGER NOT NULL DEFAULT 0');
      database.exec("ALTER TABLE invoices ADD COLUMN confirmation_source TEXT");
      // Grandfather every pre-existing invoice as confirmed.
      database.exec("UPDATE invoices SET confirmed = 1, confirmation_source = 'legacy' WHERE confirmation_source IS NULL");
    } else if (!invCols2.includes('confirmation_source')) {
      database.exec("ALTER TABLE invoices ADD COLUMN confirmation_source TEXT");
    }
  } catch (e: any) {
    console.error('[db] invoice confirmation migration:', e.message);
  }

  // --- Migration: camping-specific fields in reservations ---
  try {
    const resCols = (database.prepare("PRAGMA table_info(reservations)").all() as any[]).map((c: any) => c.name);
    if (!resCols.includes('camping_vehicle_type'))
      database.exec("ALTER TABLE reservations ADD COLUMN camping_vehicle_type TEXT");
    if (!resCols.includes('camping_tent_type'))
      database.exec("ALTER TABLE reservations ADD COLUMN camping_tent_type TEXT");
    if (!resCols.includes('camping_electricity'))
      database.exec("ALTER TABLE reservations ADD COLUMN camping_electricity INTEGER DEFAULT 0");
    if (!resCols.includes('camping_pets'))
      database.exec("ALTER TABLE reservations ADD COLUMN camping_pets TEXT");
    if (!resCols.includes('camping_notes'))
      database.exec("ALTER TABLE reservations ADD COLUMN camping_notes TEXT");
    // deposit / prepayment tracking
    if (!resCols.includes('deposit_amount'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_amount INTEGER DEFAULT 0");
    if (!resCols.includes('deposit_status'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_status TEXT DEFAULT 'none'");
    if (!resCols.includes('deposit_session_id'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_session_id TEXT");
    if (!resCols.includes('deposit_session_url'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_session_url TEXT");
    if (!resCols.includes('deposit_session_expires_at'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_session_expires_at TEXT");
    if (!resCols.includes('deposit_paid_at'))
      database.exec("ALTER TABLE reservations ADD COLUMN deposit_paid_at TEXT");
    if (!resCols.includes('group_lead_id'))
      database.exec("ALTER TABLE reservations ADD COLUMN group_lead_id TEXT");
    database.exec('CREATE INDEX IF NOT EXISTS idx_reservations_deposit_session ON reservations(deposit_session_id)');
    // Invoice-to-company override: when invoice_company_name is set, the
    // generated faktura uses these fields instead of the personal guest data
    // for the Odberatel block. Other reservations keep rendering as physical-
    // person invoices.
    if (!resCols.includes('invoice_company_name'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_name TEXT");
    if (!resCols.includes('invoice_company_ico'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_ico TEXT");
    if (!resCols.includes('invoice_company_dic'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_dic TEXT");
    if (!resCols.includes('invoice_company_address'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_address TEXT");
    if (!resCols.includes('invoice_company_city'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_city TEXT");
    if (!resCols.includes('invoice_company_country'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_country TEXT");
    if (!resCols.includes('invoice_company_email'))
      database.exec("ALTER TABLE reservations ADD COLUMN invoice_company_email TEXT");
    console.log('[DB] Camping + deposit + invoice-company columns migrated');
    // Waitlist table
    database.exec(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        site_id TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
        unit_id TEXT REFERENCES units(id) ON DELETE CASCADE,
        check_in TEXT NOT NULL,
        check_out TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        name TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  } catch (e: any) {
    console.error('[DB] Camping migration error:', e.message);
  }

  // --- Migration: create cart_events table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS cart_events (
      id                    TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id        TEXT REFERENCES reservations(id) ON DELETE SET NULL,
      guest_token           TEXT NOT NULL,
      service_id            TEXT,
      event_type            TEXT NOT NULL CHECK (event_type IN ('add','remove','pay_now','checkout','abandon')),
      quantity              INTEGER DEFAULT 1,
      phase                 TEXT,
      cart_total            REAL,
      items_json            TEXT,
      abandon_notified_at   TEXT,
      created_at            TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_cart_events_token ON cart_events(guest_token)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_cart_events_type ON cart_events(event_type, abandon_notified_at)');

  // --- Migration: create booking_drafts table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS booking_drafts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      session_id TEXT UNIQUE,
      accommodation_type TEXT,
      unit_type TEXT,
      check_in TEXT,
      check_out TEXT,
      adults INTEGER DEFAULT 1,
      children INTEGER DEFAULT 0,
      extras TEXT,
      options TEXT,
      guest_name TEXT,
      guest_email TEXT,
      guest_phone TEXT,
      total_price REAL DEFAULT 0,
      deposit_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_payment', 'paid', 'expired', 'cancelled')),
      teya_session_id TEXT,
      reservation_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Clean expired drafts older than 24h
  try { database.exec("DELETE FROM booking_drafts WHERE status = 'draft' AND created_at < datetime('now', '-24 hours')"); } catch { /* */ }

  // --- Migration: add available_in_widget to additional_services ---
  try {
    const asCols = database.prepare("PRAGMA table_info(additional_services)").all().map((c: any) => c.name);
    if (!asCols.includes('available_in_widget')) {
      database.exec("ALTER TABLE additional_services ADD COLUMN available_in_widget INTEGER DEFAULT 0");
      console.log('[DB] Added available_in_widget to additional_services');
    }
  } catch { /* */ }

  // --- Migration: add service_date + payment columns to service_orders ---
  try {
    const soCols = database.prepare("PRAGMA table_info(service_orders)").all().map((c: any) => c.name);
    if (!soCols.includes('service_date')) {
      database.exec("ALTER TABLE service_orders ADD COLUMN service_date TEXT");
      // Backfill: set service_date = check_in for existing orders
      database.exec(`
        UPDATE service_orders
        SET service_date = (
          SELECT r.check_in FROM reservations r WHERE r.id = service_orders.reservation_id
        )
        WHERE service_date IS NULL
      `);
      console.log('[DB] Added service_date to service_orders + backfilled from check_in');
    }
    if (!soCols.includes('payment_id'))
      database.exec("ALTER TABLE service_orders ADD COLUMN payment_id TEXT");
    if (!soCols.includes('payment_status'))
      database.exec("ALTER TABLE service_orders ADD COLUMN payment_status TEXT DEFAULT 'none'");
  } catch { /* */ }

  // --- Migration: create widget_price_list table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS widget_price_list (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      category TEXT NOT NULL CHECK (category IN ('glamping', 'buildings', 'camping')),
      item_code TEXT NOT NULL UNIQUE,
      item_name TEXT NOT NULL,
      rate_standard REAL NOT NULL DEFAULT 0,
      rate_holiday REAL,
      rate_side_season REAL,
      unit_label TEXT NOT NULL DEFAULT 'night',
      notes TEXT,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  // Seed default prices if table is empty
  try {
    const plCount = (database.prepare('SELECT COUNT(*) as c FROM widget_price_list').get() as any).c;
    if (plCount === 0) {
      const ins = database.prepare(`INSERT INTO widget_price_list (id, category, item_code, item_name, rate_standard, rate_holiday, rate_side_season, unit_label, notes, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      const seed = database.transaction(() => {
        // Glamping
        ins.run('wpl_tiny_std', 'glamping', 'tiny_house', 'Tiny House', 3900, 5500, null, 'night', 'Max 2 guests, price per house', 1);
        ins.run('wpl_barn_std', 'glamping', 'barn_house', 'Barn House', 5000, 7000, null, 'night', 'Max 6 guests, price per house', 2);
        // Buildings — Budova D
        ins.run('wpl_bd_bed1', 'buildings', 'budova_d_bed_1night', 'Budova D — 1 night bed', 420, 520, null, 'bed/night', '48 beds total', 10);
        ins.run('wpl_bd_bed2', 'buildings', 'budova_d_bed_2plus', 'Budova D — 2+ nights bed', 390, 470, null, 'bed/night', '48 beds total', 11);
        ins.run('wpl_bd_room', 'buildings', 'budova_d_room', 'Budova D — Room', 690, null, null, 'room/night', 'Holiday = individual quote', 12);
        // Buildings — Budova F
        ins.run('wpl_bf_bed1', 'buildings', 'budova_f_bed_1night', 'Budova F — 1 night bed', 550, 730, null, 'bed/night', '51 beds total', 20);
        ins.run('wpl_bf_bed2', 'buildings', 'budova_f_bed_2plus', 'Budova F — 2+ nights bed', 490, 680, null, 'bed/night', '51 beds total', 21);
        ins.run('wpl_bf_room', 'buildings', 'budova_f_room', 'Budova F — Room', 860, null, null, 'room/night', 'Holiday = individual quote', 22);
        // Camping
        ins.run('wpl_c_stent', 'camping', 'small_tent', 'Small tent (up to 3×3m)', 100, null, 80, 'night', null, 30);
        ins.run('wpl_c_ltent', 'camping', 'large_tent', 'Large tent (over 3×3m)', 150, null, 120, 'night', null, 31);
        ins.run('wpl_c_car', 'camping', 'car', 'Car', 100, null, null, 'night', null, 32);
        ins.run('wpl_c_minibus', 'camping', 'minibus', 'Minibus / Van', 175, null, null, 'night', null, 33);
        ins.run('wpl_c_caravan', 'camping', 'caravan', 'Caravan', 200, null, null, 'night', null, 34);
        ins.run('wpl_c_motorhome', 'camping', 'motorhome', 'Motorhome', 300, null, null, 'night', null, 35);
        ins.run('wpl_c_moto', 'camping', 'motorcycle', 'Motorcycle', 50, null, null, 'night', null, 36);
        ins.run('wpl_c_adult', 'camping', 'adult_person', 'Adult', 150, null, 170, 'person/night', 'Tourist tax +25 Kč', 40);
        ins.run('wpl_c_child', 'camping', 'child_person', 'Child (3-15)', 100, null, 100, 'person/night', 'Under 3 free', 41);
        ins.run('wpl_c_elec', 'camping', 'electricity', 'Electricity hookup', 120, null, null, 'night', null, 50);
        ins.run('wpl_c_pet', 'camping', 'pet', 'Pet', 50, null, null, 'animal/night', null, 51);
        ins.run('wpl_c_mhsvc', 'camping', 'motorhome_service', 'Motorhome cassette service', 100, null, null, 'once', null, 52);
        ins.run('wpl_c_tax', 'camping', 'tourist_tax', 'Tourist tax', 25, null, null, 'adult/night', 'Mandatory', 60);
      });
      seed();
      console.log('[DB] Seeded widget_price_list with default rates');
    }
  } catch (e: any) { console.error('[DB] widget_price_list seed error:', e.message); }

  // --- Migration: add source column to guests (for analytics) ---
  try {
    const gCols = database.prepare('PRAGMA table_info(guests)').all().map((c: any) => c.name);
    if (!gCols.includes('source')) {
      database.exec("ALTER TABLE guests ADD COLUMN source TEXT DEFAULT 'direct'");
      console.log('[DB] Added source column to guests');
    }
  } catch { /* */ }

  // --- Migration: add guest_page_token to booking_drafts ---
  try {
    const bdCols = database.prepare('PRAGMA table_info(booking_drafts)').all().map((c: any) => c.name);
    if (!bdCols.includes('guest_page_token')) {
      database.exec('ALTER TABLE booking_drafts ADD COLUMN guest_page_token TEXT');
      console.log('[DB] Added guest_page_token to booking_drafts');
    }
  } catch { /* */ }

  // ═══════════════════════════════════════════════════════════════════
  // PR #15: Clearing accounts + channel receivables
  // ═══════════════════════════════════════════════════════════════════
  // Adds 'clearing' to finance_accounts.type CHECK constraint, seeds
  // default clearing accounts (Booking CZK/EUR, Airbnb EUR, VRBO EUR),
  // creates fin_channel_receivables to track expected payouts per
  // reservation, and backfills receivables for existing channel-sourced
  // reservations.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const acctCols = database.prepare("PRAGMA table_info(finance_accounts)").all() as { name: string }[];
    if (acctCols.length > 0) {
      // Probe current CHECK constraint by attempting insert with a clearing-typed dummy.
      // Use sqlite_master to read the actual schema text.
      const schemaRow = database.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='finance_accounts'"
      ).get() as { sql: string } | undefined;
      const hasClearingType = schemaRow?.sql?.includes("'clearing'") ?? false;

      if (!hasClearingType) {
        // Clean up any orphan from a prior failed swap attempt (PR #18 hotfix:
        // first run failed at DROP TABLE because of FK references from
        // fin_operations.account_from_id/account_to_id, leaving the new table
        // behind. CREATE then errors with "table already exists" on retry.)
        database.exec("DROP TABLE IF EXISTS finance_accounts_pr15");

        // Disable FK enforcement during swap so DROP TABLE doesn't fail on
        // referenced rows. References in dependent tables (fin_operations,
        // bank_transactions) auto-migrate to the renamed table because they
        // store account_id strings, not row pointers.
        database.pragma('foreign_keys = OFF');
        try {
          database.exec(`
            CREATE TABLE finance_accounts_pr15 (
              id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
              organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              name TEXT NOT NULL,
              type TEXT NOT NULL DEFAULT 'cash' CHECK (type IN ('cash', 'bank', 'card', 'investment', 'clearing', 'other')),
              currency TEXT NOT NULL DEFAULT 'CZK',
              initial_balance REAL NOT NULL DEFAULT 0,
              credit_limit REAL,
              iban TEXT,
              color TEXT DEFAULT '#6366f1',
              is_active INTEGER NOT NULL DEFAULT 1,
              sort_order INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
            INSERT INTO finance_accounts_pr15
              (id, organization_id, name, type, currency, initial_balance, credit_limit, iban, color, is_active, sort_order, created_at)
            SELECT id, organization_id, name, type, currency, initial_balance, credit_limit, iban, color, is_active, sort_order, created_at
            FROM finance_accounts;
            DROP TABLE finance_accounts;
            ALTER TABLE finance_accounts_pr15 RENAME TO finance_accounts;
            CREATE INDEX IF NOT EXISTS idx_fin_acct_org ON finance_accounts(organization_id);
            CREATE INDEX IF NOT EXISTS idx_fin_acct_iban ON finance_accounts(iban);
          `);
        } finally {
          database.pragma('foreign_keys = ON');
        }
        console.log('[DB] PR #15: rebuilt finance_accounts to allow clearing type');
      }
    }
  } catch (e: any) { console.log('[DB] PR #15 finance_accounts CHECK migration:', e.message); }

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_channel_receivables (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      clearing_account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
      channel_source TEXT NOT NULL,
      external_reservation_id TEXT,
      gross_amount REAL NOT NULL,
      expected_commission REAL NOT NULL DEFAULT 0,
      expected_net REAL NOT NULL,
      actual_commission REAL,
      actual_net REAL,
      currency TEXT NOT NULL,
      check_in TEXT NOT NULL,
      check_out TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'in_statement', 'paid', 'cancelled')),
      statement_payout_id TEXT,
      statement_payout_date TEXT,
      paid_operation_id TEXT REFERENCES fin_operations(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (reservation_id, clearing_account_id)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_org ON fin_channel_receivables(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_status ON fin_channel_receivables(status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_clearing ON fin_channel_receivables(clearing_account_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_extid ON fin_channel_receivables(external_reservation_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_payoutid ON fin_channel_receivables(statement_payout_id)');

  // Seed default clearing accounts (one-time, idempotent via name+org check)
  try {
    const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
    if (orgRow) {
      const orgId = orgRow.id;
      const seeds = [
        { name: 'Booking.com (CZK)', currency: 'CZK', color: '#003580', sort_order: 901 },
        { name: 'Booking.com (EUR)', currency: 'EUR', color: '#003580', sort_order: 902 },
        { name: 'Airbnb (EUR)', currency: 'EUR', color: '#FF5A5F', sort_order: 903 },
        { name: 'VRBO (EUR)', currency: 'EUR', color: '#206A92', sort_order: 904 },
      ];
      const insertClearing = database.prepare(`
        INSERT INTO finance_accounts (id, organization_id, name, type, currency, color, sort_order, is_active)
        VALUES (?, ?, ?, 'clearing', ?, ?, ?, 1)
      `);
      const checkExists = database.prepare(
        "SELECT id FROM finance_accounts WHERE organization_id = ? AND name = ? AND type = 'clearing'"
      );
      let seeded = 0;
      for (const s of seeds) {
        if (checkExists.get(orgId, s.name)) continue;
        const id = `acct_clr_${s.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        insertClearing.run(id, orgId, s.name, s.currency, s.color, s.sort_order);
        seeded++;
      }
      if (seeded > 0) console.log(`[DB] PR #15: seeded ${seeded} clearing accounts`);
    }
  } catch (e: any) { console.log('[DB] PR #15 clearing accounts seed:', e.message); }

  // Finance PR #A (is_pms_signal) was retired in clean-3: all readers are
  // gone, so new databases no longer get the column. Existing databases may
  // still carry it — harmless, ignored everywhere.
  try {
    const cols = database.prepare("PRAGMA table_info(fin_operations)").all() as { name: string }[];
    // PR #C: needs_review flag for ops where the channel→account resolver
    // had to fall back. Surfaces a queue for the admin to triage.
    if (!cols.some((c) => c.name === 'needs_review')) {
      database.exec("ALTER TABLE fin_operations ADD COLUMN needs_review INTEGER NOT NULL DEFAULT 0");
      database.exec("CREATE INDEX IF NOT EXISTS idx_fop_needs_review ON fin_operations(needs_review)");
    }
  } catch (e: any) { console.log('[DB] PR #C fin_operations columns:', e.message); }

  // ═══════════════════════════════════════════════════════════════════
  // PR #36: supabase_id columns on investor tables for idempotent re-import
  // from the InvestFlow Supabase backend. Lets user re-upload CSVs without
  // creating duplicates — second run is a no-op for already-imported rows.
  const addCol = (table: string, col: string, def: string) => {
    try {
      const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === col)) {
        database.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
        database.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_${col} ON ${table}(${col})`);
      }
    } catch (e: any) { console.log(`[DB] PR #36 ${table}.${col} migration:`, e.message); }
  };
  addCol('investors', 'supabase_id', 'TEXT');
  addCol('investor_investments', 'supabase_id', 'TEXT');
  addCol('investor_payouts', 'supabase_id', 'TEXT');
  addCol('property_monthly_metrics', 'supabase_id', 'TEXT');
  addCol('property_monthly_reports', 'supabase_id', 'TEXT');

  // ═══════════════════════════════════════════════════════════════════
  // Cleanup #A: re-introduce unit_id columns on investor tables (the
  // PR #41 columns were not removed when #41 was reverted, but the
  // migration routine was — re-adding here so the schema is explicit and
  // any rows with unit_id IS NULL get name-matched to a real glamping unit
  // on next boot.
  //
  // No code yet reads from these — that comes in cleanup #B.
  // ═══════════════════════════════════════════════════════════════════
  addCol('investor_investments', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE SET NULL');
  addCol('investor_payouts', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE SET NULL');
  addCol('property_monthly_metrics', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE CASCADE');
  addCol('property_monthly_reports', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE CASCADE');
  addCol('property_work_stages', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE CASCADE');
  addCol('investor_property_details', 'unit_id', 'TEXT REFERENCES units(id) ON DELETE CASCADE');

  try {
    const norm = (s: string) => (s || '').toLowerCase()
      .replace(/[іії]/g, 'и').replace(/[єё]/g, 'е').replace(/ґ/g, 'г')
      .replace(/[\s_\-/]/g, '');

    const unitRows = database.prepare(`
      SELECT u.id, u.name FROM units u
      JOIN categories c ON c.id = u.category_id
      WHERE u.is_active = 1 AND c.type = 'glamping'
    `).all() as { id: string; name: string }[];
    const unitByNorm = new Map<string, string>();
    for (const u of unitRows) unitByNorm.set(norm(u.name), u.id);

    const buRows = database.prepare("SELECT id, name FROM business_units").all() as { id: string; name: string }[];
    const buToUnit = new Map<string, string>();
    for (const bu of buRows) {
      const u = unitByNorm.get(norm(bu.name));
      if (u) buToUnit.set(bu.id, u);
    }

    let filled = 0;
    const tables = [
      'investor_investments', 'investor_payouts',
      'property_monthly_metrics', 'property_monthly_reports',
      'property_work_stages', 'investor_property_details',
    ];
    for (const table of tables) {
      const cols = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      if (!cols.some((c) => c.name === 'unit_id') || !cols.some((c) => c.name === 'project_id')) continue;
      const upd = database.prepare(`UPDATE ${table} SET unit_id = ? WHERE project_id = ? AND unit_id IS NULL`);
      for (const [buId, unitId] of buToUnit.entries()) {
        const r = upd.run(unitId, buId);
        filled += r.changes;
      }
    }
    if (filled > 0) console.log(`[DB] Cleanup #A: filled unit_id on ${filled} investor rows by name match`);
  } catch (e: any) { console.log('[DB] Cleanup #A unit_id name-match:', e.message); }

  try {
    database.exec('CREATE INDEX IF NOT EXISTS idx_inv_invest_unit ON investor_investments(unit_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_inv_payouts_unit ON investor_payouts(unit_id)');
  } catch (e: any) { console.log('[DB] Cleanup #A indexes:', e.message); }

  // ═══════════════════════════════════════════════════════════════════
  // Cleanup #C: archive Supabase-imported business_units that are only
  // used by the investor module. These polluted finance reports/budgets
  // because business_units is the finance grouping table and the importer
  // (PR #36/#37) created rows here for each Supabase property.
  //
  // Criteria: id LIKE 'bu_sb_%' AND has at least one investor_investment.
  // We DO NOT delete — just set is_active = 0. Existing fin_operations
  // that reference these rows continue to work; they just disappear from
  // pickers and active project lists. Manually un-archivable via
  // /finance/projects (existing UI).
  //
  // Idempotent — uses fin_system_state key.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const already = database.prepare(
      "SELECT value FROM fin_system_state WHERE key = 'cleanup_c_archived_supabase_bus'"
    ).get() as { value: string } | undefined;
    if (!already) {
      const targets = database.prepare(`
        SELECT bu.id, bu.name FROM business_units bu
        WHERE bu.id LIKE 'bu_sb_%'
          AND bu.is_active = 1
          AND EXISTS (SELECT 1 FROM investor_investments WHERE project_id = bu.id)
      `).all() as { id: string; name: string }[];

      let archived = 0;
      const upd = database.prepare("UPDATE business_units SET is_active = 0 WHERE id = ?");
      for (const t of targets) {
        upd.run(t.id);
        archived++;
      }
      database.prepare(
        "INSERT OR REPLACE INTO fin_system_state (key, value, updated_at) VALUES ('cleanup_c_archived_supabase_bus', ?, datetime('now'))"
      ).run(`archived ${archived}: ${targets.map((t) => t.name).join(', ')}`);
      if (archived > 0) {
        console.log(`[DB] Cleanup #C: archived ${archived} Supabase-imported BUs from finance pickers (${targets.map((t) => t.name).join(', ')})`);
      }
    }
  } catch (e: any) { console.log('[DB] Cleanup #C archive supabase BUs:', e.message); }


  // ═══════════════════════════════════════════════════════════════════
  // Finance PR #G: payment_webhook_log — audit trail for every Teya
  // webhook call. Captures raw payload + outcome so that when a payment
  // doesn't show up in the system, the admin can look here to see whether
  // the webhook was received, parsed, matched to an order, and recorded.
  // ═══════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS payment_webhook_log (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      provider TEXT NOT NULL,
      event_type TEXT,
      session_id TEXT,
      transaction_id TEXT,
      payment_ref TEXT,
      amount REAL,
      currency TEXT,
      result TEXT NOT NULL CHECK (result IN ('recorded','no_match','duplicate','signature_invalid','parse_error','unhandled','error')),
      error_message TEXT,
      reservation_id TEXT,
      operation_id TEXT,
      raw_payload TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_pwl_created ON payment_webhook_log(created_at DESC)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_pwl_payment_ref ON payment_webhook_log(payment_ref)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_pwl_result ON payment_webhook_log(result)');

  // ═══════════════════════════════════════════════════════════════════
  // Cleanup #D: backfill needs_review on legacy null-account ops.
  //
  // The migrations from `income`, `expenses`, `transfers`, `payments`
  // copied rows into fin_operations even when account_id was NULL.
  // createOperationInTx now rejects such rows on creation (see
  // operations.handlers.ts:185-192), but the historical leftovers stay
  // invisible — they don't show up in /finance/reconcile because their
  // needs_review flag was never set, and their balance impact is hidden
  // by PR #signals-filter (the latest fix).
  //
  // Mark them needs_review=1 so the operator sees them in the existing
  // triage queue (`/finance/operations?needs_review=1`) and can either
  // assign an account or archive them. Idempotent: only flips rows
  // currently at 0.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const result = database.prepare(`
      UPDATE fin_operations
      SET needs_review = 1
      WHERE needs_review = 0
        AND (
          (op_type = 'income'   AND account_to_id   IS NULL) OR
          (op_type = 'expense'  AND account_from_id IS NULL) OR
          (op_type = 'transfer' AND (account_from_id IS NULL OR account_to_id IS NULL))
        )
    `).run();
    if (result.changes > 0) {
      console.log(`[DB] Cleanup #D: flagged ${result.changes} legacy null-account fin_operations as needs_review=1`);
    }
  } catch (e: any) {
    console.log('[DB] Cleanup #D needs_review backfill:', e.message);
  }

  // (Cleanup #E lived here — deleted legacy Hostex signal fin_operations.
  //  It served its purpose during clean-2 deploy. Since clean-3 drops the
  //  is_pms_signal column entirely, the migration is a no-op and was
  //  removed to avoid noisy «no such column» errors on every startup.)

  // (Cleanup #H REMOVED 2026-05-28: this ran on EVERY restart and deleted
  //  booking_widget / null-account operations, causing PIN-confirmed
  //  cash payments to vanish after each deploy. One-time job already done.)

  // (Cleanup #G REMOVED 2026-05-28: this ran on EVERY restart and deleted
  //  ALL fin_operations with source IN ('hostex','teia','booking_widget',
  //  'guest_page'). This was the ROOT CAUSE of 22+ missing cash payments —
  //  booking widget PIN confirmations use source='booking_widget', so they
  //  were wiped on every server restart. One-time job already done.)

  // ═══════════════════════════════════════════════════════════════════
  // Cleanup #I: drop dead FK columns on bank_transactions
  //
  // matched_payment_id REFERENCES payments(id) — payments table was DROPed
  // matched_expense_id REFERENCES expenses(id) — expenses table was DROPed
  //
  // Both were superseded by matched_operation_id (REFERENCES fin_operations)
  // in PR #6. The dead FK target makes ANY insert that touches these
  // columns blow up with "no such table: main.payments" (even when the
  // value is NULL — SQLite still validates FK target exists at write time
  // with foreign_keys=ON). bank-inbox-engine inserts into bank_transactions
  // on every parsed PDF row, hence the recurring email-import errors.
  //
  // SQLite ≥3.35 supports ALTER TABLE DROP COLUMN. Wrap in try in case
  // the column was already dropped on a fresh install.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const btxCols = database.prepare("PRAGMA table_info(bank_transactions)").all() as { name: string }[];
    if (btxCols.some((c) => c.name === 'matched_payment_id')) {
      database.exec('ALTER TABLE bank_transactions DROP COLUMN matched_payment_id');
      console.log('[DB] Cleanup #I: dropped dead bank_transactions.matched_payment_id (FK→payments)');
    }
    if (btxCols.some((c) => c.name === 'matched_expense_id')) {
      database.exec('ALTER TABLE bank_transactions DROP COLUMN matched_expense_id');
      console.log('[DB] Cleanup #I: dropped dead bank_transactions.matched_expense_id (FK→expenses)');
    }
  } catch (e: any) {
    console.log('[DB] Cleanup #I drop dead FK columns:', e.message);
  }

  // ═══════════════════════════════════════════════════════════════════
  // (Cleanup #H copy-2 REMOVED 2026-05-28: duplicate of the block above,
  //  same root-cause issue — see comment near line 3586.)

  // (Cleanup #G copy-2 REMOVED 2026-05-28: duplicate of the block above,
  //  same root-cause issue — see comment near line 3586.)

  // ═══════════════════════════════════════════════════════════════════
  // Cleanup #I: drop dead FK columns on bank_transactions
  //
  // matched_payment_id REFERENCES payments(id) — payments table was DROPed
  // matched_expense_id REFERENCES expenses(id) — expenses table was DROPed
  //
  // Both were superseded by matched_operation_id (REFERENCES fin_operations)
  // in PR #6. The dead FK target makes ANY insert that touches these
  // columns blow up with "no such table: main.payments" (even when the
  // value is NULL — SQLite still validates FK target exists at write time
  // with foreign_keys=ON). bank-inbox-engine inserts into bank_transactions
  // on every parsed PDF row, hence the recurring email-import errors.
  //
  // SQLite ≥3.35 supports ALTER TABLE DROP COLUMN. Wrap in try in case
  // the column was already dropped on a fresh install.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const btxCols = database.prepare("PRAGMA table_info(bank_transactions)").all() as { name: string }[];
    if (btxCols.some((c) => c.name === 'matched_payment_id')) {
      database.exec('ALTER TABLE bank_transactions DROP COLUMN matched_payment_id');
      console.log('[DB] Cleanup #I: dropped dead bank_transactions.matched_payment_id (FK→payments)');
    }
    if (btxCols.some((c) => c.name === 'matched_expense_id')) {
      database.exec('ALTER TABLE bank_transactions DROP COLUMN matched_expense_id');
      console.log('[DB] Cleanup #I: dropped dead bank_transactions.matched_expense_id (FK→expenses)');
    }
  } catch (e: any) {
    console.log('[DB] Cleanup #I drop dead FK columns:', e.message);
  }


  // PR #33-#35: Generic spreadsheet import wizard
  // - import_formats: persisted column→field mappings per source format
  //   (Finmap, Booking, Airbnb, etc). Saves user time on repeat imports.
  // - import_entity_mappings: persisted entity resolution (source value
  //   "KB Kemp Крони" → existing PMS account ID, OR action='create_new'
  //   to spawn fresh on commit, OR 'ignore' to skip).
  // - import_runs: audit log of each import attempt — file name, format,
  //   counts. Lets user see history.
  // ═══════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS import_formats (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      detector_signature TEXT,
      field_mappings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_import_formats_org ON import_formats(organization_id)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS import_entity_mappings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      format_id TEXT NOT NULL REFERENCES import_formats(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('account','category','project','counterparty')),
      source_value TEXT NOT NULL,
      pms_entity_id TEXT,
      action TEXT NOT NULL DEFAULT 'use_existing' CHECK (action IN ('use_existing','create_new','ignore')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(format_id, entity_type, source_value)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_iem_format ON import_entity_mappings(format_id, entity_type)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS import_runs (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      format_id TEXT REFERENCES import_formats(id) ON DELETE SET NULL,
      file_name TEXT,
      rows_total INTEGER NOT NULL DEFAULT 0,
      rows_created INTEGER NOT NULL DEFAULT 0,
      rows_skipped INTEGER NOT NULL DEFAULT 0,
      rows_dup INTEGER NOT NULL DEFAULT 0,
      errors_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'committed',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_import_runs_org ON import_runs(organization_id, created_at)');

  // ═══════════════════════════════════════════════════════════════════
  // PR #31: Investor module — investors, investments, monthly metrics,
  // payouts. Adapted from investflow-dashboard architecture but reuses
  // our business_units (= properties).
  // ═══════════════════════════════════════════════════════════════════
  database.exec(`
    CREATE TABLE IF NOT EXISTS investors (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      telegram_chat_id TEXT,
      portal_token TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_investors_org ON investors(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_investors_token ON investors(portal_token)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS investor_investments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      equity_pct REAL,
      invested_at TEXT NOT NULL,
      model_description TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_invest_org ON investor_investments(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_invest_investor ON investor_investments(investor_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_invest_project ON investor_investments(project_id)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS property_monthly_metrics (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      occupancy_pct REAL,
      revenue REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, year_month)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_pmm_project ON property_monthly_metrics(project_id, year_month)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS investor_payouts (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      investor_id TEXT NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES business_units(id) ON DELETE SET NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      paid_at TEXT NOT NULL,
      period_year_month TEXT,
      comment TEXT,
      fin_operation_id TEXT REFERENCES fin_operations(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_payouts_investor ON investor_payouts(investor_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_payouts_paid_at ON investor_payouts(paid_at)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS property_monthly_reports (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      year_month TEXT NOT NULL,
      adr REAL,
      general_comment TEXT,
      market_insight TEXT,
      operational_updates_json TEXT NOT NULL DEFAULT '[]',
      photo_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(project_id, year_month)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_pmr_project ON property_monthly_reports(project_id, year_month)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS property_work_stages (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      project_id TEXT NOT NULL UNIQUE REFERENCES business_units(id) ON DELETE CASCADE,
      stages_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // PR #38: Investor-facing property metadata that doesn't belong on
  // business_units (which is shared with the rest of the PMS). Carries
  // the InvestFlow fields: location label, image_url, status, airbnb_url,
  // ical_url. Linked 1:1 to a business_unit (= property).
  database.exec(`
    CREATE TABLE IF NOT EXISTS investor_property_details (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      project_id TEXT NOT NULL UNIQUE REFERENCES business_units(id) ON DELETE CASCADE,
      location TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('project', 'in_progress', 'active', 'paused')),
      airbnb_url TEXT,
      ical_url TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // ═══════════════════════════════════════════════════════════════════
  // Investor Portal v2 — Phase 1 (Foundation)
  //
  // New columns + tables to support contractual cashback schedules,
  // performance targets, CEO monthly notes, investor documents, and
  // 3-scenario forward projections.
  //
  // - cashback_schedule_json: full contractual monthly/quarterly plan
  // - target_apy / target_occupancy: baselines for the above/on/below
  //   performance indicator on the assets list
  // - units_count: how many physical units in a business_unit (1 by
  //   default; e.g. "B1-B3 STEALTH" has 3)
  // - investor_monthly_notes: CEO commentary per month, scope=portfolio|asset
  // - investor_documents: filesystem-backed PDF vault (agreements, monthly
  //   reports, tax statements)
  // - forecast_scenarios: 3 scenarios (pessimistic/base/optimistic) per BU
  // ═══════════════════════════════════════════════════════════════════
  addCol('investor_investments', 'cashback_schedule_json', 'TEXT');
  addCol('investor_investments', 'target_apy',             'NUMERIC');
  addCol('investor_investments', 'target_occupancy',       'NUMERIC');
  addCol('business_units',       'units_count',            'INTEGER NOT NULL DEFAULT 1');

  database.exec(`
    CREATE TABLE IF NOT EXISTS investor_monthly_notes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      scope TEXT NOT NULL CHECK (scope IN ('portfolio', 'asset')),
      scope_id TEXT NOT NULL,
      month TEXT NOT NULL,
      ceo_name TEXT,
      body_md TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (scope, scope_id, month)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_notes_scope ON investor_monthly_notes(scope, scope_id, month)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS investor_documents (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      investor_id TEXT REFERENCES investors(id) ON DELETE CASCADE,
      business_unit_id TEXT REFERENCES business_units(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK (type IN ('agreement', 'monthly_report', 'tax_statement', 'bank_statement', 'other')),
      name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      period_start TEXT,
      period_end TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      uploaded_by TEXT,
      is_archived INTEGER NOT NULL DEFAULT 0
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_docs_investor ON investor_documents(investor_id, is_archived)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_inv_docs_bu ON investor_documents(business_unit_id, is_archived)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS forecast_scenarios (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      business_unit_id TEXT NOT NULL REFERENCES business_units(id) ON DELETE CASCADE,
      scenario TEXT NOT NULL CHECK (scenario IN ('pessimistic', 'base', 'optimistic')),
      assumptions_json TEXT,
      monthly_cashback_projection_json TEXT,
      full_repayment_eta TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (business_unit_id, scenario)
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_forecast_bu ON forecast_scenarios(business_unit_id)');

  // PR #27: email-forward receipts inbox (separate from bank inbox)
  // User forwards email with invoice/receipt → IMAP poll extracts attachments
  // → drops them in fin_pending_receipts pool → user manually links to a
  // fin_operation. Optionally tries to auto-match by amount in subject/body.
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_receipt_inboxes (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      imap_host TEXT NOT NULL,
      imap_port INTEGER NOT NULL DEFAULT 993,
      imap_user TEXT NOT NULL,
      imap_password_encrypted TEXT NOT NULL,
      imap_folder TEXT NOT NULL DEFAULT 'INBOX',
      use_tls INTEGER NOT NULL DEFAULT 1,
      sender_filter TEXT,
      subject_filter TEXT,
      auto_match_threshold_pct REAL NOT NULL DEFAULT 1.0,
      last_uid INTEGER,
      last_synced_at TEXT,
      last_error TEXT,
      last_email_at TEXT,
      emails_processed INTEGER NOT NULL DEFAULT 0,
      receipts_imported INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_recv_inbox_org ON fin_receipt_inboxes(organization_id)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_pending_receipts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      inbox_id TEXT REFERENCES fin_receipt_inboxes(id) ON DELETE SET NULL,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      sender_email TEXT,
      subject TEXT,
      received_at TEXT,
      detected_amount REAL,
      detected_currency TEXT,
      auto_matched_operation_id TEXT REFERENCES fin_operations(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'matched', 'attached', 'archived')),
      attached_attachment_id TEXT REFERENCES fin_operation_attachments(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_prec_org ON fin_pending_receipts(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_prec_status ON fin_pending_receipts(status)');

  // PR #26: suggested_recurring_id on fin_operations — bank-imported ops
  // get tagged with a candidate recurring template (similar amount + counterparty)
  // for one-click confirmation by user.
  try {
    const opCols = database.prepare("PRAGMA table_info(fin_operations)").all() as { name: string }[];
    if (opCols.length > 0 && !opCols.some((c) => c.name === 'suggested_recurring_id')) {
      database.exec("ALTER TABLE fin_operations ADD COLUMN suggested_recurring_id TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_fin_op_suggested_recurring ON fin_operations(suggested_recurring_id)");
      console.log('[DB] PR #26: added suggested_recurring_id column to fin_operations');
    }
  } catch (e: any) { console.log('[DB] PR #26 suggested_recurring_id migration:', e.message); }

  // PR #23: file attachments per fin_operation (invoices, receipts, photos)
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_operation_attachments (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      operation_id TEXT NOT NULL REFERENCES fin_operations(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      uploaded_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_attach_op ON fin_operation_attachments(operation_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_attach_org ON fin_operation_attachments(organization_id)');

  // PR #21: allow orphan receivables (reservation_id NULL).
  // When a statement upload has rows that don't match any PMS reservation
  // (Hostex sync gap, missed bookings), we still record the receivable so
  // accounting reflects what the platform paid. The UI surfaces orphans
  // distinctly so user can investigate / link later.
  try {
    const recvCols = database.prepare("PRAGMA table_info(fin_channel_receivables)").all() as { name: string; notnull: number }[];
    const ridCol = recvCols.find((c) => c.name === 'reservation_id');
    if (ridCol && ridCol.notnull === 1) {
      // SQLite can't drop NOT NULL via ALTER — rebuild table preserving data.
      database.pragma('foreign_keys = OFF');
      try {
        database.exec(`
          CREATE TABLE fin_channel_receivables_pr21 (
            id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
            clearing_account_id TEXT NOT NULL REFERENCES finance_accounts(id) ON DELETE CASCADE,
            channel_source TEXT NOT NULL,
            external_reservation_id TEXT,
            gross_amount REAL NOT NULL,
            expected_commission REAL NOT NULL DEFAULT 0,
            expected_net REAL NOT NULL,
            actual_gross REAL,
            actual_commission REAL,
            actual_net REAL,
            currency TEXT NOT NULL,
            check_in TEXT NOT NULL,
            check_out TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'expected' CHECK (status IN ('expected', 'in_statement', 'paid', 'cancelled')),
            statement_payout_id TEXT,
            statement_payout_date TEXT,
            paid_operation_id TEXT REFERENCES fin_operations(id) ON DELETE SET NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (reservation_id, clearing_account_id, external_reservation_id)
          );
          INSERT INTO fin_channel_receivables_pr21
            SELECT id, organization_id, reservation_id, clearing_account_id,
                   channel_source, external_reservation_id, gross_amount,
                   expected_commission, expected_net, actual_gross,
                   actual_commission, actual_net, currency, check_in, check_out,
                   status, statement_payout_id, statement_payout_date,
                   paid_operation_id, created_at, updated_at
            FROM fin_channel_receivables;
          DROP TABLE fin_channel_receivables;
          ALTER TABLE fin_channel_receivables_pr21 RENAME TO fin_channel_receivables;
          CREATE INDEX IF NOT EXISTS idx_recv_org ON fin_channel_receivables(organization_id);
          CREATE INDEX IF NOT EXISTS idx_recv_status ON fin_channel_receivables(status);
          CREATE INDEX IF NOT EXISTS idx_recv_clearing ON fin_channel_receivables(clearing_account_id);
          CREATE INDEX IF NOT EXISTS idx_recv_extid ON fin_channel_receivables(external_reservation_id);
          CREATE INDEX IF NOT EXISTS idx_recv_payoutid ON fin_channel_receivables(statement_payout_id);
        `);
        console.log('[DB] PR #21: rebuilt fin_channel_receivables to allow NULL reservation_id (orphan receivables)');
      } finally {
        database.pragma('foreign_keys = ON');
      }
    }
  } catch (e: any) { console.log('[DB] PR #21 orphan receivables migration:', e.message); }

  // PR #20: add actual_gross to fin_channel_receivables for EUR-level reconciliation.
  // Statement-uploaded gross can differ from Hostex-stored gross (post-stay refunds,
  // partial cancellations, tariff changes). Comparing both reveals real discrepancies.
  try {
    const recvCols = database.prepare("PRAGMA table_info(fin_channel_receivables)").all() as { name: string }[];
    if (recvCols.length > 0 && !recvCols.some((c) => c.name === 'actual_gross')) {
      database.exec("ALTER TABLE fin_channel_receivables ADD COLUMN actual_gross REAL");
      console.log('[DB] PR #20: added actual_gross column to fin_channel_receivables');
    }
  } catch (e: any) { console.log('[DB] PR #20 actual_gross migration:', e.message); }

  // PR #16: track manual statement uploads (Booking/Airbnb/VRBO XLSX/CSV)
  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_statement_uploads (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      file_name TEXT NOT NULL,
      row_count INTEGER NOT NULL DEFAULT 0,
      applied_count INTEGER NOT NULL DEFAULT 0,
      cancelled_count INTEGER NOT NULL DEFAULT 0,
      unmatched_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_stmt_upl_org ON fin_statement_uploads(organization_id)');

  // Backfill receivables for existing channel-sourced reservations (one-time)
  try {
    const flagRow = database.prepare(
      "SELECT value FROM fin_system_state WHERE key = 'pr15_receivables_backfilled'"
    ).get() as { value: string } | undefined;
    if (!flagRow) {
      const orgRow = database.prepare("SELECT id FROM organizations LIMIT 1").get() as { id: string } | undefined;
      if (orgRow) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { backfillReceivables } = require('@/modules/finance/data/clearing-engine');
        const count = backfillReceivables(database, orgRow.id);
        database.prepare(
          "INSERT OR REPLACE INTO fin_system_state (key, value, updated_at) VALUES (?, ?, datetime('now'))"
        ).run('pr15_receivables_backfilled', String(count));
        console.log(`[DB] PR #15: backfilled ${count} channel receivables`);
      }
    }
  } catch (e: any) { console.log('[DB] PR #15 receivables backfill:', e.message); }

  // --- Migration: create gift_cards table (feature/gift_cards) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS gift_cards (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      property_id     TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      code            TEXT NOT NULL UNIQUE,
      template_id     TEXT NOT NULL DEFAULT 'custom',
      name            TEXT NOT NULL,
      type            TEXT NOT NULL DEFAULT 'open_date'
                      CHECK (type IN ('open_date', 'package', 'discount')),
      value_type      TEXT NOT NULL DEFAULT 'fixed_czk'
                      CHECK (value_type IN ('fixed_czk', 'fixed_eur', 'percent', 'nights')),
      face_value      REAL NOT NULL DEFAULT 0,
      currency        TEXT NOT NULL DEFAULT 'CZK',
      status          TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'active', 'paid', 'activated', 'expired', 'cancelled')),
      recipient_name  TEXT,
      recipient_email TEXT,
      buyer_name      TEXT,
      buyer_email     TEXT,
      buyer_phone     TEXT,
      message         TEXT,
      expires_at      TEXT,
      paid_at         TEXT,
      activated_at     TEXT,
      reservation_id  TEXT REFERENCES reservations(id) ON DELETE SET NULL,
      config_json     TEXT NOT NULL DEFAULT '{}',
      notes           TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_gift_cards_property ON gift_cards(property_id)');
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_gift_cards_code ON gift_cards(code)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_gift_cards_status ON gift_cards(status)');
  console.log('[DB] gift_cards table ready');

  // --- Migration: gift_card automation rules table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS gift_card_automation_rules (
      id               TEXT PRIMARY KEY,
      site_id          TEXT NOT NULL,
      template_id      TEXT,
      name             TEXT NOT NULL DEFAULT 'Автоматизований ваучер',
      discount_type    TEXT NOT NULL DEFAULT 'percentage',
      offer_amount   REAL NOT NULL DEFAULT 0,
      valid_from       TEXT,
      valid_until      TEXT,
      min_nights       INTEGER,
      max_nights       INTEGER,
      allowed_days     TEXT,
      applies_to       TEXT NOT NULL DEFAULT 'listings',
      redemption_limit INTEGER NOT NULL DEFAULT 1,
      generated_count  INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_var_site ON gift_card_automation_rules(site_id)');

  // --- Migration: add gift_card_rule_id to coupons ---
  try {
    database.exec(`ALTER TABLE coupons ADD COLUMN gift_card_rule_id TEXT REFERENCES gift_card_automation_rules(id) ON DELETE SET NULL`);
    console.log('[DB] Added gift_card_rule_id to coupons');
  } catch { /* column already exists */ }

  // --- Migration: add extra fields to coupons (min_nights, max_nights, redemption_limit, site_id, allowed_days, applies_to) ---
  for (const col of [
    'min_nights INTEGER',
    'max_nights INTEGER',
    'redemption_limit INTEGER',
    'site_id TEXT',
    'allowed_days TEXT',
    'applies_to TEXT DEFAULT \'services\'',
  ]) {
    try { database.exec(`ALTER TABLE coupons ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  console.log('[DB] gift_card_automation_rules ready');

  // --- Migration: gift_card_bundles (bundle/package gift_cards) ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS gift_card_bundles (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      site_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT,
      price           REAL NOT NULL DEFAULT 0,
      currency        TEXT NOT NULL DEFAULT 'CZK',
      nights_included INTEGER NOT NULL DEFAULT 0,
      listing_type    TEXT,
      included_services TEXT NOT NULL DEFAULT '[]',
      validity_months INTEGER NOT NULL DEFAULT 12,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_vb_site ON gift_card_bundles(site_id)');

  // --- Migration: add bundle_id to gift_cards ---
  try {
    database.exec(`ALTER TABLE gift_cards ADD COLUMN bundle_id TEXT REFERENCES gift_card_bundles(id) ON DELETE SET NULL`);
  } catch { /* already exists */ }

  // --- Migration: add allowed_days to gift_card_bundles ---
  try {
    database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN allowed_days TEXT`);
  } catch { /* already exists */ }

  // --- Migration: add allowed_promo_codes to gift_card_bundles ---
  try {
    database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN allowed_promo_codes TEXT`);
  } catch { /* already exists */ }

  // --- Migration: add price_override and thank_you_url to site_listings ---
  try {
    database.exec(`ALTER TABLE site_listings ADD COLUMN price_override REAL`);
  } catch { /* already exists */ }
  try {
    database.exec(`ALTER TABLE site_listings ADD COLUMN thank_you_url TEXT`);
  } catch { /* already exists */ }

  // --- Migration: add coupon_code, redemption_limit, current_uses to gift_card_bundles ---
  try { database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN coupon_code TEXT`); } catch { /* already exists */ }
  try { database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_vb_coupon_code ON gift_card_bundles(coupon_code) WHERE coupon_code IS NOT NULL`); } catch { }
  try { database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN redemption_limit INTEGER DEFAULT 1`); } catch { /* already exists */ }
  try { database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN current_uses INTEGER DEFAULT 0`); } catch { /* already exists */ }
  try { database.exec(`ALTER TABLE gift_card_bundles ADD COLUMN applied_listings TEXT`); } catch { /* already exists */ }

  console.log('[DB] gift_card_bundles ready');

  // ═══════════════════════════════════════════════════════════════════
  // Sub-Bookings: multi-group booking architecture.
  //
  // Adds parent_id to reservations for parent↔child linking (child
  // reservation = same dates/guest, different unit, auto-mirrors
  // status/payment from parent). reservation_sub_bookings holds per-
  // group metadata (label, adults, subtotal). reservation_line_items
  // provides optional price breakdown per sub-booking.
  //
  // Old reservation_groups table stays (empty, 0 rows) — no data to
  // migrate, but keeping the DDL so the existing group_id FK doesn't
  // complain. group_id on reservations is deprecated (always NULL for
  // new bookings).
  // ═══════════════════════════════════════════════════════════════════

  // --- Migration: add parent_id to reservations ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    if (!resCols.some((c: any) => c.name === 'parent_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN parent_id TEXT REFERENCES reservations(id) ON DELETE CASCADE");
      database.exec("CREATE INDEX IF NOT EXISTS idx_reservations_parent ON reservations(parent_id)");
      console.log('[DB] Sub-Bookings: added parent_id column to reservations');
    }
  } catch (e: any) { console.log('[DB] Sub-Bookings parent_id migration:', e.message); }

  // --- Migration: create reservation_sub_bookings table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_sub_bookings (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      reservation_id TEXT NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
      child_reservation_id TEXT REFERENCES reservations(id) ON DELETE SET NULL,
      label TEXT NOT NULL DEFAULT '',
      adults INTEGER NOT NULL DEFAULT 1,
      children INTEGER NOT NULL DEFAULT 0,
      infants INTEGER NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL DEFAULT 0,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_sub_bookings_res ON reservation_sub_bookings(reservation_id)');

  // --- Migration: create reservation_line_items table ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS reservation_line_items (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      sub_booking_id TEXT NOT NULL REFERENCES reservation_sub_bookings(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      category TEXT DEFAULT 'other',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_line_items_sub ON reservation_line_items(sub_booking_id)');

  // --- Migration: add sub_booking_id to reservation_guests ---
  try {
    const rgCols2 = database.prepare("PRAGMA table_info(reservation_guests)").all() as { name: string }[];
    if (!rgCols2.some((c: any) => c.name === 'sub_booking_id')) {
      database.exec("ALTER TABLE reservation_guests ADD COLUMN sub_booking_id TEXT REFERENCES reservation_sub_bookings(id)");
      console.log('[DB] Sub-Bookings: added sub_booking_id to reservation_guests');
    }
  } catch (e: any) { console.log('[DB] Sub-Bookings sub_booking_id migration:', e.message); }

  // ═══════════════════════════════════════════════════════════════════
  // Operations audit (W4 from finance UX upgrade).
  //
  // Adds `created_by_user_id` + `updated_by_user_id` to `fin_operations`
  // so the operator sees who recorded / last edited each row (e.g.
  // Андрій checking in a guest with cash payment vs. Олег reconciling
  // a bank statement). NULL on legacy rows; backfill is intentionally
  // skipped because we don't know who created them.
  //
  // `fin_operation_audit` stores the full change history. Each insert /
  // update / delete / op_type conversion writes one row with full
  // before/after JSON snapshots (chose `full` over `diff` for easier
  // debugging — disk is cheap, payments need bulletproof audit trail).
  //
  // No FK on operation_id deliberately: audit must survive op deletion
  // so we keep history even after the original row is removed.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const finOpCols = database.prepare("PRAGMA table_info(fin_operations)").all() as { name: string }[];
    if (!finOpCols.some((c: any) => c.name === 'created_by_user_id')) {
      database.exec("ALTER TABLE fin_operations ADD COLUMN created_by_user_id TEXT");
      database.exec("CREATE INDEX IF NOT EXISTS idx_fin_operations_created_by ON fin_operations(created_by_user_id)");
      console.log('[DB] Audit: added created_by_user_id to fin_operations');
    }
    if (!finOpCols.some((c: any) => c.name === 'updated_by_user_id')) {
      database.exec("ALTER TABLE fin_operations ADD COLUMN updated_by_user_id TEXT");
      console.log('[DB] Audit: added updated_by_user_id to fin_operations');
    }
  } catch (e: any) { console.log('[DB] Audit fin_operations columns:', e.message); }

  database.exec(`
    CREATE TABLE IF NOT EXISTS fin_operation_audit (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      operation_id TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'convert')),
      user_id TEXT,
      user_name TEXT,
      before_json TEXT,
      after_json TEXT,
      performed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_fin_operation_audit_op ON fin_operation_audit(operation_id, performed_at DESC)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_fin_operation_audit_user ON fin_operation_audit(user_id, performed_at DESC)');

  // --- Migration: create task management tables ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS task_projects (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES task_projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      color TEXT NOT NULL DEFAULT '#4f6ef7',
      icon TEXT DEFAULT '📁',
      property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES task_projects(id) ON DELETE SET NULL,
      parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      due_date TEXT,
      due_time TEXT,
      assignee_id TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      property_id TEXT REFERENCES properties(id) ON DELETE SET NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(organization_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  database.exec('CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date)');

  database.exec(`
    CREATE TABLE IF NOT EXISTS task_tags (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6c7086',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS task_tag_links (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES task_tags(id) ON DELETE CASCADE,
      PRIMARY KEY (task_id, tag_id)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS task_attachments (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      content_type TEXT,
      created_by TEXT REFERENCES app_users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  database.exec('CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON task_attachments(task_id)');

  // --- Migration: enhance booking_activity_log with user tracking + before/after snapshots ---
  try {
    database.exec("ALTER TABLE booking_activity_log ADD COLUMN user_id TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE booking_activity_log ADD COLUMN user_name TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE booking_activity_log ADD COLUMN before_json TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE booking_activity_log ADD COLUMN after_json TEXT");
  } catch { /* column already exists */ }
  try {
    database.exec("ALTER TABLE booking_activity_log ADD COLUMN booking_label TEXT");
  } catch { /* column already exists */ }

  // --- Migration: recreate booking_activity_log WITHOUT foreign key CASCADE ---
  try {
    // Check if the table still has the CASCADE FK by looking at the SQL
    const tableInfo = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='booking_activity_log'").get() as any;
    if (tableInfo?.sql?.includes('ON DELETE CASCADE')) {
      database.exec(`
        CREATE TABLE IF NOT EXISTS booking_activity_log_new (
          id TEXT PRIMARY KEY,
          reservation_id TEXT,
          action TEXT NOT NULL,
          details TEXT,
          user_id TEXT,
          user_name TEXT,
          before_json TEXT,
          after_json TEXT,
          booking_label TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO booking_activity_log_new SELECT id, reservation_id, action, details,
          CASE WHEN typeof(user_id)='text' THEN user_id ELSE NULL END,
          CASE WHEN typeof(user_name)='text' THEN user_name ELSE NULL END,
          CASE WHEN typeof(before_json)='text' THEN before_json ELSE NULL END,
          CASE WHEN typeof(after_json)='text' THEN after_json ELSE NULL END,
          CASE WHEN typeof(booking_label)='text' THEN booking_label ELSE NULL END,
          created_at
        FROM booking_activity_log;
        DROP TABLE booking_activity_log;
        ALTER TABLE booking_activity_log_new RENAME TO booking_activity_log;
      `);
    }
  } catch (e: any) { console.error('[migration] booking_activity_log FK removal (non-fatal):', e?.message); }

  // ═══ Evidenční kniha (Guest Registry) columns ═══
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN visa_number TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN purpose_of_stay TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN is_foreigner INTEGER DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN fee_amount REAL DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN fee_exempt INTEGER DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN fee_exempt_reason TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN police_reported INTEGER DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN police_reported_at TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN police_report_ref TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE reservation_guests ADD COLUMN is_hidden INTEGER DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE guest_registrations ADD COLUMN consent_given INTEGER DEFAULT 0"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE guest_registrations ADD COLUMN consent_at TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE guest_registrations ADD COLUMN consent_ip TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE guest_registrations ADD COLUMN purpose_of_stay TEXT"); } catch { /* already exists */ }
  try { database.exec("ALTER TABLE guest_registrations ADD COLUMN visa_number TEXT"); } catch { /* already exists */ }

  // --- Migration: add new columns to reservations for Analytics ---
  try {
    const resCols = database.prepare("PRAGMA table_info(reservations)").all() as { name: string }[];
    const colNames = resCols.map((c: any) => c.name);
    if (!colNames.includes('utm_source')) {
      database.exec("ALTER TABLE reservations ADD COLUMN utm_source TEXT");
    }
    if (!colNames.includes('utm_medium')) {
      database.exec("ALTER TABLE reservations ADD COLUMN utm_medium TEXT");
    }
    if (!colNames.includes('utm_campaign')) {
      database.exec("ALTER TABLE reservations ADD COLUMN utm_campaign TEXT");
    }
    if (!colNames.includes('utm_content')) {
      database.exec("ALTER TABLE reservations ADD COLUMN utm_content TEXT");
    }
    if (!colNames.includes('utm_term')) {
      database.exec("ALTER TABLE reservations ADD COLUMN utm_term TEXT");
    }
    if (!colNames.includes('ga_client_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN ga_client_id TEXT");
    }
    if (!colNames.includes('booking_lang')) {
      database.exec("ALTER TABLE reservations ADD COLUMN booking_lang TEXT");
    }
    if (!colNames.includes('country_code')) {
      database.exec("ALTER TABLE reservations ADD COLUMN country_code TEXT");
    }
    if (!colNames.includes('widget_session_id')) {
      database.exec("ALTER TABLE reservations ADD COLUMN widget_session_id TEXT");
    }
    console.log('[DB] Added Analytics columns to reservations table');
  } catch (e: any) {
    console.log('[DB] reservations analytics columns migration note:', e.message);
  }

  // --- Migration: create widget_events table for tracking ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS widget_events (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
        site_id TEXT NOT NULL REFERENCES booking_sites(id) ON DELETE CASCADE,
        session_id TEXT,
        event_type TEXT NOT NULL,
        step INTEGER,
        page TEXT,
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        lang TEXT,
        reservation_id TEXT,
        created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      );
    `);
    database.exec('CREATE INDEX IF NOT EXISTS idx_we_site ON widget_events(site_id)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_we_type ON widget_events(event_type)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_we_date ON widget_events(created_at)');
    database.exec('CREATE INDEX IF NOT EXISTS idx_we_session ON widget_events(session_id)');
    console.log('[DB] Created widget_events table and indexes');
  } catch (e: any) {
    console.log('[DB] widget_events migration note:', e.message);
  }

  // --- Migration: add country to widget_events ---
  try {
    const weCols = database.prepare("PRAGMA table_info(widget_events)").all() as { name: string }[];
    if (!weCols.some((c: any) => c.name === 'country')) {
      database.exec("ALTER TABLE widget_events ADD COLUMN country TEXT");
      console.log('[DB] Added country to widget_events');
    }
  } catch (e: any) {
    console.log('[DB] country migration note:', e.message);
  }

  // --- Migration: expand categories table with visibility flags and new types ---
  try {
    const catCols = database.prepare("PRAGMA table_info(categories)").all() as { name: string }[];
    const hasShowInTasks = catCols.some(c => c.name === 'show_in_tasks');
    if (!hasShowInTasks) {
      console.log('[DB] Migrating categories: expanding types + adding visibility flags...');
      database.exec('PRAGMA foreign_keys = OFF');
      database.exec(`
        CREATE TABLE categories_new (
          id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
          property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('glamping', 'resort', 'camping', 'facility', 'area', 'zone')),
          description TEXT,
          sort_order INTEGER NOT NULL DEFAULT 0,
          icon TEXT,
          color TEXT,
          show_in_tasks INTEGER NOT NULL DEFAULT 1,
          show_in_finance INTEGER NOT NULL DEFAULT 0,
          show_in_booking INTEGER NOT NULL DEFAULT 1,
          show_in_investor INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      database.exec(`
        INSERT INTO categories_new (id, property_id, name, type, description, sort_order, icon, color, created_at)
        SELECT id, property_id, name, type, description, sort_order, icon, color, created_at FROM categories
      `);
      // Mark existing accommodation categories as visible everywhere
      database.exec(`UPDATE categories_new SET show_in_tasks = 1, show_in_finance = 1, show_in_booking = 1, show_in_investor = 1`);
      database.exec('DROP TABLE categories');
      database.exec('ALTER TABLE categories_new RENAME TO categories');
      database.exec('PRAGMA foreign_keys = ON');

      // Seed non-accommodation categories
      const propId = (database.prepare('SELECT id FROM properties LIMIT 1').get() as { id: string })?.id;
      if (propId) {
        const insertCat = database.prepare(`
          INSERT OR IGNORE INTO categories (id, property_id, name, type, sort_order, icon, color, show_in_tasks, show_in_finance, show_in_booking, show_in_investor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        insertCat.run('cat_restaurant', propId, 'Ресторан', 'facility', 10, '🍽️', '#f59e0b', 1, 1, 0, 0);
        insertCat.run('cat_sauna', propId, 'Сауна', 'facility', 11, '🧖', '#ef4444', 1, 1, 0, 0);
        insertCat.run('cat_pool', propId, 'Купель', 'facility', 12, '🛁', '#06b6d4', 1, 1, 0, 0);
        insertCat.run('cat_territory', propId, 'Територія', 'area', 13, '🌳', '#22c55e', 1, 0, 0, 0);
      }
      console.log('[DB] Categories migration complete: expanded types + visibility flags + seeded facilities');
    }
  } catch (e: any) {
    console.log('[DB] categories expansion note:', e.message);
  }

  // --- Migration: tg_booking_messages table for notification tracking ---
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS tg_booking_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reservation_id TEXT NOT NULL,
        chat_id TEXT NOT NULL,
        message_id INTEGER NOT NULL,
        sent_payment_status TEXT,
        sent_text TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tg_booking_msgs_res ON tg_booking_messages(reservation_id);
    `);
  } catch (e: any) {
    console.log('[DB] tg_booking_messages migration note:', e.message);
  }

  // --- Migration: finance_user_access — per-user finance access control ---
  database.exec(`
    CREATE TABLE IF NOT EXISTS finance_user_access (
      user_id          TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
      is_enabled       INTEGER NOT NULL DEFAULT 0,
      period_mode      TEXT NOT NULL DEFAULT 'month' CHECK (period_mode IN ('all', 'month')),
      allowed_tabs     TEXT NOT NULL DEFAULT '["operations"]',
      allowed_accounts TEXT NOT NULL DEFAULT '[]',
      can_export       INTEGER NOT NULL DEFAULT 0,
      read_only        INTEGER NOT NULL DEFAULT 1,
      created_at       TEXT DEFAULT (datetime('now')),
      updated_at       TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('[DB] finance_user_access table ready');
  }

// Generate a cryptographically secure random token for guest pages
export function generateGuestToken(): string {
  return crypto.randomBytes(16).toString('hex');
}

function seedData(database: any) {
  const orgId = 'org_alisio_001';
  const propId = 'prop_main_001';
  const catGlamp = 'cat_glamping';
  const catResort = 'cat_resort';
  const catCamping = 'cat_camping';
  const bldgF = 'bldg_f';
  const bldgD = 'bldg_d';

  // Organization
  database.prepare('INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)').run(orgId, 'ALiSiO Properties', 'alisio');

  // Property
  database.prepare('INSERT INTO properties (id, organization_id, name, slug, city, country) VALUES (?, ?, ?, ?, ?, ?)').run(propId, orgId, 'Carlsbad Wellness & Camping Resort', 'alisio-main', 'Březová-Karlovy Vary', 'CZ');

  // Categories
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catGlamp, propId, 'Glamping', 'glamping', 1, '🏕️', '#a78bfa');
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catResort, propId, 'Resort', 'resort', 2, '🏨', '#60a5fa');
  database.prepare('INSERT INTO categories (id, property_id, name, type, sort_order, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)').run(catCamping, propId, 'Camping', 'camping', 3, '⛺', '#34d399');

  // Buildings
  database.prepare('INSERT INTO buildings (id, category_id, property_id, name, code, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(bldgF, catResort, propId, 'Будова F (Standart)', 'F', 1);
  database.prepare('INSERT INTO buildings (id, category_id, property_id, name, code, sort_order) VALUES (?, ?, ?, ?, ?, ?)').run(bldgD, catResort, propId, 'Будова D (Econom)', 'D', 2);

  // Unit Types
  const utStealth = 'ut_stealth'; const utMirror = 'ut_mirror'; const utGlamp4 = 'ut_glamp4';
  const utF2 = 'ut_f2'; const utF3 = 'ut_f3'; const utF4 = 'ut_f4'; const utDeco = 'ut_deco';
  const utFB = 'ut_fb'; const utBB = 'ut_bb'; const utFR = 'ut_fr'; const utBR = 'ut_br';

  const insertUT = database.prepare('INSERT INTO unit_types (id, property_id, category_id, building_id, name, code, max_adults, base_occupancy, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  insertUT.run(utStealth, propId, catGlamp, null, 'Stealth House (2 місця)', 'STEALTH', 2, 2, 1);
  insertUT.run(utMirror, propId, catGlamp, null, 'Mirror House (2 місця)', 'MIRROR', 2, 2, 2);
  insertUT.run(utGlamp4, propId, catGlamp, null, '4-місний будинок', 'GLAMP4', 4, 2, 3);
  insertUT.run(utF2, propId, catResort, bldgF, 'F — 2-місний', 'F-2BED', 2, 2, 1);
  insertUT.run(utF3, propId, catResort, bldgF, 'F — 3-місний', 'F-3BED', 3, 2, 2);
  insertUT.run(utF4, propId, catResort, bldgF, 'F — 4-місний', 'F-4BED', 4, 2, 3);
  insertUT.run(utDeco, propId, catResort, bldgD, 'D — Econom', 'D-ECO', 3, 2, 4);
  insertUT.run(utFB, propId, catCamping, null, 'FB — Front Pitch', 'FB', 4, 2, 1);
  insertUT.run(utBB, propId, catCamping, null, 'BB — Between Pitch', 'BB', 4, 2, 2);
  insertUT.run(utFR, propId, catCamping, null, 'FR — Restaurant Pitch', 'FR', 4, 2, 3);
  insertUT.run(utBR, propId, catCamping, null, 'BR — River Pitch', 'BR', 4, 2, 4);

  // Units
  const insertUnit = database.prepare('INSERT INTO units (id, unit_type_id, property_id, category_id, building_id, name, code, beds, zone, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  // Glamping - Stealth (3)
  for (let i = 1; i <= 3; i++) insertUnit.run(`u_st${i}`, utStealth, propId, catGlamp, null, `Stealth ${i}`, `ST${i}`, 2, null, i);
  // Glamping - Mirror (2)
  for (let i = 1; i <= 2; i++) insertUnit.run(`u_mr${i}`, utMirror, propId, catGlamp, null, `Mirror ${i}`, `MR${i}`, 2, null, 10 + i);
  // Glamping - 4-person (3)
  for (let i = 1; i <= 3; i++) insertUnit.run(`u_g4_${i}`, utGlamp4, propId, catGlamp, null, `4-місний ${i}`, `G4-${i}`, 4, null, 20 + i);

  // Resort F rooms (renumbered from 1)
  // Physical room order: old 7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23 → new 1..17
  const fRoomMap: [number, string][] = [
    [1, utF2], [2, utF3], [3, utF3], [4, utF3], [5, utF3],
    [6, utF3], [7, utF3], [8, utF3], [9, utF3], [10, utF3],
    [11, utF4], [12, utF3], [13, utF3], [14, utF3], [15, utF3],
    [16, utF4], [17, utF2],
  ];
  const fBeds: Record<string, number> = { [utF2]: 2, [utF3]: 3, [utF4]: 4 };
  for (const [n, ut] of fRoomMap) {
    insertUnit.run(`u_f${n}`, ut, propId, catResort, bldgF, `F${n}`, `F${n}`, fBeds[ut], null, n);
  }

  // Resort D rooms (16)
  for (let i = 1; i <= 16; i++) insertUnit.run(`u_d${i}`, utDeco, propId, catResort, bldgD, `D${i}`, `D${i}`, 3, null, i);

  // Camping zones
  for (let i = 1; i <= 15; i++) insertUnit.run(`u_fb${i}`, utFB, propId, catCamping, null, `FB${i}`, `FB${i}`, 0, 'FB', i);
  for (let i = 16; i <= 40; i++) insertUnit.run(`u_bb${i}`, utBB, propId, catCamping, null, `BB${i}`, `BB${i}`, 0, 'BB', i);
  for (let i = 41; i <= 50; i++) insertUnit.run(`u_fr${i}`, utFR, propId, catCamping, null, `FR${i}`, `FR${i}`, 0, 'FR', i);
  for (let i = 51; i <= 70; i++) insertUnit.run(`u_br${i}`, utBR, propId, catCamping, null, `BR${i}`, `BR${i}`, 0, 'BR', i);

  // Rate Plans
  database.prepare('INSERT INTO rate_plans (id, property_id, name, code, pricing_model, priority) VALUES (?, ?, ?, ?, ?, ?)').run('rp_std', propId, 'Standard', 'STD', 'standard', 1);

  // Fees
  database.prepare('INSERT INTO fees_taxes (id, property_id, name, type, amount) VALUES (?, ?, ?, ?, ?)').run('fee_clean', propId, 'Прибирання', 'per_stay', 500);
  database.prepare('INSERT INTO fees_taxes (id, property_id, name, type, amount) VALUES (?, ?, ?, ?, ?)').run('fee_tax', propId, 'Туристичний збір', 'per_person_per_night', 50);

  // Admin users (owners)
  const defaultPasswordHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);
  const user4svHash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 10);

  database.prepare('INSERT INTO app_users (id, organization_id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)').run('user_admin', orgId, 'admin@alisio.cz', 'Admin ALiSiO', 'owner', defaultPasswordHash);
  database.prepare('INSERT INTO app_users (id, organization_id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?, ?)').run('user_4sv', orgId, '4sv.exe@gmail.com', '4sv.exe Admin', 'owner', user4svHash);

  // Seed some guests
  const insertGuest = database.prepare('INSERT INTO guests (id, organization_id, first_name, last_name, email, phone, country) VALUES (?, ?, ?, ?, ?, ?, ?)');
  insertGuest.run('g001', orgId, 'Jan', 'Novák', 'jan.novak@email.cz', '+420601234567', 'CZ');
  insertGuest.run('g002', orgId, 'Maria', 'Schmidt', 'maria.schmidt@email.de', '+491701234567', 'DE');
  insertGuest.run('g003', orgId, 'Олена', 'Ковальчук', 'olena@email.ua', '+380501234567', 'UA');
  insertGuest.run('g004', orgId, 'Peter', 'Brown', 'peter.b@email.com', '+441234567890', 'GB');
  insertGuest.run('g005', orgId, 'Anna', 'Dvořáková', 'anna.d@email.cz', '+420777654321', 'CZ');
  insertGuest.run('g006', orgId, 'Klaus', 'Weber', 'k.weber@email.de', '+491601234567', 'DE');
  insertGuest.run('g007', orgId, 'Tomáš', 'Horák', 'tomas.h@email.cz', '+420608765432', 'CZ');
  insertGuest.run('g008', orgId, 'Ірина', 'Петренко', 'iryna.p@email.ua', '+380671234567', 'UA');

  // Seed some reservations
  const insertRes = database.prepare('INSERT INTO reservations (id, property_id, unit_id, guest_id, check_in, check_out, nights, adults, children, status, payment_status, source, total_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  // Note: F-room IDs use new numbering (F7→F1, F8→F2, F12→F6, F17→F11)
  insertRes.run('r001', propId, 'u_st1', 'g001', '2026-03-11', '2026-03-15', 4, 2, 0, 'confirmed', 'paid', 'booking_com', 8800);
  insertRes.run('r002', propId, 'u_mr1', 'g002', '2026-03-11', '2026-03-14', 3, 2, 1, 'checked_in', 'paid', 'direct', 6200);
  insertRes.run('r003', propId, 'u_g4_2', 'g003', '2026-03-13', '2026-03-18', 5, 3, 1, 'tentative', 'prepaid', 'airbnb', 12500);
  insertRes.run('r004', propId, 'u_f2', 'g004', '2026-03-09', '2026-03-12', 3, 2, 0, 'checked_in', 'paid', 'direct', 5400);
  insertRes.run('r005', propId, 'u_f6', 'g005', '2026-03-12', '2026-03-16', 4, 2, 2, 'confirmed', 'payment_requested', 'booking_com', 9200);
  insertRes.run('r006', propId, 'u_f11', 'g006', '2026-03-14', '2026-03-20', 6, 4, 0, 'confirmed', 'unpaid', 'phone', 15600);
  insertRes.run('r007', propId, 'u_d3', 'g007', '2026-03-10', '2026-03-12', 2, 1, 0, 'checked_out', 'paid', 'direct', 2800);
  insertRes.run('r008', propId, 'u_d7', 'g008', '2026-03-11', '2026-03-18', 7, 2, 1, 'confirmed', 'prepaid', 'whatsapp', 11200);

  // Seed demo payments / transactions
  const insertPay = database.prepare('INSERT INTO payments (id, reservation_id, amount, method, type, status, paid_at, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  // r001 Jan Novák — fully paid by card (8800)
  insertPay.run('pay001', 'r001', 8800, 'card', 'full', 'completed', '2026-02-20', 'Booking.com payment');
  // r002 Maria Schmidt — fully paid cash at check-in (6200)
  insertPay.run('pay002', 'r002', 6200, 'cash', 'full', 'completed', '2026-03-11', 'Cash at front desk');
  // r003 Олена Ковальчук — prepaid 30% via bank transfer (3750 of 12500)
  insertPay.run('pay003', 'r003', 3750, 'bank_transfer', 'deposit', 'completed', '2026-02-15', 'Передплата 30%');
  // r004 Peter Brown — fully paid by card (5400)
  insertPay.run('pay004', 'r004', 5400, 'card', 'full', 'completed', '2026-03-09', 'Card payment');
  // r007 Tomáš Horák — paid cash (2800)
  insertPay.run('pay005', 'r007', 2800, 'cash', 'full', 'completed', '2026-03-10', 'Cash');
  // r008 Ірина Петренко — prepaid 50% via invoice (5600 of 11200)
  insertPay.run('pay006', 'r008', 5600, 'invoice', 'deposit', 'completed', '2026-02-28', 'Фактура передплата 50%');
}
