# VYBE Chat

VYBE is a small full-stack chat app with a responsive purple glass UI, direct and group conversations, text and file messages, online presence, desktop notifications, and persistent chat history.

## Run locally

Requires Python 3.10 or newer. The backend uses only Python's standard library.

```powershell
cd message-chats
python backend/server.py
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000) to go straight to chat. A guest profile is created automatically; open another browser or private window to create another guest and try direct and group chats. Messages are checked every two seconds; presence expires after 35 seconds without a heartbeat.

The SQLite database is created at `message-chats/data/chat.sqlite3`. Set `VYBE_DB_PATH` to use a different file and `PORT` to change the default port. Attachments are stored in SQLite and limited to 1.25 MB each.

## Test

```powershell
python -m unittest discover -s tests -v
```

## API

- `POST /api/register`, `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET /api/chats`, `POST /api/chats/direct`, `POST /api/chats/group`
- `GET /api/chats/{id}/messages?after={messageId}`, `POST /api/chats/{id}/messages`
- `POST /api/presence`

Guest sessions use an HttpOnly, SameSite cookie. Optional account endpoints store passwords as salted PBKDF2 hashes. This lightweight local app is intended as a starter/demo; deploy behind HTTPS and add operational protections before exposing it publicly.
