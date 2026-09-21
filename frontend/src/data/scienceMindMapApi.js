const GRADES = [6, 7, 8, 9];

async function readJson(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.retryable = Boolean(data.retryable);
    throw err;
  }
  return data;
}

export async function generateScienceMindMap({ grade, question, studentId }) {
  const res = await fetch('/api/mindmap/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grade, question, studentId }),
  });
  return readJson(res);
}

export async function listTextbooks(grade) {
  const qs = grade ? `?grade=${encodeURIComponent(grade)}` : '';
  const res = await fetch(`/api/textbooks${qs}`);
  return readJson(res);
}

export async function ingestTextbook(body) {
  const res = await fetch('/api/textbooks/ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export async function ingestDefaultTextbooks(force = false) {
  const res = await fetch('/api/textbooks/ingest-defaults', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ force }),
  });
  return readJson(res);
}

export async function reprocessTextbook(body) {
  const res = await fetch('/api/textbooks/reprocess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

export { GRADES };
