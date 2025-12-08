// Simple POS app connected to your Supabase
const SUPABASE_URL = "https://hfdkarlboycxyosmzdge.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZGthcmxib3ljeHlvc216ZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODEzNjcsImV4cCI6MjA4MDY1NzM2N30.ndZ9hv_o1zUstIrtRXWvHsUFCPj3Pwn1r3-V3Gp7Hgo";

const PRODUCT_BUCKET = "product-images";
const STORE_TABLE = "store_profile"; // new table for store details

// Supabase client (safe init so कि अगर CDN load ना हो तब भी बाकी JS चले)
let supabaseClient = null;
if (window.supabase && typeof window.supabase.createClient === "function") {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  console.warn("Supabase JS library not loaded – UI चलेगा पर data नहीं आएगा.");
}

// ----- CART + PRODUCT CACHE -----
function ensureSupabase() {
  if (!supabaseClient) {
    console.warn("Supabase client missing");
    return false;
  }
  return true;
}

let cart = [];
let productCache = {}; // id -> product row
let storeProfile = null; // loaded from Supabase

// Toast helper
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2200);
}

function getCartTotal() {
  return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
}

function getCartCount() {
  return cart.reduce((sum, item) => sum + item.qty, 0);
}

function updateCartUI() {
  const list = document.getElementById("cart-list");
  const empty = document.getElementById("cart-empty");
  const summary = document.getElementById("cart-summary");
  const amountInput = document.getElementById("delivery-amount");
  const floatBtn = document.getElementById("floating-cart");
  const floatText = document.getElementById("float-cart-text");

  if (!list || !empty || !summary) return;

  list.innerHTML = "";

  if (cart.length === 0) {
    empty.style.display = "block";
    summary.textContent = "₹0 · 0 items";
    if (floatBtn) floatBtn.classList.add("hidden");
  } else {
    empty.style.display = "none";
    cart.forEach((item) => {
      const row = document.createElement("div");
      row.className = "cart-row";

      const left = document.createElement("div");
      left.className = "cart-row-left";
      left.textContent = item.name;

      const right = document.createElement("div");
      right.className = "cart-row-right";

      const qtyControls = document.createElement("div");
      qtyControls.className = "qty-controls";

      const minusBtn = document.createElement("button");
      minusBtn.type = "button";
      minusBtn.className = "qty-btn";
      minusBtn.textContent = "−";
      minusBtn.addEventListener("click", () => changeCartQty(item.id, -1));

      const qtyText = document.createElement("span");
      qtyText.textContent = item.qty;

      const plusBtn = document.createElement("button");
      plusBtn.type = "button";
      plusBtn.className = "qty-btn";
      plusBtn.textContent = "+";
      plusBtn.addEventListener("click", () => changeCartQty(item.id, 1));

      qtyControls.appendChild(minusBtn);
      qtyControls.appendChild(qtyText);
      qtyControls.appendChild(plusBtn);

      const price = document.createElement("div");
      price.className = "cart-price";
      price.textContent = "₹" + (item.price * item.qty).toFixed(0);

      right.appendChild(qtyControls);
      right.appendChild(price);

      row.appendChild(left);
      row.appendChild(right);
      list.appendChild(row);
    });

    const total = getCartTotal();
    const count = getCartCount();
    const label =
      "₹" +
      total.toFixed(0) +
      " · " +
      count +
      " item" +
      (count > 1 ? "s" : "");
    summary.textContent = label;

    if (floatBtn && floatText) {
      floatBtn.classList.remove("hidden");
      floatText.textContent = label;
    }

    if (amountInput && (!amountInput.value || Number(amountInput.value) === 0)) {
      amountInput.value = total.toFixed(0);
    }
  }
}

function addToCart(product) {
  const existing = cart.find((i) => i.id === product.id);
  if (existing) {
    existing.qty += 1;
  } else {
    cart.push({ ...product, qty: 1 });
  }
  showToast("Added to cart");
  updateCartUI();
}

function changeCartQty(id, delta) {
  const item = cart.find((i) => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    cart = cart.filter((i) => i.id !== id);
  }
  updateCartUI();
}

function clearCart() {
  cart = [];
  updateCartUI();
}

const clearBtn = document.getElementById("cart-clear");
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    clearCart();
  });
}

// Floating cart click → open Orders tab + scroll
const floatingCartBtn = document.getElementById("floating-cart");
if (floatingCartBtn) {
  floatingCartBtn.addEventListener("click", () => {
    const ordersTabBtn = document.querySelector('.tab-btn[data-tab="orders"]');
    if (ordersTabBtn) ordersTabBtn.click();
    const cartCard = document.querySelector(".cart-card");
    if (cartCard) {
      cartCard.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// Tabs (bottom navigation)
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".tab-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const tabId = "tab-" + btn.dataset.tab;
    document
      .querySelectorAll(".tab-page")
      .forEach((p) => p.classList.remove("active"));
    const page = document.getElementById(tabId);
    if (page) page.classList.add("active");
  });
});

// Product modal
const productBackdrop = document.getElementById("product-backdrop");
const productForm = document.getElementById("product-form");
const productClose = document.getElementById("product-close");
const openProductBtn = document.getElementById("btn-open-product");
const productError = document.getElementById("product-error");
const productImageInput = document.getElementById("product-image");
const imagePreview = document.getElementById("image-preview");
const imageLabel = document.getElementById("image-label");

let selectedFile = null;

if (openProductBtn) {
  openProductBtn.addEventListener("click", () => {
    productBackdrop.classList.remove("hidden");
    productError.classList.add("hidden");
    productForm.reset();
    selectedFile = null;
    imagePreview.classList.add("hidden");
    imageLabel.textContent = "Choose photo";
  });
}

if (productClose) {
  productClose.addEventListener("click", () => {
    productBackdrop.classList.add("hidden");
  });
}

if (productBackdrop) {
  productBackdrop.addEventListener("click", (e) => {
    if (e.target === productBackdrop) {
      productBackdrop.classList.add("hidden");
    }
  });
}

const imageBox = document.querySelector(".image-box");
if (imageBox) {
  imageBox.addEventListener("click", () => {
    productImageInput.click();
  });
}

if (productImageInput) {
  productImageInput.addEventListener("change", () => {
    const file = productImageInput.files[0];
    if (!file) return;
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      imagePreview.src = e.target.result;
      imagePreview.classList.remove("hidden");
      imageLabel.textContent = "";
    };
    reader.readAsDataURL(file);
  });
}

async function uploadImageIfNeeded() {
  if (!selectedFile) return null;

  const ext = selectedFile.name.split(".").pop();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path = `public/${fileName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from(PRODUCT_BUCKET)
    .upload(path, selectedFile, { upsert: false });

  if (uploadError) {
    console.error("Upload error", uploadError);
    productError.textContent = uploadError.message || "Failed to upload image";
    productError.classList.remove("hidden");
    return null;
  }

  const { data } = supabaseClient.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

// Save product
if (productForm) {
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    productError.classList.add("hidden");

    const name = document.getElementById("product-name").value.trim();
    const price = Number(document.getElementById("product-price").value || 0);
    const mrpVal = document.getElementById("product-mrp").value;
    const mrp = mrpVal ? Number(mrpVal) : null;
    const category =
      document.getElementById("product-category").value.trim() || null;
    const stock = Number(document.getElementById("product-stock").value || 0);
    const unit = document.getElementById("product-unit").value;
    const color =
      document.getElementById("product-color").value.trim() || null;
    const size = document.getElementById("product-size").value.trim() || null;

    if (!name || isNaN(price)) {
      productError.textContent = "Name and sale price are required.";
      productError.classList.remove("hidden");
      return;
    }

    const imageUrl = await uploadImageIfNeeded();
    if (selectedFile && !imageUrl) {
      // upload error already shown
      return;
    }

    const payload = {
      name,
      price, // numeric column in products
      mrp,
      category,
      stock,
      unit,
      color,
      size,
      image_url: imageUrl,
    };

    const { error } = await supabaseClient.from("products").insert(payload);
    if (error) {
      console.error("Insert product error", error);
      productError.textContent = error.message || "Failed to save product";
      productError.classList.remove("hidden");
      return;
    }

    showToast("Product saved");
    productBackdrop.classList.add("hidden");
    await loadProducts();
    await loadHome();
  });
}

// ---- STOCK ADJUST HELPER ----
async function addStock(productId) {
  const prod = productCache[productId];
  const current = prod && typeof prod.stock === "number" ? prod.stock : Number(prod?.stock || 0);

  const input = prompt(
    `Current stock: ${current || 0}
Kitna stock add kare? (positive number)`,
    "10"
  );

  if (input === null) return;

  const delta = Number(input);
  if (isNaN(delta) || delta === 0) {
    showToast("Valid number dalo");
    return;
  }

  let newStock = (current || 0) + delta;
  if (newStock < 0) newStock = 0;

  const { error } = await supabaseClient
    .from("products")
    .update({ stock: newStock })
    .eq("id", productId);

  if (error) {
    console.error("Stock update error", error);
    showToast("Stock update failed");
    return;
  }

  showToast("Stock updated");
  if (prod) prod.stock = newStock;
  await loadProducts();
  await loadHome();
}

// Load products
async function loadProducts() {
  if (!ensureSupabase()) return;

  const list = document.getElementById("products-list");
  const empty = document.getElementById("products-empty");
  if (!list || !empty) return;

  list.innerHTML = "";
  empty.style.display = "block";
  productCache = {};

  const { data, error } = await supabaseClient
    .from("products")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    console.error("Load products error", error);
    list.innerHTML = "<p class='muted small'>Error loading products.</p>";
    return;
  }

  if (!data || data.length === 0) return;

  empty.style.display = "none";

  data.forEach((p) => {
    productCache[p.id] = p;

    const item = document.createElement("div");
    item.className = "product-item";

    const img = document.createElement("img");
    img.className = "product-img";
    img.src =
      p.image_url ||
      "https://dummyimage.com/80x80/e5e7eb/9ca3af.png&text=No+Img";
    img.alt = p.name || "Product";

    const main = document.createElement("div");
    main.className = "product-main";

    const nameEl = document.createElement("div");
    nameEl.className = "product-name";
    nameEl.textContent = p.name;

    const metaEl = document.createElement("div");
    metaEl.className = "product-meta";
    const pricePart = "₹" + p.price + (p.mrp ? " · MRP ₹" + p.mrp : "");
    const stockPart = "Stock: " + p.stock + " " + (p.unit || "pcs");
    metaEl.textContent = pricePart + " · " + stockPart;

    main.appendChild(nameEl);
    main.appendChild(metaEl);

    const actions = document.createElement("div");
    actions.className = "product-actions";

    // Add to cart button
    const addBtnCart = document.createElement("button");
    addBtnCart.className = "btn small primary-soft";
    addBtnCart.textContent = "Add";
    addBtnCart.addEventListener("click", () =>
      addToCart({ id: p.id, name: p.name, price: Number(p.price || 0) })
    );
    actions.appendChild(addBtnCart);

    // Low stock badge
    const low = (p.stock || 0) <= 5;
    if (low) {
      const lowBadge = document.createElement("span");
      lowBadge.className = "badge low";
      lowBadge.textContent = "Low";
      actions.appendChild(lowBadge);
    }

    // + Stock button
    const stockBtn = document.createElement("button");
    stockBtn.className = "btn small stock-btn";
    stockBtn.textContent = "+ Stock";
    stockBtn.addEventListener("click", () => addStock(p.id));
    actions.appendChild(stockBtn);

    // Delete button
    const delBtn = document.createElement("button");
    delBtn.className = "btn small";
    delBtn.textContent = "Delete";
    delBtn.style.background = "#fee2e2";
    delBtn.style.color = "#b91c1c";
    delBtn.addEventListener("click", () => deleteProduct(p.id));
    actions.appendChild(delBtn);

    item.appendChild(img);
    item.appendChild(main);
    item.appendChild(actions);

    list.appendChild(item);
  });
}

async function deleteProduct(id) {
  if (!ensureSupabase()) return;

  if (!confirm("Delete this product?")) return;
  const { error } = await supabaseClient.from("products").delete().eq("id", id);
  if (error) {
    console.error("Delete error", error);
    showToast("Failed to delete");
    return;
  }
  showToast("Product deleted");
  await loadProducts();
  await loadHome();
}

// ---- ORDER STATUS HELPERS ----
function prettyStatus(status) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "PACKED":
      return "Packed";
    case "OUT_FOR_DELIVERY":
      return "Out for delivery";
    case "DELIVERED":
      return "Delivered";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status || "Pending";
  }
}

function nextStatus(current) {
  switch (current) {
    case "PENDING":
      return "ACCEPTED";
    case "ACCEPTED":
      return "PACKED";
    case "PACKED":
      return "OUT_FOR_DELIVERY";
    case "OUT_FOR_DELIVERY":
      return "DELIVERED";
    default:
      return current;
  }
}

function primaryActionLabel(current) {
  switch (current) {
    case "PENDING":
      return "Accept";
    case "ACCEPTED":
      return "Mark packed";
    case "PACKED":
      return "Out for delivery";
    case "OUT_FOR_DELIVERY":
      return "Mark delivered";
    default:
      return "";
  }
}

async function updateOrderStatus(orderId, newStatus) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId);

  if (error) {
    console.error("Status update error", error);
    showToast("Failed to update status");
    return;
  }
  showToast("Status updated");
  await loadOrders();
  await loadHome();
  await loadCustomers();
}

// ----- PRINT INVOICE -----
async function printInvoice(order) {
  const root = document.getElementById("print-root");
  if (!root) return;

  // Fetch order_items for this order
  let items = [];
  const { data, error } = await supabaseClient
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (!error && data) {
    items = data;
  }

  const created =
    order.created_at ? new Date(order.created_at).toLocaleString() : "";

  let rowsHtml = "";
  let grandTotal = 0;

  if (items.length > 0) {
    items.forEach((it, idx) => {
      const prod = productCache[it.product_id];
      const name = prod?.name || `Item ${it.product_id}`;
      const qty = Number(it.quantity || 0);
      const price = Number(it.price || 0);
      const lineTotal = qty * price;
      grandTotal += lineTotal;
      rowsHtml += `<tr>
        <td>${idx + 1}</td>
        <td>${name}</td>
        <td>${qty}</td>
        <td>₹${price.toFixed(2)}</td>
        <td>₹${lineTotal.toFixed(2)}</td>
      </tr>`;
    });
  } else {
    // fallback if no items stored
    const total = Number(order.total_amount || 0);
    grandTotal = total;
    rowsHtml = `<tr>
      <td>1</td>
      <td>Order total</td>
      <td>-</td>
      <td>-</td>
      <td>₹${total.toFixed(2)}</td>
    </tr>`;
  }

  const amountDisplay =
    grandTotal > 0 ? grandTotal.toFixed(2) : Number(order.total_amount || 0).toFixed(2);

  // store details for header
  const storeName = (storeProfile && storeProfile.store_name) || "My Quick Mart";
  const storeLine =
    storeProfile && storeProfile.address_line
      ? `${storeProfile.address_line}${
          storeProfile.city ? ", " + storeProfile.city : ""
        }${storeProfile.pincode ? " - " + storeProfile.pincode : ""}`
      : "Simple POS + Delivery";
  const storePhone =
    storeProfile && storeProfile.phone ? `Phone: ${storeProfile.phone}` : "";
  const storeGstin =
    storeProfile && storeProfile.gstin ? `GSTIN: ${storeProfile.gstin}` : "";
  const logoUrl = storeProfile && storeProfile.logo_url ? storeProfile.logo_url : "";
  const upiId = storeProfile && storeProfile.upi_id ? storeProfile.upi_id : "";
  const upiQr = storeProfile && storeProfile.upi_qr_url ? storeProfile.upi_qr_url : "";

  root.innerHTML = `
    <div class="invoice">
      <div class="invoice-header">
        <div class="invoice-brand">
          ${
            logoUrl
              ? `<div class="invoice-logo-wrap"><img src="${logoUrl}" class="invoice-logo" alt="Logo" /></div>`
              : ""
          }
          <div>
            <h1>${storeName}</h1>
            <p>${storeLine}</p>
            ${storePhone ? `<p>${storePhone}</p>` : ""}
            ${storeGstin ? `<p>${storeGstin}</p>` : ""}
          </div>
        </div>
        <div class="invoice-meta">
          <p><strong>Invoice #</strong> ${order.id}</p>
          <p><strong>Date</strong> ${created}</p>
          ${
            order.payment_method
              ? `<p><strong>Payment</strong> ${(order.payment_method || "cash").toUpperCase()}</p>`
              : ""
          }
        </div>
      </div>

      <div class="invoice-section">
        <h2>Bill to</h2>
        <p><strong>${order.customer_name || "Customer"}</strong></p>
        ${order.customer_phone ? `<p>Phone: ${order.customer_phone}</p>` : ""}
        ${order.customer_address ? `<p>Address: ${order.customer_address}</p>` : ""}
      </div>

      <div class="invoice-section">
        <table class="invoice-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>Qty</th>
              <th>Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>

      <div class="invoice-footer">
        <div class="invoice-payment">
          ${
            upiQr
              ? `<div class="invoice-qr-block">
                   <img src="${upiQr}" alt="UPI QR" class="invoice-qr" />
                   ${
                     upiId
                       ? `<p class="invoice-qr-text">Pay via UPI: <strong>${upiId}</strong></p>`
                       : ""
                   }
                 </div>`
              : upiId
              ? `<p class="invoice-qr-text">Pay via UPI: <strong>${upiId}</strong></p>`
              : "<p>Thank you for shopping with us!</p>"
          }
        </div>
        <div class="invoice-total">
          <p>Grand total</p>
          <h2>₹${amountDisplay}</h2>
        </div>
      </div>

      <p class="invoice-note">This is a computer generated invoice.</p>
    </div>
  `;

  window.print();
}

// Orders list with status + buttons + print
async function loadOrders() {
  if (!ensureSupabase()) return;

  const list = document.getElementById("orders-list");
  const empty = document.getElementById("orders-empty");
  if (!list || !empty) return;

  list.innerHTML = "";
  empty.style.display = "block";

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Load orders error", error);
    list.innerHTML = "<p class='muted small'>Error loading orders.</p>";
    return;
  }

  if (!data || data.length === 0) return;

  empty.style.display = "none";

  data.forEach((o) => {
    const card = document.createElement("div");
    card.className = "card order-card";

    const header = document.createElement("div");
    header.className = "order-header";

    const title = document.createElement("div");
    title.className = "order-title";
    const amount = Number(o.total_amount || 0);
    const pay = o.payment_method || "COD";
    title.textContent =
      "Order #" + o.id + " · ₹" + amount.toFixed(0) + " · " + pay.toUpperCase();

    const statusText = document.createElement("span");
    const status = o.status || "PENDING";
    statusText.className =
      "status-badge status-" + status.toLowerCase();
    statusText.textContent = prettyStatus(status);

    header.appendChild(title);
    header.appendChild(statusText);

    const meta = document.createElement("div");
    meta.className = "product-meta";
    const dt = o.created_at ? new Date(o.created_at).toLocaleString() : "";
    meta.textContent =
      (o.customer_name || "Customer") +
      (o.customer_phone ? " · " + o.customer_phone : "") +
      (dt ? " · " + dt : "");

    card.appendChild(header);
    card.appendChild(meta);

    if (o.customer_address) {
      const addr = document.createElement("div");
      addr.className = "order-address";
      addr.textContent = o.customer_address;
      card.appendChild(addr);
    }

    const actionsRow = document.createElement("div");
    actionsRow.className = "order-actions-row";

    if (status !== "DELIVERED" && status !== "CANCELLED") {
      const primaryBtn = document.createElement("button");
      primaryBtn.className = "btn small primary-soft";
      primaryBtn.textContent = primaryActionLabel(status);
      primaryBtn.addEventListener("click", () =>
        updateOrderStatus(o.id, nextStatus(status))
      );
      actionsRow.appendChild(primaryBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn small danger-soft";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () =>
        updateOrderStatus(o.id, "CANCELLED")
      );
      actionsRow.appendChild(cancelBtn);
    } else {
      const done = document.createElement("span");
      done.className = "product-meta";
      done.textContent =
        status === "DELIVERED" ? "Completed · Delivered" : "Order cancelled";
      actionsRow.appendChild(done);
    }

    // Print button
    const printBtn = document.createElement("button");
    printBtn.className = "btn small";
    printBtn.textContent = "Print";
    printBtn.addEventListener("click", () => printInvoice(o));
    actionsRow.appendChild(printBtn);

    // Share button - opens WhatsApp with invoice text
    const shareBtn = document.createElement("button");
    shareBtn.className = "btn small primary-soft";
    shareBtn.textContent = "Share";
    shareBtn.addEventListener("click", () => shareInvoice(o));
    actionsRow.appendChild(shareBtn);

    card.appendChild(actionsRow);
    list.appendChild(card);
  });
}

// Home stats
async function loadHome() {
  if (!ensureSupabase()) return;

  const saleEl = document.getElementById("total-sale");
  const ordersEl = document.getElementById("total-orders");
  const lowEl = document.getElementById("low-stock");
  if (!saleEl || !ordersEl || !lowEl) return;

  let totalSale = 0;
  let totalOrders = 0;
  let lowStockCount = 0;

  const { data: orders, error: errOrders } = await supabaseClient
    .from("orders")
    .select("total_amount");

  if (!errOrders && orders) {
    totalOrders = orders.length;
    totalSale = orders.reduce(
      (sum, o) => sum + Number(o.total_amount || 0),
      0
    );
  }

  const { data: products, error: errProducts } = await supabaseClient
    .from("products")
    .select("stock");

  if (!errProducts && products) {
    lowStockCount = products.filter((p) => (p.stock || 0) <= 5).length;
  }

  saleEl.textContent = "₹" + totalSale.toFixed(0);
  ordersEl.textContent = String(totalOrders);
  lowEl.textContent = String(lowStockCount);
}

// ----- ORDER SAVE + AUTO STOCK REDUCE -----
async function saveOrderWithCart(payloadOrder) {
  if (!ensureSupabase()) return;

  // 1) Insert into orders and get id back
  const { data: inserted, error } = await supabaseClient
    .from("orders")
    .insert(payloadOrder)
    .select("id")
    .limit(1);

  if (error) {
    console.error("Insert delivery order error", error);
    showToast("Failed to create delivery order");
    return false;
  }

  const orderId = inserted && inserted[0] && inserted[0].id;
  if (!orderId) {
    showToast("Order saved but id missing");
    return false;
  }

  // 2) If cart has items → insert into order_items table
  if (cart.length > 0) {
    const itemsPayload = cart.map((item) => ({
      order_id: orderId,
      product_id: item.id,
      quantity: item.qty,
      price: item.price,
    }));

    const { error: itemsError } = await supabaseClient
      .from("order_items")
      .insert(itemsPayload);

    if (itemsError) {
      console.error("Insert order_items error", itemsError);
      // continue, but show warning
      showToast("Order saved, but items failed");
    }
  }

  // 3) Auto-reduce stock for each product (client-side calculation)
  for (const item of cart) {
    const prod = productCache[item.id];
    const currentStock = prod && typeof prod.stock === "number" ? prod.stock : 0;
    let newStock = currentStock - item.qty;
    if (newStock < 0) newStock = 0;

    const { error: stockErr } = await supabaseClient
      .from("products")
      .update({ stock: newStock })
      .eq("id", item.id);

    if (stockErr) {
      console.error("Stock update error for product", item.id, stockErr);
    } else if (prod) {
      prod.stock = newStock;
    }
  }

  return true;
}

// Delivery-style order form (customer address + payment + cart total)
const deliveryForm = document.getElementById("delivery-form");
if (deliveryForm) {
  deliveryForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("delivery-name").value.trim();
    const phone = document.getElementById("delivery-phone").value.trim();
    const address = document.getElementById("delivery-address").value.trim();
    const payment = document.getElementById("delivery-payment").value;
    const amountRaw = document.getElementById("delivery-amount").value;

    if (!address) {
      showToast("Please enter delivery address");
      document.getElementById("delivery-address").focus();
      return;
    }

    let total_amount = amountRaw ? Number(amountRaw) : 0;
    const cartTotal = getCartTotal();

    if (total_amount === 0 && cartTotal > 0) {
      total_amount = cartTotal;
    }

    const customer_name = name || "Delivery customer";

    const ok = await saveOrderWithCart({
      customer_name,
      customer_phone: phone || null,
      customer_address: address,
      payment_method: payment || "cash",
      total_amount,
      status: "PENDING",
    });

    if (!ok) return;

    showToast("Delivery order created");

    // Clear form + cart
    document.getElementById("delivery-name").value = "";
    document.getElementById("delivery-phone").value = "";
    document.getElementById("delivery-address").value = "";
    document.getElementById("delivery-amount").value = "";
    document.getElementById("delivery-payment").value = "cash";
    clearCart();

    await Promise.all([loadOrders(), loadProducts(), loadHome(), loadCustomers()]);
  });
}

// Quick test order button (no items / no stock change)
const quickBtn = document.getElementById("btn-quick-order");
if (quickBtn) {
  quickBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient
      .from("orders")
      .insert({ customer_name: "Test", total_amount: 0, payment_method: "COD", status: "PENDING" });
    if (error) {
      console.error("Insert order error", error);
      showToast("Failed to create order");
      return;
    }
    showToast("Order created");
    await loadOrders();
    await loadHome();
    await loadCustomers();
  });
}

// ---------- STORE DETAILS (Manage tab) ----------
const storeForm = document.getElementById("store-form");
const storeStatus = document.getElementById("store-status");

async function loadStoreDetails() {
  if (!ensureSupabase()) return;

  if (!storeForm) return;

  if (storeStatus) {
    storeStatus.textContent = "Loading store profile...";
  }

  const { data, error } = await supabaseClient
    .from(STORE_TABLE)
    .select("*")
    .order("id", { ascending: true })
    .limit(1);

  if (error) {
    console.error("Load store error", error);
    if (storeStatus) {
      storeStatus.textContent = "Error loading store profile.";
    }
    return;
  }

  if (!data || data.length === 0) {
    storeProfile = null;
    if (storeStatus) {
      storeStatus.textContent = "Not saved yet.";
    }
    return;
  }

  const row = data[0];
  storeProfile = row;

  function setVal(id, key) {
    const el = document.getElementById(id);
    if (el && row[key] != null) {
      el.value = row[key];
    }
  }

  setVal("store-name", "store_name");
  setVal("store-phone", "phone");
  setVal("store-email", "email");
  setVal("store-category", "business_category");
  setVal("store-gstin", "gstin");
  setVal("store-fssai", "fssai");
  setVal("store-upi", "upi_id");
  setVal("store-address-line", "address_line");
  setVal("store-city", "city");
  setVal("store-pincode", "pincode");
  setVal("store-bank-name", "bank_ac_name");
  setVal("store-bank-account", "bank_ac_number");
  setVal("store-bank-ifsc", "bank_ifsc");
  setVal("store-upi-qr", "upi_qr_url");
  setVal("store-logo", "logo_url");

  if (storeStatus) {
    storeStatus.textContent = "Loaded · last saved profile.";
  }
}

if (storeForm) {
  storeForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      store_name: document.getElementById("store-name").value.trim() || null,
      phone: document.getElementById("store-phone").value.trim() || null,
      email: document.getElementById("store-email").value.trim() || null,
      business_category: document.getElementById("store-category").value.trim() || null,
      gstin: document.getElementById("store-gstin").value.trim() || null,
      fssai: document.getElementById("store-fssai").value.trim() || null,
      upi_id: document.getElementById("store-upi").value.trim() || null,
      address_line: document.getElementById("store-address-line").value.trim() || null,
      city: document.getElementById("store-city").value.trim() || null,
      pincode: document.getElementById("store-pincode").value.trim() || null,
      bank_ac_name: document.getElementById("store-bank-name").value.trim() || null,
      bank_ac_number: document.getElementById("store-bank-account").value.trim() || null,
      bank_ifsc: document.getElementById("store-bank-ifsc").value.trim() || null,
      upi_qr_url: document.getElementById("store-upi-qr").value.trim() || null,
      logo_url: document.getElementById("store-logo").value.trim() || null,
    };

    if (storeStatus) {
      storeStatus.textContent = "Saving...";
    }

    let error = null;

    if (storeProfile && storeProfile.id) {
      const res = await supabaseClient
        .from(STORE_TABLE)
        .update(payload)
        .eq("id", storeProfile.id);
      error = res.error;
    } else {
      const res = await supabaseClient
        .from(STORE_TABLE)
        .insert(payload)
        .select("id")
        .limit(1);
      error = res.error;
      if (!error && res.data && res.data[0]) {
        storeProfile = { id: res.data[0].id, ...payload };
      }
    }

    if (error) {
      console.error("Save store error", error);
      if (storeStatus) {
        storeStatus.textContent = "Error saving store profile.";
      }
      showToast("Failed to save store profile");
      return;
    }

    showToast("Store profile saved");
    await loadStoreDetails();
  });
}

// manage shortcut button scroll
const btnScrollStore = document.getElementById("btn-scroll-store");
if (btnScrollStore) {
  btnScrollStore.addEventListener("click", () => {
    const card = document.getElementById("store-card");
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

// ---------- CUSTOMERS TAB (from orders) ----------
async function loadCustomers() {
  if (!ensureSupabase()) return;

  const list = document.getElementById("customers-list");
  const empty = document.getElementById("customers-empty");
  if (!list || !empty) return;

  list.innerHTML = "";
  empty.style.display = "block";

  const { data, error } = await supabaseClient
    .from("orders")
    .select("id, customer_name, customer_phone, customer_address, total_amount, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Load customers from orders error", error);
    list.innerHTML = "<p class='muted small'>Error loading customers.</p>";
    return;
  }

  if (!data || data.length === 0) {
    return;
  }

  const map = new Map();

  data.forEach((o) => {
    const name = o.customer_name || "Customer";
    const phone = o.customer_phone || "";
    const key = `${name}|${phone}`;

    let row = map.get(key);
    const amt = Number(o.total_amount || 0);
    const created = o.created_at ? new Date(o.created_at) : null;

    if (!row) {
      row = {
        name,
        phone,
        address: o.customer_address || "",
        totalAmount: 0,
        orderCount: 0,
        lastOrder: created,
      };
      map.set(key, row);
    }

    row.totalAmount += amt;
    row.orderCount += 1;
    if (created) {
      if (!row.lastOrder || created > row.lastOrder) {
        row.lastOrder = created;
      }
    }
    if (!row.address && o.customer_address) {
      row.address = o.customer_address;
    }
  });

  const customers = Array.from(map.values()).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );

  if (customers.length === 0) return;

  empty.style.display = "none";

  customers.forEach((c) => {
    const card = document.createElement("div");
    card.className = "card customer-card";

    const header = document.createElement("div");
    header.className = "customer-header";

    const nameEl = document.createElement("div");
    nameEl.className = "customer-name";
    nameEl.textContent = c.name;

    const meta = document.createElement("div");
    meta.className = "customer-meta";
    const phonePart = c.phone ? c.phone : "No phone";
    const countPart = `${c.orderCount} order${c.orderCount > 1 ? "s" : ""}`;
    const amountPart = "₹" + c.totalAmount.toFixed(0);
    meta.textContent = `${phonePart} · ${countPart} · ${amountPart}`;

    header.appendChild(nameEl);
    header.appendChild(meta);
    card.appendChild(header);

    if (c.address) {
      const addr = document.createElement("div");
      addr.className = "customer-address";
      addr.textContent = c.address;
      card.appendChild(addr);
    }

    if (c.lastOrder) {
      const last = document.createElement("div");
      last.className = "customer-last";
      last.textContent =
        "Last order: " + c.lastOrder.toLocaleString();
      card.appendChild(last);
    }

    list.appendChild(card);
  });
}

// Initial load
(async function init() {
  await Promise.all([
    loadProducts(),
    loadOrders(),
    loadHome(),
    loadStoreDetails(),
    loadCustomers(),
  ]);
  updateCartUI();
})();

async function shareInvoice(order) {
  try {
    if (!ensureSupabase()) return;

    // Fetch order items
    let items = [];
    const { data, error } = await supabaseClient
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);

    if (!error && data) {
      items = data;
    }

    const created = order.created_at
      ? new Date(order.created_at).toLocaleString()
      : "";

    const storeName =
      (storeProfile && storeProfile.store_name) || "My Quick Mart";
    const storeLine =
      storeProfile && storeProfile.address_line
        ? `${storeProfile.address_line}${
            storeProfile.city ? ", " + storeProfile.city : ""
          }${storeProfile.pincode ? " - " + storeProfile.pincode : ""}`
        : "";
    const upiId =
      (storeProfile && storeProfile.upi_id) || "7042504514@nyes";

    let lines = [];

    lines.push(storeName);
    if (storeLine) lines.push(storeLine);
    lines.push("");
    lines.push(`Invoice #${order.id}${created ? " · " + created : ""}`);
    lines.push(
      `Customer: ${order.customer_name || "Customer"}${
        order.customer_phone ? " · " + order.customer_phone : ""
      }`
    );
    if (order.customer_address) {
      lines.push(`Address: ${order.customer_address}`);
    }
    lines.push("");

    if (items.length > 0) {
      lines.push("Items:");
      items.forEach((it, idx) => {
        const qty = it.quantity || 1;
        const price = Number(it.price || 0);
        const total = price * qty;
        const name = it.product_name || it.name || "Item";
        lines.push(
          `${idx + 1}. ${name} x${qty} – ₹${total.toFixed(2)}`
        );
      });
      lines.push("");
    }

    const total = Number(order.total_amount || 0);
    lines.push(`Total: ₹${total.toFixed(2)}`);

    if (upiId) {
      lines.push("");
      lines.push(`Pay via UPI: ${upiId}`);
      lines.push(
        `UPI link: upi://pay?pa=${encodeURIComponent(
          upiId
        )}&pn=${encodeURIComponent(storeName)}`
      );
    }

    const text = lines.join("\n");
    const encoded = encodeURIComponent(text);
    const waUrl = `https://wa.me/?text=${encoded}`;

    window.open(waUrl, "_blank");
  } catch (err) {
    console.error("Share invoice error", err);
    alert("Unable to share invoice.");
  }
}

