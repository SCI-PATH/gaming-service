import { useState } from 'react';
import {
  loginStudent,
  loginMockStorylineStudent,
  MOCK_STORYLINE_STUDENTS,
} from '../data/mockStudents.js';

/**
 * Student sign-in: own name, or a mock performance profile for testing.
 */
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

  const handleMock = (studentId) => {
    const student = loginMockStorylineStudent(studentId);
    if (!student) {
      setError('Could not load that mock profile.');
      return;
    }
    setError('');
    onLogin?.(student);
  };

  return (
    <div className="student-login">
      <div className="student-login-card">
        <p className="student-login-kicker">SCI_PATH</p>
        <h1>Student Login</h1>
        <p className="student-login-sub">
          Enter your name to start, or pick a mock profile for testing.
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

        <div className="student-gameplay-tests">
          <p>Mock performance profiles</p>
          <div className="student-gameplay-btns">
            {MOCK_STORYLINE_STUDENTS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`student-gameplay-btn ${profileButtonClass(s.id)}`}
                onClick={() => handleMock(s.id)}
              >
                <strong>
                  {s.displayName} · {s.performanceLabel}
                </strong>
                <span>Loads mock metrics for gameplay testing</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function profileButtonClass(id) {
  if (id === 'mock_student_1') return 'gp-smart';
  if (id === 'mock_student_2') return 'gp-medium';
  return 'gp-weak';
}
