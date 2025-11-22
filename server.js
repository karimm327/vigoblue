import express from "express";
import mysql from "mysql2";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import cors from "cors";
import sgMail from "@sendgrid/mail";

dotenv.config();
const app = express();
app.use(express.json());
app.use(cors());

// -----------------------
// CONFIG SENDGRID
// -----------------------
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// -----------------------
// CONFIG MYSQL
// -----------------------
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

// Vérifier connexion
db.connect((err) => {
  if (err) {
    console.error("Erreur MySQL :", err);
  } else {
    console.log("Connecté à MySQL");
  }
});

// -----------------------
// FONCTION EMAIL GMAIL AUTORISÉ
// -----------------------
function isGmail(email) {
  return email.endsWith("@gmail.com");
}

// -----------------------
// ROUTE : ENVOYER CODE DE VÉRIFICATION
// -----------------------
app.post("/send-verification-code", async (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ success: false, message: "Email requis" });
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });

  try {
    const code = Math.floor(100000 + Math.random() * 900000);
    const expire = Date.now() + 5 * 60 * 1000;

    await db.promise().query("DELETE FROM verification_codes WHERE email = ?", [email]);
    await db.promise().query(
      "INSERT INTO verification_codes (email, code, expire) VALUES (?, ?, ?)",
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
          <p>${email}, votre code est : <b>${code}</b>.</p>
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

// -----------------------
// ROUTE : VÉRIFIER LE CODE
// -----------------------
app.post("/verify-code", async (req, res) => {
  const { email, code } = req.body;

  const [rows] = await db.promise().query("SELECT * FROM verification_codes WHERE email = ? AND code = ?", [email, code]);

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: "Code incorrect" });
  }

  if (rows[0].expire < Date.now()) {
    return res.status(400).json({ success: false, message: "Code expiré" });
  }

  res.json({ success: true });
});

// -----------------------
// ROUTE : INSCRIPTION
// -----------------------
app.post("/register", async (req, res) => {
  const { nom, email, password, telephone, adresse } = req.body;

  if (!isGmail(email)) {
    return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    const [result] = await db.promise().query(
      "INSERT INTO users (nom, email, password, telephone, adresse) VALUES (?, ?, ?, ?, ?)",
      [nom, email, hashedPassword, telephone, adresse]
    );

    // EMAIL DE BIENVENUE (SendGrid)
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

    res.json({ success: true, userId: result.insertId });
  } catch (err) {
    console.error("Erreur /register :", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// -----------------------
// ROUTE : LOGIN
// -----------------------
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  const [rows] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);

  if (rows.length === 0) {
    return res.status(400).json({ success: false, message: "Email introuvable" });
  }

  const user = rows[0];
  const match = await bcrypt.compare(password, user.password);

  if (!match) {
    return res.status(400).json({ success: false, message: "Mot de passe incorrect" });
  }

  res.json({ success: true, user });
});

// -----------------------
// ROUTE TEST
// -----------------------
app.get("/", (req, res) => {
  res.send("API VigoBlue en ligne !");
});

// -----------------------
// DÉMARRER SERVEUR
// -----------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur en ligne sur le port ${PORT}`));
