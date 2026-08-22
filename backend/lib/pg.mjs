/**
 * Neon SQL-over-HTTP client (no npm `pg` package required).
 * Matches @neondatabase/serverless HTTP wire format.
 */
let lastError = null;

export function isPostgresEnabled() {
  return Boolean(String(process.env.DATABASE_URL || '').trim());
}

function sqlHttpEndpoint(connectionString) {
  const u = new URL(connectionString);
  return `https://${u.hostname}/sql`;
}

/**
 * @param {string} text SQL with $1, $2 placeholders
 * @param {any[]} [params]
 */
export async function query(text, params = []) {
  const connectionString = String(process.env.DATABASE_URL || '').trim();
  if (!connectionString) {
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
      'Neon-Connection-String': connectionString,
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

export function getPool() {
  return isPostgresEnabled() ? { kind: 'neon-http' } : null;
}

export function getPgStatus() {
  return {
    enabled: isPostgresEnabled(),
    driver: 'neon-sql-http',
    lastError,
  };
}
