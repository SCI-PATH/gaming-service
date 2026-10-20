/**
 * Neon SQL-over-HTTP client (no npm `pg` package required).
 * Matches @neondatabase/serverless HTTP wire format.
 */
let lastError = null;

/** Strip quotes and jdbc/postgres+driver prefixes so Neon HTTP accepts the URL. */
export function normalizeDatabaseUrl(raw) {
  let s = String(raw || '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  s = s.replace(/^jdbc:/i, '');
  s = s.replace(/^postgres(ql)?\+\w+:\/\//i, 'postgresql://');
  s = s.replace(/^postgres:\/\//i, 'postgresql://');
  return s;
}

/** True when the string is a postgresql URL with a host (Neon SQL-over-HTTP). */
export function isNeonConnectionString(raw) {
  const s = normalizeDatabaseUrl(raw);
  if (!/^postgresql:\/\//i.test(s)) return false;
  try {
    const u = new URL(s);
    return Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Engagement persistence is on only when DATABASE_URL is a usable Neon string. */
export function isPostgresEnabled() {
  return isNeonConnectionString(process.env.DATABASE_URL);
}

/** Neon serves SQL at https://<host>/sql, not a TCP Postgres port. */
function sqlHttpEndpoint(connectionString) {
  const u = new URL(normalizeDatabaseUrl(connectionString));
  if (!u.hostname) {
    throw new Error('DATABASE_URL host is missing');
  }
  return `https://${u.hostname}/sql`;
}

/**
 * @param {string} text SQL with $1, $2 placeholders
 * @param {any[]} [params]
 */
export async function query(text, params = []) {
  const connectionString = normalizeDatabaseUrl(process.env.DATABASE_URL);
  if (!isNeonConnectionString(connectionString)) {
    const err = new Error('DATABASE_URL_not_configured');
    err.code = 'NO_DATABASE';
    throw err;
  }

  const endpoint = sqlHttpEndpoint(connectionString);
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Neon-Connection-String': normalizeDatabaseUrl(connectionString),
      'Neon-Raw-Text-Output': 'true',
      'Neon-Array-Mode': 'true',
    },
    body: JSON.stringify({
      query: text,
      params: Array.isArray(params) ? params : [],
    }),
  });

  const rawText = await res.text();
  let data = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = { message: rawText };
  }

  if (!res.ok) {
    lastError =
      data?.message ||
      data?.error ||
      data?.detail ||
      `Neon SQL HTTP ${res.status}: ${rawText?.slice?.(0, 200) || ''}`;
    const err = new Error(lastError);
    err.status = res.status;
    err.body = data;
    throw err;
  }

  lastError = null;

  // Array-mode rows → objects when fields present
  if (data?.fields && Array.isArray(data.rows)) {
    const names = data.fields.map((f) => f.name);
    const rows = data.rows.map((row) => {
      if (row && typeof row === 'object' && !Array.isArray(row)) return row;
      const obj = {};
      names.forEach((name, i) => {
        obj[name] = Array.isArray(row) ? row[i] : null;
      });
      return obj;
    });
    return {
      rows,
      rowCount: data.rowCount ?? rows.length,
      fields: data.fields,
      command: data.command,
    };
  }

  if (Array.isArray(data?.rows)) {
    return {
      rows: data.rows,
      rowCount: data.rowCount ?? data.rows.length,
      fields: data.fields || [],
    };
  }

  if (Array.isArray(data)) {
    return { rows: data, rowCount: data.length, fields: [] };
  }

  return { rows: [], rowCount: 0, fields: [], raw: data };
}

/** Stand-in for a pg pool. Callers only need to know Neon HTTP is available. */
export function getPool() {
  return isPostgresEnabled() ? { kind: 'neon-http' } : null;
}

/** Health payload: driver name and the last Neon error, if a query failed. */
export function getPgStatus() {
  return {
    enabled: isPostgresEnabled(),
    driver: 'neon-sql-http',
    lastError,
  };
}
