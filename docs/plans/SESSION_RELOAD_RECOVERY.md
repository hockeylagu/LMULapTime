# Offline session reload recovery

The exact-player cleanup incorrectly assumed that a multiplayer results XML marks only the local driver with `isPlayer=1`. LMU can mark every human driver that way. A unique exact configured player name must take precedence over those flags; duplicate names remain unresolved. The parser now applies that rule to newly parsed sessions.

Existing session rosters retain the drivers, laps, incidents, and recording attachments. Recover ownership from those retained rows instead of reloading XML or decoding replays. Older benchmark caches also need their raw car classes converted once so canonical class comparisons can find them.

Stop the backend, then inspect the database:

```powershell
npx tsx tools/analysis/repairSessionReload.ts --player "Samuel Lague"
```

Apply the repair with a new backup path:

```powershell
npx tsx tools/analysis/repairSessionReload.ts --player "Samuel Lague" --apply --backup .cache/session-recovery-backup.db
```

Use `--db path` for a different database. The script refuses to apply while the default backend port is listening or to overwrite an existing backup. It creates a consistent SQLite backup before changing data, then restores unique exact player matches and regenerates their summaries in one transaction. It converts cached benchmark classes without changing targets or adding a benchmark update event. Missing or ambiguous player matches are reported and left unchanged. Repeating the repair makes no further writes.

Restart the backend after completion. There is no startup migration or parser-version bump for this repair.
