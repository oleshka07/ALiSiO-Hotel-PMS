const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('data/alisio.db');
const hash = bcrypt.hashSync('admin', 10);
const res = db.prepare('UPDATE app_users SET password_hash = ? WHERE email = ?').run(hash, 'admin@alisio.cz');

if (res.changes > 0) {
  console.log('Password for admin@alisio.cz has been successfully reset to: admin');
} else {
  console.log('User admin@alisio.cz not found!');
}
