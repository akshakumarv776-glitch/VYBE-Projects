# VYBE-Projects

## Projects

- [VYBE Chat](message-chats/README.md): Responsive full-stack messaging app with a Python API and SQLite database.
- Authentication Project: Flask app with registration, login, logout, dashboard and password reset.

---

## 1. Authentication Project (Flask)

### Run locally

Open the VS Code terminal:

```bash
cd authentication_project
python -m venv venv
```

Activate virtual environment on Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the application:

```bash
python app.py
```

Open http://127.0.0.1:5000

### Authentication Notes

- `database.db` is created automatically on first run.
- Set the `SECRET_KEY` environment variable in production.
- No email is sent yet. In debug mode, the password-reset link is shown on screen.

---

## 2. Main VYBE Project (Node.js)

The project uses Node.js 20 or newer and SQLite.

### Run locally

From the repository root:

```bash
npm install
```

Copy `.env.example` to `.env` and configure `JWT_SECRET`.

Start the application:

```bash
npm start
```

Open http://127.0.0.1:3000

### API Testing

```bash
npm test
```

### API Endpoints

- `GET /api/health` — Check API and database availability.
- `POST /api/auth/register` — Create an account.
- `POST /api/auth/login` — Sign in.
- `GET /api/users/me` — Get the signed-in user's profile.
- `GET /api/posts?limit=20` — Get newest posts.
- `POST /api/posts` — Create a post.
- `DELETE /api/posts/:id` — Delete your post.

For authenticated endpoints, send the login or registration token as:

```text
Authorization: Bearer <token>
```

Passwords are hashed before storage. User and post data are stored locally in SQLite.

---

## Security