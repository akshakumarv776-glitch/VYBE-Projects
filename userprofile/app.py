import sqlite3
from pathlib import Path
from werkzeug.utils import secure_filename

from flask import Flask, jsonify, request, send_from_directory


BASE_DIR = Path(__file__).resolve().parent
DATABASE = BASE_DIR / "profile.db"
UPLOAD_DIR = BASE_DIR / "uploads"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}

UPLOAD_DIR.mkdir(exist_ok=True)
app = Flask(__name__)


def get_db():
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    connection = get_db()
    connection.executescript(
        """
        CREATE TABLE IF NOT EXISTS profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT NOT NULL,
            handle TEXT NOT NULL,
            bio TEXT NOT NULL,
            email TEXT NOT NULL,
            location TEXT NOT NULL,
            website TEXT NOT NULL,
            avatar TEXT NOT NULL,
            is_private INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS connections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            handle TEXT NOT NULL,
            avatar_color TEXT NOT NULL,
            following INTEGER NOT NULL DEFAULT 0
        );
        """
    )
    profile = connection.execute("SELECT id FROM profile WHERE id = 1").fetchone()
    if profile is None:
        connection.execute(
            """
            INSERT INTO profile
            (id, name, handle, bio, email, location, website, avatar, is_private)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                1,
                "Deenaa Saravanan",
                "@deenaa",
                "Creating thoughtful digital experiences.",
                "deenaa@gmail.com",
                "Chennai, India",
                "deenaa.design",
                "",
                0,
            ),
        )

    if connection.execute("SELECT COUNT(*) FROM connections").fetchone()[0] == 0:
        connection.executemany(
            """
            INSERT INTO connections (name, handle, avatar_color, following)
            VALUES (?, ?, ?, ?)
            """,
            [
                ("Arun Kumar", "@arun", "#8e7cf4", 0),
                ("Priya Sharma", "@priya", "#f18cb7", 0),
                ("Rahul Menon", "@rahul", "#69a8ed", 0),
            ],
        )

    connection.commit()
    connection.close()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:filename>")
def assets(filename):
    if filename.startswith("uploads/"):
        return send_from_directory(BASE_DIR, filename)
    return send_from_directory(BASE_DIR, filename)


@app.route("/api/profile", methods=["GET"])
def get_profile():
    connection = get_db()
    profile = connection.execute("SELECT * FROM profile WHERE id = 1").fetchone()
    connections = connection.execute(
        "SELECT COUNT(*) AS following_count FROM connections WHERE following = 1"
    ).fetchone()["following_count"]
    connection.close()
    data = dict(profile)
    data["following_count"] = connections
    data["is_private"] = bool(data["is_private"])
    return jsonify(data)


@app.route("/api/profile", methods=["PUT"])
def update_profile():
    data = request.get_json(silent=True) or {}
    allowed = ("name", "handle", "bio", "email", "location", "website", "is_private")
    values = {key: data[key] for key in allowed if key in data}
    if not values:
        return jsonify({"error": "No profile fields supplied"}), 400

    connection = get_db()
    if "is_private" in values:
        values["is_private"] = 1 if values["is_private"] else 0

    assignments = ", ".join(f"{key} = ?" for key in values)
    connection.execute(
        f"UPDATE profile SET {assignments} WHERE id = 1",
        list(values.values()),
    )
    connection.commit()
    connection.close()
    return jsonify({"success": True})


@app.route("/api/profile/photo", methods=["POST"])
def upload_photo():
    file = request.files.get("avatar")
    if file is None or file.filename == "":
        return jsonify({"error": "No image selected"}), 400
    if not allowed_file(file.filename):
        return jsonify({"error": "Use a PNG, JPG, JPEG, or WebP image"}), 400

    filename = secure_filename(file.filename)
    filename = f"profile-{filename}"
    file.save(UPLOAD_DIR / filename)

    connection = get_db()
    connection.execute(
        "UPDATE profile SET avatar = ? WHERE id = 1",
        (f"/uploads/{filename}",),
    )
    connection.commit()
    connection.close()
    return jsonify({"avatar": f"/uploads/{filename}"})


@app.route("/api/connections", methods=["GET"])
def get_connections():
    connection = get_db()
    rows = connection.execute(
        "SELECT id, name, handle, avatar_color, following FROM connections"
    ).fetchall()
    connection.close()
    return jsonify([dict(row) for row in rows])


@app.route("/api/connections/<int:connection_id>/follow", methods=["POST"])
def toggle_follow(connection_id):
    connection = get_db()
    row = connection.execute(
        "SELECT following FROM connections WHERE id = ?", (connection_id,)
    ).fetchone()
    if row is None:
        connection.close()
        return jsonify({"error": "Connection not found"}), 404

    following = 0 if row["following"] else 1
    connection.execute(
        "UPDATE connections SET following = ? WHERE id = ?",
        (following, connection_id),
    )
    connection.commit()
    connection.close()
    return jsonify({"following": bool(following)})


init_db()

if __name__ == "__main__":
    app.run(debug=True, port=5000)
