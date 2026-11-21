const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");
const { createApp } = require("../src/app");
const { createDatabase } = require("../src/database");

const JWT_SECRET = "test-secret-with-more-than-thirty-two-characters";
let db;
let server;
let baseUrl;

async function request(path, options = {}) {
    return fetch(`${baseUrl}${path}`, options);
}

async function register(username, email) {
    const response = await request("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, email, password: "correct-horse-battery" })
    });
    return { response, body: await response.json() };
}

before(async () => {
    db = createDatabase(":memory:");
    server = createApp({ db, jwtSecret: JWT_SECRET }).listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
    }
    if (db) {
        db.close();
    }
});

test("authenticates users and protects post creation and deletion", async () => {
    const health = await request("/api/health");
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const invalidRegistration = await request("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "xy", email: "bad", password: "short" })
    });
    assert.equal(invalidRegistration.status, 400);

    const oversizedPassword = await request("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            username: "long_password",
            email: "long@example.com",
            password: "p".repeat(73)
        })
    });
    assert.equal(oversizedPassword.status, 400);

    const first = await register("vybe_user", "user@example.com");
    assert.equal(first.response.status, 201);
    assert.equal(first.body.user.username, "vybe_user");
    assert.equal(typeof first.body.token, "string");

    const duplicate = await register("other_user", "USER@example.com");
    assert.equal(duplicate.response.status, 409);

    const login = await request("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: "USER@example.com", password: "correct-horse-battery" })
    });
    assert.equal(login.status, 200);
    const loginBody = await login.json();

    const profile = await request("/api/users/me", {
        headers: { authorization: `Bearer ${loginBody.token}` }
    });
    assert.equal((await profile.json()).user.email, "user@example.com");

    const unauthorized = await request("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "A first post" })
    });
    assert.equal(unauthorized.status, 401);

    const created = await request("/api/posts", {
        method: "POST",
        headers: {
            authorization: `Bearer ${first.body.token}`,
            "content-type": "application/json"
        },
        body: JSON.stringify({ content: "  A first post  " })
    });
    assert.equal(created.status, 201);
    const postBody = await created.json();
    assert.equal(postBody.post.content, "A first post");

    const feed = await request("/api/posts?limit=1");
    assert.equal((await feed.json()).posts[0].authorUsername, "vybe_user");

    const second = await register("another_user", "another@example.com");
    const forbiddenDelete = await request(`/api/posts/${postBody.post.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${second.body.token}` }
    });
    assert.equal(forbiddenDelete.status, 404);

    const ownerDelete = await request(`/api/posts/${postBody.post.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${first.body.token}` }
    });
    assert.equal(ownerDelete.status, 204);
});
