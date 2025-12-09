// --- CONFIGURATION ---
const SUPABASE_URL = "https://hfdkarlboycxyosmzdge.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZGthcmxib3ljeHlvc216ZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODEzNjcsImV4cCI6MjA4MDY1NzM2N30.ndZ9hv_o1zUstIrtRXWvHsUFCPj3Pwn1r3-V3Gp7Hgo";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- GLOBAL VARIABLES ---
let cart = [];
let productCache = {};
let storeProfile = null;
let currentOrderFilter = 'ALL';

// --- AUTHENTICATION & STARTUP ---
const loginContainer = document.getElementById("login-container");
const appContainer = document.getElementById("app-container");
const loginForm = document.getElementById("login-form");
const logoutBtn = document.getElementById("btn-logout");

async function checkSession() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session) {
    showApp(session.user);
  } else {
    showLogin();
  }
}

function showApp(user) {
  loginContainer.classList.add("hidden");
  appContainer.classList.remove("hidden");
  initData();
}

function showLogin() {
  appContainer.classList.add("hidden");
  loginContainer.classList.remove("hidden");
}

async function initData() {
  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadHome(),
    loadCustomers(),
    loadStoreDetails(),
    loadExpenses()
  ]);
  updateCartUI();
  if (localStorage.getItem("theme") === "dark") {
    document.body.classList.add("dark-mode");
    document.getElementById("theme-toggle").textContent = "☀️";
  }
}

// Login Listener
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const pass = document.getElementById("login-password").value.trim();
    const err = document.getElementById("login-error");
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) {
      err.textContent = "Login Failed: " + error.message;
      err.classList.remove("hidden");
    } else {
      err.classList.add("hidden");
      showApp(data.user);
    }
  });
}

// Logout Listener
if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
  });
}

// Theme Toggle
const themeBtn = document.getElementById("theme-toggle");
if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    const isDark = document.body.classList.contains("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    themeBtn.textContent = isDark ? "☀️" : "🌙";
  });
}

// --- TOAST HELPER ---
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2500);
}

// --- CART FUNCTIONS ---
function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.qty++;
  else cart.push({ ...product, qty: 1 });
  showToast("Added to cart");
  updateCartUI();
}

function getCartTotal() { return cart.reduce((sum, i) => sum + (i.price * i.qty), 0); }

function updateCartUI() {
  const list = document.getElementById("cart-list");
  const summary = document.getElementById("cart-summary");
  const floatText = document.getElementById("float-cart-text");
  const empty = document.getElementById("cart-empty");
  const floatBtn = document.getElementById("floating-cart");
  
  if (!list) return;
  list.innerHTML = "";
  
  if (cart.length === 0) {
    empty.style.display = "block";
    summary.textContent = "₹0 · 0";
    if (floatBtn) floatBtn.classList.add("hidden");
  } else {
    empty.style.display = "none";
    if (floatBtn) floatBtn.classList.remove("hidden");
    
    cart.forEach(item => {
      const row = document.createElement("div");
      row.className = "cart-row";
      row.innerHTML = `
        <span>${item.name}</span>
        <div class="cart-row-right">
           <div class="qty-controls">
             <span onclick="changeQty(${item.id}, -1)">-</span>
             <span>${item.qty}</span>
             <span onclick="changeQty(${item.id}, 1)">+</span>
           </div>
           <strong>₹${item.price * item.qty}</strong>
        </div>
      `;
      list.appendChild(row);
    });
    
    const total = getCartTotal();
    const count = cart.reduce((s,i) => s+i.qty, 0);
    const txt = `₹${total} · ${count} items`;
    summary.textContent = txt;
    if (floatText) floatText.textContent = txt;
  }
}

window.changeQty = (id, delta) => {
  const item = cart.find(i => i.id === id);
  if (item) {
    item.qty += delta;
    if (item.qty <= 0) cart = cart.filter(i => i.id !== id);
    updateCartUI();
  }
};

document.getElementById("cart-clear")?.addEventListener("click", () => { cart = []; updateCartUI(); });
document.getElementById("floating-cart")?.addEventListener("click", () => {
    document.querySelector('[data-tab="orders"]').click();
});

// --- DELIVERY ORDER + COUPON + FEE LOGIC ---
const deliveryForm = document.getElementById("delivery-form");
if (deliveryForm) {
  deliveryForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("delivery-name").value.trim();
    const phone = document.getElementById("delivery-phone").value.trim();
    const address = document.getElementById("delivery-address").value.trim();
    const payment = document.getElementById("delivery-payment").value;
    const amountInput = document.getElementById("delivery-amount").value;
    const coupon = document.getElementById("delivery-coupon").value.trim().toUpperCase();

    let subtotal = getCartTotal();
    if (subtotal === 0 && amountInput) subtotal = Number(amountInput);
    if (subtotal === 0) { showToast("Amount is 0"); return; }

    let deliveryFee = 0;
    if (address && subtotal < 500) {
      deliveryFee = 40;
    }

    let discount = 0;
    if (coupon === "MQM10") {
      if (subtotal < 100) { alert("Coupon needs min ₹100 order"); return; }
      if (!phone) { alert("Phone needed for coupon"); return; }
      
      const { data: hist } = await supabaseClient.from("orders").select("id").eq("customer_phone", phone).gt("discount_amount", 0);
      if (hist && hist.length > 0) { alert("Coupon already used!"); return; }
      
      let calc = subtotal * 0.10;
      if (calc > 50) calc = 50;
      discount = calc;
      showToast(`Coupon Applied! -₹${discount}`);
    }

    const finalTotal = subtotal + deliveryFee - discount;

    if (deliveryFee > 0) {
      if(!confirm(`Order: ₹${subtotal}\nDelivery Fee: +₹${deliveryFee}\nTotal: ₹${finalTotal}\nProceed?`)) return;
    }

    const { data: ord, error } = await supabaseClient.from("orders").insert({
      customer_name: name || "Guest",
      customer_phone: phone || null,
      customer_address: address || null,
      payment_method: payment,
      total_amount: finalTotal,
      discount_amount: discount,
      delivery_fee: deliveryFee,
      status: "PENDING"
    }).select("id").single();

    if (error) { console.error(error); showToast("Failed to save"); return; }

    if (cart.length > 0 && ord) {
      const items = cart.map(i => ({ order_id: ord.id, product_id: i.id, quantity: i.qty, price: i.price }));
      await supabaseClient.from("order_items").insert(items);
      
      for (const i of cart) {
        const newStock = (productCache[i.id]?.stock || 0) - i.qty;
        await supabaseClient.from("products").update({stock: newStock}).eq("id", i.id);
      }
    }

    showToast("Order Placed!");
    deliveryForm.reset();
    cart = [];
    updateCartUI();
    initData();
  });
}

// --- WHATSAPP SHARE LOGIC ---
async function shareWhatsApp(orderId) {
  const { data: order } = await supabaseClient.from("orders").select("*").eq("id", orderId).single();
  if (!order) { alert("Order not found"); return; }
  if (!order.customer_phone) { alert("No phone number"); return; }
  
  const { data: items } = await supabaseClient.from("order_items").select("quantity, product_id").eq("order_id", order.id);
  let itemTxt = "";
  if (items) {
    items.forEach(i => {
      const n = productCache[i.product_id]?.name || "Item";
      itemTxt += `\n- ${n} x ${i.quantity}`;
    });
  }
  
  const msg = `Namaste ${order.customer_name},
Order #${order.id} is ${order.status}.
Total: ₹${order.total_amount}
${itemTxt}
Thanks for shopping!`;
  
  window.open(`https://wa.me/91${order.customer_phone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// --- UPDATE ORDER STATUS ---
async function updateOrderStatus(orderId, newStatus) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error(error);
    showToast("Status update failed");
  } else {
    showToast(`Status: ${newStatus}`);
    await loadOrders();
    await loadHome();
  }
}

// --- LOAD ORDERS (with filter) ---
async function loadOrders() {
  const list = document.getElementById("orders-list");
  if (!list) return;
  list.innerHTML = "";

  const { data, error } = await supabaseClient.from("orders").select("*").order("created_at", { ascending: false }).limit(50);
  
  if (!data) {
    document.getElementById("orders-empty").style.display = "block";
    return;
  }

  const filtered = currentOrderFilter === 'ALL' 
    ? data 
    : data.filter(o => o.status === currentOrderFilter);

  if (filtered.length === 0) {
    document.getElementById("orders-empty").style.display = "block";
  } else {
    document.getElementById("orders-empty").style.display = "none";
  }

  filtered.forEach(o => {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
         <div>
           <strong>#${o.id} · ₹${o.total_amount}</strong>
           <div class="muted small">${o.customer_name}</div>
           <div class="muted small">${new Date(o.created_at).toLocaleString()}</div>
         </div>
         <div style="text-align:right;">
           <span class="status-badge status-${o.status.toLowerCase()}">${o.status}</span>
         </div>
      </div>
      <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
         <button onclick="printInvoice(${o.id})" class="btn small">Print</button>
         ${o.customer_phone ? `<button onclick="shareWhatsApp(${o.id})" class="btn small" style="background:#25D366; color:#fff;">WA</button>` : ''}
         ${o.status !== 'DELIVERED' ? `<button onclick="updateOrderStatus(${o.id}, 'DELIVERED')" class="btn small primary-soft">Mark Delivered</button>` : ''}
         ${o.status !== 'CANCELLED' ? `<button onclick="updateOrderStatus(${o.id}, 'CANCELLED')" class="btn small danger-soft">Cancel</button>` : ''}
      </div>
    `;
    list.appendChild(card);
  });
}

// --- PRINT INVOICE WITH LOGO + QR ---
window.printInvoice = async (orderId) => {
  const { data: order } = await supabaseClient.from("orders").select("*").eq("id", orderId).single();
  const { data: items } = await supabaseClient.from("order_items").select("*").eq("order_id", orderId);
  const root = document.getElementById("print-root");
  
  let rows = "";
  let subtotal = 0;
  
  if (items && items.length > 0) {
    items.forEach((it, i) => {
      const p = productCache[it.product_id];
      const line = it.quantity * it.price;
      subtotal += line;
      rows += `<tr><td>${i+1}</td><td>${p?.name || 'Item'}</td><td>${it.quantity}</td><td>${it.price}</td><td>${line}</td></tr>`;
    });
  } else {
    subtotal = (order.total_amount + (order.discount_amount||0)) - (order.delivery_fee||0);
    rows = `<tr><td colspan="5">Manual Order Items</td></tr>`;
  }

  const store = storeProfile || {};
  
  root.innerHTML = `
    <div class="invoice">
      <div class="invoice-header">
        <div class="invoice-store">
          ${store.logo_url ? `<img src="${store.logo_url}" class="invoice-store-logo" />` : ''}
          <div>
            <h1>${store.store_name || 'My Shop'}</h1>
            <p>${store.address_line || ''}</p>
            ${store.city || store.pincode ? `<p>${store.city || ''} ${store.pincode || ''}</p>` : ''}
            ${store.phone ? `<p>Phone: ${store.phone}</p>` : ''}
            ${store.upi_id ? `<p>UPI: ${store.upi_id}</p>` : ''}
          </div>
        </div>
        <div style="text-align:right;">
          <p>Inv #${order.id}</p>
          <p>${new Date(order.created_at).toLocaleDateString()}</p>
          ${store.upi_qr ? `<div style="margin-top:6px;">
              <img src="${store.upi_qr}" class="invoice-qr" />
              <div style="font-size:10px;">Scan & Pay</div>
            </div>` : ''}
        </div>
      </div>
      <p>Bill To: <strong>${order.customer_name}</strong> ${order.customer_phone || ''}</p>
      <table class="invoice-table">
        <thead>
          <tr><th>#</th><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="invoice-footer" style="text-align:right;">
        <p>Subtotal: ₹${subtotal}</p>
        ${order.delivery_fee > 0 ? `<p>Delivery: +₹${order.delivery_fee}</p>` : ''}
        ${order.discount_amount > 0 ? `<p>Discount: -₹${order.discount_amount}</p>` : ''}
        <h3>Total: ₹${order.total_amount}</h3>
        <p style="margin-top:10px; font-size:11px;">Thank you for shopping at ${store.store_name || 'our store'}!</p>
      </div>
    </div>
  `;
  window.print();
};

// --- HOME DASHBOARD + CHART + TOP PRODUCTS ---
async function loadHome() {
  const { data: orders } = await supabaseClient.from("orders").select("total_amount, created_at").order("created_at", {ascending: true});
  const { data: exp } = await supabaseClient.from("expenses").select("amount");
  const { data: prods } = await supabaseClient.from("products").select("stock");
  
  let sale = 0;
  if(orders) sale = orders.reduce((s,o) => s+o.total_amount, 0);
  
  let expense = 0;
  if(exp) expense = exp.reduce((s,e) => s+e.amount, 0);
  
  document.getElementById("total-sale").textContent = "₹" + sale;
  document.getElementById("total-orders").textContent = orders ? orders.length : 0;
  document.getElementById("low-stock").textContent = prods ? prods.filter(p=>p.stock<=5).length : 0;
  
  const profit = sale - expense;
  const pEl = document.getElementById("net-profit");
  pEl.textContent = "₹" + profit;
  pEl.style.color = profit >= 0 ? "green" : "red";

  if(orders) {
    const ctx = document.getElementById("salesChart").getContext("2d");
    const map = {};
    orders.forEach(o => {
       const d = new Date(o.created_at).toLocaleDateString('en-IN', {day:'numeric', month:'short'});
       map[d] = (map[d]||0) + o.total_amount;
    });
    const lbls = Object.keys(map).slice(-7);
    const vals = Object.values(map).slice(-7);
    
    if(window.myChart) window.myChart.destroy();
    window.myChart = new Chart(ctx, {
       type: 'line',
       data: { 
         labels: lbls, 
         datasets: [{ 
           label: 'Sale', 
           data: vals, 
           borderColor: 'blue', 
           fill: true 
         }] 
       }
    });
  }
  
  loadTopProducts();
}

async function loadTopProducts() {
  const { data } = await supabaseClient.from("order_items").select("product_id, quantity");
  if(!data) return;
  const counts = {};
  data.forEach(i => counts[i.product_id] = (counts[i.product_id]||0) + i.quantity);
  const sorted = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,5);
  
  const list = document.getElementById("top-products-list");
  list.innerHTML = "";
  sorted.forEach(id => {
     const p = productCache[id];
     if(p) {
       list.innerHTML += `<div class="card" style="padding:8px; margin-bottom:5px; display:flex; justify-content:space-between;"><span>${p.name}</span><strong>${counts[id]} Sold</strong></div>`;
     }
  });
}

// --- EXPENSE TRACKER ---
const expenseForm = document.getElementById("expense-form");
if(expenseForm) {
  expenseForm.addEventListener("submit", async(e) => {
    e.preventDefault();
    const title = document.getElementById("expense-title").value;
    const amount = document.getElementById("expense-amount").value;
    const cat = document.getElementById("expense-category").value;
    
    await supabaseClient.from("expenses").insert({title, amount, category: cat});
    showToast("Expense Saved");
    expenseForm.reset();
    loadExpenses();
    loadHome();
  });
}

async function loadExpenses() {
  const list = document.getElementById("expense-list");
  if(!list) return;
  list.innerHTML = "";
  const { data } = await supabaseClient.from("expenses").select("*").order("created_at", {ascending: false}).limit(10);
  let total = 0;
  if(data) {
     document.getElementById("expense-empty").style.display = data.length ? 'none' : 'block';
     data.forEach(e => {
       total += e.amount;
       list.innerHTML += `<div class="card" style="padding:8px; margin-bottom:5px; display:flex; justify-content:space-between;"><div><b>${e.title}</b><div class="muted small">${e.category}</div></div><b style="color:red">-₹${e.amount}</b></div>`;
     });
     document.getElementById("expense-total-display").textContent = "Recent Total: ₹" + total;
  }
}

// --- CATALOGUE & SEARCH ---
async function loadProducts() {
  const list = document.getElementById("products-list");
  list.innerHTML = "";
  const { data } = await supabaseClient.from("products").select("*").order("id", {ascending:false});
  if(data) {
    data.forEach(p => {
      productCache[p.id] = p;
      const el = document.createElement("div");
      el.className = "product-item";
      el.innerHTML = `
        <img src="${p.image_url || 'https://placehold.co/60'}" class="product-img"/>
        <div class="product-main">
           <div style="font-weight:600">${p.name}</div>
           <div class="muted small">₹${p.price} · Stock: ${p.stock}</div>
        </div>
        <button class="btn small primary-soft" onclick='addToCart(${JSON.stringify(p)})'>Add</button>
      `;
      list.appendChild(el);
    });
  }
}

document.getElementById("product-search")?.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  document.querySelectorAll(".product-item").forEach(el => {
     el.style.display = el.textContent.toLowerCase().includes(term) ? "flex" : "none";
  });
});

// --- EXCEL EXPORT ---
document.getElementById("btn-export-excel")?.addEventListener("click", async() => {
   const { data } = await supabaseClient.from("orders").select("*");
   if(!data) return;
   let csv = "ID,Date,Name,Total,Status\n";
   data.forEach(o => {
      csv += `${o.id},${o.created_at},${o.customer_name},${o.total_amount},${o.status}\n`;
   });
   const blob = new Blob([csv], {type: 'text/csv'});
   const url = window.URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url; a.download = 'orders.csv'; a.click();
});

// --- TABS ---
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// --- STORE PROFILE (SAVE + LOAD) ---
const storeForm = document.getElementById("store-form");
if (storeForm) {
  storeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      store_name: document.getElementById("store-name").value.trim(),
      phone: document.getElementById("store-phone").value.trim(),
      address_line: document.getElementById("store-address-line").value.trim(),
      city: document.getElementById("store-city").value.trim(),
      pincode: document.getElementById("store-pincode").value.trim(),
      upi_id: document.getElementById("store-upi").value.trim(),
      upi_qr: document.getElementById("store-upi-qr").value.trim(),
      logo_url: document.getElementById("store-logo").value.trim()
    };

    let errorMsg = "";
    try {
      if (storeProfile && storeProfile.id) {
        const { error } = await supabaseClient
          .from("store_profile")
          .update(payload)
          .eq("id", storeProfile.id);
        if (error) errorMsg = error.message;
      } else {
        const { data, error } = await supabaseClient
          .from("store_profile")
          .insert(payload)
          .select("*")
          .single();
        if (error) errorMsg = error.message;
        else storeProfile = data;
      }
    } catch (err) {
      errorMsg = err.message;
    }

    const statusEl = document.getElementById("store-status");
    if (errorMsg) {
      statusEl.textContent = "Failed to save: " + errorMsg;
    } else {
      statusEl.textContent = "Profile saved!";
    }
  });
}

async function loadStoreDetails() {
  const { data } = await supabaseClient.from("store_profile").select("*").limit(1);
  if (data && data[0]) {
    storeProfile = data[0];
    document.getElementById("store-name").value = storeProfile.store_name || "";
    document.getElementById("store-phone").value = storeProfile.phone || "";
    document.getElementById("store-address-line").value = storeProfile.address_line || "";
    document.getElementById("store-city").value = storeProfile.city || "";
    document.getElementById("store-pincode").value = storeProfile.pincode || "";
    document.getElementById("store-upi").value = storeProfile.upi_id || "";
    document.getElementById("store-upi-qr").value = storeProfile.upi_qr || "";
    document.getElementById("store-logo").value = storeProfile.logo_url || "";
  }
}

async function loadCustomers() { /* TODO: implement customer aggregation */ }

// --- ORDER FILTER BUTTONS ---
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentOrderFilter = btn.dataset.status;
    loadOrders();
  });
});

// Start
checkSession();
