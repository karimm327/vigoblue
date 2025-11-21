// ---------- Login ----------
const loginForm = document.getElementById("loginForm");
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;

    try {
        const res = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const contentType = res.headers.get("content-type");
        let result;

        if (contentType && contentType.includes("application/json")) {
            result = await res.json();
        } else {
            const text = await res.text();
            console.error("Serveur n'a pas renvoyé JSON :", text);
            return alert("Erreur serveur inattendue !");
        }

        if (result.success && result.redirect) {
            window.location.href = result.redirect;
        } else {
            alert(result.message);
        }
    } catch (err) {
        console.error(err);
        alert("Erreur lors de la connexion !");
    }
});

// ---------- Inscription ----------
const registerForm = document.getElementById("registerForm");
registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("registerEmail").value;
    const password = document.getElementById("registerPassword").value;
    const code = document.getElementById("verificationCode").value;
    const nom = document.getElementById("registerNom").value;
    const prenom = document.getElementById("registerPrenom").value;
    const jour = document.getElementById("registerJour").value;
    const mois = document.getElementById("registerMois").value;
    const annee = document.getElementById("registerAnnee").value;

    try {
        const res = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, code, nom, prenom, jour, mois, annee })
        });

        const contentType = res.headers.get("content-type");
        let result;

        if (contentType && contentType.includes("application/json")) {
            result = await res.json();
        } else {
            const text = await res.text();
            console.error("Serveur n'a pas renvoyé JSON :", text);
            return alert("Erreur serveur inattendue !");
        }

        alert(result.message);
        if (result.success && result.redirect) {
            setTimeout(() => window.location.href = result.redirect, 1000);
        }
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'inscription !");
    }
});
