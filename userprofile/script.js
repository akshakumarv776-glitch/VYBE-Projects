const editDialog = document.getElementById("editDialog");
const editProfileButton = document.getElementById("editProfileButton");
const detailsEdit = document.getElementById("detailsEdit");
const closeDialog = document.getElementById("closeDialog");
const cancelEdit = document.getElementById("cancelEdit");
const editForm = document.getElementById("editForm");
const privateAccount = document.getElementById("privateAccount");
const avatarUpload = document.getElementById("avatarUpload");
const toast = document.getElementById("toast");
const sidebar = document.querySelector(".sidebar");
const themeToggle = document.getElementById("themeToggle");
let currentProfile = null;

function setTheme(theme, persist = false) {
    const isDark = theme === "dark";
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    themeToggle.setAttribute("aria-pressed", String(isDark));
    const label = `Switch to ${isDark ? "light" : "dark"} mode`;
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;

    if (persist) {
        localStorage.setItem("vybe-theme", isDark ? "dark" : "light");
    }
}

setTheme(document.documentElement.dataset.theme || "light");
themeToggle.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme, true);
});

function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    window.setTimeout(() => toast.classList.remove("visible"), 2200);
}

function initials(name) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0].toUpperCase())
        .join("");
}

function fillProfile(profile) {
    currentProfile = profile;
    document.getElementById("profileName").textContent = profile.name;
    document.getElementById("profileHandle").textContent = profile.handle;
    document.getElementById("profileBio").textContent = profile.bio;
    document.getElementById("profileEmail").textContent = profile.email;
    document.getElementById("profileLocation").textContent = profile.location;
    document.getElementById("profileWebsite").textContent = profile.website;
    document.getElementById("followingCount").textContent = profile.following_count;
    document.getElementById("profileAvatar").textContent = initials(profile.name);

    if (profile.avatar) {
        document.getElementById("profileAvatar").style.backgroundImage = `url("${profile.avatar}")`;
    } else {
        document.getElementById("profileAvatar").style.backgroundImage = "";
    }

    privateAccount.checked = profile.is_private;
    document.getElementById("privacyStatus").textContent = profile.is_private
        ? "Only approved people can see your profile."
        : "Your profile is visible to everyone.";
}

async function loadProfile() {
    const response = await fetch("/api/profile");
    if (!response.ok) throw new Error("Could not load profile");
    fillProfile(await response.json());
}

async function loadConnections() {
    const response = await fetch("/api/connections");
    if (!response.ok) throw new Error("Could not load connections");
    const connections = await response.json();
    const list = document.getElementById("connectionsList");
    list.innerHTML = "";

    connections.forEach(connection => {
        const item = document.createElement("article");
        item.className = "connection";
        item.innerHTML = `
            <div class="connection-avatar" style="background:${connection.avatar_color}">
                ${initials(connection.name)}
            </div>
            <div class="connection-info">
                <strong>${connection.name}</strong>
                <span>${connection.handle}</span>
            </div>
            <button class="follow-button${connection.following ? " following" : ""}"
                    type="button" data-id="${connection.id}">
                ${connection.following ? "Following" : "Follow"}
            </button>
        `;
        list.appendChild(item);
    });
}

function openEditDialog() {
    if (!currentProfile) return;
    document.getElementById("editName").value = currentProfile.name;
    document.getElementById("editHandle").value = currentProfile.handle;
    document.getElementById("editBio").value = currentProfile.bio;
    document.getElementById("editEmail").value = currentProfile.email;
    document.getElementById("editLocation").value = currentProfile.location;
    document.getElementById("editWebsite").value = currentProfile.website;
    editDialog.showModal();
}

editProfileButton.addEventListener("click", openEditDialog);
detailsEdit.addEventListener("click", openEditDialog);
closeDialog.addEventListener("click", () => editDialog.close());
cancelEdit.addEventListener("click", () => editDialog.close());

editForm.addEventListener("submit", async event => {
    event.preventDefault();
    const formData = new FormData(editForm);
    const payload = Object.fromEntries(formData.entries());

    const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        showToast("Could not save profile");
        return;
    }

    await loadProfile();
    editDialog.close();
    showToast("Profile updated");
});

privateAccount.addEventListener("change", async () => {
    const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_private: privateAccount.checked }),
    });

    if (!response.ok) {
        privateAccount.checked = !privateAccount.checked;
        showToast("Could not update privacy");
        return;
    }

    await loadProfile();
    showToast(privateAccount.checked ? "Account is now private" : "Account is now public");
});

avatarUpload.addEventListener("change", async () => {
    if (!avatarUpload.files.length) return;
    const formData = new FormData();
    formData.append("avatar", avatarUpload.files[0]);

    const response = await fetch("/api/profile/photo", {
        method: "POST",
        body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
        showToast(result.error || "Could not upload photo");
        return;
    }

    await loadProfile();
    showToast("Profile photo updated");
});

document.getElementById("connectionsList").addEventListener("click", async event => {
    const button = event.target.closest(".follow-button");
    if (!button) return;

    const response = await fetch(`/api/connections/${button.dataset.id}/follow`, {
        method: "POST",
    });
    if (!response.ok) {
        showToast("Could not update connection");
        return;
    }

    await loadConnections();
    await loadProfile();
    showToast("Connection updated");
});

document.querySelector(".sidebar-toggle").addEventListener("click", () => {
    sidebar.classList.toggle("open");
});

Promise.all([loadProfile(), loadConnections()]).catch(() => {
    showToast("Could not connect to the profile service");
});
