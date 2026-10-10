import type { Database as DatabaseType, Statement } from 'better-sqlite3';

/**
 * Get-or-insert ids of the dictionaries (`drivers` by exact name, `vehicles` by raw car type and class,
 * `teams` by name), meant to run inside the writer's transaction. The memo lives for one write only;
 * the tables are the cache. A driver name is a key, never a person: names that differ by case or
 * spacing stay different rows.
 */
export class Dictionaries {
  private readonly names = new Map<string, number>();
  private readonly vehicles = new Map<string, number>();
  private readonly teams = new Map<string, number>();
  private readonly insertName: Statement;
  private readonly selectName: Statement;
  private readonly insertVehicle: Statement;
  private readonly selectVehicle: Statement;
  private readonly insertTeam: Statement;
  private readonly selectTeam: Statement;

  constructor(db: DatabaseType) {
    this.insertName = db.prepare('INSERT OR IGNORE INTO drivers (name, normalized_name) VALUES (?, ?)');
    this.selectName = db.prepare('SELECT driver_id FROM drivers WHERE name = ?');
    this.insertVehicle = db.prepare('INSERT INTO vehicles (car_type, car_class) VALUES (?, ?)');
    this.selectVehicle = db.prepare('SELECT vehicle_id FROM vehicles WHERE car_type IS ? AND car_class IS ?');
    this.insertTeam = db.prepare('INSERT OR IGNORE INTO teams (name) VALUES (?)');
    this.selectTeam = db.prepare('SELECT team_id FROM teams WHERE name = ?');
  }

  /** The id of an exact driver name; null for an absent name. */
  driver(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const name = String(value);
    let id = this.names.get(name);
    if (id === undefined) {
      this.insertName.run(name, name.trim().toLowerCase());
      id = (this.selectName.get(name) as { driver_id: number }).driver_id;
      this.names.set(name, id);
    }
    return id;
  }

  /** The id of a raw car type and class pair; null when both are absent. */
  vehicle(carType: unknown, carClass: unknown): number | null {
    const type = carType === undefined || carType === null ? null : String(carType);
    const klass = carClass === undefined || carClass === null ? null : String(carClass);
    if (type === null && klass === null) return null;
    const key = JSON.stringify([type, klass]);
    let id = this.vehicles.get(key);
    if (id === undefined) {
      const found = this.selectVehicle.get(type, klass) as { vehicle_id: number } | undefined;
      if (found) id = found.vehicle_id;
      else {
        this.insertVehicle.run(type, klass);
        id = (this.selectVehicle.get(type, klass) as { vehicle_id: number }).vehicle_id;
      }
      this.vehicles.set(key, id);
    }
    return id;
  }

  /** The id of a team name; null for an absent name. */
  team(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const name = String(value);
    let id = this.teams.get(name);
    if (id === undefined) {
      this.insertTeam.run(name);
      id = (this.selectTeam.get(name) as { team_id: number }).team_id;
      this.teams.set(name, id);
    }
    return id;
  }
}
