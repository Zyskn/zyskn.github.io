const SUPABASE_URL = 'https://iifrudupaxcahnopxqcb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpZnJ1ZHVwYXhjYWhub3B4cWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NDUyNjgsImV4cCI6MjA5NzAyMTI2OH0.2tTm-ko4n15HctHX40w4_OjBlajaxYZXaqhNamGCD8o';
let sb; try { sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON); } catch(e) { console.error('Supabase init failed', e); }

/* STORE LOCK */
async function checkStoreLock() {
  try {
    const { data, error } = await sb.from('settings').select('value').eq('key', 'store_locked').maybeSingle();
    if (error) throw error;
    if (data?.value === 'true') {
      lockScroll();
      document.getElementById('zyskn-lock-screen').style.display = 'flex';
      const interval = setInterval(async () => {
        try {
          const { data: d2 } = await sb.from('settings').select('value').eq('key', 'store_locked').maybeSingle();
          if (d2?.value !== 'true') { clearInterval(interval); unlockScroll(); document.getElementById('zyskn-lock-screen').style.display='none'; window.location.reload(); }
        } catch (e) {}
      }, 10000);
    }
  } catch (e) { console.warn('ZYSKN lock check failed:', e); }
}

function lockScroll() {
  const scrollYNow = window.scrollY;
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollYNow}px`;
  document.body.style.left = '0'; document.body.style.right = '0'; document.body.style.width = '100%';
  document.addEventListener('touchmove', preventScrollTouch, { passive: false });
}

function unlockScroll() {
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  document.removeEventListener('touchmove', preventScrollTouch);
}
function preventScrollTouch(e) {
  const lockScreen = document.getElementById('zyskn-lock-screen');
  if (lockScreen && lockScreen.contains(e.target)) return;
  e.preventDefault();
}

/* STATE */
let allProducts = [];
let filteredProducts = [];
let currentProduct = null;
let currentPhotos = [], currentPhotoIndex = 0, zoomed = false;
let selectedSize = null;
let cart; try { cart = JSON.parse(localStorage.getItem('zysk_cart') || '[]'); } catch { cart = []; }
let localReservations; try { localReservations = JSON.parse(localStorage.getItem('zysk_res') || '{}'); } catch { localReservations = {}; }
let scrollY = 0;
let activeFilter = { type: 'all', value: 'all' };
let currentUser = null;

function getProductImages(p) {
  if (p.images && Array.isArray(p.images) && p.images.length) return p.images;
  const imgs = [];
  if (p.img)  imgs.push(p.img);
  if (p.img2) imgs.push(p.img2);
  return imgs;
}

/* ============================================================
   SCHEMA MARKUP DINÁMICO DE PRODUCTOS
   Se inyecta en el <head> al cargar los productos desde Supabase
   Permite rich snippets con precio y disponibilidad en Google
============================================================ */
function injectProductSchema(products) {
  // ItemList schema para listado general
  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Ropa Vintage y Streetwear ZYSKN Córdoba",
    "description": "Catálogo de prendas vintage curadas: remeras americanas, hoodies oversize, cargos, camperas y más. Únicas unidades sin restock.",
    "url": "https://zyskn.github.io",
    "numberOfItems": products.length,
    "itemListElement": products.slice(0, 20).map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Product",
        "name": p.name,
        "description": p.description ? p.description.replace(/<[^>]*>/g, '').substring(0, 160) : `${p.name} - Prenda vintage única en ZYSKN Córdoba`,
        "image": getProductImages(p)[0] || '',
        "brand": { "@type": "Brand", "name": "ZYSKN" },
        "offers": {
          "@type": "Offer",
          "priceCurrency": "ARS",
          "price": String(p.price),
          "availability": p.is_sold
            ? "https://schema.org/OutOfStock"
            : "https://schema.org/InStock",
          "seller": {
            "@type": "Organization",
            "name": "ZYSKN"
          },
          "url": "https://zyskn.github.io"
        },
        "size": (p.sizes || []).join(', ') || p.talle || '',
        "category": (p.categories && p.categories.length ? p.categories : [p.category || '']).join(', ')
      }
    }))
  };

  // Reemplazar el schema-itemlist existente o crear uno nuevo
  let el = document.getElementById('schema-itemlist');
  if (!el) {
    el = document.createElement('script');
    el.type = 'application/ld+json';
    el.id = 'schema-itemlist';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(itemListSchema);
}

/* FAVORITOS */
let favorites; try { favorites = JSON.parse(localStorage.getItem('zysk_favs') || '[]'); } catch { favorites = []; }

function toggleFavorite() {
  if (!currentProduct) return;
  const id = currentProduct.id;
  const btn = document.getElementById('favBtn');
  const idx = favorites.indexOf(id);
  if (idx === -1) { favorites.push(id); btn.classList.add('active'); showNotification('♡ GUARDADO EN FAVORITOS'); }
  else { favorites.splice(idx, 1); btn.classList.remove('active'); showNotification('ELIMINADO DE FAVORITOS'); }
  localStorage.setItem('zysk_favs', JSON.stringify(favorites));
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
}

function updateFavBtn() {
  const btn = document.getElementById('favBtn');
  if (!btn || !currentProduct) return;
  btn.classList.toggle('active', favorites.includes(currentProduct.id));
}

/* AUTH */
async function initAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) { currentUser = session.user; updateAuthUI(currentUser); }
  sb.auth.onAuthStateChange((_event, session) => { currentUser = session?.user || null; updateAuthUI(currentUser); });
}

function updateAuthUI(user) {
  const btnAuth = document.getElementById('userAuth');
  const dropdown = document.getElementById('userDropdown');
  const dropdownName = document.getElementById('userDropdownName');
  if (user) {
    const name = user.user_metadata?.name || user.email.split('@')[0];
    btnAuth.innerHTML = `<span style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--black);white-space:nowrap;">${name.split(' ')[0].toUpperCase()}</span>`;
    btnAuth.onclick = () => { dropdown.classList.toggle('open'); };
    dropdownName.textContent = name; dropdown.style.display = 'block';
    const orderEmail = document.getElementById('orderEmail');
    if (orderEmail && !orderEmail.value) orderEmail.value = user.email;
  } else {
    btnAuth.innerHTML = `<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:currentColor;"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>`;
    btnAuth.onclick = openAuthModal; dropdown.style.display = 'none'; dropdown.classList.remove('open');
  }
}

function openAuthModal(tab) { document.getElementById('authModal').classList.add('active'); switchTab(tab || 'login'); clearAuthErrors(); }
function closeAuthModal() { document.getElementById('authModal').classList.remove('active'); clearAuthErrors(); }
function switchTab(tab) {
  document.getElementById('formLogin').classList.toggle('active', tab === 'login');
  document.getElementById('formRegister').classList.toggle('active', tab === 'register');
  document.getElementById('tabLogin').classList.toggle('active', tab === 'login');
  document.getElementById('tabRegister').classList.toggle('active', tab === 'register');
  clearAuthErrors();
}
function clearAuthErrors() { ['loginError','registerError','registerSuccess'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; }); }

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn   = document.getElementById('btnLogin');
  if (!email || !pass) { errEl.textContent = 'Completá todos los campos.'; return; }
  btn.disabled = true; btn.textContent = 'Ingresando...';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  btn.disabled = false; btn.textContent = 'Iniciar sesión';
  if (error) { errEl.textContent = 'Correo o contraseña incorrectos.'; } else { closeAuthModal(); showNotification('BIENVENIDO/A'); }
}

async function doRegister() {
  const name  = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass  = document.getElementById('regPassword').value;
  const errEl = document.getElementById('registerError');
  const sucEl = document.getElementById('registerSuccess');
  const btn   = document.getElementById('btnRegister');
  if (!name || !email || !pass) { errEl.textContent = 'Completá todos los campos.'; return; }
  if (pass.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
  btn.disabled = true; btn.textContent = 'Creando cuenta...';
  const { error } = await sb.auth.signUp({ email, password: pass, options: { data: { name } } });
  btn.disabled = false; btn.textContent = 'Crear cuenta';
  if (error) { errEl.textContent = error.message.includes('already') ? 'Este correo ya está registrado.' : 'Error al crear la cuenta.'; }
  else { sucEl.textContent = '¡Cuenta creada! Revisá tu correo para confirmar.'; setTimeout(() => { closeAuthModal(); showNotification('CUENTA CREADA — REVISÁ TU CORREO'); }, 1800); }
}

async function doLogout() { document.getElementById('userDropdown').classList.remove('open'); await sb.auth.signOut(); showNotification('SESIÓN CERRADA'); }

function openConfirmModal() { document.getElementById('userDropdown').classList.remove('open'); document.getElementById('confirmModal').classList.add('active'); }
function closeConfirmModal() { document.getElementById('confirmModal').classList.remove('active'); }
async function doDeleteAccount() {
  closeConfirmModal(); if (!currentUser) return;
  try { const { error } = await sb.rpc('delete_user'); if (error) throw error; await sb.auth.signOut(); showNotification('CUENTA ELIMINADA'); }
  catch { await sb.auth.signOut(); showNotification('SESIÓN CERRADA — CONTACTANOS PARA ELIMINAR TU CUENTA'); }
}

document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('userMenuWrapper');
  const dropdown = document.getElementById('userDropdown');
  if (wrapper && !wrapper.contains(e.target)) dropdown.classList.remove('open');
});
document.getElementById('authModal').addEventListener('click', (e) => { if (e.target === document.getElementById('authModal')) closeAuthModal(); });

/* SUPABASE — PRODUCTOS */
async function loadProducts() {
  showSkeletons('productsGrid', 6); showSkeletons('newProductsGrid', 3);
  try {
    const { data, error } = await sb.from('products').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
    if (error) throw error;
    allProducts = data || [];
  } catch (e) { console.error('Error cargando productos:', e); allProducts = []; }
  await syncReservations();
  filteredProducts = [...allProducts];
  renderProducts(filteredProducts, 'productsGrid');
  renderProducts(allProducts.filter(p => p.is_new), 'newProductsGrid');
  // Inyectar schema de productos luego de cargar
  injectProductSchema(allProducts);
  updateCartUI(); startTimers();
}

/* RESERVAS */
async function syncReservations() {
  try {
    await sb.from('reservations').delete().lt('expires_at', new Date().toISOString());
    const { data } = await sb.from('reservations').select('*');
    if (data) { data.forEach(r => { allProducts.forEach(p => { if (p.id === r.product_id) p._reserved = true; }); }); }
  } catch (e) { console.error('Error sync reservas:', e); }
}

async function createReservation(productId) {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  try { await sb.from('reservations').upsert({ product_id: productId, expires_at: expiresAt }); localReservations[productId] = Date.now() + 5 * 60 * 1000; localStorage.setItem('zysk_res', JSON.stringify(localReservations)); }
  catch (e) { console.error('Error creando reserva:', e); }
}

async function deleteReservation(productId) {
  try { await sb.from('reservations').delete().eq('product_id', productId); delete localReservations[productId]; localStorage.setItem('zysk_res', JSON.stringify(localReservations)); }
  catch (e) { console.error('Error borrando reserva:', e); }
}

function isReservedByMe(productId) {
  const exp = localReservations[productId];
  if (!exp) return false;
  if (Date.now() > exp) { delete localReservations[productId]; localStorage.setItem('zysk_res', JSON.stringify(localReservations)); return false; }
  return true;
}

function timeLeft(productId) { const exp = localReservations[productId]; return exp ? Math.max(0, Math.floor((exp - Date.now()) / 1000)) : 0; }

/* GUARDAR PEDIDO */
async function saveOrder(orderData) { try { await sb.from('orders').insert(orderData); } catch (e) { console.error('Error guardando pedido:', e); } }

/* SKELETON */
function showSkeletons(gridId, count) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.innerHTML = Array(count).fill(0).map(() => `<div class="skeleton-card"><div class="skeleton-img"></div><div class="skeleton-line medium"></div><div class="skeleton-line short"></div></div>`).join('');
}

/* FILTROS */
function applyFilter(type, value) {
  activeFilter = { type, value };
  document.querySelectorAll('.filter-btn').forEach(b => { b.classList.remove('active'); if (b.dataset.filter === value) b.classList.add('active'); });
  let result = [...allProducts];
  if (type === 'all') result = [...allProducts];
  else if (type === 'section') result = allProducts.filter(p => p.section === value);
  else if (type === 'category') result = allProducts.filter(p => {
    const cats = p.categories || (p.category ? [p.category] : []);
    return cats.map(c => c.toLowerCase()).includes(value.toLowerCase());
  });
  else if (type === 'size') result = allProducts.filter(p => p.sizes && p.sizes.includes(value));
  else if (type === 'new') result = allProducts.filter(p => p.is_new);
  filteredProducts = result;
  renderProducts(filteredProducts, 'productsGrid');
  scrollToSection('shop');
}

/* RENDER */
function renderProducts(list, gridId) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  if (!list || list.length === 0) { grid.innerHTML = '<div class="no-results"><p>No hay productos en esta categoría</p></div>'; return; }
  grid.innerHTML = list.map(p => {
    const isReserved = p._reserved && !isReservedByMe(p.id);
    const isSold = p.is_sold;
    const sizeBadges = (p.sizes || []).map(s => `<span class="badge badge-size">${s}</span>`).join('');
    const newBadge = p.is_new ? '<span class="badge badge-new">NEW</span>' : '';
    const photos = getProductImages(p);
    const mainImg = photos[0] || '';
    const hoverImg = photos[1] || '';
    const cats = (p.categories && p.categories.length ? p.categories : [p.category || '']).join(', ');
    return `<div class="product-card ${isReserved ? 'reserved' : ''} ${isSold ? 'sold' : ''}" onclick="showProductDetail('${p.id}')">
      <div class="product-image">
        <img src="${mainImg}" alt="${p.name} - Ropa Vintage ZYSKN Córdoba" loading="lazy"
          ${hoverImg ? `onmouseenter="this.src='${hoverImg}'" onmouseleave="this.src='${mainImg}'"` : ''}>
      </div>
      <div class="product-meta">
        <div>
          <p class="product-name">${p.name}</p>
          <p class="product-cat">${cats}</p>
          <div class="product-badges">${newBadge}${sizeBadges}</div>
        </div>
        <p class="product-price">$${Number(p.price).toLocaleString('es-AR')}</p>
      </div>
    </div>`;
  }).join('');
}

/* PRODUCT DETAIL */
function showProductDetail(id) {
  currentProduct = allProducts.find(p => p.id === id);
  if (!currentProduct) return;
  selectedSize = null;
  currentPhotos = getProductImages(currentProduct);
  currentPhotoIndex = 0; zoomed = false;

  document.getElementById('detailName').textContent = currentProduct.name;
  document.getElementById('detailPrice').textContent = `$${Number(currentProduct.price).toLocaleString('es-AR')}`;
  document.getElementById('detailDesc').innerHTML = currentProduct.description || '';
  document.getElementById('detailImage').src = currentPhotos[0] || '';
  document.getElementById('detailImage').alt = `${currentProduct.name} - Vintage ZYSKN Córdoba`;
  document.getElementById('detailImage').style.transform = 'scale(1)';
  document.getElementById('detailTalle').textContent = currentProduct.talle || 'Consultar';
  document.getElementById('detailMedidas').textContent = currentProduct.medidas || 'Consultar';
  document.getElementById('detailEstado').textContent = currentProduct.estado || '10/10';
  document.getElementById('detailSizes').innerHTML = (currentProduct.sizes || []).map(s => `<button onclick="setSize('${s}',this)">${s}</button>`).join('');

  const hasMultiple = currentPhotos.length > 1;
  document.getElementById('prevBtn').style.display = hasMultiple ? 'block' : 'none';
  document.getElementById('nextBtn').style.display = hasMultiple ? 'block' : 'none';
  document.getElementById('thumbs').innerHTML = currentPhotos.map((src, i) =>
    `<img src="${src}" alt="${currentProduct.name} foto ${i+1}" onclick="currentPhotoIndex=${i};changePhoto(0)" class="${i === 0 ? 'active-thumb' : ''}">`
  ).join('');

  const zc = document.getElementById('zoomContainer');
  let sx = 0, lt = 0;
  zc.ontouchstart = e => sx = e.touches[0].clientX;
  zc.ontouchend = e => {
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50 && currentPhotos.length > 1) changePhoto(dx < 0 ? 1 : -1);
    const now = Date.now();
    if (now - lt < 300) zoomImage();
    lt = now;
  };

  const btn = document.querySelector('#product-detail .btn-add-cart');
  const statusOverlay = document.getElementById('detailStatusOverlay');
  const isSold = currentProduct.is_sold;
  const isReservedByOther = currentProduct._reserved && !isReservedByMe(currentProduct.id);

  if (isSold || isReservedByOther) {
    const text = isSold ? 'SIN STOCK' : 'RESERVADO';
    statusOverlay.textContent = text;
    statusOverlay.classList.add('show');
    statusOverlay.classList.toggle('sold', isSold);
    btn.disabled = true; btn.style.opacity = '.4'; btn.style.cursor = 'not-allowed'; btn.textContent = text;
  } else {
    statusOverlay.classList.remove('show', 'sold');
    statusOverlay.textContent = '';
    btn.disabled = false; btn.style.opacity = '1'; btn.style.cursor = 'pointer'; btn.textContent = 'AGREGAR AL CARRITO';
  }

  updateFavBtn();
  document.getElementById('product-detail').classList.add('active');
  scrollToSection('product-detail');
}

function changePhoto(dir) {
  const img = document.getElementById('detailImage');
  img.style.opacity = '0';
  setTimeout(() => {
    currentPhotoIndex = (currentPhotoIndex + dir + currentPhotos.length) % currentPhotos.length;
    img.src = currentPhotos[currentPhotoIndex]; img.style.opacity = '1';
    document.querySelectorAll('#thumbs img').forEach((t, i) => t.className = i === currentPhotoIndex ? 'active-thumb' : '');
  }, 160);
}

function zoomImage() {
  const img = document.getElementById('detailImage');
  const container = img.parentElement;
  zoomed = !zoomed;
  if (zoomed) {
    img.style.transform = 'scale(2.2)'; container.style.cursor = 'grab';
    let isDown = false, startX, startY, tx = 0, ty = 0;
    const down = e => { isDown = true; startX = (e.touches?.[0]?.clientX || e.clientX) - tx; startY = (e.touches?.[0]?.clientY || e.clientY) - ty; container.style.cursor = 'grabbing'; };
    const move = e => { if (!isDown) return; e.preventDefault(); const x = (e.touches?.[0]?.clientX || e.clientX) - startX; const y = (e.touches?.[0]?.clientY || e.clientY) - startY; tx = Math.max(-150, Math.min(150, x)); ty = Math.max(-150, Math.min(150, y)); img.style.transform = `scale(2.2) translate(${tx/6}px,${ty/6}px)`; };
    const up = () => { isDown = false; container.style.cursor = 'grab'; };
    container.addEventListener('mousedown', down); container.addEventListener('mousemove', move); container.addEventListener('mouseup', up); container.addEventListener('mouseleave', up);
    container.addEventListener('touchstart', down, { passive: false }); container.addEventListener('touchmove', move, { passive: false }); container.addEventListener('touchend', up);
    container._zh = { down, move, up };
  } else {
    img.style.transform = 'scale(1)'; container.style.cursor = 'zoom-in';
    if (container._zh) { const h = container._zh; container.removeEventListener('mousedown', h.down); container.removeEventListener('mousemove', h.move); container.removeEventListener('mouseup', h.up); container.removeEventListener('mouseleave', h.up); }
  }
}

function setSize(s, btn) {
  selectedSize = s;
  document.querySelectorAll('#detailSizes button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

/* FLY ANIMATION */
function animateToCart(originEl) {
  const cartEl = document.getElementById('cart-icon');
  if (!cartEl || !originEl) return;
  const flyer = document.createElement('div');
  flyer.className = 'fly-item';
  const originRect = originEl.getBoundingClientRect();
  const cartRect = cartEl.getBoundingClientRect();
  const startX = originRect.left + originRect.width / 2 - 9;
  const startY = originRect.top + originRect.height / 2 - 9;
  const tx = (cartRect.left + cartRect.width / 2) - (originRect.left + originRect.width / 2);
  const ty = (cartRect.top + cartRect.height / 2) - (originRect.top + originRect.height / 2);
  flyer.style.left = startX + 'px'; flyer.style.top = startY + 'px';
  flyer.style.setProperty('--tx', tx + 'px'); flyer.style.setProperty('--ty', ty + 'px');
  document.body.appendChild(flyer);
  flyer.addEventListener('animationend', () => {
    flyer.remove(); cartEl.style.transform = 'scale(1.4)';
    setTimeout(() => { cartEl.style.transform = 'scale(1)'; }, 220);
  });
}

/* ADD TO CART */
async function addToCartFromDetail(event) {
  if (!selectedSize) { alert('Seleccioná el talle'); return; }
  if (currentProduct.is_sold) { alert('Este producto ya fue vendido'); return; }
  if (currentProduct._reserved && !isReservedByMe(currentProduct.id)) { alert('Este producto está reservado por otro usuario'); return; }
  if (cart.find(i => i.id === currentProduct.id)) { alert('Ya está en el carrito'); return; }
  await createReservation(currentProduct.id);
  currentProduct._reserved = true;
  cart.push({ ...currentProduct, size: selectedSize });
  localStorage.setItem('zysk_cart', JSON.stringify(cart));
  updateCartUI(); animateToCart(event.currentTarget); showNotification('RESERVADO POR 5 MINUTOS');
  scrollToSection('cart-section');
}

/* CART UI */
function updateCartUI() {
  const badge = document.getElementById('cartBadge');
  badge.textContent = cart.length; badge.style.display = cart.length ? 'flex' : 'none';
  const checkout = document.getElementById('cartCheckoutArea');
  const empty = document.getElementById('cartEmptyMsg');
  if (cart.length === 0) { checkout.style.display = 'none'; empty.style.display = 'block'; document.getElementById('cartItems').innerHTML = ''; }
  else {
    checkout.style.display = 'block'; empty.style.display = 'none';
    document.getElementById('cartItems').innerHTML = cart.map((item, idx) => {
      const t = timeLeft(item.id); const m = Math.floor(t / 60); const s = (t % 60).toString().padStart(2, '0');
      return `<div style="margin-bottom:1rem;font-size:.88rem;border-bottom:1px solid rgba(0,0,0,.08);padding-bottom:1rem;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span style="font-weight:700;">${item.name} (${item.size}) — $${Number(item.price).toLocaleString('es-AR')}</span>
          <div class="reservation-timer">⏱ RESERVA ACTIVA ${m}:${s}</div>
        </div>
        <button onclick="removeFromCart(${idx})" style="background:none;border:none;color:var(--red);cursor:pointer;font-weight:900;font-size:1.3rem;line-height:1;">×</button>
      </div>`;
    }).join('');
  }
  document.getElementById('cartTotal').textContent = `$${cart.reduce((s, i) => s + Number(i.price), 0).toLocaleString('es-AR')}`;
}

async function removeFromCart(index) {
  const item = cart[index]; await deleteReservation(item.id);
  const p = allProducts.find(p => p.id === item.id); if (p) p._reserved = false;
  cart.splice(index, 1); localStorage.setItem('zysk_cart', JSON.stringify(cart));
  updateCartUI(); showNotification('Producto eliminado del carrito');
}

/* WHATSAPP */
async function shareOnWhatsApp() {
  if (cart.length === 0) { alert('El carrito está vacío'); return; }
  const nombre    = document.getElementById('orderName').value.trim();
  const dni       = document.getElementById('orderDni').value.trim();
  const celular   = document.getElementById('orderPhone').value.trim();
  const email     = document.getElementById('orderEmail').value.trim();
  const localidad = document.getElementById('orderLocation').value.trim();
  const sucursal  = document.getElementById('orderShippingAddr').value.trim();
  if (!nombre || !dni || !celular || !localidad) { alert('Completá Nombre, DNI, Celular y Ciudad antes de continuar'); return; }
  const orderId = 'ZSK-' + Date.now().toString(36).toUpperCase();
  const now = new Date();
  const fecha = now.toLocaleDateString('es-AR');
  const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const total = cart.reduce((s, i) => s + Number(i.price), 0);
  await saveOrder({ order_id: orderId, customer_name: nombre, customer_dni: dni, customer_phone: celular, customer_email: email, customer_location: localidad, customer_shipping: sucursal, items: cart, total: total, status: 'pending' });

  let msg = `*Holaa! ZYSKN · NUEVO PEDIDO*\n\n`;
  msg += `*N° de Pedido:* ${orderId}\n`;
  msg += `*Fecha:* ${fecha} · ${hora}\n\n`;
  msg += `─────────────────────\n`;
  msg += `*DATOS DEL COMPRADOR*\n`;
  msg += `─────────────────────\n\n`;
  msg += `· *Nombre:* ${nombre}\n`;
  msg += `· *DNI:* ${dni}\n`;
  msg += `· *Celular:* ${celular}\n`;
  msg += `· *Email:* ${email || 'No informado'}\n`;
  msg += `· *Localidad:* ${localidad}\n`;
  msg += `· *Envío:* ${sucursal || 'A coordinar'}\n\n`;
  msg += `─────────────────────\n`;
  msg += `*PRENDAS SELECCIONADAS*\n`;
  msg += `─────────────────────\n\n`;
  cart.forEach((item, index) => {
    msg += `${index + 1}. *${item.name}*\n`;
    msg += `   Talle: ${item.size} · Precio: $${Number(item.price).toLocaleString('es-AR')}\n\n`;
  });
  msg += `─────────────────────\n`;
  msg += `· *TOTAL: $${total.toLocaleString('es-AR')}*\n`;
  msg += `_· El costo de envío se calcula según destino._\n\n`;
  msg += `_Gracias por tu compra. En breve nos ponemos en contacto!._`;

  for (const item of cart) { await deleteReservation(item.id); }
  cart = []; localStorage.setItem('zysk_cart', JSON.stringify(cart)); updateCartUI();
  window.open(`https://wa.me/5493544631553?text=${encodeURIComponent(msg)}`, '_blank');
  showNotification('PEDIDO ENVIADO · ' + orderId);
}

/* SEARCH */
function toggleSearch() {
  const header = document.getElementById('header'); const input = document.getElementById('searchInput');
  header.classList.toggle('searching');
  if (header.classList.contains('searching')) setTimeout(() => input?.focus(), 150);
}
function handleSearch(e) {
  if (e.key === 'Enter') {
    const q = e.target.value.toLowerCase().trim();
    if (!q) { applyFilter('all', 'all'); } else {
      filteredProducts = allProducts.filter(p => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q));
      renderProducts(filteredProducts, 'productsGrid'); scrollToSection('shop');
    }
    toggleSearch(); e.target.value = '';
  }
}
function mobileSearch(q) {
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(q.trim().toLowerCase()) || (p.category || '').toLowerCase().includes(q.trim().toLowerCase()));
  renderProducts(filtered, 'productsGrid');
  document.getElementById('hamburger')?.click();
  setTimeout(() => scrollToSection('shop'), 350);
}

/* TIMERS */
function startTimers() {
  setInterval(async () => {
    let changed = false;
    for (const productId of Object.keys(localReservations)) {
      if (Date.now() > localReservations[productId]) {
        delete localReservations[productId];
        cart = cart.filter(i => i.id !== productId);
        localStorage.setItem('zysk_cart', JSON.stringify(cart));
        localStorage.setItem('zysk_res', JSON.stringify(localReservations));
        const p = allProducts.find(pr => pr.id === productId); if (p) p._reserved = false;
        changed = true; showNotification('RESERVA VENCIDA — PRODUCTO LIBERADO');
      }
    }
    if (changed) { await syncReservations(); renderProducts(filteredProducts, 'productsGrid'); renderProducts(allProducts.filter(p => p.is_new), 'newProductsGrid'); }
    updateCartUI();
  }, 1000);
}

/* UI HELPERS */
function showNotification(msg) {
  const n = document.getElementById('notification');
  n.textContent = msg; n.style.display = 'block';
  setTimeout(() => n.style.display = 'none', 3500);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const hamburger = document.getElementById('hamburger');
  const navMain = document.getElementById('navMain');
  const navOverlay = document.getElementById('nav-overlay');
  const isMenuOpen = navMain && navMain.classList.contains('active');
  if (isMenuOpen) {
    hamburger?.classList.remove('active'); navMain.classList.remove('active'); navOverlay?.classList.remove('active');
    document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = '';
    window.scrollTo(0, scrollY);
  }
  setTimeout(() => {
    const headerHeight = document.getElementById('header').offsetHeight;
    const elementPosition = el.getBoundingClientRect().top + window.pageYOffset;
    const isMobile = window.innerWidth <= 1024;
    const offsetPosition = elementPosition - headerHeight - (isMobile ? 12 : -30);
    if (isMobile) { window.scrollTo({ top: offsetPosition, behavior: 'smooth' }); }
    else {
      const start = window.pageYOffset; const distance = offsetPosition - start; const duration = 900; let startTime = null;
      function ease(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
      function anim(ct) { if (!startTime) startTime = ct; const elapsed = ct - startTime; const progress = Math.min(elapsed / duration, 1); window.scrollTo(0, start + distance * ease(progress)); if (elapsed < duration) requestAnimationFrame(anim); }
      requestAnimationFrame(anim);
    }
  }, isMenuOpen ? 350 : 50);
}

/* MOBILE MENU */
const hamburger = document.getElementById('hamburger');
const navMain = document.getElementById('navMain');
const navOverlay = document.getElementById('nav-overlay');

document.querySelectorAll('.nav-item').forEach(item => {
  const link = item.querySelector('a');
  const subNav = item.querySelector('.sub-nav-wrapper');
  if (subNav && link.dataset.section) {
    link.addEventListener('click', e => {
      e.preventDefault();
      const section = link.dataset.section;
      if (window.innerWidth <= 1024) {
        e.stopPropagation();
        const isOpen = item.classList.contains('active-mobile');
        if (isOpen) { item.classList.remove('active-mobile'); applyFilter('section', section); }
        else { document.querySelectorAll('.nav-item').forEach(o => { if (o !== item) o.classList.remove('active-mobile'); }); item.classList.add('active-mobile'); }
      } else { applyFilter('section', section); }
    });
  }
});

if (hamburger && navMain) {
  hamburger.addEventListener('click', () => {
    const isOpening = !navMain.classList.contains('active');
    document.getElementById('header').classList.remove('searching');
    hamburger.classList.toggle('active'); navMain.classList.toggle('active'); navOverlay?.classList.toggle('active');
    if (isOpening) { scrollY = window.scrollY; document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%'; }
    else { document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = ''; window.scrollTo(0, scrollY); }
  });
}

navOverlay?.addEventListener('click', () => {
  hamburger.classList.remove('active'); navMain.classList.remove('active'); navOverlay.classList.remove('active');
  document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = ''; window.scrollTo(0, scrollY);
});

window.addEventListener('scroll', () => {
  if (window.pageYOffset > 50) document.body.classList.add('scrolled-down');
  else document.body.classList.remove('scrolled-down');
  const header = document.getElementById('header');
  if (window.pageYOffset > 10) header.classList.add('elevated');
  else header.classList.remove('elevated');
});

/* BOOT */
checkStoreLock();
initAuth();
loadProducts();
