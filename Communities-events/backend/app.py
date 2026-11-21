from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

groups = [
    {
        "id": 1,
        "name": "Python Developers",
        "description": "Learn Python programming and share projects.",
        "members": 25,
        "joined": False
    },
    {
        "id": 2,
        "name": "Web Development",
        "description": "Discuss HTML, CSS, JavaScript and Flask.",
        "members": 40,
        "joined": False
    },
    {
        "id": 3,
        "name": "AI Community",
        "description": "Explore Artificial Intelligence and Machine Learning.",
        "members": 35,
        "joined": False
    }
]

@app.route("/")
def home():
    return "Communities & Groups Backend Running!"

@app.route("/api/groups", methods=["GET"])
def get_groups():
    return jsonify(groups)

@app.route("/api/groups", methods=["POST"])
def create_group():
    data = request.get_json()

    name = data.get("name", "").strip()
    description = data.get("description", "").strip()

    if not name or not description:
        return jsonify({"error": "All fields are required"}), 400

    new_group = {
        "id": max([g["id"] for g in groups], default=0) + 1,
        "name": name,
        "description": description,
        "members": 1,
        "joined": True
    }

    groups.append(new_group)

    return jsonify(new_group), 201

@app.route("/api/groups/<int:group_id>/join", methods=["POST"])
def join_group(group_id):
    for group in groups:
        if group["id"] == group_id:

            if group["joined"]:
                group["joined"] = False
                group["members"] -= 1
                message = "You left the group"
            else:
                group["joined"] = True
                group["members"] += 1
                message = "You joined the group"

            return jsonify({"message": message})

    return jsonify({"error": "Group not found"}), 404

if __name__ == "__main__":
    app.run(debug=True) 