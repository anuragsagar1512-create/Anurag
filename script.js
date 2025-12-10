// --- CONFIGURATION ---
const SUPABASE_URL = "https://hfdkarlboycxyosmzdge.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZGthcmxib3ljeHlvc216ZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODEzNjcsImV4cCI6MjA4MDY1NzM2N30.ndZ9hv_o1zUstIrtRXWvHsUFCPj3Pwn1r3-V3Gp7Hgo";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL VARIABLES ---
let cart = [];
let productCache = {}; // Fast access for POS
let storeProfile = null;
let currentOrderFilter = "ALL";
let editingProductId = null;
let uploadedImageUrl = null;

// --- UTILS ---
function formatRupee(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 3000);
}

// --- AUTH & INIT ---
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");

async function initApp() {
  const {
    data: { session },
  } = await db.auth.getSession();
  if (session) {
    loginContainer.classList.add("hidden");
    appContainer.classList.remove("hidden");
    loadAllData();
  } else {
    loginContainer.classList.remove("hidden");
    appContainer.classList.add("hidden");
  }
}

async function loadAllData() {
  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadHomeStats(),
    loadExpenses(),
    loadStoreDetails(),
  ]);
  updateCartUI();
}

// Login Logic
document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    const errEl = document.getElementById("login-error");
    errEl.textContent = error.message;
    errEl.classList.remove("hidden");
  } else {
    initApp();
  }
});

document.getElementById("btn-logout").onclick = async () => {
  await db.auth.signOut();
  window.location.reload();
};

// Theme Toggle
document.getElementById("theme-toggle").onclick = () => {
  document.body.classList.toggle("dark-mode");
};

// --- PRODUCT MANAGER (MERGED LOGIC) ---

async function loadProducts() {
  const list = document.getElementById("products-list");
  const search = document.getElementById("product-search").value.toLowerCase();
  list.innerHTML = "";

  const { data, error } = await db
    .from("products")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    showToast("Failed to load products");
    return;
  }

  if (!data || data.length === 0) {
    document.getElementById("products-empty").style.display = "block";
    return;
  }
  document.getElementById("products-empty").style.display = "none";

  // Cache update for POS
  productCache = {};
  data.forEach((p) => (productCache[p.id] = p));

  // Render List
  const filtered = data.filter((p) =>
    (p.name || "").toLowerCase().includes(search)
  );

  filtered.forEach((p) => {
    const isLow = p.low_stock_threshold && p.stock <= p.low_stock_threshold;
    const el = document.createElement("div");
    el.className = `product-item ${isLow ? "low-stock" : ""}`;
    el.innerHTML = `
      <img src="${p.image_url || "https://placehold.co/60"}" class="product-img"/>
      <div class="product-main">
        <div style="font-weight:600; font-size:16px;">${p.name}</div>
        <div class="muted small">${formatRupee(p.price)} · Stock: <b>${
      p.stock
    }</b> ${isLow ? "⚠️" : ""}</div>
      </div>
      <div class="product-actions" style="display:flex; flex-direction:column; gap:5px;">
        <button class="btn small primary-soft" onclick='addToCartFromId(${
          p.id
        })'>+ Add</button>
        <button class="btn small" onclick="openProductModal(${p.id})">✏️ Edit</button>
      </div>
    `;
    list.appendChild(el);
  });
}

document.getElementById("product-search").addEventListener("input", loadProducts);

// Open Modal (Add/Edit)
window.openProductModal = function (id = null) {
  editingProductId = id;
  const modal = document.getElementById("product-modal-backdrop");
  modal.classList.remove("hidden");
  const delBtn = document.getElementById("delete-product-btn");
  const title = document.getElementById("modal-title");

  // Reset Form
  uploadedImageUrl = null;
  const imgBox = document.getElementById("image-preview-box");
  imgBox.style.backgroundImage = "none";
  imgBox.textContent = "Tap to Upload Photo";
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-price").value = "";
  document.getElementById("prod-stock").value = "";
  document.getElementById("prod-low").value = "5";

  if (id) {
    // Edit Mode
    const p = productCache[id];
    title.textContent = "Edit Product";
    delBtn.classList.remove("hidden");

    document.getElementById("prod-name").value = p.name;
    document.getElementById("prod-price").value = p.price;
    document.getElementById("prod-stock").value = p.stock;
    document.getElementById("prod-category").value = p.category || "General";
    document.getElementById("prod-low").value = p.low_stock_threshold || 5;

    uploadedImageUrl = p.image_url;
    if (uploadedImageUrl) {
      imgBox.style.backgroundImage = `url(${uploadedImageUrl})`;
      imgBox.textContent = "";
    }
  } else {
    // Add Mode
    title.textContent = "Add Product";
    delBtn.classList.add("hidden");
  }
};

document.getElementById("btn-add-product").onclick = () => openProductModal(null);
document.getElementById("modal-close-btn").onclick = () =>
  document.getElementById("product-modal-backdrop").classList.add("hidden");

// Image Upload
document.getElementById("image-preview-box").onclick = () =>
  document.getElementById("product-image-input").click();

document.getElementById("product-image-input").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const box = document.getElementById("image-preview-box");
  box.textContent = "Uploading...";

  try {
    const path = "images/" + Date.now() + "-" + file.name;
    const { error } = await db.storage
      .from("product-images")
      .upload(path, file);
    if (error) throw error;

    const { data } = db.storage.from("product-images").getPublicUrl(path);
    uploadedImageUrl = data.publicUrl;

    box.style.backgroundImage = `url(${uploadedImageUrl})`;
    box.textContent = "";
  } catch (err) {
    console.error(err);
    showToast("Image upload failed ❌");
    box.textContent = "Retry";
  }
};

// Save Product (With Validation)
document.getElementById("save-product-btn").onclick = async () => {
  const name = document.getElementById("prod-name").value.trim();
  const price = document.getElementById("prod-price").value;
  const stock = document.getElementById("prod-stock").value || 0;
  const category = document.getElementById("prod-category").value;
  const low = document.getElementById("prod-low").value || 5;

  if (!name) return showToast("❌ Name required");
  if (!price || price <= 0) return showToast("❌ Price invalid");

  const btn = document.getElementById("save-product-btn");
  btn.textContent = "Saving...";
  btn.disabled = true;

  const payload = {
    name,
    price: Number(price),
    stock: Number(stock),
    category,
    low_stock_threshold: Number(low),
    image_url: uploadedImageUrl,
  };

  try {
    if (editingProductId) {
      await db.from("products").update(payload).eq("id", editingProductId);
      showToast("Updated ✅");
    } else {
      await db.from("products").insert(payload);
      showToast("Added ✅");
    }
    document
      .getElementById("product-modal-backdrop")
      .classList.add("hidden");
    loadProducts();
  } catch (e) {
    console.error(e);
    showToast("Error saving");
  } finally {
    btn.textContent = "Save Product";
    btn.disabled = false;
  }
};

// Delete Product (With Image Cleanup)
document.getElementById("delete-product-btn").onclick = async () => {
  if (!confirm("Delete this product?")) return;

  const btn = document.getElementById("delete-product-btn");
  btn.textContent = "Deleting...";
  btn.disabled = true;

  const p = productCache[editingProductId];

  // Clean image from storage
  if (p && p.image_url && p.image_url.includes("product-images")) {
    try {
      const path = p.image_url.split("/product-images/")[1];
      if (path) await db.storage.from("product-images").remove([path]);
    } catch (e) {
      console.error("Img cleanup fail", e);
    }
  }

  await db.from("products").delete().eq("id", editingProductId);
  showToast("Product Deleted 🗑");
  document.getElementById("product-modal-backdrop").classList.add("hidden");
  loadProducts();
};

// --- POS & CART LOGIC ---

window.addToCartFromId = (id) => {
  const p = productCache[id];
  if (p) addToCart(p);
};

function addToCart(product) {
  const existing = cart.find((i) => i.id === product.id);
  if (existing) {
    if (existing.qty >= product.stock)
      return showToast("⚠️ Not enough stock");
    existing.qty++;
  } else {
    if (product.stock < 1) return showToast("⚠️ Out of stock");
    cart.push({ ...product, qty: 1 });
  }
  updateCartUI();
  showToast("Added to cart");
}

function updateCartUI() {
  const list = document.getElementById("cart-list");
  const summary = document.getElementById("cart-summary");
  const floatText = document.getElementById("float-cart-text");
  const empty = document.getElementById("cart-empty");
  const floatBtn = document.getElementById("floating-cart");

  list.innerHTML = "";

  if (cart.length === 0) {
    empty.style.display = "block";
    summary.textContent = "₹0 · 0";
    floatBtn.classList.add("hidden");
  } else {
    empty.style.display = "none";
    floatBtn.classList.remove("hidden");

    let total = 0;
    let count = 0;

    cart.forEach((item) => {
      total += item.price * item.qty;
      count += item.qty;

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.justifyContent = "space-between";
      row.style.marginTop = "8px";
      row.innerHTML = `
        <span>${item.name}</span>
        <div style="display:flex; align-items:center; gap:8px;">
          <button class="btn small" onclick="changeQty(${item.id}, -1)">-</button>
          <b>${item.qty}</b>
          <button class="btn small" onclick="changeQty(${item.id}, 1)">+</button>
          <span>${formatRupee(item.price * item.qty)}</span>
        </div>
      `;
      list.appendChild(row);
    });

    const txt = `${formatRupee(total)} · ${count}`;
    summary.textContent = txt;
    floatText.textContent = txt;
  }
}

window.changeQty = (id, delta) => {
  const item = cart.find((i) => i.id === id);
  if (item) {
    const stock = productCache[id]?.stock || 0;
    if (delta > 0 && item.qty >= stock) return showToast("Max stock reached");

    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter((i) => i.id !== id);
    updateCartUI();
  }
};

document.getElementById("cart-clear").onclick = () => {
  cart = [];
  updateCartUI();
};
document.getElementById("floating-cart").onclick = () =>
  document.querySelector('[data-tab="orders"]').click();

// CHECKOUT & PRINT
document.getElementById("delivery-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  let total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const manualAmt = document.getElementById("delivery-amount").value;

  if (total === 0 && manualAmt) total = Number(manualAmt);
  if (total === 0) return showToast("Cart is empty");

  if (!confirm(`Confirm Order: ${formatRupee(total)}?`)) return;

  const btn = e.target.querySelector("button");
  btn.textContent = "Processing...";
  btn.disabled = true;

  const orderData = {
    customer_name: document.getElementById("delivery-name").value || "Guest",
    customer_phone: document.getElementById("delivery-phone").value,
    customer_address: document.getElementById("delivery-address").value,
    payment_method: document.getElementById("delivery-payment").value,
    total_amount: total,
    status: "PENDING",
  };

  const { data: ord, error } = await db
    .from("orders")
    .insert(orderData)
    .select("id")
    .single();

  if (!error && ord) {
    // Save items & reduce stock
    if (cart.length > 0) {
      const items = cart.map((i) => ({
        order_id: ord.id,
        product_id: i.id,
        quantity: i.qty,
        price: i.price,
      }));
      await db.from("order_items").insert(items);

      for (const i of cart) {
        const newStock = (productCache[i.id]?.stock || 0) - i.qty;
        await db.from("products").update({ stock: newStock }).eq("id", i.id);
      }
    }

    showToast("Order Placed! Printing...");
    await printInvoice(ord.id);

    cart = [];
    e.target.reset();
    updateCartUI();
    loadAllData();
  } else {
    console.error(error);
    showToast("Failed to place order");
  }
  btn.textContent = "Place Order & Print";
  btn.disabled = false;
});

// --- INVOICE PRINT ---
async function printInvoice(orderId) {
  const { data: order } = await db
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();
  const { data: items } = await db
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  const root = document.getElementById("print-root");

  let rows = "";
  if (items && items.length > 0) {
    items.forEach((it, i) => {
      const name = productCache[it.product_id]?.name || "Item";
      rows += `<tr><td>${i + 1}</td><td>${name}</td><td>${
        it.quantity
      }</td><td>${it.price}</td><td>${it.quantity * it.price}</td></tr>`;
    });
  } else {
    rows = `<tr><td colspan="5">Manual Order (No Item Details)</td></tr>`;
  }

  const s = storeProfile || {};
  root.innerHTML = `
    <div style="font-family:monospace; padding:10px;">
      <center>
        <h2>${s.store_name || "MY SHOP"}</h2>
        <p>${s.address_line || ""} ${s.city || ""}</p>
        <p>Phone: ${s.phone || ""}</p>
      </center>
      <hr>
      <p>Order #${order.id}</p>
      <p>Date: ${new Date().toLocaleDateString()}</p>
      <p>Customer: ${order.customer_name}</p>
      <table class="invoice-table">
        <thead><tr><th>#</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amt</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <h3 style="text-align:right">Total: ${formatRupee(
        order.total_amount
      )}</h3>
      <center><p>Thank You!</p></center>
    </div>
  `;
  window.print();
}

// --- TABS & OTHER LOADS ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".tab-page")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

async function loadOrders() {
  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  const list = document.getElementById("orders-list");
  list.innerHTML = "";
  if (error) {
    console.error(error);
    showToast("Failed to load orders");
    return;
  }
  if (!data || data.length === 0) {
    document.getElementById("orders-empty").style.display = "block";
    return;
  }
  document.getElementById("orders-empty").style.display = "none";

  const filtered =
    currentOrderFilter === "ALL"
      ? data
      : data.filter((o) => o.status === currentOrderFilter);

  filtered.forEach((o) => {
    list.innerHTML += `
      <div class="card" style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong>#${o.id} · ${formatRupee(o.total_amount)}</strong>
          <div class="muted small">${o.customer_name} · ${new Date(
      o.created_at
    ).toLocaleDateString()}</div>
        </div>
        <span class="status-badge status-${o.status.toLowerCase()}">${
      o.status
    }</span>
      </div>
    `;
  });
}

document.querySelectorAll(".filter-btn").forEach((btn) => {
  btn.onclick = () => {
    document
      .querySelectorAll(".filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentOrderFilter = btn.dataset.status;
    loadOrders();
  };
});

async function loadHomeStats() {
  const { data: orders, error } = await db
    .from("orders")
    .select("total_amount");
  if (error) {
    console.error(error);
    return;
  }
  const total = orders
    ? orders.reduce((s, o) => s + (o.total_amount || 0), 0)
    : 0;
  document.getElementById("total-sale").textContent = formatRupee(total);
  document.getElementById("total-orders").textContent = orders?.length || 0;

  // Top Products Logic
  const { data: items } = await db
    .from("order_items")
    .select("product_id, quantity");
  if (items) {
    const counts = {};
    items.forEach(
      (i) => (counts[i.product_id] = (counts[i.product_id] || 0) + i.quantity)
    );
    const sorted = Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, 5);
    const topList = document.getElementById("top-products-list");
    topList.innerHTML = "";
    sorted.forEach((id) => {
      const p = productCache[id];
      if (p)
        topList.innerHTML += `<div class="card" style="padding:8px; margin-bottom:5px; display:flex; justify-content:space-between;"><span>${p.name}</span><strong>${counts[id]} Sold</strong></div>`;
    });
  }
}

// Store Profile Save/Load
async function loadStoreDetails() {
  const { data, error } = await db.from("store_profile").select("*").limit(1);
  if (error) {
    console.error(error);
    return;
  }
  if (data && data[0]) {
    storeProfile = data[0];
    document.getElementById("store-name").value = storeProfile.store_name || "";
    document.getElementById("store-phone").value = storeProfile.phone || "";
    document.getElementById("store-address-line").value =
      storeProfile.address_line || "";
    document.getElementById("store-city").value = storeProfile.city || "";
    document.getElementById("store-pincode").value =
      storeProfile.pincode || "";
    document.getElementById("store-upi").value = storeProfile.upi_id || "";
    document.getElementById("store-logo").value =
      storeProfile.logo_url || "";
  }
}

document.getElementById("store-form").onsubmit = async (e) => {
  e.preventDefault();
  const payload = {
    store_name: document.getElementById("store-name").value,
    phone: document.getElementById("store-phone").value,
    address_line: document.getElementById("store-address-line").value,
    city: document.getElementById("store-city").value,
    pincode: document.getElementById("store-pincode").value,
    upi_id: document.getElementById("store-upi").value,
    logo_url: document.getElementById("store-logo").value,
  };

  if (storeProfile?.id)
    await db.from("store_profile").update(payload).eq("id", storeProfile.id);
  else await db.from("store_profile").insert(payload);

  showToast("Profile Saved");
  loadStoreDetails();
};

// Expenses
async function loadExpenses() {
  const { data, error } = await db
    .from("expenses")
    .select("*")
    .order("created_at", { ascending: false });
  const list = document.getElementById("expense-list");
  list.innerHTML = "";
  let total = 0;
  if (error) {
    console.error(error);
    return;
  }
  if (data) {
    data.forEach((e) => {
      total += e.amount;
      list.innerHTML += `<div class="card" style="margin-bottom:5px; display:flex; justify-content:space-between;"><span>${e.title} <small class="muted">(${e.category})</small></span><span style="color:red">-${formatRupee(
        e.amount
      )}</span></div>`;
    });
    document.getElementById("expense-total-display").textContent =
      "Total: " + formatRupee(total);
  }
}

document.getElementById("expense-form").onsubmit = async (e) => {
  e.preventDefault();
  await db.from("expenses").insert({
    title: document.getElementById("expense-title").value,
    amount: document.getElementById("expense-amount").value,
    category: document.getElementById("expense-category").value,
  });
  showToast("Expense Added");
  e.target.reset();
  loadExpenses();
};

// Start
initApp();
