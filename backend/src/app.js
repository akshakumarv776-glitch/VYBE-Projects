const path = require("node:path");
const bcrypt = require("bcryptjs");
const express = require("express");
const jwt = require("jsonwebtoken");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,24}$/;

function asyncRoute(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function createApp({ db, jwtSecret }) {
    if (!db || !jwtSecret) {
        throw new Error("A database connection and JWT secret are required");
    }

    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "16kb" }));

    const publicUser = (user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.createdAt
    });

    const signInToken = (user) => jwt.sign(
        { sub: String(user.id) },
        jwtSecret,
        { expiresIn: "7d" }
    );

    const requireUser = (req, res, next) => {
        const match = /^Bearer ([^\s]+)$/.exec(req.get("authorization") || "");
        if (!match) {
            return res.status(401).json({ error: "Authentication required" });
        }

        let payload;
        try {
            payload = jwt.verify(match[1], jwtSecret);
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                return res.status(401).json({ error: "Invalid or expired token" });
            }
            return next(error);
        }

        if (typeof payload !== "object" || payload === null || !("sub" in payload)) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        const userId = Number(payload.sub);
        if (!Number.isSafeInteger(userId) || userId < 1) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        const user = db.prepare(`
            SELECT id, username, email, created_at AS createdAt
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(401).json({ error: "Invalid or expired token" });
        }

        req.user = user;
        return next();
    };

    app.get("/api/health", (req, res) => {
        db.prepare("SELECT 1").get();
        res.json({ status: "ok" });
    });

    app.post("/api/auth/register", asyncRoute(async (req, res) => {
        const { username, email, password } = req.body || {};
        if (
            typeof username !== "string" ||
            !USERNAME_PATTERN.test(username) ||
            typeof email !== "string" ||
            email.length > 254 ||
            !EMAIL_PATTERN.test(email) ||
            typeof password !== "string" ||
            password.length < 8 ||
            password.length > 128 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            return res.status(400).json({
                error: "Provide a 3-24 character username, valid email, and an 8-128 character password (maximum 72 UTF-8 bytes)"
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            return res.status(400).json({ error: "Provide a valid email address" });
        }

        const passwordHash = await bcrypt.hash(password, 12);
        let result;
        try {
            result = db.prepare(`
                INSERT INTO users (username, email, password_hash)
                VALUES (?, ?, ?)
            `).run(username, normalizedEmail, passwordHash);
        } catch (error) {
            if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return res.status(409).json({ error: "Username or email is already in use" });
            }
            throw error;
        }

        const user = db.prepare(`
            SELECT id, username, email, created_at AS createdAt
            FROM users
            WHERE id = ?
        `).get(result.lastInsertRowid);

        return res.status(201).json({
            token: signInToken(user),
            user: publicUser(user)
        });
    }));

    app.post("/api/auth/login", asyncRoute(async (req, res) => {
        const { email, password } = req.body || {};
        if (
            typeof email !== "string" ||
            typeof password !== "string" ||
            email.length > 254 ||
            password.length > 128 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            return res.status(400).json({ error: "Email and password are required" });
        }

        const userRecord = db.prepare(`
            SELECT id, username, email, password_hash AS passwordHash,
                   created_at AS createdAt
            FROM users
            WHERE email = ?
        `).get(email.trim().toLowerCase());

        if (!userRecord || !(await bcrypt.compare(password, userRecord.passwordHash))) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        return res.json({
            token: signInToken(userRecord),
            user: publicUser(userRecord)
        });
    }));

    app.get("/api/users/me", requireUser, (req, res) => {
        res.json({ user: publicUser(req.user) });
    });

    app.get("/api/posts", (req, res) => {
        const requestedLimit = req.query.limit === undefined ? 20 : Number(req.query.limit);
        if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50) {
            return res.status(400).json({ error: "limit must be an integer between 1 and 50" });
        }

        const posts = db.prepare(`
            SELECT posts.id, posts.content, posts.created_at AS createdAt,
                   users.id AS authorId, users.username AS authorUsername
            FROM posts
            JOIN users ON users.id = posts.author_id
            ORDER BY posts.id DESC
            LIMIT ?
        `).all(requestedLimit);

        return res.json({ posts });
    });

    app.post("/api/posts", requireUser, (req, res) => {
        const { content } = req.body || {};
        if (
            typeof content !== "string" ||
            content.trim().length < 1 ||
            content.length > 2000
        ) {
            return res.status(400).json({ error: "Post content must be between 1 and 2000 characters" });
        }

        const result = db.prepare(`
            INSERT INTO posts (author_id, content)
            VALUES (?, ?)
        `).run(req.user.id, content.trim());

        const post = db.prepare(`
            SELECT posts.id, posts.content, posts.created_at AS createdAt,
                   users.id AS authorId, users.username AS authorUsername
            FROM posts
            JOIN users ON users.id = posts.author_id
            WHERE posts.id = ?
        `).get(result.lastInsertRowid);

        return res.status(201).json({ post });
    });

    app.delete("/api/posts/:id", requireUser, (req, res) => {
        const postId = Number(req.params.id);
        if (!Number.isSafeInteger(postId) || postId < 1) {
            return res.status(404).json({ error: "Post not found" });
        }

        const result = db.prepare(`
            DELETE FROM posts
            WHERE id = ? AND author_id = ?
        `).run(postId, req.user.id);

        if (result.changes === 0) {
            return res.status(404).json({ error: "Post not found" });
        }

        return res.status(204).end();
    });

    app.get("/", (req, res) => {
        res.redirect("/pages/index.html");
    });

    app.use(express.static(path.resolve(__dirname, "..", "..", "frontend")));

    app.use((req, res) => {
        res.status(404).json({ error: "Not found" });
    });

    app.use((error, req, res, next) => {
        if (res.headersSent) {
            return next(error);
        }

        if (error.type === "entity.parse.failed") {
            return res.status(400).json({ error: "Invalid JSON body" });
        }
        if (error.type === "entity.too.large") {
            return res.status(413).json({ error: "Request body is too large" });
        }

        console.error(error);
        return res.status(500).json({ error: "Internal server error" });
    });

    return app;
}

module.exports = { createApp };
