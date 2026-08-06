// customer.js —— 顾客端 SPA
const $ = (s, r = document) => r.querySelector(s);
const app = $('#app');
let TOKEN = localStorage.getItem('c_token') || '';
let ME = JSON.parse(localStorage.getItem('c_user') || 'null');
let SETTINGS = {};
let CATS = [];
let cartCache = null;

// ---------- 工具 ----------
async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opt.headers.authorization = 'Bearer ' + TOKEN;
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('错误 ' + r.status));
  return data;
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.remove('hide'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hide'), 1800); }
function money(n) { return '¥' + (Number(n) || 0).toFixed(2); }
function setAuth(t, u) { TOKEN = t; ME = u; localStorage.setItem('c_token', t); localStorage.setItem('c_user', JSON.stringify(u)); }
function logout() { TOKEN = ''; ME = null; localStorage.removeItem('c_token'); localStorage.removeItem('c_user'); location.hash = '#/'; route(); }

function authHeader() { return TOKEN ? { authorization: 'Bearer ' + TOKEN } : {}; }

// ---------- 弹窗 ----------
function openModal(html) { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hide'); }
function closeModal() { $('#modal').classList.add('hide'); }
window.closeModal = closeModal;

function openLogin(next) {
  openModal(`<h3>登录 / 注册</h3>
    <div class="row" style="margin-bottom:10px">
      <button class="btn block" id="tabLogin">登录</button>
      <button class="btn ghost block" id="tabReg">注册</button>
    </div>
    <div id="authBody"></div>`);
  const showLogin = () => { $('#authBody').innerHTML = `
      <div class="field"><label>手机号</label><input id="aph" placeholder="11 位手机号"></div>
      <div class="field"><label>密码</label><input id="apw" type="password" placeholder="至少 6 位"></div>
      <button class="btn block" id="doAuth">登录</button>`;
    $('#doAuth').onclick = async () => {
      try { const d = await api('POST', '/auth/customer/login', { phone: $('#aph').value, password: $('#apw').value });
        setAuth(d.token, d.user); toast('登录成功'); closeModal(); route(); }
      catch (e) { toast(e.message); }
    };
  };
  const showReg = () => { $('#authBody').innerHTML = `
      <div class="field"><label>手机号</label><input id="aph" placeholder="11 位手机号"></div>
      <div class="field"><label>昵称</label><input id="anm" placeholder="选填"></div>
      <div class="field"><label>密码</label><input id="apw" type="password" placeholder="至少 6 位"></div>
      <button class="btn block" id="doAuth">注册</button>`;
    $('#doAuth').onclick = async () => {
      try { const d = await api('POST', '/auth/customer/register', { phone: $('#aph').value, password: $('#apw').value, name: $('#anm').value });
        setAuth(d.token, d.user); toast('注册成功'); closeModal(); route(); }
      catch (e) { toast(e.message); }
    };
  };
  $('#tabLogin').onclick = () => { $('#tabLogin').className = 'btn block'; $('#tabReg').className = 'btn ghost block'; showLogin(); };
  $('#tabReg').onclick = () => { $('#tabReg').className = 'btn block'; $('#tabLogin').className = 'btn ghost block'; showReg(); };
  if (next === 'reg') showReg(); else showLogin();
}
function requireLogin() { if (!TOKEN) { openLogin(); return false; } return true; }

// ---------- 购物车抽屉 ----------
function toggleCart(open) { $('#cartDrawer').classList.toggle('hide', !open); if (open) renderCart(); }
window.toggleCart = toggleCart;

async function renderCart() {
  if (!requireLogin()) return;
  const c = await api('GET', '/cart');
  cartCache = c;
  const body = $('#cartBody');
  if (!c.items.length) { body.innerHTML = '<div class="empty">购物车是空的</div>'; $('#cartFoot').innerHTML = ''; return; }
  body.innerHTML = c.items.map(i => `<div class="citem">
    <img src="${i.image_url || ''}" onerror="this.style.display='none'">
    <div class="info"><div class="nm">${i.name}</div><div class="pr">${money(i.price)}</div>
      <div class="ctrl">
        <button data-dec="${i.product_id}">−</button>
        <span>${i.quantity}</span>
        <button data-inc="${i.product_id}">＋</button>
        <button data-del="${i.product_id}" style="margin-left:auto;color:#999">删除</button>
      </div></div></div>`).join('');
  $('#cartFoot').innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>合计</span><b style="color:var(--brand)">${money(c.total)}</b></div>
    <button class="btn block" id="toCheckout">去结算 (${c.count})</button>`;
  $('#toCheckout').onclick = () => { closeCart(); location.hash = '#/checkout'; route(); };
  body.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => changeQty(b.dataset.inc, 1));
  body.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => changeQty(b.dataset.dec, -1));
  body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => delItem(b.dataset.del));
}
function closeCart() { $('#cartDrawer').classList.add('hide'); }
async function changeQty(pid, d) {
  const it = cartCache.items.find(x => String(x.product_id) === String(pid));
  const q = Math.max(1, (it ? it.quantity : 1) + d);
  await api('PUT', '/cart/item/' + pid, { quantity: q }); renderCart(); updateCartBadge();
}
async function delItem(pid) { await api('DELETE', '/cart/item/' + pid); renderCart(); updateCartBadge(); }
async function updateCartBadge() {
  if (!TOKEN) return;
  try { const c = await api('GET', '/cart'); const n = c.count || 0;
    let b = $('.cart-badge'); if (!b) { b = document.createElement('span'); b.className = 'cart-badge'; $('.bottom-nav a[href="#/cart"]').appendChild(b); }
    b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; } catch {}
}

// ---------- 视图 ----------
async function loadBase() {
  if (!SETTINGS.shop_name) { try { SETTINGS = await api('GET', '/settings'); } catch {} }
  if (!CATS.length) { try { CATS = (await api('GET', '/products/categories/list')).items; } catch {} }
  $('#shopName').textContent = SETTINGS.shop_name || '商城';
  document.title = (SETTINGS.shop_name || '商城') + ' · 顾客端';
}

async function viewHome() {
  await loadBase();
  const kw = ($('#searchInput') ? $('#searchInput').value : '') || '';
  let html = '';
  if (SETTINGS.announcement) html += `<div class="announce">📢 ${SETTINGS.announcement}</div>`;
  html += `<div class="cats" id="catBar"></div><div class="grid" id="pgrid"></div>`;
  app.innerHTML = html;
  const bar = $('#catBar');
  bar.innerHTML = `<div class="cat ${!state.cat ? 'on' : ''}" data-c="">全部</div>` +
    CATS.map(c => `<div class="cat ${state.cat == c.id ? 'on' : ''}" data-c="${c.id}">${c.name}</div>`).join('');
  bar.querySelectorAll('.cat').forEach(el => el.onclick = () => { state.cat = el.dataset.c ? +el.dataset.c : ''; viewHome(); });
  await loadProducts(kw);
}

async function loadProducts(kw) {
  const params = new URLSearchParams(); if (state.cat) params.set('category_id', state.cat); if (kw) params.set('keyword', kw);
  const grid = $('#pgrid'); if (!grid) return;
  grid.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const d = await api('GET', '/products?' + params.toString());
    if (!d.items.length) { grid.innerHTML = '<div class="empty">没有找到商品</div>'; return; }
    grid.innerHTML = d.items.map(p => `<div class="card" data-id="${p.id}">
      <img src="${p.image_url || ''}" onerror="this.style.display='none'">
      <div class="body"><div class="name">${p.name}</div>
      <div class="price">${money(p.price)} <small>库存 ${p.stock}</small></div></div></div>`).join('');
    grid.querySelectorAll('.card').forEach(c => c.onclick = () => { location.hash = '#/product/' + c.dataset.id; route(); });
  } catch (e) { grid.innerHTML = '<div class="empty">' + e.message + '</div>'; }
}

async function viewProduct(id) {
  app.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const p = await api('GET', '/products/' + id);
    app.innerHTML = `<div class="detail"><img src="${p.image_url || ''}" onerror="this.style.display='none'">
      <div class="pad"><h2>${p.name}</h2><div class="price">${money(p.price)}</div>
      <div class="desc">${p.description || ''}</div>
      <div class="qty">数量 <button id="minus">−</button><input id="qty" value="1" readonly><button id="plus">＋</button>
        <span style="margin-left:auto;color:var(--muted);font-size:13px">库存 ${p.stock}</span></div>
      <div class="row">
        <button class="btn ghost" id="addCart">加入购物车</button>
        <button class="btn" id="buyNow">立即购买</button>
      </div>
      <button class="btn ghost block" style="margin-top:10px" onclick="location.hash='#/';route()">← 返回</button>
      </div></div>`;
    let q = 1;
    $('#minus').onclick = () => { q = Math.max(1, q - 1); $('#qty').value = q; };
    $('#plus').onclick = () => { q = Math.min(p.stock, q + 1); $('#qty').value = q; };
    $('#addCart').onclick = async () => { if (!requireLogin()) return; await api('POST', '/cart/add', { product_id: p.id, quantity: q }); toast('已加入购物车'); updateCartBadge(); toggleCart(true); };
    $('#buyNow').onclick = async () => { if (!requireLogin()) return; await api('POST', '/cart/add', { product_id: p.id, quantity: q }); toggleCart(false); location.hash = '#/checkout'; route(); };
  } catch (e) { app.innerHTML = '<div class="empty">' + e.message + '</div>'; }
}

async function viewCheckout() {
  if (!requireLogin()) return;
  const c = await api('GET', '/cart');
  if (!c.items.length) { app.innerHTML = '<div class="empty">购物车为空 <a class="link" style="color:var(--brand)" href="#/">去逛逛</a></div>'; return; }
  app.innerHTML = `<h2 style="margin:6px 2px 12px">确认订单</h2>
    <div class="order"><div class="oi" style="display:block">${c.items.map(i => `<div class="oi"><img src="${i.image_url || ''}" onerror="this.style.display='none'"><div style="flex:1"><div>${i.name}</div><div class="pr" style="color:var(--brand)">${money(i.price)} × ${i.quantity}</div></div></div>`).join('')}</div></div>
    <div class="field"><label>收货人</label><input id="rn" value="${ME.name || ''}"></div>
    <div class="field"><label>手机号</label><input id="rp" value="${ME.phone || ''}"></div>
    <div class="field"><label>收货地址</label><textarea id="ra" rows="2" placeholder="请输入详细地址"></textarea></div>
    <div class="field"><label>备注</label><input id="rm" placeholder="选填"></div>
    <div style="display:flex;justify-content:space-between;margin:10px 2px"><span>应付金额</span><b style="color:var(--brand);font-size:18px">${money(c.total)}</b></div>
    <button class="btn block" id="payBtn">提交并支付</button>`;
  $('#payBtn').onclick = submitOrder;
}

async function submitOrder() {
  const rn = $('#rn').value.trim(), rp = $('#rp').value.trim(), ra = $('#ra').value.trim();
  if (!rn || !rp || !ra) { toast('请填写完整收货信息'); return; }
  const btn = $('#payBtn'); btn.disabled = true; btn.textContent = '处理中…';
  try {
    const o = await api('POST', '/orders', { from_cart: true, receiver_name: rn, receiver_phone: rp, address: ra, remark: $('#rm').value });
    const pay = await api('POST', '/payments/create', { order_id: o.order_id });
    if (pay.method === 'mock') {
      if (!confirm('模拟支付：点击确定视为支付成功')) { btn.disabled = false; btn.textContent = '提交并支付'; return; }
      await api('POST', '/payments/confirm', { payment_id: pay.payment_id });
      toast('支付成功'); updateCartBadge();
      location.hash = '#/orders'; route();
    } else {
      toast('请前往支付页完成付款'); window.open(pay.action.url, '_blank'); location.hash = '#/orders'; route();
    }
  } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '提交并支付'; }
}

async function viewOrders() {
  if (!requireLogin()) return;
  app.innerHTML = `<h2 style="margin:6px 2px 12px">我的订单</h2>
    <div class="field"><label>按订单号查询</label><div class="row"><input id="qno" placeholder="输入订单号"><button class="btn" id="qbtn">查询</button></div></div>
    <div id="olist" class="loading">加载中…</div>`;
  const render = (list) => {
    if (!list.length) { $('#olist').innerHTML = '<div class="empty">暂无订单</div>'; return; }
    $('#olist').innerHTML = list.map(o => `<div class="order">
      <div class="hd"><span>${o.order_no}</span><span class="tag ${o.status}">${({pending:'待付款',paid:'已付款',shipped:'已发货',completed:'已完成',cancelled:'已取消',refunded:'已退款'})[o.status]}</span></div>
      ${o.items.map(i => `<div class="oi"><img src="${(i.image_url)||''}" onerror="this.style.display='none'"><div style="flex:1"><div>${i.name}</div><div style="color:var(--brand)">${money(i.price/100)} × ${i.quantity}</div></div></div>`).join('')}
      <div style="text-align:right;margin-top:6px">合计 <b style="color:var(--brand)">${money(o.total_amount)}</b></div></div>`).join('');
  };
  try { const d = await api('GET', '/orders/mine'); render(d.items); } catch (e) { $('#olist').innerHTML = e.message; }
  $('#qbtn').onclick = async () => { const no = $('#qno').value.trim(); if (!no) return; try { const o = await api('GET', '/orders/query?order_no=' + encodeURIComponent(no)); render([o]); } catch (e) { $('#olist').innerHTML = e.message; } };
}

function viewMe() {
  if (!ME) { openLogin(); app.innerHTML = '<div class="empty">请先登录</div>'; return; }
  app.innerHTML = `<h2 style="margin:6px 2px 12px">我的</h2>
    <div class="order"><div style="font-size:16px;font-weight:600">${ME.name || ME.phone}</div><div style="color:var(--muted);font-size:13px">手机号 ${ME.phone}</div></div>
    <div class="row" style="margin-top:10px">
      <a class="btn ghost block" href="#/orders">我的订单</a>
      <button class="btn block" id="logout">退出登录</button></div>`;
  $('#logout').onclick = logout;
}

// ---------- 路由 ----------
const state = { cat: '' };
function route() {
  const h = location.hash || '#/';
  document.querySelectorAll('.bottom-nav a').forEach(a => a.classList.toggle('active', a.dataset.view === (h.startsWith('#/product') ? 'home' : h.slice(2).split('/')[0] || 'home')));
  if (h.startsWith('#/product/')) return viewProduct(h.split('/')[2]);
  if (h.startsWith('#/cart')) return viewHome().then(() => toggleCart(true));
  if (h.startsWith('#/checkout')) return viewCheckout();
  if (h.startsWith('#/orders')) return viewOrders();
  if (h.startsWith('#/me')) return viewMe();
  return viewHome();
}
window.addEventListener('hashchange', route);
$('#searchInput') && ($('#searchInput').oninput = debounce(() => { state.cat = ''; viewHome(); }, 400));
function debounce(fn, t) { let id; return (...a) => { clearTimeout(id); id = setTimeout(() => fn(...a), t); }; }
updateCartBadge();
route();
