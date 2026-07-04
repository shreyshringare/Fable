import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor() {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'fable.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate() {
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS _migrations (
         name TEXT PRIMARY KEY,
         applied_at TEXT NOT NULL DEFAULT (datetime('now'))
       )`,
    );
    const dir =
      process.env.MIGRATIONS_DIR ||
      path.join(__dirname, '..', '..', 'migrations');
    if (!fs.existsSync(dir)) return;
    const applied = new Set(
      (this.db.prepare('SELECT name FROM _migrations').all() as { name: string }[]).map(
        (r) => r.name,
      ),
    );
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      this.db.transaction(() => {
        this.db.exec(sql);
        this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
      })();
      // eslint-disable-next-line no-console
      console.log(`Applied migration ${file}`);
    }
  }

  onModuleDestroy() {
    this.db.close();
  }
}
