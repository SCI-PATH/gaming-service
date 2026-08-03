import { useState } from 'react';
import {
  MOCK_STUDENTS,
  loginStudent,
  loginTestStudent,
  resetAllStudentProgress,
} from '../data/mockStudents.js';
import { seedTestGameplayProfile } from '../data/gameplayPerformance.js';
import {
  clearOwnedUnlocks,
  markUnlocked,
  advanceChallengeProgress,
} from '../data/unlockShop.js';

const TEST_USER = { username: 'dana', password: 'plant000' };

const GAMEPLAY_TEST_USERS = MOCK_STUDENTS.filter((s) => s.gameplayProfile);

function queueDevJump(payload) {
  try {
    sessionStorage.setItem('scipath_dev_jump', JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function applyGameplaySeed(student) {
  if (!student?.gameplayProfile) return;
  try {
    seedTestGameplayProfile(student.gameplayProfile);
  } catch {
    // ignore
  }
}

/**
 * Mock student login — credentials are local-only for testing.
 */
export default function StudentLogin({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [resetNote, setResetNote] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();
    const student = loginStudent(username, password);
    if (!student) {
      setError('Invalid username or password.');
      return;
    }
    applyGameplaySeed(student);
    setError('');
    setResetNote('');
    onLogin?.(student);
  };

  const fillDemo = (student) => {
    setUsername(student.username);
    setPassword(student.password);
    setError('');
  };

  const playAs = (student) => {
    const loggedIn = loginTestStudent(student.id);
    if (!loggedIn) {
      setError(`Could not log in as ${student.displayName}.`);
      return;
    }
    applyGameplaySeed(loggedIn);
    queueDevJump({
      mode: 'gameplay_profile',
      levelId: 2,
      startingMoney: 150,
    });
    setError('');
    setResetNote('');
    onLogin?.(loggedIn, { testMode: `gameplay_${student.gameplayProfile}` });
  };

  /**
   * Test shortcut: seeds house + chicks (+ hen house) + calf as if bought
   * on a previous level. Click Farm House / Hen House / Calf on the map.
   */
  const playHouseAndEggsAs = (student) => {
    const loggedIn = loginTestStudent(student.id);
    if (!loggedIn) {
      setError(
        `Could not start house + eggs + calf test as ${student.displayName}.`,
      );
      return;
    }
    applyGameplaySeed(loggedIn);
    clearOwnedUnlocks();
    // Pretend student bought these after level 1 (challenges unlock on level 2+)
    markUnlocked('house', { purchasedAtLevel: 1 });
    markUnlocked('chick', { purchasedAtLevel: 1 });
    markUnlocked('calf', { purchasedAtLevel: 1 });
    try {
      // Skip raise-chick quiz noise for the house/eggs check
      advanceChallengeProgress('chick', 'raise_chick', {
        stepIndex: 1,
        done: true,
      });
    } catch {
      // ignore
    }
    queueDevJump({
      mode: 'house_challenge',
      levelId: 2,
      startingMoney: 500,
    });
    setError('');
    setResetNote('');
    onLogin?.(loggedIn, {
      testMode: `house_${student.gameplayProfile}`,
    });
  };

  const handleResetAll = () => {
    resetAllStudentProgress();
    setUsername('');
    setPassword('');
    setError('');
    setResetNote('All students reset — unlocks and mastery cleared.');
  };

  const handleTestBuyHouse = () => {
    const student = loginStudent(TEST_USER.username, TEST_USER.password);
    if (!student) {
      setError('Could not start house buy test.');
      return;
    }
    clearOwnedUnlocks();
    queueDevJump({
      mode: 'buy_house',
      levelId: 1,
      startingMoney: 2000,
    });
    setError('');
    setResetNote('');
    onLogin?.(student, { testMode: 'buy_house' });
  };

  return (
    <div className="student-login">
      <div className="student-login-card">
        <p className="student-login-kicker">SCI_PATH · mock accounts</p>
        <h1>Student Login</h1>
        <p className="student-login-sub">
          Each account keeps its own mastery, gameplay band, house luxury, egg
          timers, calf feed pace, and unlocks. Test buttons only skip the shop
          for checking — in the real game students buy unlocks on earlier levels.
        </p>

        <div className="student-gameplay-tests">
          <p>Farm gameplay test users (level 2 + seeded band):</p>
          <div className="student-gameplay-btns">
            {GAMEPLAY_TEST_USERS.map((s) => (
              <button
                key={`farm-${s.id}`}
                type="button"
                className={`student-gameplay-btn gp-${s.gameplayProfile}`}
                onClick={() => playAs(s)}
              >
                <strong>{s.displayName}</strong>
                <span>
                  {s.username} / {s.password}
                </span>
                <em>{s.note}</em>
              </button>
            ))}
          </div>
        </div>

        <div className="student-gameplay-tests student-house-tests">
          <p>
            House + eggs + calf test (weak / average / smart) — seeds Farm
            House, Hen House, and a Calf Pen on the map. Click buildings/pen on
            the farm; calf feed uses normal science questions and fills buckets
            in the pen.
          </p>
          <div className="student-gameplay-btns">
            {GAMEPLAY_TEST_USERS.map((s) => (
              <button
                key={`house-eggs-${s.id}`}
                type="button"
                className={`student-gameplay-btn gp-${s.gameplayProfile}`}
                onClick={() => playHouseAndEggsAs(s)}
              >
                <strong>House + Eggs + Calf · {s.displayName}</strong>
                <span>
                  {s.username} / {s.password}
                </span>
                <em>
                  {s.gameplayProfile === 'weak'
                    ? 'Poor furniture + gentle egg/calf timers'
                    : s.gameplayProfile === 'strong'
                      ? 'Luxury furniture + fast egg/calf timers'
                      : 'Average furniture + steady egg/calf timers'}
                </em>
              </button>
            ))}
          </div>
        </div>

        <form className="student-login-form" onSubmit={handleSubmit}>
          <label>
            Username
            <input
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="weak / average / smart"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="weak123 / avg123 / smart123"
            />
          </label>
          {error && <p className="student-login-error">{error}</p>}
          {resetNote && <p className="student-login-reset-note">{resetNote}</p>}
          <button type="submit">Enter farm</button>
        </form>

        <div className="student-dev-tests">
          <p>Extra shop shortcut (dana · buy house yourself):</p>
          <button type="button" className="student-dev-btn" onClick={handleTestBuyHouse}>
            Test: buy house ($2000 + shop)
          </button>
          <button
            type="button"
            className="student-dev-btn student-reset-all"
            onClick={handleResetAll}
          >
            Reset all student progress
          </button>
        </div>

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
