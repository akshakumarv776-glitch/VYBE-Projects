function validateRegister() {
    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const error = document.getElementById("error");

    error.textContent = "";

    if (name.length < 2) {
        error.textContent = "Enter a valid name";
        return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        error.textContent = "Enter a valid email";
        return false;
    }

    if (password.length < 8) {
        error.textContent = "Password must contain at least 8 characters";
        return false;
    }

    return true;
}
