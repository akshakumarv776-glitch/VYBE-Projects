# VYBE-Projects

## authentication_project

Flask app with register, login, logout, dashboard and password reset.

### Run

```bash
cd authentication_project
python -m venv venv
# Windows: venv\Scripts\activate    macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000

In VS Code, press `F5` and select **Run Authentication Flask App**. Do not open
`templates/index.html` directly or with Live Server: Jinja template syntax is
processed only by the Flask server.

### Notes

- `database.db` is created automatically on first run.
- Set the `SECRET_KEY` environment variable in production. If it is not set, a key is generated once and stored in `.secret_key` (git-ignored).
- No email is sent yet. In debug mode (`python app.py`) the password-reset link is shown on screen instead.
