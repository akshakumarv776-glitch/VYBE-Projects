
from flask import Flask, render_template, request, jsonify

app = Flask(
    __name__,
    template_folder=".",
    static_folder="static",
)

# Sample users
users = [
    {"name": "Alex Morgan", "username": "@alexm", "interest": "Technology", "type": "user"},
    {"name": "Sarah James", "username": "@sarahj", "interest": "Photography", "type": "user"},
    {"name": "David Lee", "username": "@davidlee", "interest": "Music", "type": "user"},
    {"name": "Emma Wilson", "username": "@emmaw", "interest": "Design", "type": "user"}
]

# Sample posts
posts = [
    {"title": "The Future of Artificial Intelligence", "creator": "Alex Morgan", "category": "Technology", "likes": 1250, "type": "post"},
    {"title": "Beautiful Places Around the World", "creator": "Sarah James", "category": "Travel", "likes": 980, "type": "post"},
    {"title": "How Music Changes Our Mood", "creator": "David Lee", "category": "Music", "likes": 760, "type": "post"},
    {"title": "Creative UI Design Ideas", "creator": "Emma Wilson", "category": "Design", "likes": 650, "type": "post"}
]

# Sample communities
communities = [
    {"name": "Tech Enthusiasts", "members": "12.5K members", "category": "Technology"},
    {"name": "Photography Lovers", "members": "8.2K members", "category": "Photography"},
    {"name": "Music Community", "members": "15K members", "category": "Music"}
]

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/explore")
def explore():
    return jsonify({
        "users": users,
        "posts": posts,
        "communities": communities
    })


@app.route("/api/search")
def search():
    query = request.args.get("q", "").strip().lower()

    if not query:
        return jsonify({"users": [], "posts": [], "communities": []})

    found_users = [
        user for user in users
        if query in user["name"].lower()
        or query in user["username"].lower()
        or query in user["interest"].lower()
    ]

    found_posts = [
        post for post in posts
        if query in post["title"].lower()
        or query in post["creator"].lower()
        or query in post["category"].lower()
    ]

    found_communities = [
        community for community in communities
        if query in community["name"].lower()
        or query in community["category"].lower()
    ]

    return jsonify({
        "users": found_users,
        "posts": found_posts,
        "communities": found_communities
    })


if __name__ == "__main__":
    app.run(debug=True)
