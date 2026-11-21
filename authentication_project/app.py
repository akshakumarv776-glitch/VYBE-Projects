import hashlib
import os
import re
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import (
    Flask,
    abort,
    flash,
    redirect,
    render_template,
    request,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "database.db"
SECRET_KEY_FILE = BASE_DIR / ".secret_key"

# Flask looks for "templates" and "static" next to app.py by default.
app = Flask(__name__)


def load_secret_key():
    """Use SECRET_KEY from the environment, else a key generated once and kept on disk."""
    env_key = os.environ.get("SECRET_KEY")
    if env_key:
        return env_key
    if SECRET_KEY_FILE.exists():
        return SECRET_KEY_FILE.read_text().strip()
    key = secrets.token_hex(32)
    SECRET_KEY_FILE.write_text(key)
    return key


app.secret_key = load_secret_key()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
MIN_PASSWORD_LENGTH = 8
RESET_TOKEN_MINUTES = 30


# --------------------------------------------------------------------------
# Database
# --------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def create_table():
    with closing(get_db()) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                reset_token TEXT,
                reset_expiry TEXT
            )
            """
        )
        conn.commit()


# --------------------------------------------------------------------------
# Helpers: CSRF, login protection, validation
# --------------------------------------------------------------------------
def get_csrf_token():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(16)
    return session["csrf_token"]


app.jinja_env.globals["csrf_token"] = get_csrf_token


@app.before_request
def check_csrf():
    if request.method == "POST":
        sent = request.form.get("csrf_token", "")
        expected = session.get("csrf_token", "")
        if not expected or not secrets.compare_digest(sent, expected):
            abort(400, description="Invalid or missing CSRF token.")


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            flash("Please log in first.")
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def validate_password(password):
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Password must contain at least {MIN_PASSWORD_LENGTH} characters"
    return None


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        error = None
        if len(name) < 2:
            error = "Enter a valid name"
        elif not EMAIL_PATTERN.match(email):
            error = "Enter a valid email"
        else:
            error = validate_password(password)

        if error:
            flash(error)
            return render_template("register.html"), 400

        try:
            with closing(get_db()) as conn:
                conn.execute(
                    "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
                    (name, email, generate_password_hash(password)),
                )
                conn.commit()
        except sqlite3.IntegrityError:
            flash("An account with this email already exists")
            return render_template("register.html"), 409

        flash("Account created. Please log in.")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")

        with closing(get_db()) as conn:
            user = conn.execute(
                "SELECT id, name, password FROM users WHERE email = ?", (email,)
            ).fetchone()

        if user and check_password_hash(user["password"], password):
            session.clear()  # prevents session fixation
            session["user_id"] = user["id"]
            session["user_name"] = user["name"]
            return redirect(url_for("dashboard"))

        flash("Invalid email or password")
        return render_template("login.html"), 401

    return render_template("login.html")


@app.route("/dashboard")
@login_required
def dashboard():
    return render_template("dashboard.html")


@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    flash("You have been logged out.")
    return redirect(url_for("login"))


@app.route("/forgot-password", methods=["GET", "POST"])
def forgot_password():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()

        with closing(get_db()) as conn:
            user = conn.execute(
                "SELECT id FROM users WHERE email = ?", (email,)
            ).fetchone()

            if user:
                token = secrets.token_urlsafe(32)
                expiry = datetime.now(timezone.utc) + timedelta(
                    minutes=RESET_TOKEN_MINUTES
                )
                conn.execute(
                    "UPDATE users SET reset_token = ?, reset_expiry = ? WHERE id = ?",
                    (hash_token(token), expiry.isoformat(), user["id"]),
                )
                conn.commit()

                # No email service is configured yet, so the link is only
                # shown on screen while running in debug mode.
                if app.debug:
                    link = url_for("reset_password", token=token, _external=True)
                    flash(f"Debug mode - reset link: {link}")

        # Same message whether or not the email exists (avoids account enumeration).
        flash("If that email is registered, a reset link has been sent.")
        return redirect(url_for("forgot_password"))

    return render_template("forgot_password.html")


@app.route("/reset-password/<token>", methods=["GET", "POST"])
def reset_password(token):
    token_hash = hash_token(token)

    with closing(get_db()) as conn:
        user = conn.execute(
            "SELECT id, reset_expiry FROM users WHERE reset_token = ?",
            (token_hash,),
        ).fetchone()

        valid = False
        if user and user["reset_expiry"]:
            try:
                valid = datetime.fromisoformat(user["reset_expiry"]) > datetime.now(
                    timezone.utc
                )
            except ValueError:
                valid = False

        if not valid:
            flash("This reset link is invalid or has expired.")
            return redirect(url_for("forgot_password"))

        if request.method == "POST":
            password = request.form.get("password", "")
            error = validate_password(password)
            if error:
                flash(error)
                return render_template("reset_password.html"), 400

            conn.execute(
                "UPDATE users SET password = ?, reset_token = NULL, "
                "reset_expiry = NULL WHERE id = ?",
                (generate_password_hash(password), user["id"]),
            )
            conn.commit()
            flash("Password updated. Please log in.")
            return redirect(url_for("login"))

    return render_template("reset_password.html")


# Make sure the table exists however the app is started (python app.py or flask run).
create_table()

if __name__ == "__main__":
    app.run(debug=True)
