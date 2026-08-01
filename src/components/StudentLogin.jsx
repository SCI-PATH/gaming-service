import { useState } from 'react';
import { MOCK_STUDENTS, loginStudent } from '../data/mockStudents.js';

/**
 * Mock student login — credentials are local-only for testing.
 */
export default function StudentLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const student = loginStudent(username, password);
    if (!student) {
      setError('Invalid username or password.');
      return;
    }
    setError('');
    onLogin?.(student);
  };

  const fillDemo = (student) => {
    setUsername(student.username);
    setPassword(student.password);
    setError('');
  };

  return (
    <div className="student-login">
      <div className="student-login-card">
        <p className="student-login-kicker">SCI_PATH · mock accounts</p>
        <h1>Student Login</h1>
        <p className="student-login-sub">
          Each account keeps its own mastery, target time, and unlocks.
        </p>

        <form className="student-login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="alex"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="farm123"
            />
          </label>
          {error && <p className="student-login-error">{error}</p>}
          <button type="submit">Enter farm</button>
        </form>

        <div className="student-login-demos">
          <p>Quick fill (click a student):</p>
          <ul>
            {MOCK_STUDENTS.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => fillDemo(s)}>
                  <strong>{s.displayName}</strong>
                  <span>
                    {s.username} / {s.password}
                  </span>
                  <em>{s.note}</em>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
