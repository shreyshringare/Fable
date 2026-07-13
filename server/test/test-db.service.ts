import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';

/**
 * In-memory SQLite database for tests — runs all migrations on init,
 * isolated per test suite (each describe block creates its own app + db).
 */
@Injectable()
export class TestDbService implements OnModuleDestroy {
  readonly db: Database.Database;

  constructor() {
    this.db = new Database(':memory:');
    this.db.pragma('foreign_keys = ON');
    this.runMigrations();
  }

  private runMigrations() {
    const dir = path.join(__dirname, '..', 'migrations');
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(dir, file), 'utf8');
      this.db.exec(sql);
    }
  }

  onModuleDestroy() {
    this.db.close();
  }
}
