// admin.js —— 商家管理后台 SPA
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
let TOKEN = localStorage.getItem('a_token') || '';
let ADMIN = JSON.parse(localStorage.getItem('a_user') || 'null');
let CATS = [];
const charts = {};
const STATUS_CN = { pending:'待付款', paid:'已付款', shipped:'已发货', completed:'已完成', cancelled:'已取消', refunded:'已退款' };

async function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } };
  if (TOKEN) opt.headers.authorization = 'Bearer ' + TOKEN;
  if (body) opt.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opt);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    // token 失效（如服务重启/换库后旧 token 失效）时，自动清理并回到登录页，避免页面卡死
    if (r.status === 401 && !path.includes('/auth/')) {
      TOKEN = ''; ADMIN = null;
      localStorage.removeItem('a_token'); localStorage.removeItem('a_user');
      if ($('#loginView')) { showLogin(); }
    }
    throw new Error(data.error || ('错误 ' + r.status));
  }
  return data;
}
function toast(m){const t=$('#toast');t.textContent=m;t.classList.remove('hide');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.add('hide'),1800);}
function money(n){return '¥'+(Number(n)||0).toFixed(2);}
function openModal(html){$('#modalBox').innerHTML=html;$('#modal').classList.remove('hide');}
function closeModal(){$('#modal').classList.add('hide');}
window.closeModal=closeModal;

// ---------- 启动 ----------
if (TOKEN) boot(); else showLogin();
function showLogin(){ $('#loginView').classList.remove('hide'); $('#adminView').classList.add('hide');
  $('#loginForm').onsubmit = async (e)=>{ e.preventDefault();
    try{ const d=await api('POST','/auth/admin/login',{username:$('#aUser').value,password:$('#aPass').value});
      TOKEN=d.token;ADMIN=d.admin;localStorage.setItem('a_token',TOKEN);localStorage.setItem('a_user',JSON.stringify(ADMIN));boot();
    }catch(err){toast(err.message);} };
}
function boot(){ $('#loginView').classList.add('hide'); $('#adminView').classList.remove('hide');
  $('#sideUser').textContent=ADMIN.username;
  $('#btnLogout').onclick=()=>{TOKEN='';ADMIN=null;localStorage.clear();location.reload();};
  $$('.side nav a').forEach(a=>a.onclick=()=>{$$('.side nav a').forEach(x=>x.classList.remove('active'));a.classList.add('active');renderTab(a.dataset.tab);});
  renderTab('dashboard');
}
async function ensureCats(){ if(!CATS.length){const d=await api('GET','/products/categories/list');CATS=d.items;} return CATS; }

function renderTab(tab){
  const v=$('#view');
  if(tab==='dashboard')return renderDashboard();
  if(tab==='products')return renderProducts();
  if(tab==='orders')return renderOrders();
  if(tab==='customers')return renderCustomers();
  if(tab==='inventory')return renderInventory();
  if(tab==='settings')return renderSettings();
}

// Chart.js 按需动态加载（离线时图表不渲染，但不影响后台其它功能）
let chartLoading=null;
function loadChart(){
  if(window.Chart)return Promise.resolve();
  if(chartLoading)return chartLoading;
  chartLoading=new Promise((res)=>{const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
    s.onload=res;s.onerror=()=>{console.warn('Chart.js 加载失败(可能离线)');res();};
    document.head.appendChild(s);});
  return chartLoading;
}

// ---------- 仪表盘 ----------
async function renderDashboard(){
  await loadChart();
  const d=await api('GET','/stats/dashboard');
  $('#view').innerHTML=`
    <div class="cards">
      <div class="card"><div class="t">总销售额</div><div class="n brand">${money(d.totals.revenue)}</div></div>
      <div class="card"><div class="t">订单总数</div><div class="n">${d.totals.total_orders}</div></div>
      <div class="card"><div class="t">注册客户</div><div class="n">${d.totals.total_customers}</div></div>
      <div class="card"><div class="t">在售商品</div><div class="n">${d.totals.on_sale_products}</div></div>
    </div>
    <div class="charts">
      <div class="chart-box"><h3>近 14 天销售趋势</h3><canvas id="trendChart"></canvas></div>
      <div class="chart-box"><h3>分类销售占比</h3><canvas id="catChart"></canvas></div>
    </div>
    <div class="panel"><h3>低库存预警（${d.lowStock.length}）</h3>
      ${d.lowStock.length?`<table><tr><th>商品</th><th>当前库存</th><th>预警线</th></tr>${d.lowStock.map(s=>`<tr><td>${s.name}</td><td style="color:var(--brand)">${s.quantity}</td><td>${s.warn_threshold}</td></tr>`).join('')}</table>`:'<div class="empty">暂无预警</div>'}
    </div>
    <div class="panel"><h3>近期订单</h3>
      ${d.recent.length?`<table><tr><th>订单号</th><th>客户</th><th>金额</th><th>状态</th></tr>${d.recent.map(o=>`<tr><td>${o.order_no}</td><td>${o.phone||o.name||'游客'}</td><td>${money(o.total_amount)}</td><td><span class="tag ${o.status}">${STATUS_CN[o.status]}</span></td></tr>`).join('')}</table>`:'<div class="empty">暂无订单</div>'}
    </div>`;
  drawTrend(d.trend); drawCat(d.categorySales);
}
function drawTrend(trend){
  if(charts.trend)charts.trend.destroy();
  const ctx=$('#trendChart');if(!ctx||!window.Chart)return;
  charts.trend=new Chart(ctx,{
    type:'line',
    data:{labels:trend.map(t=>t.date),datasets:[
      {label:'销售额',data:trend.map(t=>t.revenue),borderColor:'#ff5000',backgroundColor:'rgba(255,80,0,.1)',fill:true,tension:.3},
      {label:'订单数',data:trend.map(t=>t.orders),borderColor:'#1668dc',yAxisID:'y1',tension:.3}
    ]},
    options:{
      responsive:true,
      interaction:{mode:'index',intersect:false},
      scales:{ y:{position:'left'}, y1:{position:'right',grid:{drawOnChartArea:false}} }
    }
  });
}
function drawCat(cat){
  if(charts.cat)charts.cat.destroy();
  const ctx=$('#catChart');if(!ctx||!window.Chart)return;
  charts.cat=new Chart(ctx,{type:'doughnut',data:{labels:cat.map(c=>c.name),datasets:[{data:cat.map(c=>c.revenue),backgroundColor:['#ff5000','#1668dc','#07c160','#fa8c16','#722ed1','#13c2c2']}]},options:{responsive:true}});
}

// ---------- 商品管理 ----------
async function renderProducts(page=1){
  await ensureCats();
  const d=await api('GET',`/products?page=${page}&pageSize=10&status=all`);
  const rows=d.items.map(p=>`<tr>
    <td><img class="img-sm" src="${p.image_url||''}" onerror="this.style.display='none'"></td>
    <td>${p.name}</td><td>${p.category_name||'未分类'}</td>
    <td>${money(p.price)}</td><td>${p.stock}</td>
    <td><span class="tag ${p.status}">${p.status==='on'?'在售':'下架'}</span></td>
    <td class="row">
      <button class="btn sm" onclick="editProduct(${p.id})">编辑</button>
      <button class="btn sm ghost" onclick="toggleProd(${p.id},'${p.status}')">${p.status==='on'?'下架':'上架'}</button>
      <button class="btn sm" style="background:#ff4d4f" onclick="delProduct(${p.id})">删除</button>
    </td></tr>`).join('');
  $('#view').innerHTML=`<div class="panel"><h3>商品管理 <button class="btn sm" onclick="editProduct(0)">+ 新增商品</button></h3>
    <table><tr><th></th><th>名称</th><th>分类</th><th>价格</th><th>库存</th><th>状态</th><th>操作</th></tr>${rows}</table>
    <div class="pagination"><span>共 ${d.total} 条</span><button class="btn sm ghost" ${page<=1?'disabled':''} onclick="renderProducts(${page-1})">上一页</button><button class="btn sm ghost" ${page*10>=d.total?'disabled':''} onclick="renderProducts(${page+1})">下一页</button></div>
  </div>`;
}
window.renderProducts=renderProducts;
async function editProduct(id){
  await ensureCats();
  let p={name:'',category_id:'',price:'',image_url:'',description:'',stock:0,status:'on'};
  if(id){p=await api('GET','/products/'+id);p.price=(p.price/100).toFixed(2);p.stock=(await api('GET','/products/'+id)).stock;}
  openModal(`<h3>${id?'编辑':'新增'}商品</h3>
    <div class="field"><label>名称</label><input id="p_name" value="${p.name||''}"></div>
    <div class="field"><label>分类</label><select id="p_cat">${CATS.map(c=>`<option value="${c.id}" ${p.category_id==c.id?'selected':''}>${c.name}</option>`).join('')}</select></div>
    <div class="field"><label>价格(元)</label><input id="p_price" type="number" step="0.01" value="${p.price||''}"></div>
    <div class="field"><label>库存</label><input id="p_stock" type="number" value="${p.stock||0}"></div>
    <div class="field"><label>图片URL</label><input id="p_img" value="${p.image_url||''}" placeholder="https://..."></div>
    <div class="field"><label>描述</label><textarea id="p_desc" rows="2">${p.description||''}</textarea></div>
    <div class="field"><label>状态</label><select id="p_status"><option value="on" ${p.status==='on'?'selected':''}>在售</option><option value="off" ${p.status==='off'?'selected':''}>下架</option></select></div>
    <button class="btn block" id="p_save">保存</button>`);
  $('#p_save').onclick=async()=>{const body={name:$('#p_name').value,category_id:$('#p_cat').value,price:$('#p_price').value,stock:+$('#p_stock').value,image_url:$('#p_img').value,description:$('#p_desc').value,status:$('#p_status').value};
    try{ if(id)await api('PUT','/products/'+id,body);else await api('POST','/products',body);toast('已保存');closeModal();renderProducts(); }catch(e){toast(e.message);} };
}
window.editProduct=editProduct;
window.toggleProd=async(id,st)=>{try{await api('PUT','/products/'+id,{status:st==='on'?'off':'on'});renderProducts();}catch(e){toast(e.message);}};
window.delProduct=async(id)=>{if(!confirm('确定删除该商品？'))return;try{await api('DELETE','/products/'+id);toast('已删除');renderProducts();}catch(e){toast(e.message);}};

// ---------- 订单管理 ----------
async function renderOrders(page=1,status=''){
  const qs=new URLSearchParams({page,pageSize:10});if(status)qs.set('status',status);
  const d=await api('GET','/orders?'+qs.toString());
  const opts=['','pending','paid','shipped','completed','cancelled','refunded'].map(s=>`<option value="${s}" ${status===s?'selected':''}>${s?STATUS_CN[s]:'全部'}</option>`).join('');
  const rows=d.items.map(o=>`<tr>
    <td>${o.order_no}<br><small style="color:var(--muted)">${o.receiver_name||''} ${o.receiver_phone||''}</small></td>
    <td>${money(o.total_amount)}</td><td><span class="tag ${o.status}">${STATUS_CN[o.status]}</span></td>
    <td class="row"><button class="btn sm" onclick="orderDetail(${o.id})">详情</button>${orderActions(o)}</td></tr>`).join('');
  $('#view').innerHTML=`<div class="panel"><h3>订单管理
      <select id="oStatus" class="spacer" style="width:auto;margin-left:12px">${opts}</select></h3>
    <table><tr><th>订单/收货人</th><th>金额</th><th>状态</th><th>操作</th></tr>${rows}</table>
    <div class="pagination"><span>共 ${d.total} 条</span><button class="btn sm ghost" ${page<=1?'disabled':''} onclick="renderOrders(${page-1},'${status}')">上一页</button><button class="btn sm ghost" ${page*10>=d.total?'disabled':''} onclick="renderOrders(${page+1},'${status}')">下一页</button></div>
  </div>`;
  $('#oStatus').onchange=()=>renderOrders(1,$('#oStatus').value);
}
window.renderOrders=renderOrders;
function orderActions(o){
  const b=[];
  if(o.status==='paid')b.push(`<button class="btn sm" onclick="setStatus(${o.id},'shipped')">发货</button>`);
  if(o.status==='shipped')b.push(`<button class="btn sm" onclick="setStatus(${o.id},'completed')">完成</button>`);
  if(o.status==='pending')b.push(`<button class="btn sm ghost" onclick="setStatus(${o.id},'cancelled')">取消</button>`);
  if(o.status==='paid'||o.status==='shipped')b.push(`<button class="btn sm" style="background:#fa8c16" onclick="refundOrder(${o.id})">退款</button>`);
  return b.join('');
}
window.setStatus=async(id,st)=>{try{await api('PUT',`/orders/${id}/status`,{status:st});toast('已更新');renderOrders();}catch(e){toast(e.message);}};
window.refundOrder=async(id)=>{if(!confirm('确认退款？将恢复库存'))return;try{await api('POST',`/orders/${id}/refund`);toast('已退款');renderOrders();}catch(e){toast(e.message);}};
window.orderDetail=async(id)=>{const o=await api('GET','/orders/'+id);
  openModal(`<h3>订单详情</h3>
    <p>订单号：${o.order_no}</p><p>状态：<span class="tag ${o.status}">${STATUS_CN[o.status]}</span></p>
    <p>收货：${o.receiver_name} ${o.receiver_phone}</p><p>地址：${o.address||'-'}</p>
    <table><tr><th>商品</th><th>单价</th><th>数量</th><th>小计</th></tr>
    ${o.items.map(i=>`<tr><td>${i.name}</td><td>${money(i.price/100)}</td><td>${i.quantity}</td><td>${money(i.subtotal/100)}</td></tr>`).join('')}</table>
    <p style="text-align:right;margin-top:8px">合计 <b style="color:var(--brand)">${money(o.total_amount)}</b></p>`);
};

// ---------- 客户管理 ----------
async function renderCustomers(page=1,keyword='',level=''){
  const qs=new URLSearchParams({page,pageSize:10});if(keyword)qs.set('keyword',keyword);if(level)qs.set('level',level);
  const d=await api('GET','/customers?'+qs.toString());
  const rows=d.items.map(c=>`<tr><td>${c.phone}<br><small style="color:var(--muted)">${c.name||''}</small></td>
    <td>${money(c.accumulated_spent)}</td><td>${c.order_count}</td>
    <td><span class="tag ${c.level}">${{normal:'普通',vip:'VIP',svip:'SVIP'}[c.level]||c.level}</span></td>
    <td class="row"><button class="btn sm" onclick="editCustomer(${c.id})">编辑</button></td></tr>`).join('');
  $('#view').innerHTML=`<div class="panel"><h3>客户管理
      <input id="cKw" placeholder="搜索手机/昵称" value="${keyword}" style="width:160px;margin-left:8px">
      <select id="cLevel" style="width:auto"><option value="">全部等级</option><option value="normal" ${level==='normal'?'selected':''}>普通</option><option value="vip" ${level==='vip'?'selected':''}>VIP</option><option value="svip" ${level==='svip'?'selected':''}>SVIP</option></select>
      <button class="btn sm" onclick="searchCust()">搜索</button></h3>
    <table><tr><th>手机/昵称</th><th>累计消费</th><th>订单数</th><th>等级</th><th>操作</th></tr>${rows}</table>
    <div class="pagination"><span>共 ${d.total} 条</span><button class="btn sm ghost" ${page<=1?'disabled':''} onclick="renderCustomers(${page-1},'${keyword}','${level}')">上一页</button><button class="btn sm ghost" ${page*10>=d.total?'disabled':''} onclick="renderCustomers(${page+1},'${keyword}','${level}')">下一页</button></div>
  </div>`;
}
window.renderCustomers=renderCustomers;
window.searchCust=()=>renderCustomers(1,$('#cKw').value,$('#cLevel').value);
window.editCustomer=async(id)=>{const c=await api('GET','/customers/'+id);
  openModal(`<h3>编辑客户</h3>
    <div class="field"><label>等级</label><select id="cl"><option value="normal" ${c.level==='normal'?'selected':''}>普通</option><option value="vip" ${c.level==='vip'?'selected':''}>VIP</option><option value="svip" ${c.level==='svip'?'selected':''}>SVIP</option></select></div>
    <div class="field"><label>标签(逗号分隔)</label><input id="ct" value="${c.tags||''}"></div>
    <div class="field"><label>备注</label><textarea id="cn" rows="2">${c.note||''}</textarea></div>
    <button class="btn block" id="cs">保存</button>`);
  $('#cs').onclick=async()=>{try{await api('PUT','/customers/'+id,{level:$('#cl').value,tags:$('#ct').value,note:$('#cn').value});toast('已保存');closeModal();renderCustomers();}catch(e){toast(e.message);}};
};

// ---------- 库存管理 ----------
async function renderInventory(){
  const d=await api('GET','/inventory');
  $('#view').innerHTML=`<div class="panel"><h3>库存管理</h3>
    <table><tr><th>商品</th><th>当前库存</th><th>预警线</th><th>调整</th></tr>
    ${d.items.map(i=>`<tr><td>${i.name}</td>
      <td style="color:${i.low_stock?'var(--brand)':''}">${i.quantity}</td>
      <td><input id="wt_${i.id}" value="${i.warn_threshold}" style="width:70px"></td>
      <td class="row">
        <button class="btn sm ghost" onclick="adjInv(${i.id},-1)">-1</button>
        <button class="btn sm ghost" onclick="adjInv(${i.id},1)">+1</button>
        <button class="btn sm" onclick="setInv(${i.id})">设值</button>
      </td></tr>`).join('')}</table></div>`;
}
window.renderInventory=renderInventory;
window.adjInv=async(id,d)=>{try{await api('PUT',`/inventory/${id}`,{delta:d});renderInventory();}catch(e){toast(e.message);}};
window.setInv=async(id)=>{const q=prompt('设置库存为：');if(q===null)return;try{await api('PUT',`/inventory/${id}`,{quantity:+q});renderInventory();}catch(e){toast(e.message);}};

// ---------- 店铺设置 ----------
async function renderSettings(){
  const s=await api('GET','/settings');
  $('#view').innerHTML=`<div class="panel" style="max-width:560px"><h3>店铺设置</h3>
    <div class="field"><label>店铺名称</label><input id="s_name" value="${s.shop_name||''}"></div>
    <div class="field"><label>公告</label><textarea id="s_ann" rows="2">${s.announcement||''}</textarea></div>
    <div class="field"><label>联系手机</label><input id="s_tel" value="${s.contact_phone||''}"></div>
    <div class="field"><label>支付模式</label><select id="s_pay"><option value="mock" ${s.payment_method==='mock'?'selected':''}>模拟支付(演示)</option><option value="stripe" ${s.payment_method==='stripe'?'selected':''}>Stripe</option><option value="wechat" ${s.payment_method==='wechat'?'selected':''}>微信支付</option><option value="alipay" ${s.payment_method==='alipay'?'selected':''}>支付宝</option></select></div>
    <button class="btn block" id="s_save">保存设置</button></div>`;
  $('#s_save').onclick=async()=>{try{await api('PUT','/settings',{shop_name:$('#s_name').value,announcement:$('#s_ann').value,contact_phone:$('#s_tel').value,payment_method:$('#s_pay').value});toast('已保存');}catch(e){toast(e.message);}};
}
