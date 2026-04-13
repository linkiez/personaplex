// Set required env vars before any module import
process.env['DATABASE_URL'] = 'postgres://test:test@localhost:5432/test';
process.env['JWT_SECRET'] = 'test-secret-at-least-32-chars-long!!';
process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret-32-chars-long!';
