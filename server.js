import express from "express";
import cors from "cors";
import sgMail from "@sendgrid/mail";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------
// CONFIG SENDGRID
// ---------------------------------------
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// ---------------------------------------
// STOCK TEMPORAIRE DES CODES
// ---------------------------------------
const verificationCodes = {};

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ---------------------------------------
// ROUTE ENVOI DU CODE
// ---------------------------------------
app.post("/send-verification-code", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email manquant" });
    }

    const code = generateCode();
    verificationCodes[email] = code;

    const msg = {
      to: email,
      from: "vigoblueofficiel@gmail.com",
      subject: "Votre code de vérification - VigoBlue",
      html: `<p>Bonjour,<br><br>Voici votre code de vérification :</p>
             <h2 style="color:#2563eb;">${code}</h2>
             <p>Il est valable 10 minutes.</p>`
    };

    await sgMail.send(msg);

    res.json({ success: true, message: "Code envoyé à votre email !" });

  } catch (err) {
    console.error("Erreur serveur :", err);
    res.status(500).json({ success: false, message: "Erreur interne serveur" });
  }
});

// ---------------------------------------
// ROUTE INSCRIPTION
// ---------------------------------------
app.post("/register", async (req, res) => {
  try {
    const { email, password, code, prenom, nom, jour, mois, annee } = req.body;

    if (!email || !password || !code || !prenom || !nom || !jour || !mois || !annee) {
      return res.status(400).json({
        success: false,
        message: "Tous les champs sont requis"
      });
    }

    if (verificationCodes[email] !== code) {
      return res.status(400).json({
        success: false,
        message: "Code de vérification incorrect"
      });
    }

    delete verificationCodes[email]; // ⚠️ On supprime le code après utilisation

    res.json({
      success: true,
      message: "Inscription réussie !",
      redirect: "/welcome.html"
    });

  } catch (err) {
    console.error("Erreur serveur :", err);
    res.status(500).json({ success: false, message: "Erreur interne serveur" });
  }
});

// ---------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Serveur lancé sur " + PORT));
