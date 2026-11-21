
// ===================================
// VYBE PROJECT - COMMON JAVASCRIPT
// ===================================

// Light and Dark Theme
const themeButton = document.getElementById("themeButton");

if (themeButton) {
    themeButton.addEventListener("click", () => {
        document.body.classList.toggle("light-theme");

        themeButton.textContent =
            document.body.classList.contains("light-theme")
                ? "☀ Light Mode"
                : "☾ Dark Mode";
    });
}

// Sidebar Navigation
const navLinks = document.querySelectorAll(".nav-link");

navLinks.forEach(link => {
    link.addEventListener("click", () => {
        navLinks.forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");
    });
});

// Like Buttons
const likeButtons = document.querySelectorAll(".like-button");

likeButtons.forEach(button => {
    button.addEventListener("click", () => {
        const liked = button.classList.toggle("liked");

        button.textContent = liked ? "♥ Liked" : "♡ Like";
    });
});

// Welcome Message
console.log("Welcome to VYBE-project! 💜");
