import Database from 'better-sqlite3';

const since = Date.now() - 20 * 60 * 1000;
const db = new Database('server/lmu_cache.db', { readonly: true });
const done = db.prepare('SELECT COUNT(*) c FROM replay_trajectories WHERE updated_at > ?').get(since).c;
const total = db.prepare('SELECT COUNT(*) c FROM replay_trajectories').get().c;
const pct = ((done / total) * 100).toFixed(1);
console.log('recoded ' + done + '/' + total + '  (' + pct + '%)');
db.close();
