(function () {
    const storageKey = "vybe-theme";

    function getTheme() {
        const saved = localStorage.getItem(storageKey);
        if (saved === "light" || saved === "dark") return saved;
        return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    }

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            const isLight = theme === "light";
            button.setAttribute("aria-label", isLight ? "Switch to dark mode" : "Switch to light mode");
            button.setAttribute("title", isLight ? "Switch to dark mode" : "Switch to light mode");
            button.textContent = isLight ? "☾" : "☀";
        });
    }

    const current = getTheme();
    applyTheme(current);

    window.addEventListener("DOMContentLoaded", () => {
        applyTheme(current);

        document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
            button.addEventListener("click", () => {
                const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
                localStorage.setItem(storageKey, next);
                applyTheme(next);
            });
        });
    });
})();
