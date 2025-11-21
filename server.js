// server.js
import express from "express";
import session from "express-session";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Pool } from "pg";
import Stripe from "stripe";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import connectPgSimple from "connect-pg-simple";





const app = express();
const port = process.env.PORT || 3000;
dotenv.config();



app.use(cors({
  origin: ["https://vigoblue.netlify.app"],
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Middleware pour préflight CORS sur toutes les routes
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", "https://vigoblue.netlify.app");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.sendStatus(200);
  } else {
    next();
  }
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
app.use(
  session({
    store: new pgSession({
      pool: db,                // Utilise le pool PostgreSQL
      tableName: "user_sessions"
    }),
    secret: process.env.SESSION_SECRET || "secretkey",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 jour
  })
);

// ----------------- Middlewares -----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

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

// ----------------- Routes -----------------
// Page statiques
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "public/reset-password.html")));

// Utilisateur connecté
app.get("/user/me", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "Non connecté" });

  try {
    const { rows } = await db.query(
      "SELECT id, email, nom, prenom, stripe_customer_id FROM users WHERE id = $1",
      [req.session.userId]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    res.json({ success: true, user: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Produits
app.get("/products", async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM products");
    res.json({ success: true, products: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Panier : ajouter, récupérer, modifier, supprimer
app.post("/cart/add", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Non connecté" });

  const { ref, color, price, quantity, image } = req.body;
  if (!ref || !price || !quantity) return res.status(400).json({ success: false, message: "Données manquantes" });

  try {
    const { rows } = await db.query(
      "SELECT id, quantity FROM cart_items WHERE user_id = $1 AND ref = $2 AND color = $3",
      [userId, ref, color]
    );

    if (rows.length > 0) {
      const newQty = rows[0].quantity + quantity;
      await db.query("UPDATE cart_items SET quantity = $1 WHERE id = $2", [newQty, rows[0].id]);
      res.json({ success: true, message: "Quantité mise à jour" });
    } else {
      await db.query(
        "INSERT INTO cart_items (user_id, ref, color, price, quantity, image) VALUES ($1, $2, $3, $4, $5, $6)",
        [userId, ref, color, price, quantity, image]
      );
      res.json({ success: true, message: "Produit ajouté au panier" });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/cart", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Non connecté" });

  try {
    const { rows } = await db.query("SELECT * FROM cart_items WHERE user_id = $1", [userId]);
    res.json({ success: true, cart: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/cart/update", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Non connecté" });

  const { id, quantity } = req.body;
  try {
    await db.query("UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3", [quantity, id, userId]);
    res.json({ success: true, message: "Quantité mise à jour" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/cart/remove", async (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: "Non connecté" });

  const { id } = req.body;
  try {
    await db.query("DELETE FROM cart_items WHERE id = $1 AND user_id = $2", [id, userId]);
    res.json({ success: true, message: "Produit supprimé" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Envoi code de vérification
app.post("/send-verification-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: "Email requis" });
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });

  try {
    const code = Math.floor(100000 + Math.random() * 900000);
    const expire = Date.now() + 5 * 60 * 1000;

    await db.query("DELETE FROM verification_codes WHERE email = $1", [email]);
    await db.query("INSERT INTO verification_codes (email, code, expire) VALUES ($1, $2, $3)", [email, code, expire]);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Code de vérification",
      html: `<div style="text-align:center;">
              <h2>VigoBlue</h2>
              <h3 style="background-color:black; color:white; padding:10px;">Code de vérification</h3>
              <p>${email}, votre code : <b>${code}</b></p>
              <p>Il expire dans 5 minutes</p>
            </div>`
    });

    res.json({ success: true, message: "Code envoyé à votre email !" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// Inscription
app.post("/register", async (req, res) => {
  const { email, password, code, nom, prenom, jour, mois, annee } = req.body;
  if (!email || !password || !code || !nom || !prenom || !jour || !mois || !annee)
    return res.status(400).json({ success: false, message: "Tous les champs sont requis" });
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });
  if (!validatePassword(password))
    return res.status(400).json({ success: false, message: "Mot de passe invalide" });

  try {
    const { rows } = await db.query(
      "SELECT * FROM verification_codes WHERE email = $1 AND code = $2 AND expire > $3",
      [email, code, Date.now()]
    );
    if (rows.length === 0) return res.status(400).json({ success: false, message: "Code invalide ou expiré" });

    const { rows: existing } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: "Email déjà utilisé" });

    const customer = await stripe.customers.create({ email });
    const hashedPassword = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO users (email, password, nom, prenom, jour_naissance, mois_naissance, annee_naissance, stripe_customer_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [email, hashedPassword, nom, prenom, parseInt(jour), parseInt(mois), parseInt(annee), customer.id]
    );

    await db.query("DELETE FROM verification_codes WHERE email = $1", [email]);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Bienvenue sur VigoBlue !",
      html: `<div style="text-align:center;">
              <h2>Bienvenue sur VigoBlue</h2>
              <p>Bonjour ${nom}, votre inscription est réussie !</p>
              <p>Vous pouvez maintenant continuer votre shopping.</p>
            </div>`
    });

    res.json({ success: true, message: "Inscription réussie !", redirect: "/login.html" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur serveur : " + err.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "Email et mot de passe requis" });

  try {
    const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (rows.length === 0) return res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });

    req.session.userId = user.id;
    res.json({ success: true, redirect: "/site.html" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erreur serveur : " + err.message });
  }
});

// ----------------- Lancer serveur -----------------
app.listen(port, () => console.log(`🚀 Serveur lancé sur le port ${port}`));
