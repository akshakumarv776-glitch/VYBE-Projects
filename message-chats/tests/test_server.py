import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from backend import server


class ChatAPITest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_database = server.DATABASE
        server.DATABASE = Path(self.temp_dir.name) / "test.sqlite3"
        server.initialize_database()
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.ChatHandler)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        self.host, self.port = self.httpd.server_address

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.thread.join(timeout=2)
        server.DATABASE = self.original_database
        self.temp_dir.cleanup()

    def request(self, method, path, body=None, cookie=None):
        connection = http.client.HTTPConnection(self.host, self.port)
        headers = {}
        encoded = None
        if body is not None:
            encoded = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if cookie:
            headers["Cookie"] = cookie
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        payload = json.loads(response.read().decode("utf-8"))
        set_cookie = response.getheader("Set-Cookie")
        status = response.status
        connection.close()
        return status, payload, set_cookie

    def register(self, username):
        status, payload, cookie = self.request(
            "POST", "/api/register", {"username": username, "password": "secure-test-password"}
        )
        self.assertEqual(status, 200)
        return payload, cookie.split(";", 1)[0]

    def test_accounts_direct_and_group_messages(self):
        alice, alice_cookie = self.register("alice")
        bob, bob_cookie = self.register("bobby")

        status, contacts, _ = self.request("GET", "/api/chats", cookie=alice_cookie)
        self.assertEqual(status, 200)
        self.assertEqual(contacts["chats"][0]["name"], "bobby")

        status, direct, _ = self.request(
            "POST", "/api/chats/direct", {"user_id": bob["id"]}, alice_cookie
        )
        self.assertEqual(status, 200)
        conversation_id = direct["conversationId"]
        status, _, _ = self.request(
            "POST", "/api/chats/%d/messages" % conversation_id,
            {"text": "Hello from Alice"}, alice_cookie
        )
        self.assertEqual(status, 201)
        status, _, _ = self.request(
            "POST", "/api/chats/%d/messages" % conversation_id,
            {"text": "", "attachment": {
                "name": "photo.png",
                "type": "image/png",
                "data": "data:image/png;base64,aGVsbG8="
            }},
            alice_cookie
        )
        self.assertEqual(status, 201)
        status, messages, _ = self.request(
            "GET", "/api/chats/%d/messages" % conversation_id, cookie=bob_cookie
        )
        self.assertEqual(status, 200)
        self.assertEqual(messages["messages"][0]["direction"], "received")
        self.assertEqual(messages["messages"][0]["text"], "Hello from Alice")
        self.assertEqual(messages["messages"][1]["attachment"]["name"], "photo.png")

        status, group, _ = self.request(
            "POST", "/api/chats/group",
            {"name": "Friends", "members": [bob["id"]]}, alice_cookie
        )
        self.assertEqual(status, 201)
        status, chats, _ = self.request("GET", "/api/chats", cookie=bob_cookie)
        self.assertEqual(status, 200)
        group_chat = next(chat for chat in chats["chats"] if chat["kind"] == "group")
        self.assertEqual(group_chat["conversationId"], group["conversationId"])

    def test_chat_history_requires_membership(self):
        alice, alice_cookie = self.register("alice")
        bob, _ = self.register("bobby")
        stranger, stranger_cookie = self.register("charlie")
        _, direct, _ = self.request(
            "POST", "/api/chats/direct", {"user_id": bob["id"]}, alice_cookie
        )
        status, error, _ = self.request(
            "GET", "/api/chats/%d/messages" % direct["conversationId"], cookie=stranger_cookie
        )
        self.assertEqual(status, 404)
        self.assertIn("Chat not found", error["error"])

    def test_guest_session_is_created_without_sign_in(self):
        status, response, cookie = self.request("GET", "/api/me")
        self.assertEqual(status, 200)
        self.assertRegex(response["user"]["username"], r"^Guest-[0-9a-f]{8}$")
        self.assertIsNotNone(cookie)

        status, existing, _ = self.request(
            "GET", "/api/me", cookie=cookie.split(";", 1)[0]
        )
        self.assertEqual(status, 200)
        self.assertEqual(existing["user"], response["user"])


if __name__ == "__main__":
    unittest.main()
