
import os
import uuid
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename

from database import get_connection

ROOT = Path(__file__).resolve().parent.parent
FRONTEND = ROOT / "frontend"
UPLOADS = FRONTEND / "uploads"

UPLOADS.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {
    "jpg", "jpeg", "png", "gif", "webp",
    "mp4", "webm", "ogg"
}

CURRENT_USER_ID = 1  # Temporary demo user

app = Flask(__name__, static_folder=str(FRONTEND), static_url_path="/static")
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024


def query_db(sql, params=(), fetch=False, one=False):
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    try:
        cursor.execute(sql, params)

        if one:
            result = cursor.fetchone()
        elif fetch:
            result = cursor.fetchall()
        else:
            result = None

        conn.commit()
        return result

    except Exception:
        conn.rollback()
        raise

    finally:
        cursor.close()
        conn.close()


def get_post_data(post):
    comments = query_db(
        """SELECT c.body, u.username
           FROM comments c
           JOIN users u ON c.user_id = u.id
           WHERE c.post_id = %s
           ORDER BY c.created_at ASC""",
        (post["id"],),
        fetch=True
    )

    return {
        "id": post["id"],
        "user_id": post["user_id"],
        "username": post["username"],
        "display_name": post["display_name"],
        "caption": post["caption"] or "",
        "media_url": (
            f"/uploads/{post['media_filename']}"
            if post["media_filename"] else None
        ),
        "media_type": post["media_type"] or "",
        "created_at": str(post["created_at"]),
        "like_count": post["like_count"],
        "comment_count": post["comment_count"],
        "share_count": post["share_count"],
        "liked_by_me": bool(post["liked_by_me"]),
        "comments": comments
    }


@app.route("/")
def home():
    return send_from_directory(FRONTEND, "index.html")


@app.route("/dashboard")
def dashboard():
    return send_from_directory(FRONTEND, "dashboard.html")


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOADS, filename)


@app.route("/api/health")
def health():
    try:
        query_db("SELECT 1", fetch=True)
        return jsonify({
            "status": "success",
            "database": "connected"
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# VIEW POSTS
@app.route("/api/posts", methods=["GET"])
def get_posts():
    try:
        rows = query_db(
            """
            SELECT p.id, p.user_id, u.username, u.display_name,
                   p.caption, p.media_filename, p.media_type,
                   p.created_at, p.share_count,

                   (SELECT COUNT(*)
                    FROM likes l
                    WHERE l.post_id = p.id) AS like_count,

                   (SELECT COUNT(*)
                    FROM comments c
                    WHERE c.post_id = p.id) AS comment_count,

                   EXISTS(
                       SELECT 1 FROM likes ml
                       WHERE ml.post_id = p.id
                       AND ml.user_id = %s
                   ) AS liked_by_me

            FROM posts p
            JOIN users u ON p.user_id = u.id

            WHERE p.user_id = %s
               OR p.user_id IN (
                   SELECT followed_id
                   FROM follows
                   WHERE follower_id = %s
               )

            ORDER BY p.created_at DESC
            LIMIT 100
            """,
            (CURRENT_USER_ID, CURRENT_USER_ID, CURRENT_USER_ID),
            fetch=True
        )

        return jsonify({
            "posts": [get_post_data(post) for post in rows]
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# CREATE POST
@app.route("/api/posts", methods=["POST"])
def create_post():
    caption = request.form.get("caption", "").strip()
    media = request.files.get("media")

    if not caption and (not media or not media.filename):
        return jsonify({"error": "Caption or media is required"}), 400

    filename = None
    media_type = None

    if media and media.filename:
        safe_name = secure_filename(media.filename)

        if (
            not safe_name
            or "." not in safe_name
            or safe_name.rsplit(".", 1)[1].lower() not in ALLOWED_EXTENSIONS
        ):
            return jsonify({"error": "Invalid media file"}), 400

        extension = safe_name.rsplit(".", 1)[1].lower()
        filename = f"{uuid.uuid4().hex}.{extension}"
        media_type = media.mimetype

        media.save(UPLOADS / filename)

    try:
        query_db(
            """
            INSERT INTO posts
            (user_id, caption, media_filename, media_type)
            VALUES (%s, %s, %s, %s)
            """,
            (CURRENT_USER_ID, caption, filename, media_type)
        )

        return jsonify({"message": "Post created"}), 201

    except Exception as e:
        if filename and (UPLOADS / filename).exists():
            (UPLOADS / filename).unlink()

        return jsonify({"error": str(e)}), 500


# EDIT POST
@app.route("/api/posts/<int:post_id>", methods=["PUT"])
def edit_post(post_id):
    data = request.get_json(silent=True) or {}
    caption = str(data.get("caption", "")).strip()

    try:
        post = query_db(
            "SELECT id FROM posts WHERE id=%s AND user_id=%s",
            (post_id, CURRENT_USER_ID),
            fetch=True
        )

        if not post:
            return jsonify({"error": "Post not found or unauthorized"}), 404

        query_db(
            "UPDATE posts SET caption=%s WHERE id=%s AND user_id=%s",
            (caption, post_id, CURRENT_USER_ID)
        )

        return jsonify({"message": "Post updated"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# DELETE POST
@app.route("/api/posts/<int:post_id>", methods=["DELETE"])
def delete_post(post_id):
    try:
        post = query_db(
            "SELECT media_filename FROM posts WHERE id=%s AND user_id=%s",
            (post_id, CURRENT_USER_ID),
            fetch=True
        )

        if not post:
            return jsonify({"error": "Post not found or unauthorized"}), 404

        filename = post[0]["media_filename"]

        query_db(
            "DELETE FROM posts WHERE id=%s AND user_id=%s",
            (post_id, CURRENT_USER_ID)
        )

        if filename and (UPLOADS / filename).exists():
            (UPLOADS / filename).unlink()

        return jsonify({"message": "Post deleted"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# LIKE / UNLIKE
@app.route("/api/posts/<int:post_id>/like", methods=["POST"])
def toggle_like(post_id):
    try:
        post = query_db(
            "SELECT id FROM posts WHERE id=%s",
            (post_id,),
            fetch=True
        )

        if not post:
            return jsonify({"error": "Post not found"}), 404

        liked = query_db(
            "SELECT id FROM likes WHERE post_id=%s AND user_id=%s",
            (post_id, CURRENT_USER_ID),
            fetch=True
        )

        if liked:
            query_db(
                "DELETE FROM likes WHERE post_id=%s AND user_id=%s",
                (post_id, CURRENT_USER_ID)
            )
            return jsonify({"liked": False})

        query_db(
            "INSERT INTO likes (post_id, user_id) VALUES (%s, %s)",
            (post_id, CURRENT_USER_ID)
        )

        return jsonify({"liked": True})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ADD COMMENT
@app.route("/api/posts/<int:post_id>/comments", methods=["POST"])
def add_comment(post_id):
    data = request.get_json(silent=True) or {}
    body = str(data.get("body", "")).strip()

    if not body or len(body) > 1000:
        return jsonify({"error": "Enter a comment under 1000 characters"}), 400

    try:
        post = query_db(
            "SELECT id FROM posts WHERE id=%s",
            (post_id,),
            fetch=True
        )

        if not post:
            return jsonify({"error": "Post not found"}), 404

        query_db(
            """
            INSERT INTO comments (post_id, user_id, body)
            VALUES (%s, %s, %s)
            """,
            (post_id, CURRENT_USER_ID, body)
        )

        return jsonify({"message": "Comment added"}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# SHARE POST
@app.route("/api/posts/<int:post_id>/share", methods=["POST"])
def share_post(post_id):
    try:
        query_db(
            "UPDATE posts SET share_count=share_count+1 WHERE id=%s",
            (post_id,)
        )

        return jsonify({"message": "Share recorded"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "Maximum upload size is 100 MB"}), 413


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
