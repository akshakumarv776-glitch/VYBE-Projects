# VYBE-Projects

## Run locally

The project uses Node.js 20 or newer and SQLite. From the repository root:

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env` and replace `JWT_SECRET` with a random value of at least 32 characters.
3. Start the app with `npm start`.
4. Open `http://127.0.0.1:3000`. The SQLite database is created at `backend/data/vybe.sqlite`.

The server also serves the static frontend at `/pages/index.html`. Set `DATABASE_PATH` to use a different SQLite file, or set `HOST` and `PORT` to change the bind address and port.

Run the API tests with `npm test`.

## API

- `GET /api/health` — check that the API and database are available.
- `POST /api/auth/register` — create an account with `{ "username", "email", "password" }`. Usernames must be 3-24 letters, numbers, or underscores; passwords must be 8-128 characters and no more than 72 UTF-8 bytes.
- `POST /api/auth/login` — sign in with `{ "email", "password" }`.
- `GET /api/users/me` — get the signed-in user's profile.
- `GET /api/posts?limit=20` — get the newest posts (limit 1–50).
- `POST /api/posts` — create a post with `{ "content" }` (requires authentication).
- `DELETE /api/posts/:id` — delete one of your posts (requires authentication).

For authenticated endpoints, send the login or registration token as `Authorization: Bearer <token>`. Passwords are hashed before storage; the database stores users and posts locally in SQLite.

