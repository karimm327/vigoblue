import express from "express";
import session from "express-session";
import mysql from "mysql2";
import path from "path";
import { fileURLToPath } from "url";
import Stripe from "stripe";

const app = express();
const port = 3000;

// ---------------- Stripe ----------------
const stripe = new Stripe("sk_test_51S6yGqPuI7pn7UOVTuwLLAYPzpdte8iQnBcGsRA8u77oBIFvUwhgbV9w8MWZGOOAdT83Rx6i7Ew54gfqd9cTp6hi00FZ5X3Bl2"); // ta clé secrète Stripe

// ---------------- Middleware ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "secretkey",
    resave: false,
    saveUninitialized: false
  })
);

// ---------------- MySQL ----------------
const db = mysql.createConnection({
  host: "localhost",
  user: "ben",
  password: "monpassword",
  database: "VigoBlue"
});

db.connect((err) => {
  if (err) console.error("❌ MySQL:", err);
  else console.log("✅ Connecté à MySQL");
});

// ---------------- Paths ----------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ---------------- Utilisateurs ----------------

// Inscription
app.post("/register", async (req, res) => {
  const { email, password, nom, prenom } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email et mot de passe requis" });

  try {
    const customer = await stripe.customers.create({ email });
    db.query(
      "INSERT INTO users (email, password, nom, prenom, stripe_customer_id) VALUES (?, ?, ?, ?, ?)",
      [email, password, nom || "", prenom || "", customer.id],
      (err) => {
        if (err) return res.status(500).json({ success: false, message: "Erreur lors de l'inscription." });
        res.json({ success: true, message: "Inscription réussie !", redirect: "/login.html" });
      }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Erreur Stripe: " + err.message });
  }
});

// Login
app.post("/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, message: "Email et mot de passe requis" });

  db.query(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: "Erreur serveur" });
      if (results.length > 0) {
        req.session.userId = results[0].id;
        res.json({ success: true, redirect: "/site.html" });
      } else {
        res.status(401).json({ success: false, message: "❌ Email ou mot de passe incorrect" });
      }
    }
  );
});

// Récupérer utilisateur connecté
app.get("/user/me", (req, res) => {
  if (!req.session.userId) return res.json({ success: false, message: "Non connecté" });

  db.query(
    "SELECT id, email, nom, prenom, stripe_customer_id FROM users WHERE id = ?",
    [req.session.userId],
    (err, results) => {
      if (err) return res.status(500).json({ success: false, message: err.message });
      if (results.length === 0) return res.json({ success: false, message: "Utilisateur non trouvé" });
      res.json({ success: true, user: results[0] });
    }
  );
});

// ---------------- Produits ----------------
app.get("/products", (req, res) => {
  db.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, products: results });
  });
});

// ---------------- Panier ----------------

// Ajouter un produit au panier
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

// Récupérer le panier
app.get('/cart', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  db.query('SELECT * FROM cart_items WHERE user_id = ?', [userId], (err, results) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, cart: results });
  });
});

// Mettre à jour quantité
app.post('/cart/update', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  const { id, quantity } = req.body;
  db.query('UPDATE cart_items SET quantity = ? WHERE id = ? AND user_id = ?', [quantity, id, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Quantité mise à jour' });
  });
});

// Supprimer produit du panier
app.post('/cart/remove', (req, res) => {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ success: false, message: 'Non connecté' });

  const { id } = req.body;
  db.query('DELETE FROM cart_items WHERE id = ? AND user_id = ?', [id, userId], (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    res.json({ success: true, message: 'Produit supprimé' });
  });
});

// ---------------- Paiements ----------------
// ... tes routes Stripe existantes ici ...

// ---------------- Pages ----------------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));

// ---------------- Lancement serveur ----------------
app.listen(port, () => console.log(`🚀 Serveur lancé : http://localhost:${port}`));

