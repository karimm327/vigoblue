import express from "express";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import cors from "cors";
import sgMail from "@sendgrid/mail";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(express.json());
app.use(cors());

// -----------------------
// CONFIG SENDGRID
// -----------------------
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// -----------------------
// CONFIG POSTGRESQL
// -----------------------
const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false, // obligatoire pour Render
  },
});

// Test connexion
db.connect()
  .then(() => console.log("Connecté à PostgreSQL"))
  .catch((err) => console.error("Erreur PostgreSQL :", err));


// -----------------------
// FONCTION EMAIL GMAIL AUTORISÉ
// -----------------------
function isGmail(email) {
  return email.endsWith("@gmail.com");
}


// ----------------------------
// ROUTE : ENVOYER CODE CONFIRMATION
// ----------------------------
app.post("/send-verification-code", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ success: false, message: "Email requis" });
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });

  try {
    const code = Math.floor(100000 + Math.random() * 900000);
    const expire = Date.now() + 5 * 60 * 1000;

    await db.query("DELETE FROM verification_codes WHERE email = $1", [email]);

    await db.query(
      "INSERT INTO verification_codes (email, code, expire) VALUES ($1, $2, $3)",
      [email, code, expire]
    );

    const msg = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Code de vérification VigoBlue",
      html: `
        <div style="text-align:center;">
          <h2>VigoBlue</h2>
          <h3 style="background:black;color:white;padding:10px;">Code de vérification</h3>
          <p>${email}, votre code est : <b>${code}</b></p>
          <p>Il expire dans 5 minutes.</p>
        </div>
      `,
    };

    await sgMail.send(msg);

    res.json({ success: true, message: "Code envoyé !" });

  } catch (err) {
    console.error("Erreur SendGrid :", err.response ? err.response.body : err);
    res.status(500).json({ success: false, message: "Erreur serveur SendGrid" });
  }
});


// ----------------------------
// ROUTE : VÉRIFIER LE CODE
// ----------------------------
app.post("/verify-code", async (req, res) => {
  const { email, code } = req.body;

  const result = await db.query(
    "SELECT * FROM verification_codes WHERE email = $1 AND code = $2",
    [email, code]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, message: "Code incorrect" });
  }

  if (result.rows[0].expire < Date.now()) {
    return res.status(400).json({ success: false, message: "Code expiré" });
  }

  res.json({ success: true });
});


// ----------------------------
// ROUTE : INSCRIPTION
// ----------------------------
app.post("/register", async (req, res) => {
  const { nom, email, password, telephone, adresse } = req.body;

  if (!isGmail(email)) {
    return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const result = await db.query(
      "INSERT INTO users (nom, email, password, telephone, adresse) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [nom, email, hashedPassword, telephone, adresse]
    );

    // Email de bienvenue
    const welcomeMsg = {
      to: email,
      from: process.env.EMAIL_USER,
      subject: "Bienvenue sur VigoBlue !",
      html: `
        <div style="text-align:center;">
          <h2>Bienvenue ${nom} !</h2>
          <p>Votre inscription sur VigoBlue est réussie.</p>
        </div>
      `,
    };

    await sgMail.send(welcomeMsg);

    res.json({ success: true, userId: result.rows[0].id });

  } catch (err) {
    console.error("Erreur /register :", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});


// ----------------------------
// ROUTE : LOGIN
// ----------------------------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, message: "Email introuvable" });
  }

  const user = result.rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ success: false, message: "Mot de passe incorrect" });
  }

  res.json({ success: true, user });
});


// ----------------------------
// ROUTE TEST
// ----------------------------
app.get("/", (req, res) => {
  res.send("API VigoBlue (PostgreSQL) est en ligne !");
});


// ----------------------------
// DÉMARRAGE SERVEUR
// ----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
