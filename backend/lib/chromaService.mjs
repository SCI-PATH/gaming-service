/**
 * ChromaService — Node talks to persistent ChromaDB through the Python worker.
 * Persist dir: <repo>/data/chroma  collection: science_textbooks
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = resolve(HERE, '..');
const REPO_ROOT = process.env.GAMING_ROOT || resolve(BACKEND_ROOT, '..');
const SCRIPT = resolve(BACKEND_ROOT, 'python/chroma_ops.py');

function venvPython() {
  const candidate =
    process.platform === 'win32'
      ? resolve(REPO_ROOT, '.venv/Scripts/python.exe')
      : resolve(REPO_ROOT, '.venv/bin/python');
  return existsSync(candidate) ? candidate : null;
}

function pythonBin() {
  return (
    process.env.CHROMA_PYTHON ||
    process.env.PYTHON ||
    venvPython() ||
    (process.platform === 'win32' ? 'py' : 'python')
  );
}

function pythonArgs(extra) {
  const bin = pythonBin();
  if (process.platform === 'win32' && (bin === 'py' || /[\\/]py\.exe$/i.test(bin))) {
    // Default `py -3` is 3.14 here; chromadb is installed on 3.12.
    return ['-3.12', SCRIPT, ...extra];
  }
  return [SCRIPT, ...extra];
}

let worker = null;
let workerReady = false;
let seq = 0;
const pending = new Map();
let starting = null;

function handleLine(line) {
  const text = String(line || '').trim();
  if (!text) return;
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  const wait = pending.get(msg.id);
  if (!wait) return;
  pending.delete(msg.id);
  if (msg.ok) wait.resolve(msg.result);
  else wait.reject(new Error(msg.error || 'Chroma worker error'));
}

function startWorker() {
  if (worker && workerReady && !worker.killed) return Promise.resolve();
  if (starting) return starting;
  starting = new Promise((resolveStart, rejectStart) => {
    if (!existsSync(SCRIPT)) {
      rejectStart(new Error(`Missing Chroma helper: ${SCRIPT}`));
      return;
    }
    const child = spawn(pythonBin(), pythonArgs(['worker']), {
      cwd: REPO_ROOT,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) handleLine(line);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 4000) stderr = stderr.slice(-2000);
    });
    child.on('error', () => {
      workerReady = false;
      worker = null;
      rejectStart(
        new Error(
          `Could not start Python Chroma worker (${pythonBin()}). Install chromadb + pypdf: pip install chromadb pypdf`,
        ),
      );
    });
    child.on('exit', (code) => {
      workerReady = false;
      worker = null;
      for (const [id, wait] of pending) {
        pending.delete(id);
        wait.reject(new Error(stderr.trim() || `Chroma worker exited (${code})`));
      }
    });
    worker = child;
    workerReady = true;
    resolveStart();
  }).finally(() => {
    starting = null;
  });
  return starting;
}

export async function chromaCall(op, payload = {}, timeoutMs = 120000) {
  await startWorker();
  if (!worker) throw new Error('Chroma worker is not running');
  const id = `c${++seq}`;
  const line = `${JSON.stringify({ id, op, payload })}\n`;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chroma ${op} timed out`));
    }, timeoutMs);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
  });
  worker.stdin.write(line);
  return result;
}

export function listTextbooks(grade) {
  return chromaCall('list', grade != null ? { grade: Number(grade) } : {});
}

export function ingestTextbook(body) {
  return chromaCall('ingest', body, 15 * 60 * 1000);
}

export function queryChunks(body) {
  return chromaCall('query', body, 60000);
}

export function ingestDefaultTextbooks(force = false) {
  return chromaCall('ingest_defaults', { force: Boolean(force) }, 60 * 60 * 1000);
}
