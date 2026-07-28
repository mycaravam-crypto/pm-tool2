// Preloaded via `node --import` (see package.json's "test" script) so this
// runs before any test file's own imports — in particular, before
// db/connection.js's top-level code opens a database. Points every test file
// at its own private in-memory SQLite database instead of the real
// server/data/chronos.db, so running tests never touches real dev/prod data.
// `node --test` runs each test file in its own process by default, so each
// one gets a fresh, isolated ':memory:' database.
process.env.DB_PATH = ':memory:';
