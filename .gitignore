
# VYBE-Projects

## 1. Authentication Project (Flask)

Flask app with register, login, logout, dashboard and password reset.

### Run Authentication Project

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

- database.db is created automatically on first run.
- Set the SECRET_KEY environment variable in production.
- No email is sent yet. In debug mode, the password-reset link is shown on screen.

---

## 2. Main VYBE Project (Node.js)

The project uses Node.js 20 or newer and SQLite.

### Run Main Project

From the repository root:

```bash
npm install
```

Copy `.env.example` to `.env` and configure JWT_SECRET.

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

- GET /api/health
- POST /api/auth/register
- POST /api/auth/login
- GET /api/users/me
- GET /api/posts?limit=20
- POST /api/posts
- DELETE /api/posts/:id

Authenticated endpoints require:

```text
Authorization: Bearer <token>
```

Passwords are hashed before storage, and user and post data are stored locally in SQLite.
