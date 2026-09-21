import { useCallback, useEffect, useState } from 'react';
import {
  GRADES,
  ingestDefaultTextbooks,
  ingestTextbook,
  listTextbooks,
  reprocessTextbook,
} from '../data/scienceMindMapApi.js';

export default function TextbookIngestView() {
  const [grade, setGrade] = useState('');
  const [title, setTitle] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [rows, setRows] = useState([]);
  const [chroma, setChroma] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const data = await listTextbooks();
      setRows(data.textbooks || []);
      setChroma(data.chroma || null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load textbooks');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onIngest = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await ingestTextbook({
        grade: Number(grade),
        title,
        source_url: sourceUrl,
      });
      setSourceUrl('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const onDefaults = async () => {
    setBusy(true);
    setError('');
    try {
      await ingestDefaultTextbooks(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Default ingest failed');
    } finally {
      setBusy(false);
    }
  };

  const onReprocess = async (row) => {
    setBusy(true);
    setError('');
    try {
      await reprocessTextbook({
        id: row.id,
        grade: row.grade,
        title: row.title,
        source_url: row.source_url,
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reprocess failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="textbook-ingest-view">
      <div className="science-mindmap-intro">
        <p className="science-mindmap-kicker">Admin</p>
        <h2>Science textbook ingest</h2>
        <p>
          PDFs are downloaded, split into chunks, embedded, and stored in persistent ChromaDB
          collection <code>science_textbooks</code>
          {chroma?.count != null ? ` (${chroma.count} chunks)` : ''}.
        </p>
      </div>

      <form className="textbook-ingest-form" onSubmit={onIngest}>
        <label>
          Grade
          <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
            <option value="">Select</option>
            {GRADES.map((item) => (
              <option key={item} value={item}>
                Grade {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Grade 6 Science" />
        </label>
        <label className="textbook-ingest-url">
          Textbook PDF URL
          <input
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="http://www.edupub.gov.lk/..."
            required
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Working…' : 'Ingest URL'}
        </button>
        <button type="button" className="is-secondary" onClick={onDefaults} disabled={busy}>
          Ingest Grade 6–9 defaults
        </button>
      </form>

      {error ? <p className="science-mindmap-error">{error}</p> : null}

      <div className="textbook-ingest-table-wrap">
        <table className="textbook-ingest-table">
          <thead>
            <tr>
              <th>Grade</th>
              <th>Title</th>
              <th>Status</th>
              <th>Chunks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.grade}</td>
                <td>
                  <div>{row.title}</div>
                  <small>{row.stage_detail || row.source_url}</small>
                  {row.error_message ? (
                    <div className="science-mindmap-error">{row.error_message}</div>
                  ) : null}
                </td>
                <td>{row.status}</td>
                <td>{row.chunks_created || 0}</td>
                <td>
                  <button type="button" onClick={() => onReprocess(row)} disabled={busy}>
                    Reprocess
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
