const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const { createApp } = require("./app");
const { createDatabase } = require("./database");

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
    throw new Error("JWT_SECRET must be set to a random value of at least 32 characters");
}

const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
}

const host = process.env.HOST || "127.0.0.1";
const databasePath = process.env.DATABASE_PATH ||
    path.resolve(__dirname, "..", "data", "vybe.sqlite");
const db = createDatabase(databasePath);
const app = createApp({ db, jwtSecret });
const server = app.listen(port, host, () => {
    console.log(`VYBE is running at http://${host}:${port}`);
});

function shutdown() {
    server.close((error) => {
        db.close();
        if (error) {
            console.error(error);
            process.exitCode = 1;
        }
    });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
