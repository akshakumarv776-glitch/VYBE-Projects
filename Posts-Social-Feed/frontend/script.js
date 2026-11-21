
const API = "/api";

// Temporary demo user until Authentication module integration.
const USER_ID = 1;

const form = document.getElementById("post-form");
const caption = document.getElementById("caption");
const media = document.getElementById("media");
const posts = document.getElementById("posts");
const statusText = document.getElementById("status");
const preview = document.getElementById("preview");
const toastBox = document.getElementById("toast");

function showToast(message) {
    toastBox.textContent = message;
    toastBox.classList.add("show");
    setTimeout(() => toastBox.classList.remove("show"), 2500);
}

function safe(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[char]);
}

media.addEventListener("change", () => {
    preview.innerHTML = "";

    const file = media.files[0];
    if (!file) return;

    document.getElementById("file-name").textContent = file.name;

    const url = URL.createObjectURL(file);
    const element = document.createElement(
        file.type.startsWith("video/") ? "video" : "img"
    );

    element.src = url;

    if (element.tagName === "VIDEO") {
        element.controls = true;
    }

    preview.appendChild(element);
});

async function loadPosts() {
    statusText.textContent = "Loading your feed...";

    try {
        const response = await fetch(`${API}/posts`);
        const data = await response.json();

        if (!response.ok) throw new Error(data.error);

        posts.innerHTML = "";

        if (!data.posts.length) {
            posts.innerHTML = `
                <div class="empty">
                    <h3>Your feed is waiting!</h3>
                    Create your first post and share your moment.
                </div>`;
        }

        data.posts.forEach(post => {
            const isOwner = Number(post.user_id) === USER_ID;

            const comments = post.comments.map(comment => `
                <div class="comment-item">
                    <b>${safe(comment.username)}:</b>
                    ${safe(comment.body)}
                </div>
            `).join("");

            const mediaContent = post.media_url
                ? post.media_type.startsWith("video/")
                    ? `<video class="post-media" src="${safe(post.media_url)}" controls></video>`
                    : `<img class="post-media" src="${safe(post.media_url)}" alt="Post media">`
                : "";

            const card = document.createElement("article");
            card.className = "post glass";
            card.dataset.id = post.id;

            card.innerHTML = `
                <div class="post-header">
                    <div class="avatar">${safe(post.username[0].toUpperCase())}</div>
                    <div class="post-user">
                        <b>${safe(post.display_name)}</b>
                        <small>@${safe(post.username)} · ${safe(post.created_at)}</small>
                    </div>
                    ${isOwner ? `
                        <button class="edit-post secondary">Edit</button>
                        <button class="delete delete-post secondary">Delete</button>
                    ` : ""}
                </div>

                ${post.caption ? `
                    <div class="post-caption">${safe(post.caption)}</div>
                ` : ""}

                ${mediaContent}

                <div class="post-stats">
                    <span>♥ ${post.like_count} likes</span>
                    <span>${post.comment_count} comments · ${post.share_count} shares</span>
                </div>

                <div class="post-actions">
                    <button class="like-post ${post.liked_by_me ? "liked" : ""}">
                        ${post.liked_by_me ? "♥ Liked" : "♡ Like"}
                    </button>
                    <button class="show-comments">▤ Comment</button>
                    <button class="share-post">↗ Share</button>
                </div>

                <div class="comments" hidden>
                    <div class="comment-list">
                        ${comments || "No comments yet."}
                    </div>
                    <form class="comment-form">
                        <input name="comment" placeholder="Write a comment..." maxlength="1000" required>
                        <button type="submit">Send</button>
                    </form>
                </div>
            `;

            posts.appendChild(card);
        });

        statusText.textContent = `${data.posts.length} posts in your feed`;

    } catch (error) {
        statusText.textContent = "Unable to load posts. Check Flask and MySQL.";
        showToast(error.message || "Server connection failed.");
    }
}

// CREATE POST
form.addEventListener("submit", async event => {
    event.preventDefault();

    const file = media.files[0];
    const text = caption.value.trim();

    if (!text && !file) {
        showToast("Write a caption or select media.");
        return;
    }

    if (file && file.size > 100 * 1024 * 1024) {
        showToast("Maximum file size is 100 MB.");
        return;
    }

    const formData = new FormData();
    formData.append("caption", text);

    if (file) formData.append("media", file);

    try {
        const response = await fetch(`${API}/posts`, {
            method: "POST",
            body: formData
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        form.reset();
        preview.innerHTML = "";
        document.getElementById("file-name").textContent = "No file selected";

        showToast("Post published successfully!");
        loadPosts();

    } catch (error) {
        showToast(error.message);
    }
});

// POST ACTIONS
posts.addEventListener("click", async event => {
    const card = event.target.closest(".post");
    if (!card) return;

    const id = card.dataset.id;

    try {
        if (event.target.closest(".like-post")) {
            const response = await fetch(`${API}/posts/${id}/like`, {
                method: "POST"
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            loadPosts();
        }

        else if (event.target.closest(".show-comments")) {
            const panel = card.querySelector(".comments");
            panel.hidden = !panel.hidden;
        }

        else if (event.target.closest(".edit-post")) {
            const oldCaption =
                card.querySelector(".post-caption")?.textContent || "";

            const newCaption = prompt("Edit your caption:", oldCaption);
            if (newCaption === null) return;

            const response = await fetch(`${API}/posts/${id}`, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({caption: newCaption})
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            showToast("Post updated!");
            loadPosts();
        }

        else if (event.target.closest(".delete-post")) {
            if (!confirm("Are you sure you want to delete this post?")) return;

            const response = await fetch(`${API}/posts/${id}`, {
                method: "DELETE"
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            showToast("Post deleted!");
            loadPosts();
        }

        else if (event.target.closest(".share-post")) {
            const link = `${location.origin}/?post=${id}`;

            if (navigator.share) {
                await navigator.share({
                    title: "VYBE Post",
                    url: link
                });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(link);
                showToast("Post link copied!");
            } else {
                prompt("Copy post link:", link);
            }

            const response = await fetch(`${API}/posts/${id}/share`, {
                method: "POST"
            });

            if (!response.ok) throw new Error("Share could not be recorded.");
            loadPosts();
        }

    } catch (error) {
        showToast(error.message || "Something went wrong.");
    }
});

// ADD COMMENT
posts.addEventListener("submit", async event => {
    if (!event.target.matches(".comment-form")) return;

    event.preventDefault();

    const card = event.target.closest(".post");
    const input = event.target.elements.comment;
    const body = input.value.trim();

    if (!body) return;

    try {
        const response = await fetch(
            `${API}/posts/${card.dataset.id}/comments`,
            {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({body})
            }
        );

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        showToast("Comment added!");
        await loadPosts();

        const updated = posts.querySelector(
            `[data-id="${card.dataset.id}"]`
        );

        if (updated) updated.querySelector(".comments").hidden = false;

    } catch (error) {
        showToast(error.message);
    }
});

document.getElementById("refresh").addEventListener("click", loadPosts);

loadPosts();
