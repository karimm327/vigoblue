import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import Stripe from "stripe";
import bcrypt from "bcrypt";
import connectPgSimple from "connect-pg-simple";
import sgMail from "@sendgrid/mail";

// ⚡ Charger les variables d'environnement
dotenv.config();
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_PORT:", process.env.DB_PORT);

const app = express();
const port = process.env.PORT || 3000;

// ----------------- CORS -----------------
app.use(cors({
  origin: ["https://vigoblue.netlify.app"],
  methods: ["GET","POST","PUT","DELETE"],
  credentials: true
}));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://vigoblue.netlify.app");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ----------------- Connexion PostgreSQL -----------------
const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

db.connect()
  .then(() => console.log("✅ Connecté à PostgreSQL !"))
  .catch(err => console.error("❌ Erreur de connexion PostgreSQL :", err));

// ----------------- Sessions -----------------
const pgSession = connectPgSimple(session);
app.use(session({
  store: new pgSession({ pool: db, tableName: "user_sessions" }),
  secret: process.env.SESSION_SECRET || "secretkey",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24*60*60*1000 }
}));

// ----------------- Middlewares -----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname)));

// ----------------- Stripe -----------------
const stripe = new Stripe(process.env.STRIPE_SECRET);

// ----------------- Utilitaires -----------------
function validatePassword(password) {
  const regex = /^(?=.*[A-Z])(?=(?:.*\d){3,})(?=.*[!@#$%^&*()_+=[\]{};':"\\|,.<>/?]).{8,}$/;
  return regex.test(password);
}
function isGmail(email) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email);
}

// ----------------- Routes statiques -----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "vigoblue/login.html")));
app.get("/signup.html", (req, res) => res.sendFile(path.join(__dirname, "vigoblue/signup.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "vigoblue/reset-password.html")));

// ----------------- Routes API -----------------
app.post("/send-verification-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email requis" });
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });

  try {
    const code = Math.floor(100000 + Math.random() * 900000);
    const expire = Date.now() + 5 * 60 * 1000;

    // DB
    try {
      await db.query("DELETE FROM verification_codes WHERE email = $1", [email]);
      await db.query("INSERT INTO verification_codes (email, code, expire) VALUES ($1,$2,$3)", [email, code, expire]);
    } catch (dbErr) {
      console.error("Erreur DB :", dbErr);
      return res.status(500).json({ success: false, message: "Erreur base de données" });
    }

    // SendGrid
  try {
  const msg = {
    to: email,
    from: process.env.EMAIL_USER, // doit être un sender vérifié SendGrid
    subject: "Code de vérification",
    html: `<div style="text-align:center;">
             <h2>VigoBlue</h2>
             <h3 style="background-color:black; color:white; padding:10px;">Code de vérification</h3>
             <p>${email}, votre code : <b>${code}</b></p>
             <p>Il expire dans 5 minutes</p>
           </div>`,
  };

  await sgMail.send(msg);
  res.json({ success: true, message: "Code envoyé à votre email !" });

} catch (err) {
  if (err.response && err.response.body) {
    console.error("Erreur SendGrid :", err.response.body);
  } else {
    console.error("Erreur serveur :", err);
  }
  res.status(500).json({ success: false, message: "Erreur serveur SendGrid" });
}


// ----------------- Lancer serveur -----------------
app.listen(port, () => console.log(`🚀 Serveur lancé sur le port ${port}`));
