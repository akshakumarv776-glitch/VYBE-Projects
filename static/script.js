
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const themeToggle = document.getElementById("themeToggle");

function setTheme(theme) {
    const isLight = theme === "light";
    document.body.dataset.theme = isLight ? "light" : "dark";
    themeToggle.textContent = isLight ? "☾ Dark mode" : "☀ Light mode";
    themeToggle.setAttribute(
        "aria-label",
        `Switch to ${isLight ? "dark" : "light"} mode`
    );
    themeToggle.setAttribute("aria-pressed", String(isLight));
    localStorage.setItem("vybe-theme", isLight ? "light" : "dark");
}

setTheme(localStorage.getItem("vybe-theme") === "light" ? "light" : "dark");
themeToggle.addEventListener("click", () => {
    setTheme(document.body.dataset.theme === "light" ? "dark" : "light");
});

const icons = {
    user: "👤",
    post: "🔥",
    community: "👥"
};

function createCard(title, description, type, extra = "") {
    const card = document.createElement("div");
    card.className = "content-card";

    const icon = document.createElement("div");
    icon.className = "card-icon";
    icon.textContent = icons[type] || "✨";

    const heading = document.createElement("h3");
    heading.textContent = title;

    const paragraph = document.createElement("p");
    paragraph.textContent = description;

    const button = document.createElement("button");
    button.className = "card-button";
    button.textContent = extra || "Explore";

    card.append(icon, heading, paragraph, button);
    return card;
}

function showCards(containerId, items, type) {
    const container = document.getElementById(containerId);
    container.replaceChildren();

    if (!items || items.length === 0) {
        const message = document.createElement("p");
        message.className = "empty-message";
        message.textContent = "No content available.";
        container.appendChild(message);
        return;
    }

    items.forEach(item => {
        let title, description, buttonText;

        if (type === "user") {
            title = item.name;
            description = `${item.username} • Interest: ${item.interest}`;
            buttonText = "View Profile";
        } else if (type === "post") {
            title = item.title;
            description = `By ${item.creator} • ${item.category} • ${item.likes} likes`;
            buttonText = "View Post";
        } else {
            title = item.name;
            description = `${item.members} • ${item.category}`;
            buttonText = "Explore Community";
        }

        container.appendChild(
            createCard(title, description, type, buttonText)
        );
    });
}

async function loadExplore() {
    try {
        const response = await fetch("/api/explore");

        if (!response.ok) {
            throw new Error("Could not load explore content.");
        }

        const data = await response.json();

        showCards("trendingPosts", data.posts, "post");
        showCards("creators", data.users, "user");
        showCards("recommendations", data.posts.slice(0, 3), "post");
        showCards("communities", data.communities, "community");

    } catch (error) {
        console.error(error);
    }
}

async function searchContent() {
    const query = searchInput.value.trim();

    if (!query) {
        alert("Please enter something to search.");
        searchInput.focus();
        return;
    }

    try {
        const response = await fetch(
            `/api/search?q=${encodeURIComponent(query)}`
        );

        if (!response.ok) {
            throw new Error("Search failed.");
        }

        const data = await response.json();

        const resultsContainer =
            document.getElementById("resultsContainer");

        resultsContainer.replaceChildren();

        showCards("resultsContainer", data.users, "user");

        data.posts.forEach(post => {
            resultsContainer.appendChild(
                createCard(
                    post.title,
                    `By ${post.creator} • ${post.category} • ${post.likes} likes`,
                    "post",
                    "View Post"
                )
            );
        });

        data.communities.forEach(community => {
            resultsContainer.appendChild(
                createCard(
                    community.name,
                    `${community.members} • ${community.category}`,
                    "community",
                    "Explore Community"
                )
            );
        });

        if (
            data.users.length === 0 &&
            data.posts.length === 0 &&
            data.communities.length === 0
        ) {
            const message = document.createElement("p");
            message.className = "empty-message";
            message.textContent = "No matching results found.";
            resultsContainer.appendChild(message);
        }

        document.getElementById("searchResults")
            .classList.remove("hidden");

        document.getElementById("searchResults")
            .scrollIntoView({ behavior: "smooth" });

    } catch (error) {
        console.error(error);
        alert("Unable to search. Please try again.");
    }
}

searchButton.addEventListener("click", searchContent);

searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
        searchContent();
    }
});

loadExplore();
