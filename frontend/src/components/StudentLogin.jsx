import { useState } from 'react';
import { loginStudent } from '../data/mockStudents.js';
import { GAME_NAME, GAME_PLATFORM } from '../data/gameBrand.js';

/** Student sign-in before entering the farm. */
export default function StudentLogin({ onLogin }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const student = loginStudent(name);
    if (!student) {
      setError('Enter your name (at least 2 characters).');
      return;
    }
    setError('');
    onLogin?.(student);
  };

  return (
    <div className="student-login">
      <div className="student-login-card">
        <p className="student-login-kicker">{GAME_PLATFORM} · {GAME_NAME}</p>
        <h1>Student Login</h1>
        <p className="student-login-sub">
          Enter your name to start your farm adventure.
        </p>

        <form className="student-login-form" onSubmit={handleSubmit}>
          <label>
            Your name
            <input
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maya"
            />
          </label>
          {error && <p className="student-login-error">{error}</p>}
          <button type="submit">Enter farm</button>
        </form>
      </div>
    </div>
  );
}
