/**
 * Printed by the repo root dev script.
 * The farm API and the game UI are separate processes and must be started apart.
 */
console.error(`SCI_PATH runs as two processes. Start them in separate terminals:

  npm run backend     API + database   http://127.0.0.1:8002
  npm run frontend    game UI          http://127.0.0.1:5173

From folders:

  cd backend && npm run dev
  cd frontend && npm run dev
`);
process.exit(1);
