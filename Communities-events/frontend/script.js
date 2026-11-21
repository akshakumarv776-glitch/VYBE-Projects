 const API = "http://127.0.0.1:5000/api/groups";

async function loadGroups() {
    try {
        const response = await fetch(API);
        const groups = await response.json();

        const groupList = document.getElementById("groupList");
        groupList.innerHTML = "";

        groups.forEach(group => {
            const card = document.createElement("div");
            card.className = "group-card";

            const title = document.createElement("h3");
            title.textContent = group.name;

            const description = document.createElement("p");
            description.textContent = group.description;

            const members = document.createElement("p");
            members.textContent = "Members: " + group.members;

            const button = document.createElement("button");
            button.textContent = group.joined ? "Leave Group" : "Join Group";

            button.onclick = () => joinGroup(group.id);

            card.append(title, description, members, button);
            groupList.appendChild(card);
        });

    } catch (error) {
        console.error("Unable to load groups:", error);
        document.getElementById("groupList").textContent =
            "Cannot connect to server. Please start Flask.";
    }
}

async function createGroup() {
    const name = document.getElementById("groupName").value.trim();
    const description = document.getElementById("groupDescription").value.trim();

    if (!name || !description) {
        alert("Please enter group name and description");
        return;
    }

    try {
        const response = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ name, description })
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || "Unable to create group");
            return;
        }

        document.getElementById("groupName").value = "";
        document.getElementById("groupDescription").value = "";

        alert("Community created successfully!");
        loadGroups();

    } catch (error) {
        alert("Server connection failed");
    }
}

async function joinGroup(id) {
    try {
        const response = await fetch(`${API}/${id}/join`, {
            method: "POST"
        });

        const result = await response.json();

        if (!response.ok) {
            alert(result.error || "Unable to update membership");
            return;
        }

        loadGroups();

    } catch (error) {
        alert("Server connection failed");
    }
}

loadGroups();