
const db = supabase.createClient(
  "https://hfdkarlboycxyosmzdge.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmZGthcmxib3ljeHlvc216ZGdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUwODEzNjcsImV4cCI6MjA4MDY1NzM2N30.ndZ9hv_o1zUstIrtRXWvHsUFCPj3Pwn1r3-V3Gp7Hgo"
);

let products = [];
let categories = [];
let editingId = null;
let uploadedImageUrl = null;

// THEME
document.getElementById("theme-toggle").onclick = () => {
  document.body.classList.toggle("dark");
  document.body.classList.toggle("light");
};

// LOAD INITIAL
loadCategories();
loadProducts();

// LOAD PRODUCTS
async function loadProducts(){
  const { data } = await db.from("products").select("*").order("id",{ascending:false});
  products = data || [];
  renderProductList();
  fillCategoryFilter();
}

// RENDER PRODUCTS
function renderProductList(){
  const list = document.getElementById("product-list");
  const search = document.getElementById("search").value.toLowerCase();
  const filter = document.getElementById("category-filter").value;

  list.innerHTML="";
  products
    .filter(p => p.name.toLowerCase().includes(search))
    .filter(p => filter? p.category===filter:true)
    .sort((a,b)=> a.stock - b.stock) // low stock first
    .forEach(p=>{
      const low = p.low_stock_threshold && p.stock <= p.low_stock_threshold;
      const card = document.createElement("div");
      card.className="product-card"+(low?" low":"");
      card.innerHTML=`
        <img src="${p.image_url || 'https://placehold.co/60'}" width="60" height="60" style="border-radius:10px; object-fit:cover;">
        <div style="flex:1">
          <b>${p.name}</b>
          <p>₹${p.price} · ${p.category}</p>
          <p>Stock: ${p.stock} ${low ? "⚠️":""}</p>
        </div>
        <div>
          <button onclick="changeStock(${p.id},-1)">-</button>
          <button onclick="changeStock(${p.id},+1)">+</button>
          <button onclick="openProduct(${p.id})">✏️</button>
          <button onclick="deleteProduct(${p.id})">🗑</button>
        </div>
      `;
      list.appendChild(card);
    });
}

// CATEGORY FILTER
function fillCategoryFilter(){
  const f = document.getElementById("category-filter");
  f.innerHTML=`<option value="">All</option>`;
  categories.forEach(c=> f.innerHTML+=`<option value="${c}">${c}</option>`);
}

// LOAD CATEGORIES
async function loadCategories(){
  const { data } = await db.from("categories").select("*");
  categories = data ? data.map(x=>x.name) : [];
}

// SAVE CATEGORY
async function saveCategory(name){
  await db.from("categories").insert({name});
  await loadCategories();
  fillCategoryFilter();
  renderCategoryModal();
}

// DELETE CATEGORY
async function removeCategory(name){
  await db.from("categories").delete().eq("name",name);
  await loadCategories();
  fillCategoryFilter();
  renderCategoryModal();
}

// RENDER CATEGORY MODAL
function renderCategoryModal(){
  const list = document.getElementById("category-list");
  list.innerHTML="";
  categories.forEach(c=>{
    const row = document.createElement("div");
    row.innerHTML = `${c} <button onclick='removeCategory("${c}")'>x</button>`;
    list.appendChild(row);
  });
}

// OPEN CATEGORY MODAL
document.getElementById("manage-categories").onclick = ()=>{
  renderCategoryModal();
  document.getElementById("category-modal").classList.remove("hidden");
};
document.getElementById("close-category-modal").onclick = ()=>{
  document.getElementById("category-modal").classList.add("hidden");
};
document.getElementById("add-category-btn").onclick = ()=>{
  const val = document.getElementById("new-category").value.trim();
  if(val) saveCategory(val);
  document.getElementById("new-category").value="";
};

// CHANGE STOCK
async function changeStock(id,delta){
  const p = products.find(x=>x.id===id);
  if(!p)return;
  let newStock = p.stock + delta;
  if(newStock<0)return;

  await db.from("products").update({stock:newStock}).eq("id",id);

  if(p.low_stock_threshold && p.stock > p.low_stock_threshold && newStock <= p.low_stock_threshold){
    alert(`LOW STOCK: ${p.name} now ${newStock}`);
  }

  loadProducts();
}

// DELETE PRODUCT
async function deleteProduct(id){
  if(!confirm("Delete product?"))return;
  await db.from("products").delete().eq("id",id);
  loadProducts();
}

// OPEN ADD/EDIT PRODUCT
document.getElementById("add-product").onclick = ()=>openProduct(null);

function openProduct(id){
  editingId=id;
  document.getElementById("product-modal").classList.remove("hidden");
  document.getElementById("delete-product").classList.toggle("hidden",!id);

  const catDropdown = document.getElementById("prod-category");
  catDropdown.innerHTML="";
  categories.forEach(c=> catDropdown.innerHTML+=`<option value="${c}">${c}</option>`);

  if(id){
    const p = products.find(x=>x.id===id);
    uploadedImageUrl=p.image_url;
    document.getElementById("prod-name").value=p.name;
    document.getElementById("prod-price").value=p.price;
    document.getElementById("prod-category").value=p.category;
    document.getElementById("prod-stock").value=p.stock;
    document.getElementById("prod-low").value=p.low_stock_threshold;
    document.getElementById("image-preview").style.backgroundImage=`url(${p.image_url})`;
  }else{
    uploadedImageUrl=null;
    document.querySelectorAll("#product-modal input").forEach(i=>i.value="");
    document.getElementById("image-preview").style.backgroundImage="none";
  }
}

// SAVE PRODUCT
document.getElementById("save-product").onclick = async()=>{
  const payload = {
    name: document.getElementById("prod-name").value,
    price: Number(document.getElementById("prod-price").value),
    category: document.getElementById("prod-category").value,
    stock: Number(document.getElementById("prod-stock").value),
    low_stock_threshold: Number(document.getElementById("prod-low").value),
    image_url: uploadedImageUrl
  };

  if(editingId)
    await db.from("products").update(payload).eq("id",editingId);
  else
    await db.from("products").insert(payload);

  closeModal();
  loadProducts();
};

// IMAGE UPLOAD
document.getElementById("image-preview").onclick = ()=>document.getElementById("product-image").click();

document.getElementById("product-image").onchange = async(e)=>{
  const file = e.target.files[0]; if(!file)return;
  const path = "images/"+Date.now()+"-"+file.name;
  await db.storage.from("product-images").upload(path,file);
  const { data } = db.storage.from("product-images").getPublicUrl(path);
  uploadedImageUrl = data.publicUrl;
  document.getElementById("image-preview").style.backgroundImage=`url(${uploadedImageUrl})`;
};

// CLOSE MODAL
function closeModal(){
  document.getElementById("product-modal").classList.add("hidden");
}
document.getElementById("close-modal").onclick = closeModal;

// SEARCH + FILTER
document.getElementById("search").oninput = renderProductList;
document.getElementById("category-filter").onchange = renderProductList;
