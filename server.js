import nodemailer from "nodemailer";  // envoie de mail
import cors from "cors";
import express from "express"; //express+node.js pour créer le server
import session from "express-session";
import path from "path";  //cheminement
import { fileURLToPath } from "url";
import Stripe from "stripe";  // moyen de paiement
import bcrypt from "bcrypt";  // hachage des mdp
import dotenv from "dotenv";
import pkg from 'pg';
const { Pool } = pkg;

const db = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

db.connect()
  .then(() => console.log("Connecté à PostgreSQL !"))
  .catch(err => console.error("Erreur de connexion PostgreSQL :", err));


//  Middlewares  //
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(session({ secret: "secretkey", resave: false, saveUninitialized: false }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));


// clé api secrète donné par Stripe caché dans .env
const stripe = new Stripe(process.env.STRIPE_SECRET);

//  Fonctions Utilitaires //
function validatePassword(password) {
  const regex = /^(?=.*[A-Z])(?=(?:.*\d){3,})(?=.*[!@#$%^&*()_+=[\]{};':"\\|,.<>/?]).{8,}$/;
  return regex.test(password);
}

function isGmail(email) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(email);
}

//  Routes  //
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/reset-password.html", (req, res) => res.sendFile(path.join(__dirname, "public/reset-password.html")));


// --- Route pour récupérer l'utilisateur connecté --- //
app.get("/user/me", (req, res) => {
  if (!req.session.userId) return res.status(401).json({ success: false, message: "Non connecté" });

  db.query(
    "SELECT id, email, nom, prenom, stripe_customer_id FROM users WHERE id = ?",
    [req.session.userId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (results.length === 0) return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
      res.json({ success: true, user: results[0] });
    }
  );
});


// Produits //
app.get("/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, products: results });
  });
});


// Ajouter un produit au panier //
app.post('/cart/add', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  const { ref, color, price, quantity, image } = req.body;
  if (!ref || !price || !quantity) return res.status(400).json({ success: false, message: 'Données manquantes' });

  db.query(
    'SELECT id, quantity FROM cart_items WHERE user_id = ? AND ref = ? AND color = ?',
    [userId, ref, color],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });

      if (results.length > 0) {
        const newQty = results[0].quantity + quantity;
        db.query('UPDATE cart_items SET quantity = ? WHERE id = ?', [newQty, results[0].id], (err) => {
          if (err) return res.status(500).json({ success: false, message: err.message });
          res.json({ success: true, message: 'Quantité mise à jour' });
        });
      } else {
        db.query(
          'INSERT INTO cart_items (user_id, ref, color, price, quantity, image) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, ref, color, price, quantity, image],
          (err) => {
            if (err) return res.status(500).json({ success: false, message: err.message });
            res.json({ success: true, message: 'Produit ajouté au panier' });
          }
        );
      }
    }
  );
});

// Récupérer le panier //
app.get('/cart', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  db.query('SELECT * FROM cart_items WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, cart: results });
  });
});



// Mettre à jour quantité //
app.post('/cart/update', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  const { id, quantity } = req.body;
  db.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, id, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Quantité mise à jour' });
  });
});

// Supprimer produit du panier //
app.post('/cart/remove', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  const { id } = req.body;
  db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [id, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Produit supprimé' });
  });
});


//  Envoi code de vérification  //
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

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "benhajkarim73@gmail.com", pass: "lftz chtp otrh xbnb" }
    });
    
// envoie code verif avec structure html, css unline //
    await transporter.sendMail({
      from: "benhajkarim73@gmail.com",
      to: email,
      subject: "Code de vérification",
      html: `
        <h2>VigoBlue</h2>
        <div style="text-align:center;">
          <h3 style="background-color:black; color:white; padding:10px;">Code de vérification</h3>
          <p>${email}, votre code de vérification : <b>${code}</b></p>
          <p>Il expire dans 5 minutes</p>
        </div>
      `
    });

    res.json({ success: true, message: "Code envoyé à votre email !" });
  } catch (err) {
    console.error("Erreur /send-verification-code :", err);
    res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

// --- inscription --- //
app.post("/register", async (req, res) => {
  const { email, password, code, nom, prenom, jour, mois, annee } = req.body;

  if (!email || !password || !code || !nom || !prenom || !jour || !mois || !annee) {
    return res.status(400).json({ success: false, message: "Tous les champs sont requis" });
  }
  if (!isGmail(email)) return res.status(400).json({ success: false, message: "Seuls les emails Gmail sont autorisés !" });
  if (!validatePassword(password)) return res.status(400).json({ success: false, message: "Mot de passe invalide : minimum 8 caractères, 1 majuscule, 3 chiffres, 1 symbole" });

  try {
// Vérifie le code //
    const [rows] = await db.promise().query(
      "SELECT * FROM verification_codes WHERE email = ? AND code = ? AND expire > ?",
      [email, code, Date.now()]
    );
    if (rows.length === 0) return res.status(400).json({ success: false, message: "Code invalide ou expiré" });

// Vérifie si email déjà utilisé
    const [existing] = await db.promise().query("SELECT * FROM users WHERE email = ?", [email]);
    if (existing.length > 0) return res.status(400).json({ success: false, message: "Email déjà utilisé" });

// Crée client Stripe
    const customer = await stripe.customers.create({ email });

// Hash mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

// Insère utilisateur
    await db.promise().query(
      "INSERT INTO users (email, password, nom, prenom, jour_naissance, mois_naissance, annee_naissance, stripe_customer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [email, hashedPassword, nom, prenom, parseInt(jour), parseInt(mois), parseInt(annee), customer.id]
    );

// Supprime code vérification
    await db.promise().query("DELETE FROM verification_codes WHERE email = ?", [email]);

// envoi du mail bienvenue //
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: "benhajkarim73@gmail.com", pass: "lftz chtp otrh xbnb" }
    });
    await transporter.sendMail({
      from: "benhajkarim73@gmail.com",
      to: email,
      subject: "Bienvenue sur VigoBlue !",
      html: `<div style="text-align:center;">
        <h2>Bienvenue sur VigoBlue</h2>
        <p>Bonjour ${nom}, votre inscription est réussie !</p>
        <p>Vous pouvez maintenant continuer votre shopping.</p>
      </div>`
    });

    res.json({ success: true, message: "Inscription réussie et email de bienvenue envoyé !", redirect: "/login.html" });

  } catch (err) {
    console.error("Erreur /register :", err);
    res.status(500).json({ success: false, message: "Erreur serveur : " + err.message });
  }
});






// Login //
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: "Email et mot de passe requis" });

  db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
    if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });

    if (results.length > 0) {
      const user = results[0];
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        req.session.userId = user.id;
        res.json({ success: true, redirect: "/site.html" });
      } else {
        res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });
      }
    } else {
      res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });
    }
  });
});

// ---------------------- port sur lequel le port ecoute  ---------------------- //
app.listen(port, () => console.log(`🚀 Serveur lancé : http://localhost:${port}`));

