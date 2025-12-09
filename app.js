// --- SUPABASE CONFIG ---
// Replace with your actual Supabase URL and anon key if different
const SUPABASE_URL = "https://hfdkarlboycxyosmzdge.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZGthcmxib3ljeHlvc216ZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzMzODM4NTUsImV4cCI6MjA0ODk1Nzg1NX0.N9Y287V8kMb-WAt9ZLiK-GQDJbZgHFVeaPlsaid3-Ng";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- STATE ---
let products = [];
let cart = [];
let editingProductId = null;

// --- DOM REFS ---
const productsListEl = document.getElementById("products-list");
const noProductsEl = document.getElementById("no-products");
const lowStockWarningEl = document.getElementById("low-stock-warning");

const cartItemsEl = document.getElementById("cart-items");
const cartEmptyEl = document.getElementById("cart-empty");
const cartItemsCountEl = document.getElementById("cart-items-count");
const cartTotalEl = document.getElementById("cart-total");

// popup
const popupOverlayEl = document.getElementById("popup-overlay");
const productPopupEl = document.getElementById("product-popup");
const popupTitleEl = document.getElementById("popup-title");

const nameInput = document.getElementById("p-name");
const priceInput = document.getElementById("p-price");
const categoryInput = document.getElementById("p-category");
const stockInput = document.getElementById("p-stock");
const lowStockInput = document.getElementById("p-low-stock");

const imgPicker = document.getElementById("img-picker");
const imgFile = document.getElementById("img-file");
const imgEl = document.getElementById("product-image");
const imgText = document.getElementById("img-text");

let tempImageFile = null; // file selected but not yet uploaded

// --- INITIAL LOAD ---
document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("btn-new-product")
    .addEventListener("click", openNewProductPopup);

  document
    .getElementById("cancel-btn")
    .addEventListener("click", closePopup);

  popupOverlayEl.addEventListener("click", closePopup);

  // stock +/- buttons
  document
    .getElementById("stock-plus")
    .addEventListener("click", () => changeStock(1));
  document
    .getElementById("stock-minus")
    .addEventListener("click", () => changeStock(-1));

  // image picker
  imgPicker.addEventListener("click", () => imgFile.click());
  imgFile.addEventListener("change", onImageSelected);

  // save / delete
  document
    .getElementById("save-btn")
    .addEventListener("click", saveProduct);
  document
    .getElementById("delete-btn")
    .addEventListener("click", deleteProduct);

  // catalogue search
  document
    .getElementById("catalogue-search")
    .addEventListener("input", renderProducts);

  loadProducts();
});

// --- LOAD PRODUCTS FROM SUPABASE ---
async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  products = data || [];
  renderProducts();
}

// --- RENDER PRODUCTS ---
function renderProducts() {
  const search = document
    .getElementById("catalogue-search")
    .value.toLowerCase()
    .trim();

  productsListEl.innerHTML = "";

  let hasLowStock = false;

  const filtered = products.filter((p) => {
    if (!search) return true;
    const s = (p.name || "") + " " + (p.category || "");
    return s.toLowerCase().includes(search);
  });

  if (!filtered.length) {
    noProductsEl.classList.remove("hidden");
  } else {
    noProductsEl.classList.add("hidden");
  }

  filtered.forEach((p) => {
    const card = document.createElement("div");
    card.className = "product-card";

    const lowStockLimit = Number(p.low_stock_alert || 0);
    if (lowStockLimit > 0 && Number(p.stock || 0) <= lowStockLimit) {
      card.classList.add("low-stock");
      hasLowStock = true;
    }

    if (p.image_url) {
      const img = document.createElement("img");
      img.src = p.image_url;
      img.className = "product-image";
      card.appendChild(img);
    }

    const nameEl = document.createElement("div");
    nameEl.className = "product-name";
    nameEl.textContent = p.name;
    card.appendChild(nameEl);

    const meta = document.createElement("div");
    meta.className = "product-meta";
    meta.innerHTML = `<span>₹${p.price}</span><span>Stock: ${p.stock ?? 0}</span>`;
    card.appendChild(meta);

    const actions = document.createElement("div");
    actions.className = "product-actions";

    const addBtn = document.createElement("button");
    addBtn.className = "btn-add-cart";
    addBtn.textContent = "Add";
    addBtn.addEventListener("click", () => addToCart(p));
    actions.appendChild(addBtn);

    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditProductPopup(p));
    actions.appendChild(editBtn);

    card.appendChild(actions);

    productsListEl.appendChild(card);
  });

  if (hasLowStock) {
    lowStockWarningEl.classList.remove("hidden");
  } else {
    lowStockWarningEl.classList.add("hidden");
  }
}

// --- CART LOGIC ---
function addToCart(product) {
  const found = cart.find((item) => item.id === product.id);
  if (found) {
    found.qty += 1;
  } else {
    cart.push({ id: product.id, name: product.name, price: product.price, qty: 1 });
  }
  renderCart();
}

function renderCart() {
  cartItemsEl.innerHTML = "";

  if (!cart.length) {
    cartEmptyEl.classList.remove("hidden");
  } else {
    cartEmptyEl.classList.add("hidden");
  }

  let totalItems = 0;
  let totalAmount = 0;

  cart.forEach((item) => {
    totalItems += item.qty;
    totalAmount += item.price * item.qty;

    const row = document.createElement("div");
    row.className = "cart-item";

    const left = document.createElement("div");
    left.textContent = `${item.name} x ${item.qty}`;
    row.appendChild(left);

    const right = document.createElement("div");
    right.textContent = "₹" + item.price * item.qty;
    row.appendChild(right);

    cartItemsEl.appendChild(row);
  });

  cartItemsCountEl.textContent = totalItems;
  cartTotalEl.textContent = totalAmount.toFixed(2);
}

// --- POPUP OPEN/CLOSE ---
function openNewProductPopup() {
  editingProductId = null;
  popupTitleEl.textContent = "New Product";
  document.getElementById("delete-btn").classList.add("hidden");

  nameInput.value = "";
  priceInput.value = "";
  categoryInput.value = "";
  stockInput.value = 0;
  lowStockInput.value = "";

  tempImageFile = null;
  imgEl.classList.add("hidden");
  imgText.classList.remove("hidden");

  showPopup();
}

function openEditProductPopup(product) {
  editingProductId = product.id;
  popupTitleEl.textContent = "Edit Product";
  document.getElementById("delete-btn").classList.remove("hidden");

  nameInput.value = product.name || "";
  priceInput.value = product.price || "";
  categoryInput.value = product.category || "";
  stockInput.value = product.stock || 0;
  lowStockInput.value = product.low_stock_alert || "";

  tempImageFile = null;
  if (product.image_url) {
    imgEl.src = product.image_url;
    imgEl.classList.remove("hidden");
    imgText.classList.add("hidden");
  } else {
    imgEl.classList.add("hidden");
    imgText.classList.remove("hidden");
  }

  showPopup();
}

function showPopup() {
  productPopupEl.classList.remove("hidden");
  popupOverlayEl.classList.remove("hidden");
}

function closePopup() {
  productPopupEl.classList.add("hidden");
  popupOverlayEl.classList.add("hidden");
}

// --- STOCK +/- ---
function changeStock(delta) {
  let val = parseInt(stockInput.value || "0", 10);
  if (isNaN(val)) val = 0;
  val += delta;
  if (val < 0) val = 0;
  stockInput.value = val;
}

// --- IMAGE ---
function onImageSelected(e) {
  const file = e.target.files[0];
  if (!file) return;
  tempImageFile = file;

  const url = URL.createObjectURL(file);
  imgEl.src = url;
  imgEl.classList.remove("hidden");
  imgText.classList.add("hidden");
}

// --- SAVE PRODUCT ---
async function saveProduct() {
  const name = nameInput.value.trim();
  const price = Number(priceInput.value || 0);
  const category = categoryInput.value.trim();
  const stock = Number(stockInput.value || 0);
  const lowStock = Number(lowStockInput.value || 0);

  if (!name || !price) {
    alert("Name aur Price zaroori hai");
    return;
  }

  let image_url = null;

  // If image selected, upload to storage
  if (tempImageFile) {
    const fileName = `${Date.now()}-${tempImageFile.name}`;
    const { data: storageData, error: storageError } = await supabase.storage
      .from("product-images") // make sure this bucket exists
      .upload(fileName, tempImageFile, {
        cacheControl: "3600",
        upsert: false,
      });

    if (storageError) {
      console.error(storageError);
      alert("Image upload failed");
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("product-images")
      .getPublicUrl(storageData.path);

    image_url = publicUrlData.publicUrl;
  }

  let payload = {
    name,
    price,
    category,
    stock,
    low_stock_alert: lowStock,
  };

  if (image_url) {
    payload.image_url = image_url;
  }

  let result;
  if (!editingProductId) {
    result = await supabase.from("products").insert(payload).select().single();
  } else {
    result = await supabase
      .from("products")
      .update(payload)
      .eq("id", editingProductId)
      .select()
      .single();
  }

  if (result.error) {
    console.error(result.error);
    alert("Error saving product");
    return;
  }

  closePopup();
  await loadProducts();
}

// --- DELETE PRODUCT ---
async function deleteProduct() {
  if (!editingProductId) return;
  if (!confirm("Delete this product?")) return;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", editingProductId);

  if (error) {
    console.error(error);
    alert("Error deleting product");
    return;
  }

  closePopup();
  await loadProducts();
}
