/**
 * Column specs shared by the schema, the writer, the reader and the canonical form, so a field is
 * declared once. `nullable` marks a required property typed `T | null`: its NULL reads back as null.
 * Every other NULL is an absent property.
 */
export type FieldKind = 'text' | 'real' | 'int' | 'bool';

export interface Field {
  prop: string;
  col: string;
  kind: FieldKind;
  nullable?: boolean;
}

export const text = (prop: string, col: string): Field => ({ prop, col, kind: 'text' });
export const real = (prop: string, col: string): Field => ({ prop, col, kind: 'real' });
export const int = (prop: string, col: string): Field => ({ prop, col, kind: 'int' });
export const bool = (prop: string, col: string): Field => ({ prop, col, kind: 'bool' });
/** The same field for a required property typed `T | null`. */
export const orNull = (field: Field): Field => ({ ...field, nullable: true });

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

export function sqlType(kind: FieldKind): string {
  return kind === 'text' ? 'TEXT' : kind === 'real' ? 'REAL' : 'INTEGER';
}

export function columnDefinitions(fields: readonly Field[]): string {
  return fields.map(field => `${field.col} ${sqlType(field.kind)}`).join(', ');
}

export function toSql(value: unknown, kind: FieldKind): SqlValue {
  if (value === undefined || value === null) return null;
  if (kind === 'bool') return typeof value === 'boolean' ? (value ? 1 : 0) : (value as number);
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value as SqlValue;
}

/** Writes each field of `source` into the named parameters of `target`. */
export function packFields(target: Record<string, SqlValue>, source: Row | undefined, fields: readonly Field[]): void {
  for (const field of fields) target[field.col] = toSql(source?.[field.prop], field.kind);
}

/** True when any column of the fields holds a value: the object they describe is present. */
export function anyPresent(row: Row, fields: readonly Field[]): boolean {
  return fields.some(field => row[field.col] !== null && row[field.col] !== undefined);
}

/** Copies the fields of a stored row onto a new object; NULLs become absent or null as declared. */
export function unpackFields(row: Row, fields: readonly Field[], into: Row = {}): Row {
  for (const field of fields) {
    const value = row[field.col];
    if (value === null || value === undefined) {
      if (field.nullable) into[field.prop] = null;
      continue;
    }
    into[field.prop] = field.kind === 'bool' ? value !== 0 : value;
  }
  return into;
}

/** Named-parameter INSERT for a table: `@col` for each column. */
export function insertSql(table: string, columns: readonly string[]): string {
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(column => `@${column}`).join(', ')})`;
}
