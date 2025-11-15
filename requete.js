// ✅ Stripe côté client
const stripe = Stripe("pk_test_51S6yGqPuI7pn7UOVAuI1UOrgRoFDeJOrLwCBpMJsavXKnLAAcNaVYFSMXGqi8WAcB5v3b3PVN2VKPnHOH7h0aykp00NdB9ob2Z"); // Mets ta clé publique
const elements = stripe.elements();
const cardElement = elements.create("card");
cardElement.mount("#card-element");

// ✅ Paiement
document.getElementById("paymentForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { paymentMethod, error } = await stripe.createPaymentMethod({
    type: "card",
    card: cardElement,
    billing_details: { name: document.getElementById("cardholder").value }
  });

  if (error) return alert("Erreur : " + error.message);

  const res = await fetch("/paiement", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethodId: paymentMethod.id, amount: parseInt(document.getElementById("amount").value) * 100 })
  });

  const data = await res.json();
  if (data.success) {
    alert("✅ Paiement validé !");
    loadPaiements();
  } else {
    alert("❌ " + data.message);
  }
});

// ✅ Charger infos utilisateur
async function loadUser() {
  const res = await fetch("/user");
  const data = await res.json();
  if (data.success) document.getElementById("userEmail").innerText = data.user.email;
}
async function loadPaiements() {
  const res = await fetch("/paiements");
  const data = await res.json();
  if (data.success) {
    const list = document.getElementById("paiementsList");
    list.innerHTML = "";
    data.paiements.forEach(p => {
      const li = document.createElement("li");
      li.textContent = `${p.brand.toUpperCase()} ****${p.last4} — ${(p.montant / 100).toFixed(2)} €`;
      list.appendChild(li);
    });
  }
}
loadUser();
loadPaiements();

