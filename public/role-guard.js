// role-guard.js —— 前端基于角色的路由与权限控制（顾客 user / 商家 admin）
// 职责：在 UI 层按角色引导用户进入正确端口；真正的权限仍由后端 JWT authGuard 强制校验。
// 两端令牌键名：顾客端 c_token / c_user，商家端 a_token / a_user。

// 解码 JWT payload（仅前端 UI 用，不做签名校验；后端才是权威）
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string' || token.split('.').length !== 3) return null;
  try {
    const seg = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(window.atob(seg)));
    return JSON.parse(json);
  } catch { return null; }
}

// 读取某令牌键名对应的角色
function getRoleByKey(tokenKey) {
  const t = localStorage.getItem(tokenKey);
  const p = decodeJwtPayload(t);
  return p && p.role ? p.role : null;
}

// 角色冲突提示：当前持有一个与端口不符的账号，引导跳转正确端口
function showRoleConflict(roleName, targetUrl) {
  const box = document.getElementById('roleConflict');
  if (box) {
    box.innerHTML = '检测到您当前登录的是 <b>' + roleName + '账号</b>，无法进入当前端口。正在为您跳转至' + roleName + '端…';
    box.classList.remove('hide');
  }
  setTimeout(function () { location.href = targetUrl; }, 1800);
}

// 顾客端守卫：只允许 user 角色
// 若发现持有商家(admin)令牌 —— 误扫了商家码 —— 提示并跳转 /admin
function enforceCustomer() {
  if (getRoleByKey('a_token') === 'admin') { showRoleConflict('商家', '/admin'); return false; }
  // 顾客令牌损坏（非 user）则清理，回到登录态
  if (localStorage.getItem('c_token') && getRoleByKey('c_token') !== 'user') {
    localStorage.removeItem('c_token'); localStorage.removeItem('c_user');
  }
  return true;
}

// 商家端守卫：只允许 admin 角色
// 若发现持有顾客(user)令牌 —— 误扫了顾客码 —— 提示无法进入并给出顾客端入口
function enforceMerchant() {
  if (getRoleByKey('c_token') === 'user') { showRoleConflict('顾客', '/'); return false; }
  // 商家令牌损坏（非 admin）则清理，回到登录态
  if (localStorage.getItem('a_token') && getRoleByKey('a_token') !== 'admin') {
    localStorage.removeItem('a_token'); localStorage.removeItem('a_user');
  }
  return true;
}

window.RoleGuard = {
  decodeJwtPayload: decodeJwtPayload,
  getRoleByKey: getRoleByKey,
  enforceCustomer: enforceCustomer,
  enforceMerchant: enforceMerchant,
  showRoleConflict: showRoleConflict
};
