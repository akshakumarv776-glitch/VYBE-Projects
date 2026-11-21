const fs = require("node:fs");
const path = require("node:path");
const Database = require("better-sqlite3");

function createDatabase(filename) {
    if (filename !== ":memory:" && !filename.startsWith("file:")) {
        fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
    }

    const db = new Database(filename);
    db.pragma("foreign_keys = ON");

    if (filename !== ":memory:") {
        db.pragma("journal_mode = WAL");
    }

    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL COLLATE NOCASE UNIQUE,
            email TEXT NOT NULL COLLATE NOCASE UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );

        CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(id DESC);
    `);

    return db;
}

module.exports = { createDatabase };
