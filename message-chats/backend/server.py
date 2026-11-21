import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from http import HTTPStatus
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
DATABASE = Path(os.environ.get("VYBE_DB_PATH", ROOT / "data" / "chat.sqlite3"))
PORT = int(os.environ.get("PORT", "8000"))
SESSION_COOKIE = "vybe_session"
SESSION_SECONDS = 60 * 60 * 24 * 14
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_ATTACHMENT_BYTES = 1250 * 1024
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,24}$")
DATA_URL_PATTERN = re.compile(r"^data:([\w.+-]+/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$")
ALLOWED_DOCUMENTS = {".pdf", ".doc", ".docx", ".txt", ".rtf", ".xls", ".xlsx", ".ppt", ".pptx", ".zip"}


def connect():
    DATABASE.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATABASE, timeout=10)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    return db


@contextmanager
def database():
    db = connect()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_database():
    with database() as db:
        db.executescript(
            """
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash BLOB NOT NULL,
                password_salt BLOB NOT NULL,
                last_seen INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token_hash BLOB PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                expires_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('direct', 'group')),
                name TEXT,
                direct_key TEXT UNIQUE,
                created_by INTEGER NOT NULL REFERENCES users(id),
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conversation_members (
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (conversation_id, user_id)
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id),
                text TEXT NOT NULL DEFAULT '',
                attachment_name TEXT,
                attachment_type TEXT,
                attachment_data BLOB,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS messages_conversation_id ON messages(conversation_id, id);
            CREATE INDEX IF NOT EXISTS sessions_expiration ON sessions(expires_at);
            """
        )


def now_ms():
    return int(time.time() * 1000)


class APIError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class ChatHandler(BaseHTTPRequestHandler):
    server_version = "VYBE/1.0"

    def log_message(self, fmt, *args):
        print("%s - %s" % (self.address_string(), fmt % args))

    def send_json(self, status, payload, headers=None):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if headers:
            for name, value in headers.items():
                self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "Invalid request length.") from exc
        if length < 0 or length > MAX_REQUEST_BYTES:
            raise APIError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Request is too large.")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "Request body must be valid JSON.") from exc
        if not isinstance(data, dict):
            raise APIError(HTTPStatus.BAD_REQUEST, "Request body must be a JSON object.")
        return data

    def get_session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except (CookieError, ValueError, KeyError):
            return None
        morsel = cookie.get(SESSION_COOKIE)
        return morsel.value if morsel else None

    def current_user(self, db, required=True):
        token = self.get_session_token()
        if token:
            try:
                token_hash = hashlib.sha256(token.encode("ascii")).digest()
            except UnicodeEncodeError:
                token_hash = b""
            row = db.execute(
                """SELECT users.id, users.username
                   FROM sessions JOIN users ON users.id = sessions.user_id
                   WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
                (token_hash, int(time.time())),
            ).fetchone()
            if row:
                return row
        if required:
            raise APIError(HTTPStatus.UNAUTHORIZED, "Please sign in to continue.")
        return None

    def create_session(self, db, user_id):
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("ascii")).digest()
        expires = int(time.time()) + SESSION_SECONDS
        db.execute("DELETE FROM sessions WHERE expires_at <= ?", (int(time.time()),))
        db.execute(
            "INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, expires),
        )
        return "%s=%s; Path=/; HttpOnly; SameSite=Strict; Max-Age=%d" % (
            SESSION_COOKIE, token, SESSION_SECONDS
        )

    def create_guest(self, db):
        while True:
            username = "Guest-" + secrets.token_hex(4)
            salt = secrets.token_bytes(16)
            password_hash = secrets.token_bytes(32)
            cursor = db.execute(
                """INSERT OR IGNORE INTO users(username, password_hash, password_salt, last_seen)
                   VALUES (?, ?, ?, ?)""",
                (username, password_hash, salt, int(time.time())),
            )
            if cursor.rowcount:
                user = {"id": cursor.lastrowid, "username": username}
                return user, self.create_session(db, user["id"])

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api("GET", parsed.path, parse_qs(parsed.query))
        else:
            self.serve_frontend(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        if not parsed.path.startswith("/api/"):
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return
        self.handle_api("POST", parsed.path, parse_qs(parsed.query))

    def handle_api(self, method, path, query):
        try:
            with database() as db:
                if method == "GET" and path == "/api/me":
                    user = self.current_user(db, required=False)
                    headers = None
                    if not user:
                        user, cookie = self.create_guest(db)
                        headers = {"Set-Cookie": cookie}
                    self.send_json(HTTPStatus.OK, {"user": dict(user)}, headers)
                elif method == "POST" and path in ("/api/register", "/api/login"):
                    self.handle_auth(db, path)
                elif method == "POST" and path == "/api/logout":
                    user = self.current_user(db)
                    token = self.get_session_token()
                    db.execute(
                        "DELETE FROM sessions WHERE token_hash = ?",
                        (hashlib.sha256(token.encode("ascii")).digest(),),
                    )
                    self.send_json(HTTPStatus.OK, {"ok": True}, {
                        "Set-Cookie": "%s=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" % SESSION_COOKIE
                    })
                else:
                    user = self.current_user(db)
                    if method == "POST" and path == "/api/presence":
                        db.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), user["id"]))
                        self.send_json(HTTPStatus.OK, {"ok": True})
                    elif method == "GET" and path == "/api/chats":
                        self.list_chats(db, user)
                    elif method == "POST" and path == "/api/chats/direct":
                        self.open_direct(db, user)
                    elif method == "POST" and path == "/api/chats/group":
                        self.create_group(db, user)
                    elif method == "GET" and re.fullmatch(r"/api/chats/\d+/messages", path):
                        self.list_messages(db, user, path, query)
                    elif method == "POST" and re.fullmatch(r"/api/chats/\d+/messages", path):
                        self.create_message(db, user, path)
                    else:
                        raise APIError(HTTPStatus.NOT_FOUND, "API route not found.")
        except APIError as error:
            self.send_json(error.status, {"error": error.message})
        except sqlite3.IntegrityError:
            self.send_json(HTTPStatus.CONFLICT, {"error": "That username or conversation already exists."})
        except sqlite3.Error:
            self.log_error("Database operation failed")
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "The database could not complete the request."})

    def handle_auth(self, db, path):
        data = self.read_json()
        username = data.get("username", "")
        password = data.get("password", "")
        if not isinstance(username, str) or not USERNAME_PATTERN.fullmatch(username):
            raise APIError(HTTPStatus.BAD_REQUEST, "Username must be 3-24 letters, numbers, dots, dashes, or underscores.")
        if not isinstance(password, str) or len(password) < 8 or len(password) > 256:
            raise APIError(HTTPStatus.BAD_REQUEST, "Password must be between 8 and 256 characters.")

        if path == "/api/register":
            salt = secrets.token_bytes(16)
            password_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 240000)
            try:
                cursor = db.execute(
                    "INSERT INTO users(username, password_hash, password_salt, last_seen) VALUES (?, ?, ?, ?)",
                    (username, password_hash, salt, int(time.time())),
                )
            except sqlite3.IntegrityError as exc:
                raise APIError(HTTPStatus.CONFLICT, "That username is already taken.") from exc
            user_id = cursor.lastrowid
        else:
            row = db.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
            if not row:
                raise APIError(HTTPStatus.UNAUTHORIZED, "Username or password is incorrect.")
            actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), row["password_salt"], 240000)
            if not hmac.compare_digest(actual, row["password_hash"]):
                raise APIError(HTTPStatus.UNAUTHORIZED, "Username or password is incorrect.")
            user_id = row["id"]
            db.execute("UPDATE users SET last_seen = ? WHERE id = ?", (int(time.time()), user_id))

        cookie = self.create_session(db, user_id)
        self.send_json(HTTPStatus.OK, {"id": user_id, "username": username}, {"Set-Cookie": cookie})

    def list_chats(self, db, user):
        users = db.execute(
            """SELECT u.id, u.username, u.last_seen, c.id AS conversation_id,
                      (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                      (SELECT m.attachment_name FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_attachment,
                      (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_time,
                      (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_id,
                      (SELECT m.user_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_user_id
               FROM users u
               LEFT JOIN conversations c ON c.direct_key = CASE
                   WHEN u.id < ? THEN CAST(u.id AS TEXT) || ':' || CAST(? AS TEXT)
                   ELSE CAST(? AS TEXT) || ':' || CAST(u.id AS TEXT)
               END
               WHERE u.id != ? ORDER BY u.username COLLATE NOCASE""",
            (user["id"], user["id"], user["id"], user["id"]),
        ).fetchall()
        groups = db.execute(
            """SELECT c.id, c.name,
                      (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count,
                      (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_text,
                      (SELECT m.attachment_name FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_attachment,
                      (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_time,
                      (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_id,
                      (SELECT m.user_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_user_id
               FROM conversations c JOIN conversation_members mine ON mine.conversation_id = c.id
               WHERE mine.user_id = ? AND c.kind = 'group' ORDER BY c.created_at DESC""",
            (user["id"],),
        ).fetchall()

        result = []
        for row in users:
            result.append({
                "id": row["id"],
                "conversationId": row["conversation_id"],
                "name": row["username"],
                "kind": "direct",
                "online": int(time.time()) - row["last_seen"] < 35,
                "preview": row["last_text"] or row["last_attachment"] or "Start a conversation",
                "lastTime": row["last_time"],
                "lastMessageId": row["last_message_id"],
                "lastSenderId": row["last_user_id"],
            })
        for row in groups:
            result.append({
                "id": "group-" + str(row["id"]),
                "conversationId": row["id"],
                "name": row["name"],
                "kind": "group",
                "memberCount": row["member_count"],
                "preview": row["last_text"] or row["last_attachment"] or "Start a conversation",
                "lastTime": row["last_time"],
                "lastMessageId": row["last_message_id"],
                "lastSenderId": row["last_user_id"],
            })
        result.sort(key=lambda item: (item["lastTime"] is not None, item["lastTime"] or 0), reverse=True)
        self.send_json(HTTPStatus.OK, {"chats": result})

    def open_direct(self, db, user):
        other_id = self.read_json().get("user_id")
        if not isinstance(other_id, int) or other_id == user["id"]:
            raise APIError(HTTPStatus.BAD_REQUEST, "Choose a valid contact.")
        other = db.execute("SELECT id FROM users WHERE id = ?", (other_id,)).fetchone()
        if not other:
            raise APIError(HTTPStatus.NOT_FOUND, "Contact not found.")
        first, second = sorted((user["id"], other_id))
        direct_key = "%d:%d" % (first, second)
        row = db.execute("SELECT id FROM conversations WHERE direct_key = ?", (direct_key,)).fetchone()
        if row:
            conversation_id = row["id"]
        else:
            cursor = db.execute(
                "INSERT INTO conversations(kind, direct_key, created_by, created_at) VALUES ('direct', ?, ?, ?)",
                (direct_key, user["id"], now_ms()),
            )
            conversation_id = cursor.lastrowid
            db.executemany(
                "INSERT INTO conversation_members(conversation_id, user_id) VALUES (?, ?)",
                ((conversation_id, first), (conversation_id, second)),
            )
        self.send_json(HTTPStatus.OK, {"conversationId": conversation_id})

    def create_group(self, db, user):
        data = self.read_json()
        name = data.get("name")
        members = data.get("members")
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 60:
            raise APIError(HTTPStatus.BAD_REQUEST, "Group name must be between 1 and 60 characters.")
        if not isinstance(members, list) or not members or len(members) > 50:
            raise APIError(HTTPStatus.BAD_REQUEST, "Add at least one contact to the group.")
        if any(not isinstance(member, int) or member == user["id"] for member in members):
            raise APIError(HTTPStatus.BAD_REQUEST, "Group members must be valid contacts.")
        member_ids = sorted(set(members + [user["id"]]))
        placeholders = ",".join("?" for _ in member_ids)
        found = db.execute("SELECT COUNT(*) FROM users WHERE id IN (%s)" % placeholders, member_ids).fetchone()[0]
        if found != len(member_ids):
            raise APIError(HTTPStatus.BAD_REQUEST, "One or more group members could not be found.")
        cursor = db.execute(
            "INSERT INTO conversations(kind, name, created_by, created_at) VALUES ('group', ?, ?, ?)",
            (name.strip(), user["id"], now_ms()),
        )
        conversation_id = cursor.lastrowid
        db.executemany(
            "INSERT INTO conversation_members(conversation_id, user_id) VALUES (?, ?)",
            ((conversation_id, member_id) for member_id in member_ids),
        )
        self.send_json(HTTPStatus.CREATED, {"conversationId": conversation_id})

    def check_membership(self, db, conversation_id, user_id):
        row = db.execute(
            "SELECT id, kind FROM conversations WHERE id = ? AND EXISTS "
            "(SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?)",
            (conversation_id, conversation_id, user_id),
        ).fetchone()
        if not row:
            raise APIError(HTTPStatus.NOT_FOUND, "Chat not found.")
        return row

    def list_messages(self, db, user, path, query):
        conversation_id = int(path.split("/")[3])
        self.check_membership(db, conversation_id, user["id"])
        try:
            after = int(query.get("after", ["0"])[0])
        except ValueError as exc:
            raise APIError(HTTPStatus.BAD_REQUEST, "Invalid message cursor.") from exc
        rows = db.execute(
            """SELECT m.id, m.user_id, u.username, m.text, m.attachment_name,
                      m.attachment_type, m.attachment_data, m.created_at
               FROM messages m JOIN users u ON u.id = m.user_id
               WHERE m.conversation_id = ? AND m.id > ? ORDER BY m.id LIMIT 200""",
            (conversation_id, after),
        ).fetchall()
        messages = []
        for row in rows:
            attachment = None
            if row["attachment_data"] is not None:
                attachment = {
                    "name": row["attachment_name"],
                    "type": row["attachment_type"],
                    "data": "data:%s;base64,%s" % (
                        row["attachment_type"],
                        base64.b64encode(row["attachment_data"]).decode("ascii"),
                    ),
                }
            messages.append({
                "id": row["id"],
                "sender": row["username"],
                "direction": "sent" if row["user_id"] == user["id"] else "received",
                "text": row["text"],
                "attachment": attachment,
                "time": row["created_at"],
            })
        self.send_json(HTTPStatus.OK, {"messages": messages})

    def create_message(self, db, user, path):
        conversation_id = int(path.split("/")[3])
        self.check_membership(db, conversation_id, user["id"])
        data = self.read_json()
        text = data.get("text", "")
        if not isinstance(text, str) or len(text) > 10000:
            raise APIError(HTTPStatus.BAD_REQUEST, "Message must be 10,000 characters or fewer.")
        attachment = data.get("attachment")
        attachment_name = attachment_type = attachment_data = None
        if attachment is not None:
            if not isinstance(attachment, dict):
                raise APIError(HTTPStatus.BAD_REQUEST, "Invalid attachment.")
            name = attachment.get("name")
            data_url = attachment.get("data")
            if not isinstance(name, str) or not name.strip() or len(name) > 255 or not isinstance(data_url, str):
                raise APIError(HTTPStatus.BAD_REQUEST, "Invalid attachment name or data.")
            match = DATA_URL_PATTERN.fullmatch(data_url)
            if not match:
                raise APIError(HTTPStatus.BAD_REQUEST, "Attachment data is invalid.")
            try:
                decoded = base64.b64decode(match.group(2), validate=True)
            except (ValueError, base64.binascii.Error) as exc:
                raise APIError(HTTPStatus.BAD_REQUEST, "Attachment data is invalid.") from exc
            if len(decoded) > MAX_ATTACHMENT_BYTES:
                raise APIError(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "Attachments must be 1.25 MB or smaller.")
            attachment_type = match.group(1).lower()
            extension = Path(name).suffix.lower()
            if not (attachment_type.startswith("image/") or attachment_type.startswith("video/")
                    or extension in ALLOWED_DOCUMENTS):
                raise APIError(HTTPStatus.BAD_REQUEST, "Unsupported attachment type.")
            attachment_name = Path(name).name
            attachment_data = decoded
        if not text.strip() and attachment_data is None:
            raise APIError(HTTPStatus.BAD_REQUEST, "Write a message or attach a file.")
        cursor = db.execute(
            """INSERT INTO messages(conversation_id, user_id, text, attachment_name,
                       attachment_type, attachment_data, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (conversation_id, user["id"], text.strip(), attachment_name,
             attachment_type, attachment_data, now_ms()),
        )
        self.send_json(HTTPStatus.CREATED, {"id": cursor.lastrowid})

    def serve_frontend(self, path):
        relative = unquote(path).lstrip("/")
        if not relative:
            relative = "chat.html"
        requested = (FRONTEND / relative).resolve()
        if FRONTEND.resolve() not in requested.parents or not requested.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        content = requested.read_bytes()
        content_type = mimetypes.guess_type(requested.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith(("text/", "application/javascript")) else ""))
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self' data:; img-src 'self' data:; media-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self';")
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    initialize_database()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), ChatHandler)
    print("VYBE chat is running at http://127.0.0.1:%d" % PORT)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping VYBE chat.")
        server.server_close()
