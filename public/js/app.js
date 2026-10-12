/**
 * Mamy One – Complete Nursery Management System
 * Core Client-side SPA Application Logic
 */

// Application State
const state = {
  token: localStorage.getItem('mamy_token') || null,
  user: null,
  currentPage: 'dashboard',
  settings: null,
  notifications: [],
  unreadNotifs: 0
};

// API Helper
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(endpoint, {
      ...options,
      headers
    });
    const data = await res.json();
    if (res.status === 401 && !endpoint.includes('/api/auth/login')) {
      logout();
      showToast('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً', 'warning');
      return null;
    }
    return data;
  } catch (err) {
    console.error('API Error:', err);
    showToast('تعذر الاتصال بالخادم: ' + err.message, 'error');
    return null;
  }
}

// Arabic Currency Formatter
function formatEGP(amount) {
  const num = Number(amount) || 0;
  return num.toLocaleString('ar-EG', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ج.م';
}

// Age Calculator from Date of Birth (Arabic String: X سنة و Y شهر)
function calculateAge(dobStr) {
  if (!dobStr) return 'غير محدد';
  const dob = new Date(dobStr);
  const now = new Date();
  if (isNaN(dob.getTime())) return 'غير محدد';

  let years = now.getFullYear() - dob.getFullYear();
  let months = now.getMonth() - dob.getMonth();
  let days = now.getDate() - dob.getDate();

  if (days < 0) {
    months--;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0 && months === 0) return 'أقل من شهر';
  if (years === 0) return `${months} شهور`;
  if (months === 0) return `${years} سنوات`;
  return `${years} سنوات و ${months} شهور`;
}

// Arabic Classification Badges
function getClassificationBadge(type) {
  switch (type) {
    case 'speech_therapy':
      return '<span class="badge badge-purple">🗣️ تخاطب ونطق</span>';
    case 'learning_difficulties':
      return '<span class="badge badge-warning">🧠 صعوبات تعلم</span>';
    case 'regular':
    default:
      return '<span class="badge badge-primary">⭐ طفل طبيعي</span>';
  }
}

// Arabic Status Badges
function getStatusBadge(status) {
  switch (status) {
    case 'active':
      return '<span class="badge badge-success">نشط ومنتظم</span>';
    case 'withdrawn':
      return '<span class="badge badge-danger">منسحب</span>';
    case 'suspended':
      return '<span class="badge badge-warning">موقوف مؤقتاً</span>';
    case 'paid':
      return '<span class="badge badge-success">مسدد بالكامل</span>';
    case 'partially_paid':
      return '<span class="badge badge-warning">مسدد جزئياً</span>';
    case 'unpaid':
      return '<span class="badge badge-danger">غير مسدد</span>';
    case 'refunded':
      return '<span class="badge badge-secondary">مسترد / ملغى</span>';
    default:
      return `<span class="badge badge-secondary">${status}</span>`;
  }
}

// Toast Notifications
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    success: 'bg-emerald-600',
    error: 'bg-rose-600',
    warning: 'bg-amber-600',
    info: 'bg-sky-600'
  };
  const icons = {
    success: '✓',
    error: '✕',
    warning: '⚠️',
    info: 'ℹ'
  };

  toast.className = `toast ${bgColors[type] || 'bg-slate-800'}`;
  toast.innerHTML = `<span>${icons[type] || '•'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeJsString(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

// Modal Manager
function openModal(title, contentHtml, onReady) {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay active" id="current-modal-overlay">
      <div class="modal-content">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 class="font-bold text-slate-900 text-base">${title}</h3>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition">✕</button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[75vh]">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;

  // Close on outside click
  document.getElementById('current-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'current-modal-overlay') closeModal();
  });

  if (typeof onReady === 'function') onReady();
}

function openLargeModal(title, contentHtml, onReady) {
  const container = document.getElementById('modal-container');
  container.innerHTML = `
    <div class="modal-overlay active" id="current-modal-overlay">
      <div class="modal-content modal-content-lg">
        <div class="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h3 class="font-bold text-slate-900 text-base">${title}</h3>
          <button onclick="closeModal()" class="w-8 h-8 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition">✕</button>
        </div>
        <div class="p-6 overflow-y-auto max-h-[82vh]">
          ${contentHtml}
        </div>
      </div>
    </div>
  `;

  document.getElementById('current-modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'current-modal-overlay') closeModal();
  });

  if (typeof onReady === 'function') onReady();
}

function closeModal() {
  const container = document.getElementById('modal-container');
  container.innerHTML = '';
}

// Live Cairo Clock
function updateCairoClock() {
  const clockEl = document.getElementById('live-cairo-clock');
  const dateEl = document.getElementById('today-cairo-date');
  if (!clockEl || !dateEl) return;

  const now = new Date();
  const timeFormatter = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
  const dateFormatter = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  clockEl.textContent = timeFormatter.format(now);
  dateEl.textContent = dateFormatter.format(now);
}
setInterval(updateCairoClock, 1000);
updateCairoClock();

// Authentication Handling
async function checkAuth() {
  if (!state.token) {
    showLoginModal();
    return false;
  }

  const res = await api('/api/auth/me');
  if (res && res.success) {
    state.user = res.user;
    updateUserHeader();
    loadNotifications();
    return true;
  } else {
    logout();
    return false;
  }
}

function updateUserHeader() {
  if (!state.user) return;
  const nameEl = document.getElementById('user-display-name');
  const roleEl = document.getElementById('user-display-role');
  const avatarEl = document.getElementById('user-avatar-letter');

  if (nameEl) nameEl.textContent = state.user.full_name;
  if (roleEl) roleEl.textContent = state.user.role === 'admin' ? 'مدير عام' : (state.user.role === 'accountant' ? 'مسؤول مالي' : 'معلمة / أخصائية');
  if (avatarEl) avatarEl.textContent = (state.user.full_name || 'م').charAt(0);
}

function showLoginModal() {
  const content = `
    <div class="flex flex-col items-center text-center mb-6">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-teal-400 flex items-center justify-center text-white text-3xl shadow-lg shadow-teal-500/30 mb-3">
        🧸
      </div>
      <h2 class="text-xl font-bold text-slate-900">حضانة Mamy One</h2>
      <p class="text-xs text-slate-500 mt-1">يرجى تسجيل الدخول للوصول إلى لوحة التحكم والبيانات</p>
    </div>

    <form id="login-form" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">اسم المستخدم</label>
        <input type="text" id="login-username" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none" placeholder="admin">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور</label>
        <input type="password" id="login-password" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-teal-500 focus:ring-2 focus:ring-teal-100 outline-none" placeholder="••••••••">
      </div>
      <button type="submit" class="btn btn-primary w-full py-2.5 text-sm font-bold shadow-md shadow-teal-500/20">
        تسجيل الدخول
      </button>
    </form>

    <div class="mt-4 pt-4 border-t border-slate-100 text-center">
      <button id="btn-quick-fill-admin" class="text-xs text-teal-600 hover:underline font-semibold">
        💡 تعبئة بيانات الدخول الافتراضية (admin / admin123)
      </button>
    </div>
  `;

  openModal('تسجيل الدخول للنظام', content, () => {
    document.getElementById('btn-quick-fill-admin').addEventListener('click', () => {
      document.getElementById('login-username').value = 'admin';
      document.getElementById('login-password').value = 'admin123';
    });

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('login-username').value.trim();
      const password = document.getElementById('login-password').value;

      const res = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });

      if (res && res.success) {
        state.token = res.token;
        state.user = res.user;
        localStorage.setItem('mamy_token', res.token);
        closeModal();
        updateUserHeader();
        showToast('مرحباً بك في نظام مامي وان', 'success');
        navigateTo(state.currentPage);
      } else {
        showToast(res ? res.error : 'فشل تسجيل الدخول', 'error');
      }
    });
  });
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('mamy_token');
  showLoginModal();
}

// Notifications Loader
async function loadNotifications() {
  const res = await api('/api/notifications');
  if (res && res.success) {
    state.notifications = res.notifications;
    state.unreadNotifs = res.unreadCount;

    const badge = document.getElementById('notif-badge');
    if (badge) {
      if (res.unreadCount > 0) {
        badge.textContent = res.unreadCount;
        badge.classList.remove('hidden');
        badge.classList.add('flex');
      } else {
        badge.classList.add('hidden');
        badge.classList.remove('flex');
      }
    }

    const list = document.getElementById('notif-list');
    if (list) {
      if (res.notifications.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-slate-400">لا توجد إشعارات جديدة</div>';
      } else {
        list.innerHTML = res.notifications.map(n => `
          <div class="p-3 hover:bg-slate-50 transition ${n.is_read ? 'opacity-60' : 'bg-teal-50/30'}">
            <div class="font-bold text-slate-800">${n.title}</div>
            <div class="text-slate-500 text-[11px] mt-0.5">${n.message}</div>
            <div class="text-[10px] text-slate-400 mt-1">${n.created_at}</div>
          </div>
        `).join('');
      }
    }
  }
}

// Page Navigation Routing
function navigateTo(page) {
  state.currentPage = page;

  // Update sidebar active classes
  document.querySelectorAll('.nav-item').forEach(btn => {
    if (btn.dataset.page === page) {
      btn.className = 'nav-item active flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-teal-700 bg-teal-50 transition';
    } else {
      btn.className = 'nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-teal-600 transition';
    }
  });

  const main = document.getElementById('app-content');
  if (!main) return;

  switch (page) {
    case 'dashboard':
      renderDashboard(main);
      break;
    case 'students':
      renderStudents(main);
      break;
    case 'payments':
      renderPayments(main);
      break;
    case 'outstanding':
      renderOutstanding(main);
      break;
    case 'expenses':
      renderExpenses(main);
      break;
    case 'payroll':
      renderPayroll(main);
      break;
    case 'attendance':
      renderAttendance(main);
      break;
    case 'sessions':
      renderSessions(main);
      break;
    case 'reports':
      renderReports(main);
      break;
    case 'audit':
      renderAudit(main);
      break;
    case 'settings':
      renderSettings(main);
      break;
    default:
      renderDashboard(main);
  }
}

// ============================================================================
// PAGE 1: DASHBOARD
// ============================================================================
async function renderDashboard(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل بيانات لوحة التحكم...</div>';

  const res = await api('/api/dashboard/stats');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل الإحصائيات</div>';
    return;
  }

  const s = res.stats;

  container.innerHTML = `
    <!-- Top Welcome Banner -->
    <div class="bg-gradient-to-r from-teal-700 via-teal-600 to-teal-800 rounded-3xl p-6 text-white shadow-lg shadow-teal-700/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2">
          <span class="text-2xl">👋</span>
          <h2 class="text-xl font-bold">أهلاً بك، ${state.user ? state.user.full_name : 'مدير النظام'}</h2>
        </div>
        <p class="text-teal-100 text-xs mt-1">مرحباً بك في لوحة تحكم وإدارة حضانة Mamy One – كافة العمليات والإحصائيات محدثة لحظياً بتوقيت القاهرة.</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-dash-add-student" class="btn bg-white text-teal-800 hover:bg-teal-50 text-xs font-bold shadow-sm">
          <span>+</span> <span>إضافة طفل</span>
        </button>
        <button id="btn-dash-add-payment" class="btn bg-teal-500 text-white hover:bg-teal-400 text-xs font-bold shadow-sm">
          <span>💵</span> <span>تسجيل دفعة</span>
        </button>
      </div>
    </div>

    <!-- 1. STUDENTS STATISTICS CARDS -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
          <span>👶</span> <span>إحصائيات الأطفال والانتظام</span>
        </h3>
        <span class="text-xs text-slate-400">مسجلين جدد هذا الشهر: <strong class="text-teal-600 font-bold">${s.newRegisteredThisMonth}</strong></span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        
        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">إجمالي المسجلين</div>
          <div class="text-2xl font-black text-slate-800 mt-1">${s.totalStudents}</div>
          <div class="text-[10px] text-teal-600 mt-0.5">في النظام</div>
        </div>

        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">الأطفال النشطون</div>
          <div class="text-2xl font-black text-emerald-600 mt-1">${s.activeStudents}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">منتظمين حالياً</div>
        </div>

        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">الأطفال الطبيعيون</div>
          <div class="text-2xl font-black text-teal-600 mt-1">${s.classifications.regular}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">تعليم مبكر</div>
        </div>

        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">صعوبات تعلم</div>
          <div class="text-2xl font-black text-amber-600 mt-1">${s.classifications.learningDifficulties}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">برامج دعم</div>
        </div>

        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">جلسات تخاطب</div>
          <div class="text-2xl font-black text-purple-600 mt-1">${s.classifications.speechTherapy}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">نطق وتأهيل</div>
        </div>

        <div class="card p-3.5 bg-white border-slate-200/80">
          <div class="text-xs text-slate-500 font-medium">منسحبون</div>
          <div class="text-2xl font-black text-rose-500 mt-1">${s.withdrawnStudents}</div>
          <div class="text-[10px] text-slate-400 mt-0.5">أرشيف محفوظ</div>
        </div>

      </div>
    </div>

    <!-- 2. ATTENDANCE & FINANCIAL SUMMARY ROW -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

      <!-- Today's Attendance Box -->
      <div class="card p-5 bg-white">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-bold text-sm text-slate-800 flex items-center gap-2">
            <span>📅</span> <span>حضور اليوم</span>
          </h4>
          <button onclick="navigateTo('attendance')" class="text-xs text-teal-600 hover:underline font-semibold">تسجيل الحضور</button>
        </div>

        <div class="grid grid-cols-2 gap-3 mb-4">
          <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 text-center">
            <span class="text-xs text-emerald-700 font-bold">حاضر</span>
            <div class="text-2xl font-black text-emerald-800 mt-0.5">${s.attendanceToday.present}</div>
          </div>
          <div class="bg-rose-50 border border-rose-100 rounded-2xl p-3 text-center">
            <span class="text-xs text-rose-700 font-bold">غائب</span>
            <div class="text-2xl font-black text-rose-800 mt-0.5">${s.attendanceToday.absent}</div>
          </div>
          <div class="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
            <span class="text-xs text-amber-700 font-bold">متأخر</span>
            <div class="text-xl font-black text-amber-800 mt-0.5">${s.attendanceToday.late}</div>
          </div>
          <div class="bg-sky-50 border border-sky-100 rounded-2xl p-3 text-center">
            <span class="text-xs text-sky-700 font-bold">بعذر</span>
            <div class="text-xl font-black text-sky-800 mt-0.5">${s.attendanceToday.excused}</div>
          </div>
        </div>

        <div class="text-xs text-slate-500 flex justify-between items-center pt-3 border-t border-slate-100">
          <span>إجمالي حضور اليوم المسجل:</span>
          <span class="font-bold text-slate-800">${s.attendanceToday.total} طفل</span>
        </div>
      </div>

      <!-- Financial Statistics (2 columns span) -->
      <div class="card p-5 bg-white lg:col-span-2">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-bold text-sm text-slate-800 flex items-center gap-2">
            <span>💰</span> <span>المؤشرات المالية لشهر (${new Date().toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })})</span>
          </h4>
          <span class="badge badge-primary font-bold">نسبة التحصيل: ${s.finances.collectionPercentage}%</span>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          
          <div class="p-3.5 rounded-2xl bg-teal-50 border border-teal-100">
            <div class="text-xs text-teal-700 font-semibold">المقبوضات المحصلة</div>
            <div class="text-xl font-black text-teal-900 mt-1">${formatEGP(s.finances.monthPayments)}</div>
            <div class="text-[10px] text-teal-600 mt-0.5">منها رسوم إضافية: ${formatEGP(s.finances.monthAdditionalPayments)}</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-rose-50 border border-rose-100">
            <div class="text-xs text-rose-700 font-semibold">المصروفات المدفوعة</div>
            <div class="text-xl font-black text-rose-900 mt-1">${formatEGP(s.finances.monthExpensesPaid)}</div>
            <div class="text-[10px] text-rose-600 mt-0.5">تدفقات نقدية خارجة</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-sky-50 border border-sky-100">
            <div class="text-xs text-sky-700 font-semibold">صافي التدفق النقدي</div>
            <div class="text-xl font-black ${s.finances.netCashFlow >= 0 ? 'text-sky-900' : 'text-rose-900'} mt-1">${formatEGP(s.finances.netCashFlow)}</div>
            <div class="text-[10px] text-sky-600 mt-0.5">فارق المقبوضات - المصروفات</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
            <div class="text-xs text-amber-700 font-semibold">المتأخرات المستحقة</div>
            <div class="text-xl font-black text-amber-900 mt-1">${formatEGP(s.finances.totalOutstandingFees)}</div>
            <div class="text-[10px] text-amber-600 mt-0.5">تجاوزت الموعد: ${formatEGP(s.finances.overdueBalance)}</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-purple-50 border border-purple-100">
            <div class="text-xs text-purple-700 font-semibold">التزامات رواتب معلقة</div>
            <div class="text-xl font-black text-purple-900 mt-1">${formatEGP(s.finances.unpaidSalaryObligations)}</div>
            <div class="text-[10px] text-purple-600 mt-0.5">مستحقة للموظفين</div>
          </div>

          <div class="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
            <div class="text-xs text-slate-600 font-semibold">إجمالي الرسوم المتوقعة</div>
            <div class="text-xl font-black text-slate-800 mt-1">${formatEGP(s.finances.monthExpectedCharges)}</div>
            <div class="text-[10px] text-slate-500 mt-0.5">مطالبات الشهر</div>
          </div>

        </div>

        <div class="flex items-center justify-between text-xs pt-3 border-t border-slate-100">
          <button onclick="navigateTo('reports')" class="text-teal-600 font-bold hover:underline">عرض التقرير المالي المفصل وتدفقات الخزينة ←</button>
          <button onclick="navigateTo('outstanding')" class="text-amber-600 font-bold hover:underline">متابعة المتأخرات وتذكير أولياء الأمور ←</button>
        </div>
      </div>

    </div>

    <!-- 3. ALERTS & RECENT ACTIVITY TABLES -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

      <!-- Overdue Fees Urgent List -->
      <div class="card p-5 bg-white">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-bold text-sm text-slate-800 flex items-center gap-2">
            <span>⚠️</span> <span>متأخرات عاجلة بحاجة لمتابعة</span>
          </h4>
          <button onclick="navigateTo('outstanding')" class="text-xs text-teal-600 hover:underline">عرض الكل</button>
        </div>

        ${s.overdueStudentsList.length === 0 ? `
          <div class="py-8 text-center text-slate-400 text-xs">لا توجد رسوم متأخرة متراكمة حالياً ✓</div>
        ` : `
          <div class="divide-y divide-slate-100">
            ${s.overdueStudentsList.map(item => `
              <div class="py-3 flex items-center justify-between gap-3">
                <div>
                  <div class="font-bold text-xs text-slate-800 flex items-center gap-2">
                    <span>${item.full_name}</span>
                    <span class="text-[10px] font-mono text-slate-400">#${item.code}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 mt-0.5">
                    ولي الأمر: ${item.parent_name || 'غير مسجل'} (${item.parent_mobile || '-'})
                  </div>
                </div>
                <div class="text-left flex items-center gap-3">
                  <div>
                    <div class="text-xs font-bold text-rose-600">${formatEGP(item.overdue_amount)}</div>
                    <div class="text-[10px] text-slate-400">تاريخ: ${item.latest_due_date || '-'}</div>
                  </div>
                  ${item.parent_mobile ? `
                    <button onclick="openWhatsAppReminderModal('${item.id}', '${item.full_name}', '${item.parent_name || ''}', '${item.parent_mobile}', ${item.overdue_amount})"
                            title="إرسال تذكير واتساب"
                            class="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition">
                      💬
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <!-- Recent Payments & Transactions -->
      <div class="card p-5 bg-white">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-bold text-sm text-slate-800 flex items-center gap-2">
            <span>🧾</span> <span>آخر سندات القبض الصادرة</span>
          </h4>
          <button onclick="navigateTo('payments')" class="text-xs text-teal-600 hover:underline">دفتر المقبوضات</button>
        </div>

        ${s.recentPayments.length === 0 ? `
          <div class="py-8 text-center text-slate-400 text-xs">لا توجد مدفوعات مسجلة بعد</div>
        ` : `
          <div class="divide-y divide-slate-100">
            ${s.recentPayments.map(p => `
              <div class="py-3 flex items-center justify-between gap-3">
                <div>
                  <div class="font-bold text-xs text-slate-800 flex items-center gap-2">
                    <span>${p.student_name}</span>
                    <span class="text-[10px] font-mono text-slate-400">#${p.student_code}</span>
                  </div>
                  <div class="text-[11px] text-slate-500 mt-0.5">
                    إيصال: <span class="font-mono text-teal-600 font-semibold">${p.receipt_no}</span> • طريقة الدفع: ${p.payment_method === 'cash' ? 'نقداً' : p.payment_method}
                  </div>
                </div>
                <div class="text-left">
                  <div class="text-xs font-bold text-emerald-600">${formatEGP(p.amount)}</div>
                  <div class="text-[10px] text-slate-400">${p.payment_date} ${p.payment_time || ''}</div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

    </div>
  `;

  // Bind Quick Actions
  document.getElementById('btn-dash-add-student').addEventListener('click', openAddStudentModal);
  document.getElementById('btn-dash-add-payment').addEventListener('click', openAddPaymentModal);
}

// ============================================================================
// PAGE 2: STUDENTS MANAGEMENT
// ============================================================================
async function renderStudents(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل قائمة الأطفال...</div>';

  const res = await api('/api/students');
  const classRes = await api('/api/classrooms');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل بيانات الأطفال</div>';
    return;
  }

  const students = res.students;
  const classrooms = classRes ? classRes.classrooms : [];

  container.innerHTML = `
    <!-- Header with Search & Filters -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>👶</span> <span>إدارة شؤون وملفات الأطفال</span>
        </h2>
        <p class="text-xs text-slate-500">إجمالي الأطفال المسجلين: <strong class="text-teal-600">${students.length}</strong> طفل</p>
      </div>
      <div class="flex items-center gap-3">
        <button id="btn-add-student-page" class="btn btn-primary text-xs font-bold">
          <span>+</span> <span>تسجيل طفل جديد</span>
        </button>
      </div>
    </div>

    <!-- Filter Bar -->
    <div class="card p-4 bg-white flex flex-col md:flex-row items-center gap-3">
      <div class="relative flex-1 w-full">
        <input type="text" id="students-search-input" placeholder="بحث بالاسم، كود الطفل، اسم ولي الأمر، أو رقم الهاتف..."
               class="w-full pl-4 pr-10 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
        <span class="absolute right-3.5 top-2.5 text-slate-400">🔍</span>
      </div>

      <div class="flex items-center gap-2 w-full md:w-auto">
        <select id="students-filter-status" class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white outline-none">
          <option value="">كافة الحالات</option>
          <option value="active" selected>نشط ومنتظم</option>
          <option value="suspended">موقوف مؤقتاً</option>
          <option value="withdrawn">منسحب</option>
        </select>

        <select id="students-filter-classification" class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white outline-none">
          <option value="">كافة التصنيفات</option>
          <option value="regular">طفل طبيعي</option>
          <option value="learning_difficulties">صعوبات تعلم</option>
          <option value="speech_therapy">تخاطب</option>
        </select>

        <select id="students-filter-class" class="px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white outline-none">
          <option value="">كافة القاعات</option>
          ${classrooms.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- Students Grid / Table -->
    <div class="card bg-white overflow-hidden" id="students-table-container">
      <!-- Injected by filterStudents() -->
    </div>
  `;

  document.getElementById('btn-add-student-page').addEventListener('click', openAddStudentModal);

  // Filter Logic
  function filterStudents() {
    const term = document.getElementById('students-search-input').value.trim().toLowerCase();
    const stFilter = document.getElementById('students-filter-status').value;
    const clFilter = document.getElementById('students-filter-classification').value;
    const clsFilter = document.getElementById('students-filter-class').value;

    const filtered = students.filter(s => {
      if (stFilter && s.status !== stFilter) return false;
      if (clFilter && s.classification !== clFilter) return false;
      if (clsFilter && String(s.classroom_id) !== clsFilter) return false;
      if (term) {
        const matchName = s.full_name && s.full_name.toLowerCase().includes(term);
        const matchCode = String(s.code).includes(term);
        const matchParent = s.primary_guardian_name && s.primary_guardian_name.toLowerCase().includes(term);
        const matchMobile = s.primary_guardian_mobile && s.primary_guardian_mobile.includes(term);
        if (!matchName && !matchCode && !matchParent && !matchMobile) return false;
      }
      return true;
    });

    const container = document.getElementById('students-table-container');
    if (filtered.length === 0) {
      container.innerHTML = '<div class="p-12 text-center text-slate-400 text-xs">لا يوجد أطفال يطابقون خيارات البحث المحددة</div>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th class="p-3.5">الكود</th>
              <th class="p-3.5">اسم الطفل</th>
              <th class="p-3.5">العمر</th>
              <th class="p-3.5">التصنيف</th>
              <th class="p-3.5">القاعة</th>
              <th class="p-3.5">المصروفات الشهرية</th>
              <th class="p-3.5">الرصيد المستحق</th>
              <th class="p-3.5">ولي الأمر والهاتف</th>
              <th class="p-3.5">الحالة</th>
              <th class="p-3.5 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${filtered.map(s => `
              <tr class="hover:bg-slate-50/80 transition">
                <td class="p-3.5 font-mono font-bold text-teal-700">#${s.code}</td>
                <td class="p-3.5 font-bold text-slate-800">
                  <div class="flex items-center gap-2">
                    ${s.photo ? `
                      <img src="${s.photo}" class="w-8 h-8 rounded-full object-cover border border-teal-200 shadow-xs flex-shrink-0">
                    ` : `
                      <span class="text-base">${s.gender === 'أنثى' ? '👧' : '👦'}</span>
                    `}
                    <span>${s.full_name}</span>
                  </div>
                </td>
                <td class="p-3.5 text-slate-600">${calculateAge(s.dob)}</td>
                <td class="p-3.5">${getClassificationBadge(s.classification)}</td>
                <td class="p-3.5 text-slate-600">${s.classroom_name || 'غير محدد'}</td>
                <td class="p-3.5 font-semibold text-slate-800">${formatEGP(s.monthly_tuition)}</td>
                <td class="p-3.5 font-bold ${s.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}">
                  ${s.balance > 0 ? formatEGP(s.balance) : 'خالص ✓'}
                </td>
                <td class="p-3.5 text-slate-600">
                  <div>${s.primary_guardian_name || '-'}</div>
                  <div class="text-[10px] font-mono text-slate-400">${s.primary_guardian_mobile || '-'}</div>
                </td>
                <td class="p-3.5">${getStatusBadge(s.status)}</td>
                <td class="p-3.5 text-center">
                  <div class="flex items-center justify-center gap-1.5">
                    <button onclick="openStudentProfileModal(${s.id})" class="px-2.5 py-1.5 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold transition">
                      الملف الشامل
                    </button>
                    <button onclick="openAddPaymentModalForStudent(${s.id})" title="تسجيل دفعة" class="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition">
                      💵
                    </button>
                    ${s.primary_guardian_mobile ? `
                      <button onclick="openWhatsAppReminderModal('${s.id}', '${escapeJsString(s.full_name)}', '${escapeJsString(s.primary_guardian_name || '')}', '${s.primary_guardian_mobile}', ${s.balance})" title="مراسلة واتساب" class="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition">
                        💬
                      </button>
                    ` : ''}
                    <button onclick="confirmDeleteStudent(${s.id}, '${escapeJsString(s.full_name)}', '${s.code}')" title="مسح الطفل نهائياً" class="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition">
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  document.getElementById('students-search-input').addEventListener('input', filterStudents);
  document.getElementById('students-filter-status').addEventListener('change', filterStudents);
  document.getElementById('students-filter-classification').addEventListener('change', filterStudents);
  document.getElementById('students-filter-class').addEventListener('change', filterStudents);

  filterStudents();
}

// Open Add Student Modal
async function openAddStudentModal() {
  const classRes = await api('/api/classrooms');
  const empRes = await api('/api/employees');
  const classrooms = classRes ? classRes.classrooms : [];
  const employees = empRes ? empRes.employees : [];

  const content = `
    <form id="add-student-form" class="space-y-4">
      
      <div class="bg-teal-50 border border-teal-100 rounded-2xl p-3 text-xs text-teal-800 flex items-center gap-2">
        <span>ℹ️</span>
        <span>سيتم توليد كود الطفل الرقمي تلقائياً وبشكل تسلسلي يبدأ من 1001، وإذا تم مسح أي طفل يعود كوده شاغراً تلقائياً.</span>
      </div>

      <!-- Child Photo Selection -->
      <div class="flex flex-col sm:flex-row items-center gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
        <div class="relative">
          <div id="ast-photo-preview" class="w-20 h-20 rounded-2xl bg-white border-2 border-dashed border-teal-300 flex items-center justify-center text-4xl overflow-hidden shadow-sm text-teal-600">
            👦
          </div>
          <button type="button" id="ast-photo-remove" class="hidden absolute -top-1.5 -right-1.5 w-6 h-6 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-xs font-bold items-center justify-center shadow transition" title="إزالة الصورة">✕</button>
        </div>
        <div class="flex-1 text-center sm:text-right">
          <div class="text-xs font-bold text-slate-800">صورة الطفل الشخصية</div>
          <div class="text-[11px] text-slate-500 mt-0.5">يمكنك رفع صورة واضحة للطفل من جهازك أو التقاطها بالموبايل (اختياري)</div>
          <div class="mt-2 flex items-center justify-center sm:justify-start gap-2">
            <label class="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 font-bold text-xs border border-teal-200 transition">
              <span>📷</span>
              <span>اختيار صورة للطفل</span>
              <input type="file" id="ast-photo-input" accept="image/*" class="hidden">
            </label>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">اسم الطفل بالكامل *</label>
          <input type="text" id="ast-name" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="الاسم ثلاثي أو رباعي">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">النوع / الجنس</label>
          <select id="ast-gender" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none bg-white">
            <option value="ذكر">ذكر</option>
            <option value="أنثى">أنثى</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تاريخ الميلاد *</label>
          <input type="date" id="ast-dob" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          <div id="ast-age-preview" class="text-[11px] text-teal-600 mt-1 font-semibold"></div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تاريخ الالتحاق *</label>
          <input type="date" id="ast-enrollment" value="${new Date().toISOString().substring(0, 10)}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تصنيف الطفل *</label>
          <select id="ast-classification" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none bg-white font-bold text-slate-800">
            <option value="regular">طفل طبيعي (Regular)</option>
            <option value="learning_difficulties">صعوبات تعلم (Learning Support)</option>
            <option value="speech_therapy">تخاطب (Speech Therapy)</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">القاعة / الفصل</label>
          <select id="ast-classroom" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none bg-white">
            <option value="">بدون تعيين</option>
            ${classrooms.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">المعلمة المسؤولة</label>
          <select id="ast-teacher" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none bg-white">
            <option value="">بدون تعيين</option>
            ${employees.map(e => `<option value="${e.id}">${e.full_name} (${e.job_title})</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span>💵</span> <span>إعدادات المصروفات الشهرية</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label class="block text-xs text-slate-600 mb-1">المصروفات الشهرية (ج.م) *</label>
            <input type="number" id="ast-tuition" min="0" step="50" value="1500" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none font-bold">
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">يوم الاستحقاق الشهري (1-28)</label>
            <input type="number" id="ast-due-day" min="1" max="28" value="1" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">قيمة الخصم إن وجد (ج.م)</label>
            <input type="number" id="ast-discount" min="0" value="0" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-600 mb-1">سبب الخصم (منحة / أخوة / ظرف خاص)</label>
          <input type="text" id="ast-discount-reason" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="اختياري">
        </div>
      </div>

      <div class="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
        <div class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <span>👨‍👩‍👧</span> <span>بيانات ولي الأمر الأساسي</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs text-slate-600 mb-1">اسم ولي الأمر *</label>
            <input type="text" id="ast-g-name" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="الاسم بالكامل">
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">صلة القرابة</label>
            <select id="ast-g-rel" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none bg-white">
              <option value="أب">أب</option>
              <option value="أم">أم</option>
              <option value="ولي أمر">ولي أمر آخر</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">رقم الهاتف الأساسي / واتساب *</label>
            <input type="tel" id="ast-g-mobile" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="010xxxxxxxx">
          </div>
          <div>
            <label class="block text-xs text-slate-600 mb-1">رقم بديل للطوارئ</label>
            <input type="tel" id="ast-g-mobile-sec" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="اختياري">
          </div>
        </div>
        <div>
          <label class="block text-xs text-slate-600 mb-1">العنوان بالتفصيل</label>
          <input type="text" id="ast-g-address" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="المنطقة - الشارع - رقم العقار">
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">ملاحظات طبية أو تربوية</label>
        <textarea id="ast-medical" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="أي حساسية، أدوية، أو توصيات خاصة..."></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">تسجيل وحفظ الطفل</button>
      </div>
    </form>
  `;

  openLargeModal('تسجيل طفل جديد بحضانة Mamy One', content, () => {
    let studentPhotoDataUrl = null;
    const photoInput = document.getElementById('ast-photo-input');
    const photoPreview = document.getElementById('ast-photo-preview');
    const photoRemove = document.getElementById('ast-photo-remove');
    const genderSelect = document.getElementById('ast-gender');

    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const maxDim = 320;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
              else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            studentPhotoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            photoPreview.innerHTML = `<img src="${studentPhotoDataUrl}" class="w-full h-full object-cover">`;
            photoRemove.classList.remove('hidden');
            photoRemove.classList.add('flex');
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    if (photoRemove) {
      photoRemove.addEventListener('click', () => {
        studentPhotoDataUrl = null;
        if (photoInput) photoInput.value = '';
        photoPreview.innerHTML = (genderSelect && genderSelect.value === 'أنثى') ? '👧' : '👦';
        photoRemove.classList.add('hidden');
        photoRemove.classList.remove('flex');
      });
    }

    if (genderSelect) {
      genderSelect.addEventListener('change', (e) => {
        if (!studentPhotoDataUrl && photoPreview) {
          photoPreview.innerHTML = e.target.value === 'أنثى' ? '👧' : '👦';
        }
      });
    }

    const dobInput = document.getElementById('ast-dob');
    const agePreview = document.getElementById('ast-age-preview');
    dobInput.addEventListener('change', () => {
      agePreview.textContent = 'العمر المحسوب: ' + calculateAge(dobInput.value);
    });

    document.getElementById('add-student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        full_name: document.getElementById('ast-name').value.trim(),
        gender: document.getElementById('ast-gender').value,
        photo: studentPhotoDataUrl || null,
        dob: document.getElementById('ast-dob').value,
        enrollment_date: document.getElementById('ast-enrollment').value,
        classification: document.getElementById('ast-classification').value,
        classroom_id: document.getElementById('ast-classroom').value || null,
        teacher_id: document.getElementById('ast-teacher').value || null,
        monthly_tuition: Number(document.getElementById('ast-tuition').value),
        payment_due_day: Number(document.getElementById('ast-due-day').value),
        discount_amount: Number(document.getElementById('ast-discount').value || 0),
        discount_reason: document.getElementById('ast-discount-reason').value.trim(),
        guardian_name: document.getElementById('ast-g-name').value.trim(),
        guardian_relationship: document.getElementById('ast-g-rel').value,
        guardian_mobile: document.getElementById('ast-g-mobile').value.trim(),
        guardian_mobile_secondary: document.getElementById('ast-g-mobile-sec').value.trim(),
        guardian_address: document.getElementById('ast-g-address').value.trim(),
        medical_notes: document.getElementById('ast-medical').value.trim()
      };

      const res = await api('/api/students', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        closeModal();
        showToast(`تم تسجيل الطفل بنجاح بكود #${res.student.code}`, 'success');
        navigateTo('students');
      } else {
        showToast(res ? res.error : 'فشل التسجيل', 'error');
      }
    });
  });
}

// Confirmation dialog and logic for deleting a registered student
function confirmDeleteStudent(studentId, studentName, studentCode) {
  const safeName = studentName || 'هذا الطفل';
  const codeTag = studentCode ? `(#${studentCode})` : '';

  const content = `
    <div class="text-center space-y-4 py-3" dir="rtl">
      <div class="w-16 h-16 mx-auto rounded-full bg-rose-100 text-rose-600 flex items-center justify-center text-3xl shadow-inner">
        🗑️
      </div>
      <div>
        <h4 class="text-base font-black text-slate-900">هل أنت متأكد من مسح وحذف هذا الطفل؟</h4>
        <div class="inline-block mt-2 px-3 py-1 bg-rose-50 border border-rose-200 rounded-xl">
          <span class="text-sm font-black text-rose-700">${safeName}</span>
          ${codeTag ? `<span class="font-mono text-xs text-rose-500 mr-1">${codeTag}</span>` : ''}
        </div>
        <p class="text-xs text-slate-500 mt-3 leading-relaxed max-w-sm mx-auto">
          ⚠️ <strong>تنبيه:</strong> سيتم مسح بيانات الطفل وجميع سجلاته المرتبطة (الرسوم، الحضور، الجلسات، بيانات ولي الأمر) نهائياً من النظام. لا يمكن التراجع عن هذه الخطوة.
        </p>
      </div>
      <div class="flex items-center justify-center gap-3 pt-4 border-t border-slate-100">
        <button id="btn-confirm-delete-student" class="btn bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs py-2.5 px-6 rounded-xl transition shadow">
          نعم، احذف الطفل نهائياً
        </button>
        <button onclick="closeModal()" class="btn btn-secondary text-xs py-2.5 px-5">
          إلغاء
        </button>
      </div>
    </div>
  `;

  openModal('تأكيد مسح الطفل', content, () => {
    const btn = document.getElementById('btn-confirm-delete-student');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.textContent = 'جاري المسح...';
        try {
          const res = await api(`/api/students/${studentId}`, { method: 'DELETE' });
          if (res && res.success) {
            closeModal();
            showToast(res.message || 'تم حذف بيانات الطفل بنجاح', 'success');
            // Refresh view
            if (window.currentPage === 'students') {
              renderStudents(document.getElementById('main-content'));
            } else {
              navigateTo('students');
            }
          } else {
            showToast((res && res.error) || 'تعذر حذف الطفل', 'error');
            btn.disabled = false;
            btn.textContent = 'نعم، احذف الطفل نهائياً';
          }
        } catch (err) {
          showToast('حدث خطأ أثناء محاولة الحذف', 'error');
          btn.disabled = false;
          btn.textContent = 'نعم، احذف الطفل نهائياً';
        }
      });
    }
  });
}

// Full Interactive Child Profile Modal
async function openStudentProfileModal(studentId) {
  const res = await api(`/api/students/${studentId}`);
  if (!res || !res.success) {
    showToast('تعذر جلب ملف الطفل', 'error');
    return;
  }

  const s = res.student;
  const g = res.guardians;
  const f = res.finances;
  const charges = res.charges;
  const payments = res.payments;
  const sessions = res.sessions;
  const reports = res.progressReports;
  const history = res.classificationHistory;

  const content = `
    <div class="space-y-6">
      
      <!-- Child Top Profile Header -->
      <div class="flex flex-col sm:flex-row items-center sm:items-start gap-4 p-4 rounded-2xl bg-gradient-to-r from-teal-50 via-slate-50 to-teal-50 border border-teal-100/80">
        <div class="relative group">
          <div id="profile-photo-container-${s.id}" class="w-20 h-20 rounded-2xl bg-white border border-teal-200 shadow-sm flex items-center justify-center text-4xl overflow-hidden">
            ${s.photo ? `<img src="${s.photo}" class="w-full h-full object-cover">` : (s.gender === 'أنثى' ? '👧' : '👦')}
          </div>
          <label class="cursor-pointer absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center text-[11px] shadow transition" title="تغيير صورة الطفل">
            📷
            <input type="file" id="profile-change-photo-${s.id}" accept="image/*" class="hidden">
          </label>
        </div>
        <div class="flex-1 text-center sm:text-right">
          <div class="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <h2 class="text-lg font-black text-slate-900">${s.full_name}</h2>
            <span class="font-mono font-bold text-xs bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full">كود: #${s.code}</span>
            ${getClassificationBadge(s.classification)}
            ${getStatusBadge(s.status)}
          </div>
          <div class="text-xs text-slate-600 mt-1.5 flex flex-wrap items-center justify-center sm:justify-start gap-4">
            <span>🎂 العمر: <strong>${calculateAge(s.dob)}</strong> (${s.dob})</span>
            <span>🏫 القاعة: <strong>${s.classroom_name || 'غير محدد'}</strong></span>
            <span>👩‍🏫 المعلمة: <strong>${s.teacher_name || 'غير محدد'}</strong></span>
            <span>📅 الالتحاق: <strong>${s.enrollment_date}</strong></span>
          </div>
        </div>
        <div class="text-center sm:text-left flex flex-col items-center sm:items-end">
          <div class="text-xs text-slate-500">الرصيد المستحق</div>
          <div class="text-xl font-black ${f.balance > 0 ? 'text-rose-600' : 'text-emerald-600'} mt-0.5">
            ${f.balance > 0 ? formatEGP(f.balance) : 'خالص ✓'}
          </div>
          <div class="flex items-center gap-2 mt-2">
            <button onclick="closeModal(); openAddPaymentModalForStudent(${s.id})" class="btn btn-primary text-xs py-1.5 px-3">
              + تسجيل دفعة
            </button>
            <button onclick="closeModal(); confirmDeleteStudent(${s.id}, '${escapeJsString(s.full_name)}', '${s.code}')" class="px-2.5 py-1.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 font-bold text-xs transition flex items-center gap-1" title="مسح الطفل نهائياً">
              🗑️ مسح الطفل
            </button>
          </div>
        </div>
      </div>

      <!-- Guardians Card -->
      <div class="card p-3.5 bg-white border-slate-200">
        <div class="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
          <span>👨‍👩‍👧</span> <span>بيانات أولياء الأمور وجهات الاتصال</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          ${g.map(guardian => `
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between">
              <div>
                <div class="font-bold text-xs text-slate-800">${guardian.full_name} (${guardian.relationship})</div>
                <div class="text-[11px] font-mono text-slate-600 mt-0.5">${guardian.mobile}</div>
                ${guardian.address ? `<div class="text-[10px] text-slate-400 mt-0.5">${guardian.address}</div>` : ''}
              </div>
              <div class="flex items-center gap-1">
                <a href="tel:${guardian.mobile}" class="p-2 rounded-xl bg-sky-50 text-sky-600 hover:bg-sky-100 transition" title="اتصال">📞</a>
                <button onclick="openWhatsAppReminderModal('${s.id}', '${s.full_name}', '${guardian.full_name}', '${guardian.mobile}', ${f.balance})"
                        class="p-2 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition" title="واتساب">💬</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Profile Sub-Tabs -->
      <div class="space-y-4">
        
        <!-- Tab 1: Financial Ledger for this child -->
        <div class="card p-4 bg-white border-slate-200">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-xs text-slate-800 flex items-center gap-2">
              <span>💳</span> <span>سجل المطالبات وسندات القبض</span>
            </h4>
            <div class="flex items-center gap-3 text-xs">
              <span>إجمالي المطالبات: <strong>${formatEGP(f.totalCharges)}</strong></span>
              <span>المسدد: <strong class="text-emerald-600">${formatEGP(f.totalPaid)}</strong></span>
            </div>
          </div>

          <!-- Charges table -->
          <div class="mb-4">
            <div class="text-[11px] font-bold text-slate-500 mb-1">المطالبات والرسوم المسجلة:</div>
            <div class="overflow-x-auto rounded-xl border border-slate-100">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th class="p-2.5">البيان</th>
                    <th class="p-2.5">المبلغ</th>
                    <th class="p-2.5">المدفوع</th>
                    <th class="p-2.5">تاريخ الاستحقاق</th>
                    <th class="p-2.5">الحالة</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${charges.map(c => `
                    <tr>
                      <td class="p-2.5 font-medium text-slate-800">${c.description}</td>
                      <td class="p-2.5 font-bold">${formatEGP(c.net_amount)}</td>
                      <td class="p-2.5 text-emerald-600 font-semibold">${formatEGP(c.paid_amount)}</td>
                      <td class="p-2.5 text-slate-500">${c.due_date}</td>
                      <td class="p-2.5">${getStatusBadge(c.status)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Payments table -->
          <div>
            <div class="text-[11px] font-bold text-slate-500 mb-1">سندات القبض والمدفوعات:</div>
            <div class="overflow-x-auto rounded-xl border border-slate-100">
              <table class="w-full text-right text-xs">
                <thead class="bg-slate-50 text-slate-600 font-semibold">
                  <tr>
                    <th class="p-2.5">رقم الإيصال</th>
                    <th class="p-2.5">المبلغ</th>
                    <th class="p-2.5">طريقة الدفع</th>
                    <th class="p-2.5">التاريخ والوقت</th>
                    <th class="p-2.5">الحالة</th>
                    <th class="p-2.5 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100">
                  ${payments.map(p => `
                    <tr>
                      <td class="p-2.5 font-mono font-bold text-teal-700">${p.receipt_no}</td>
                      <td class="p-2.5 font-bold text-emerald-600">${formatEGP(p.amount)}</td>
                      <td class="p-2.5 text-slate-600">${p.payment_method === 'cash' ? 'نقداً' : p.payment_method}</td>
                      <td class="p-2.5 text-slate-500">${p.payment_date} ${p.payment_time || ''}</td>
                      <td class="p-2.5">${getStatusBadge(p.status)}</td>
                      <td class="p-2.5 text-center">
                        <button onclick="printReceipt('${p.id}')" class="text-teal-600 hover:underline font-bold">طباعة</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Tab 2: Sessions & Speech Therapy -->
        <div class="card p-4 bg-white border-slate-200">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-bold text-xs text-slate-800 flex items-center gap-2">
              <span>🗣️</span> <span>سجل الجلسات والتخاطب وصعوبات التعلم</span>
            </h4>
            <button onclick="closeModal(); openAddSessionModalForStudent(${s.id})" class="text-xs text-teal-600 font-bold hover:underline">+ جلسة جديدة</button>
          </div>
          ${sessions.length === 0 ? `
            <div class="py-4 text-center text-slate-400 text-xs">لا توجد جلسات مسجلة لهذا الطفل</div>
          ` : `
            <div class="space-y-2">
              ${sessions.map(sess => `
                <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                  <div class="flex items-center justify-between font-bold text-slate-800">
                    <span>${sess.session_type === 'speech_therapy' ? 'جلسة تخاطب ونطق' : 'جلسة صعوبات تعلم'}</span>
                    <span class="text-slate-500 font-normal">${sess.session_date} (${sess.duration_minutes} دقيقة)</span>
                  </div>
                  <div class="text-slate-600 text-[11px] mt-1">${sess.progress_notes || 'لا توجد ملاحظات سريرية مسجلة'}</div>
                  ${sess.recommendations ? `<div class="text-teal-700 text-[10px] mt-1">توصيات: ${sess.recommendations}</div>` : ''}
                </div>
              `).join('')}
            </div>
          `}
        </div>

      </div>

    </div>
  `;

  openLargeModal(`ملف الطفل: ${s.full_name} (#${s.code})`, content, () => {
    const changeInput = document.getElementById(`profile-change-photo-${s.id}`);
    if (changeInput) {
      changeInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const maxDim = 320;
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
              if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
              else { w = Math.round((w * maxDim) / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            const updateRes = await api(`/api/students/${s.id}`, {
              method: 'PUT',
              body: JSON.stringify({ photo: dataUrl })
            });
            if (updateRes && updateRes.success) {
              showToast('تم تحديث صورة الطفل بنجاح', 'success');
              const container = document.getElementById(`profile-photo-container-${s.id}`);
              if (container) container.innerHTML = `<img src="${dataUrl}" class="w-full h-full object-cover">`;
              if (window.currentPage === 'students') {
                renderStudents(document.getElementById('main-content'));
              }
            } else {
              showToast('تعذر تحديث الصورة', 'error');
            }
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  });
}

// Print Receipt Generator (Thermal / A4)
async function printReceipt(paymentId) {
  const res = await api(`/api/payments?id=${paymentId}`);
  if (!res || !res.payments || res.payments.length === 0) {
    showToast('تعذر العثور على سند القبض', 'error');
    return;
  }
  const p = res.payments.find(x => String(x.id) === String(paymentId)) || res.payments[0];

  const content = `
    <div class="printable-area p-6 max-w-lg mx-auto bg-white border border-slate-300 rounded-2xl shadow-sm text-slate-800 font-sans" dir="rtl">
      
      <!-- Receipt Header -->
      <div class="text-center border-b-2 border-slate-800 pb-4 mb-4">
        <div class="text-3xl mb-1">🧸</div>
        <h2 class="text-xl font-black text-slate-900 tracking-tight">حضانة Mamy One</h2>
        <div class="text-xs text-slate-600">نظام إدارة وحسابات الحضانات المتكامل</div>
        <div class="text-xs text-slate-500 mt-1">القاهرة - مصر | هاتف: 01012345678</div>
        <div class="inline-block px-3 py-1 bg-slate-100 border border-slate-300 rounded-full font-bold text-xs mt-3">
          إيصال استلام نقدية (سند قبض رسمي)
        </div>
      </div>

      <!-- Receipt Meta -->
      <div class="flex justify-between items-center text-xs mb-4">
        <div>
          <span>رقم السند: </span>
          <strong class="font-mono text-sm text-teal-700">${p.receipt_no}</strong>
        </div>
        <div>
          <span>التاريخ: </span>
          <strong>${p.payment_date}</strong> <span class="text-slate-500">${p.payment_time || ''}</span>
        </div>
      </div>

      <!-- Receipt Body Table -->
      <div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 space-y-2 text-xs">
        <div class="flex justify-between">
          <span class="text-slate-500">كود الطفل:</span>
          <strong class="font-mono">${p.student_code}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">اسم الطفل:</span>
          <strong class="text-sm font-bold text-slate-900">${p.student_name}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">طريقة الدفع:</span>
          <strong>${p.payment_method === 'cash' ? 'نقداً (خزينة)' : p.payment_method}</strong>
        </div>
        <div class="flex justify-between">
          <span class="text-slate-500">بند التحصيل:</span>
          <strong>${p.payment_category === 'tuition' ? 'قسط مصروفات شهرية' : 'رسوم إضافية'}</strong>
        </div>
        ${p.notes ? `
          <div class="flex justify-between">
            <span class="text-slate-500">ملاحظات:</span>
            <span>${p.notes}</span>
          </div>
        ` : ''}
      </div>

      <!-- Amount Highlight -->
      <div class="p-3 bg-teal-50 border-2 border-teal-600 rounded-xl text-center mb-6">
        <div class="text-xs text-teal-800 font-semibold">المبلغ المستلم</div>
        <div class="text-2xl font-black text-teal-900 my-0.5">${formatEGP(p.amount)}</div>
        <div class="text-[11px] text-teal-700 font-medium">فقط لا غير بالجنيه المصري</div>
      </div>

      <!-- Signatures Footer -->
      <div class="grid grid-cols-2 text-center text-xs pt-4 border-t border-slate-200 gap-4 mb-4">
        <div>
          <div class="text-slate-400 mb-8">توقيع المستلم / الخزينة</div>
          <div class="font-bold border-t border-slate-300 pt-1">${p.recorded_by_name || 'مسؤول الحسابات'}</div>
        </div>
        <div>
          <div class="text-slate-400 mb-8">توقيع ولي الأمر</div>
          <div class="border-t border-slate-300 pt-1">................................</div>
        </div>
      </div>

      <div class="text-[10px] text-center text-slate-400 border-t border-slate-100 pt-3">
        شكراً لاختياركم حضانة مامي وان - نعتز بثقتكم ونسعى دائماً لأفضل رعاية لأبنائكم
      </div>

    </div>

    <!-- Actions inside preview -->
    <div class="flex items-center justify-center gap-3 mt-4 no-print">
      <button onclick="window.print()" class="btn btn-primary text-xs font-bold px-6">
        🖨️ طباعة الإيصال فوراً
      </button>
      <button onclick="closeModal()" class="btn btn-secondary text-xs">
        إغلاق
      </button>
    </div>
  `;

  openModal(`معاينة إيصال: ${p.receipt_no}`, content);
}

// Open Payment Modal
async function openAddPaymentModal() {
  const res = await api('/api/students');
  const students = (res && res.students) ? res.students.filter(s => s.status === 'active') : [];
  openAddPaymentModalWithStudents(students);
}

async function openAddPaymentModalForStudent(studentId) {
  const res = await api('/api/students');
  const students = (res && res.students) ? res.students : [];
  openAddPaymentModalWithStudents(students, studentId);
}

function openAddPaymentModalWithStudents(students, preselectedId = null) {
  const content = `
    <form id="record-payment-form" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">اختر الطفل *</label>
        <select id="pay-student" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white focus:border-teal-500 outline-none">
          <option value="">-- اضغط لاختيار الطفل --</option>
          ${students.map(s => `
            <option value="${s.id}" ${preselectedId && String(preselectedId) === String(s.id) ? 'selected' : ''}>
              #${s.code} - ${s.full_name} (المتبقي: ${s.balance} ج.م)
            </option>
          `).join('')}
        </select>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">المبلغ المحصل (ج.م) *</label>
          <input type="number" id="pay-amount" min="1" step="10" required class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-teal-800 focus:border-teal-500 outline-none" placeholder="1500">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">طريقة الدفع *</label>
          <select id="pay-method" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:border-teal-500 outline-none">
            <option value="cash" selected>نقداً (خزينة الحضانة)</option>
            <option value="vodafone_cash">فودافون كاش / محفظة إلكترونية</option>
            <option value="bank_transfer">تحويل بنكي / إنستاباي</option>
            <option value="card">بطاقة دفع إلكترونية / فيزا</option>
            <option value="other">أخرى</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">بند التحصيل</label>
          <select id="pay-category" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:border-teal-500 outline-none">
            <option value="tuition" selected>قسط مصروفات شهرية</option>
            <option value="speech_therapy">جلسات تخاطب</option>
            <option value="learning_support">صعوبات تعلم</option>
            <option value="uniform">زي مدرسي (يونيفورم)</option>
            <option value="books">كتب ومناهج</option>
            <option value="bus">انتقالات وباص</option>
            <option value="activity">أنشطة ورحلات</option>
            <option value="registration">رسوم تسجيل</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تاريخ التحصيل</label>
          <input type="date" id="pay-date" value="${new Date().toISOString().substring(0, 10)}" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">ملاحظات أو رقم الحوالة</label>
        <input type="text" id="pay-notes" class="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="اختياري">
      </div>

      <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">تسجيل الدفعة وإصدار الإيصال</button>
      </div>
    </form>
  `;

  openModal('تسجيل سند قبض واستلام نقدية', content, () => {
    document.getElementById('record-payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const studentId = document.getElementById('pay-student').value;
      const amount = Number(document.getElementById('pay-amount').value);
      const method = document.getElementById('pay-method').value;
      const category = document.getElementById('pay-category').value;
      const pDate = document.getElementById('pay-date').value;
      const notes = document.getElementById('pay-notes').value.trim();

      const res = await api('/api/payments', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          amount,
          payment_method: method,
          payment_category: category,
          payment_date: pDate,
          notes
        })
      });

      if (res && res.success) {
        closeModal();
        showToast('تم حفظ الدفعة بنجاح', 'success');
        printReceipt(res.payment.id);
        if (state.currentPage === 'payments' || state.currentPage === 'dashboard') {
          navigateTo(state.currentPage);
        }
      } else {
        showToast(res ? res.error : 'فشل التسجيل', 'error');
      }
    });
  });
}

// WhatsApp Polite Reminder Modal
function openWhatsAppReminderModal(studentId, studentName, parentName, parentMobile, amountDue) {
  const formattedMobile = parentMobile.replace(/^0/, '20').replace(/[^0-9]/g, '');
  const amountStr = formatEGP(amountDue);

  const messageText = `السلام عليكم ورحمة الله وبركاته 🌸
تحية طيبة لحضرتكم من إدارة حضانة Mamy One.
نود تذكيركم بموعد سداد الرسوم المستحقة للطفل/ة (${studentName}) وقيمتها ${amountStr}.
شاكرين ومقدرين حسن تعاونكم وحرصكم الدائم على استمرار الرعاية المتميزة لطفلكم.
حضانة مامي وان – بيئة تعليمية وتربوية متكاملة ❤️`;

  const waUrl = `https://wa.me/${formattedMobile}?text=${encodeURIComponent(messageText)}`;

  const content = `
    <div class="space-y-4">
      <div class="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 text-xs text-emerald-900 flex items-start gap-3">
        <span class="text-2xl">💬</span>
        <div>
          <div class="font-bold text-sm">إرسال تذكير ودّي عبر واتساب</div>
          <div class="text-emerald-700 mt-0.5">المرسل إليه: <strong>${parentName || 'ولي أمر'}</strong> (${parentMobile})</div>
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">نص رسالة التذكير المعدة:</label>
        <textarea id="wa-reminder-text" rows="6" class="w-full p-3 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none font-sans leading-relaxed text-slate-800">${messageText}</textarea>
      </div>

      <div class="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <button id="btn-copy-wa-text" class="btn btn-secondary text-xs w-full sm:w-auto">
          📋 نسخ نص الرسالة
        </button>
        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
          <a href="${waUrl}" target="_blank" id="btn-open-wa" class="btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
            فتح محادثة واتساب الآن ←
          </a>
        </div>
      </div>
    </div>
  `;

  openModal('تذكير ولي الأمر بالرسوم المستحقة', content, () => {
    document.getElementById('btn-copy-wa-text').addEventListener('click', () => {
      const txt = document.getElementById('wa-reminder-text').value;
      navigator.clipboard.writeText(txt).then(() => {
        showToast('تم نسخ نص الرسالة بنجاح', 'success');
      });
    });

    document.getElementById('btn-open-wa').addEventListener('click', async () => {
      // Log to communication logs automatically
      await api('/api/communications/log', {
        method: 'POST',
        body: JSON.stringify({
          student_id: studentId,
          recipient_name: parentName || 'ولي الأمر',
          recipient_phone: parentMobile,
          message_type: 'payment_reminder',
          channel: 'whatsapp',
          message_content: document.getElementById('wa-reminder-text').value
        })
      });
      closeModal();
    });
  });
}

// ============================================================================
// PAGE 3: PAYMENTS LEDGER
// ============================================================================
async function renderPayments(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل سجل المقبوضات...</div>';

  const res = await api('/api/payments');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل المقبوضات</div>';
    return;
  }

  const payments = res.payments;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>💵</span> <span>دفتر المقبوضات وسندات القبض</span>
        </h2>
        <p class="text-xs text-slate-500">سجل كافة المدفوعات النقدية والبنكية الصادرة بدقة</p>
      </div>
      <div>
        <button onclick="openAddPaymentModal()" class="btn btn-primary text-xs font-bold">
          <span>+</span> <span>تسجيل سند قبض جديد</span>
        </button>
      </div>
    </div>

    <div class="card bg-white overflow-hidden">
      ${payments.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">لا توجد حركات دفع مسجلة بعد</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">رقم السند</th>
                <th class="p-3.5">اسم الطفل</th>
                <th class="p-3.5">المبلغ المستلم</th>
                <th class="p-3.5">طريقة الدفع</th>
                <th class="p-3.5">البند</th>
                <th class="p-3.5">التاريخ والوقت</th>
                <th class="p-3.5">المسؤول</th>
                <th class="p-3.5">الحالة</th>
                <th class="p-3.5 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${payments.map(p => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono font-bold text-teal-700">${p.receipt_no}</td>
                  <td class="p-3.5 font-bold text-slate-800">
                    <div>${p.student_name}</div>
                    <div class="text-[10px] font-mono text-slate-400">#${p.student_code}</div>
                  </td>
                  <td class="p-3.5 font-black text-emerald-600 text-sm">${formatEGP(p.amount)}</td>
                  <td class="p-3.5 text-slate-600">${p.payment_method === 'cash' ? 'نقداً (خزينة)' : p.payment_method}</td>
                  <td class="p-3.5 text-slate-600">${p.payment_category === 'tuition' ? 'قسط شهري' : 'رسوم إضافية'}</td>
                  <td class="p-3.5 text-slate-500">${p.payment_date} ${p.payment_time || ''}</td>
                  <td class="p-3.5 text-slate-500">${p.recorded_by_name || '-'}</td>
                  <td class="p-3.5">${getStatusBadge(p.status)}</td>
                  <td class="p-3.5 text-center">
                    <div class="flex items-center justify-center gap-2">
                      <button onclick="printReceipt('${p.id}')" class="btn btn-secondary text-[11px] py-1 px-2.5">
                        🖨️ طباعة
                      </button>
                      ${p.status === 'completed' ? `
                        <button onclick="openRefundModal('${p.id}', '${p.receipt_no}', ${p.amount})" class="text-rose-600 hover:underline font-bold text-[11px]">
                          استرداد
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// Refund Modal
function openRefundModal(paymentId, receiptNo, amount) {
  const content = `
    <form id="refund-form" class="space-y-4">
      <div class="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
        تحذير: سيتم إلغاء السند رقم <strong>${receiptNo}</strong> وإعادة قيمة المبلغ <strong>${formatEGP(amount)}</strong> كرسوم مستحقة على الطفل وتوثيق العملية في سجل المراقبة.
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">سبب الاسترداد / الإلغاء (إجباري) *</label>
        <textarea id="refund-reason" required rows="3" class="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:border-rose-500 outline-none" placeholder="اكتب سبب الاسترداد أو الخطأ المحاسبي بالتفصيل..."></textarea>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-danger text-xs font-bold">تأكيد الاسترداد</button>
      </div>
    </form>
  `;

  openModal(`استرداد سند القبض (${receiptNo})`, content, () => {
    document.getElementById('refund-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = document.getElementById('refund-reason').value.trim();
      const res = await api(`/api/payments/${paymentId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });

      if (res && res.success) {
        closeModal();
        showToast('تم استرداد السند بنجاح', 'success');
        navigateTo('payments');
      } else {
        showToast(res ? res.error : 'فشل الاسترداد', 'error');
      }
    });
  });
}

// ============================================================================
// PAGE 4: OUTSTANDING FEES & REMINDERS
// ============================================================================
async function renderOutstanding(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري فحص المتأخرات...</div>';

  const res = await api('/api/outstanding-fees');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل المتأخرات</div>';
    return;
  }

  const list = res.records;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>⚠️</span> <span>كشف الرسوم المتأخرة وتذكيرات أولياء الأمور</span>
        </h2>
        <p class="text-xs text-slate-500">الأطفال الذين عليهم متبقيات مستحقة: <strong class="text-rose-600">${list.length}</strong> طفل</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-export-outstanding-excel" class="btn btn-secondary text-xs">
          📊 تصدير Excel
        </button>
        <button onclick="window.print()" class="btn btn-secondary text-xs">
          🖨️ طباعة الكشف
        </button>
      </div>
    </div>

    <div class="card bg-white overflow-hidden">
      ${list.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">لا توجد رسوم متأخرة على الإطلاق! جميع الحسابات مسددة بالكامل ✓</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">الكود</th>
                <th class="p-3.5">اسم الطفل</th>
                <th class="p-3.5">القاعة</th>
                <th class="p-3.5">إجمالي الرسوم</th>
                <th class="p-3.5">المسدد</th>
                <th class="p-3.5">الرصيد المتبقي</th>
                <th class="p-3.5">تاريخ الاستحقاق</th>
                <th class="p-3.5">أيام التأخير</th>
                <th class="p-3.5">ولي الأمر</th>
                <th class="p-3.5 text-center">إجراء تذكير</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${list.map(item => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono font-bold text-teal-700">#${item.code}</td>
                  <td class="p-3.5 font-bold text-slate-800">${item.full_name}</td>
                  <td class="p-3.5 text-slate-600">${item.classroom_name || '-'}</td>
                  <td class="p-3.5 font-semibold text-slate-700">${formatEGP(item.total_charges)}</td>
                  <td class="p-3.5 text-emerald-600 font-semibold">${formatEGP(item.total_paid)}</td>
                  <td class="p-3.5 font-black text-rose-600 text-sm">${formatEGP(item.remaining_balance)}</td>
                  <td class="p-3.5 text-slate-500">${item.earliest_due_date || '-'}</td>
                  <td class="p-3.5">
                    ${item.overdue_days > 0 ? `
                      <span class="badge badge-danger">${item.overdue_days} يوم تأخير</span>
                    ` : `
                      <span class="badge badge-warning">مستحق قريباً</span>
                    `}
                  </td>
                  <td class="p-3.5 text-slate-600">
                    <div>${item.guardian_name || '-'}</div>
                    <div class="text-[10px] font-mono text-slate-400">${item.guardian_mobile || '-'}</div>
                  </td>
                  <td class="p-3.5 text-center">
                    <button onclick="openWhatsAppReminderModal('${item.id}', '${item.full_name}', '${item.guardian_name || ''}', '${item.guardian_mobile || ''}', ${item.remaining_balance})"
                            class="btn bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-[11px] py-1 px-3 font-bold">
                      💬 تذكير واتساب
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-export-outstanding-excel').addEventListener('click', () => {
    exportToCsv('كشف_المتأخرات_حضانة_مامي_وان.csv', list, [
      { header: 'الكود', key: 'code' },
      { header: 'اسم الطفل', key: 'full_name' },
      { header: 'إجمالي الرسوم', key: 'total_charges' },
      { header: 'المسدد', key: 'total_paid' },
      { header: 'المتبقي', key: 'remaining_balance' },
      { header: 'تاريخ الاستحقاق', key: 'earliest_due_date' },
      { header: 'أيام التأخير', key: 'overdue_days' },
      { header: 'ولي الأمر', key: 'guardian_name' },
      { header: 'الهاتف', key: 'guardian_mobile' }
    ]);
  });
}

// CSV Export Utility
function exportToCsv(filename, rows, columns) {
  if (!rows || rows.length === 0) {
    showToast('لا توجد بيانات للتصدير', 'warning');
    return;
  }
  const headerLine = columns.map(c => `"${c.header}"`).join(',');
  const dataLines = rows.map(r => {
    return columns.map(c => {
      const val = r[c.key] !== undefined && r[c.key] !== null ? String(r[c.key]).replace(/"/g, '""') : '';
      return `"${val}"`;
    }).join(',');
  });

  const csvContent = '\uFEFF' + [headerLine, ...dataLines].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  showToast('تم تصدير الملف بنجاح', 'success');
}

// ============================================================================
// PAGE 5: EXPENSES MANAGEMENT & CASH CLOSING
// ============================================================================
async function renderExpenses(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل المصروفات...</div>';

  const res = await api('/api/expenses');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل المصروفات</div>';
    return;
  }

  const expenses = res.expenses;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>📉</span> <span>سجل المصروفات والنفقات التشغيلية</span>
        </h2>
        <p class="text-xs text-slate-500">حصر دقيق للمصروفات المدفوعة والالتزامات المعلقة</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-daily-cash-closing" class="btn btn-secondary text-xs font-bold">
          🏦 إغلاق الخزينة اليومي
        </button>
        <button id="btn-add-expense" class="btn btn-primary text-xs font-bold">
          <span>+</span> <span>تسجيل مصروف جديد</span>
        </button>
      </div>
    </div>

    <div class="card bg-white overflow-hidden">
      ${expenses.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">لا توجد مصروفات مسجلة بعد</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">الرقم المرجعي</th>
                <th class="p-3.5">التصنيف</th>
                <th class="p-3.5">البيان والتفاصيل</th>
                <th class="p-3.5">المبلغ الإجمالي</th>
                <th class="p-3.5">المدفوع فعلياً</th>
                <th class="p-3.5">تاريخ المصروف</th>
                <th class="p-3.5">المستفيد / المورد</th>
                <th class="p-3.5">حالة السداد</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${expenses.map(e => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono font-bold text-teal-700">${e.reference_no}</td>
                  <td class="p-3.5 font-semibold text-slate-700">${getExpenseCategoryArabic(e.category)}</td>
                  <td class="p-3.5 font-bold text-slate-800">${e.description}</td>
                  <td class="p-3.5 font-bold text-slate-800">${formatEGP(e.amount)}</td>
                  <td class="p-3.5 font-black text-rose-600">${formatEGP(e.paid_amount)}</td>
                  <td class="p-3.5 text-slate-500">${e.expense_date}</td>
                  <td class="p-3.5 text-slate-600">${e.recipient_supplier || '-'}</td>
                  <td class="p-3.5">${getStatusBadge(e.payment_status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-add-expense').addEventListener('click', openAddExpenseModal);
  document.getElementById('btn-daily-cash-closing').addEventListener('click', openDailyClosingModal);
}

function getExpenseCategoryArabic(cat) {
  const map = {
    teacher_salary: 'رواتب معلمات',
    employee_salary: 'رواتب موظفين',
    rent: 'إيجار المقر',
    utilities: 'كهرباء ومياه',
    maintenance: 'نظافة وصيانة',
    supplies: 'أدوات تعليمية',
    books: 'كتب ومناهج',
    food: 'وجبات وأغذية',
    transport: 'انتقالات وباص',
    medical: 'مستلزمات طبية',
    marketing: 'تسويق وإعلانات',
    other: 'أخرى ونثرية'
  };
  return map[cat] || cat;
}

function openAddExpenseModal() {
  const content = `
    <form id="add-expense-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">بند المصروف *</label>
          <select id="exp-category" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-bold text-slate-800 focus:border-teal-500 outline-none">
            <option value="supplies">أدوات ومستلزمات تعليمية</option>
            <option value="maintenance">نظافة وصيانة وتجديدات</option>
            <option value="utilities">كهرباء ومياه وغاز</option>
            <option value="rent">إيجار المقر</option>
            <option value="books">كتب ومناهج دراسية</option>
            <option value="food">وجبات وأغذية وضيافة</option>
            <option value="transport">انتقالات وباصات</option>
            <option value="medical">مستلزمات طبية وإسعافات</option>
            <option value="marketing">تسويق وإعلانات ومطبوعات</option>
            <option value="other">مصروفات أخرى ونثرية</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">المبلغ (ج.م) *</label>
          <input type="number" id="exp-amount" min="1" step="5" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-black text-rose-700 focus:border-teal-500 outline-none" placeholder="500">
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">بيان المصروف بالتفصيل *</label>
        <input type="text" id="exp-desc" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="شراء ورق رسم وألوان مائية، صيانة مكيف...">
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">حالة السداد</label>
          <select id="exp-status" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:border-teal-500 outline-none">
            <option value="paid" selected>مسدد بالكامل (نقداً)</option>
            <option value="unpaid">غير مسدد (مستحق مستقبلاً)</option>
            <option value="partially_paid">مسدد جزئياً</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">طريقة الدفع</label>
          <select id="exp-method" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:border-teal-500 outline-none">
            <option value="cash" selected>نقداً</option>
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="vodafone_cash">فودافون كاش</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تاريخ المصروف</label>
          <input type="date" id="exp-date" value="${new Date().toISOString().substring(0, 10)}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
        </div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">المورد أو المستفيد</label>
        <input type="text" id="exp-supplier" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="مكتبة الأهرام، فني الصيانة...">
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">تسجيل المصروف</button>
      </div>
    </form>
  `;

  openModal('تسجيل مصروف ونفقة تشغيلية', content, () => {
    document.getElementById('add-expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        category: document.getElementById('exp-category').value,
        amount: Number(document.getElementById('exp-amount').value),
        description: document.getElementById('exp-desc').value.trim(),
        payment_status: document.getElementById('exp-status').value,
        payment_method: document.getElementById('exp-method').value,
        expense_date: document.getElementById('exp-date').value,
        recipient_supplier: document.getElementById('exp-supplier').value.trim()
      };

      const res = await api('/api/expenses', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        closeModal();
        showToast('تم تسجيل المصروف بنجاح', 'success');
        navigateTo('expenses');
      } else {
        showToast(res ? res.error : 'فشل التسجيل', 'error');
      }
    });
  });
}

// Daily Cash Closing Modal
async function openDailyClosingModal() {
  const res = await api('/api/daily-closing');
  if (!res || !res.success) return;

  const content = `
    <div class="space-y-4">
      <div class="p-3 rounded-xl bg-teal-50 border border-teal-100 text-xs text-teal-800">
        تقرير الجرد والإغلاق اليومي لحساب الخزينة النقدية ليوم <strong>${res.date}</strong>.
      </div>

      <div class="grid grid-cols-2 gap-3 text-xs">
        <div class="p-3 rounded-xl bg-slate-50 border border-slate-200">
          <div class="text-slate-500">الرصيد الافتتاحي:</div>
          <div class="text-lg font-bold text-slate-800">${formatEGP(res.openingBalance)}</div>
        </div>

        <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
          <div class="text-emerald-700">المقبوضات النقدية (+):</div>
          <div class="text-lg font-bold text-emerald-800">${formatEGP(res.cashIn)}</div>
        </div>

        <div class="p-3 rounded-xl bg-rose-50 border border-rose-200">
          <div class="text-rose-700">المصروفات النقدية (-):</div>
          <div class="text-lg font-bold text-rose-800">${formatEGP(res.cashOut)}</div>
        </div>

        <div class="p-3 rounded-xl bg-amber-50 border border-amber-200">
          <div class="text-amber-700">المرتجع النقدي (-):</div>
          <div class="text-lg font-bold text-amber-800">${formatEGP(res.refunds)}</div>
        </div>
      </div>

      <div class="p-3 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs">
        <span class="font-bold text-sky-900">الرصيد الدفتري المفترض بالخزينة:</span>
        <span class="text-xl font-black text-sky-900">${formatEGP(res.computedClosing)}</span>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">الرصيد الفعلي بعد العد اليدوي (ج.م) *</label>
        <input type="number" id="closing-counted" value="${res.computedClosing}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-800 outline-none">
        <div id="closing-diff-preview" class="text-xs font-bold mt-1 text-slate-500">الفارق: 0 ج.م (مطابق تماماً)</div>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">ملاحظات الإغلاق</label>
        <input type="text" id="closing-notes" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none" placeholder="اختياري">
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button id="btn-submit-closing" class="btn btn-primary text-xs font-bold">اعتماد وحفظ إغلاق اليوم</button>
      </div>
    </div>
  `;

  openModal('إغلاق الخزينة اليومية', content, () => {
    const inputCounted = document.getElementById('closing-counted');
    const diffEl = document.getElementById('closing-diff-preview');

    inputCounted.addEventListener('input', () => {
      const counted = Number(inputCounted.value);
      const diff = counted - res.computedClosing;
      if (diff === 0) {
        diffEl.textContent = 'الفارق: 0 ج.م (مطابق تماماً ✓)';
        diffEl.className = 'text-xs font-bold mt-1 text-emerald-600';
      } else if (diff > 0) {
        diffEl.textContent = `الفارق: زيادة بمقدار +${diff} ج.م`;
        diffEl.className = 'text-xs font-bold mt-1 text-sky-600';
      } else {
        diffEl.textContent = `الفارق: عجز بمقدار ${diff} ج.م`;
        diffEl.className = 'text-xs font-bold mt-1 text-rose-600';
      }
    });

    document.getElementById('btn-submit-closing').addEventListener('click', async () => {
      const counted = Number(inputCounted.value);
      const notes = document.getElementById('closing-notes').value.trim();

      const r = await api('/api/daily-closing', {
        method: 'POST',
        body: JSON.stringify({
          closing_date: res.date,
          opening_balance: res.openingBalance,
          cash_in: res.cashIn,
          cash_out: res.cashOut,
          refunds: res.refunds,
          actual_cash_counted: counted,
          notes
        })
      });

      if (r && r.success) {
        closeModal();
        showToast('تم اعتماد إغلاق الخزينة بنجاح', 'success');
      }
    });
  });
}

// ============================================================================
// PAGE 6: EMPLOYEES & PAYROLL
// ============================================================================
async function renderPayroll(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل مسير الرواتب...</div>';

  const currentMonth = new Date().toISOString().substring(0, 7);
  const payRes = await api(`/api/payroll?month=${currentMonth}`);
  const empRes = await api('/api/employees');

  if (!payRes || !payRes.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل الرواتب</div>';
    return;
  }

  const payroll = payRes.records;
  const employees = empRes ? empRes.employees : [];

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>👩‍🏫</span> <span>شؤون الموظفين ومسير الرواتب</span>
        </h2>
        <p class="text-xs text-slate-500">إدارة كادر العمل وحسابات وصرف الرواتب الشهرية</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="btn-add-employee" class="btn btn-secondary text-xs">
          <span>+</span> <span>إضافة موظف جديد</span>
        </button>
        <button id="btn-generate-payroll" class="btn btn-primary text-xs font-bold">
          <span>⚡</span> <span>إصدار مسير رواتب الشهر (${currentMonth})</span>
        </button>
      </div>
    </div>

    <!-- Payroll Sheet Table -->
    <div class="card bg-white overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex items-center justify-between">
        <h4 class="font-bold text-xs text-slate-800">مسير رواتب شهر (${currentMonth})</h4>
        <span class="text-xs text-slate-500">عدد السجلات: ${payroll.length}</span>
      </div>

      ${payroll.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">
          لم يتم إصدار مسير رواتب لهذا الشهر بعد. اضغط على زر "إصدار مسير رواتب الشهر" أعلاه لإنشائه تلقائياً.
        </div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">الكود</th>
                <th class="p-3.5">اسم الموظف</th>
                <th class="p-3.5">المسمى الوظيفي</th>
                <th class="p-3.5">الراتب الأساسي</th>
                <th class="p-3.5">المكافآت (+)</th>
                <th class="p-3.5">الاستقطاعات (-)</th>
                <th class="p-3.5">صافي الراتب</th>
                <th class="p-3.5">المدفوع</th>
                <th class="p-3.5">الحالة</th>
                <th class="p-3.5 text-center">إجراء الصرف</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${payroll.map(p => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono font-bold text-teal-700">${p.employee_code}</td>
                  <td class="p-3.5 font-bold text-slate-800">${p.employee_name}</td>
                  <td class="p-3.5 text-slate-600">${p.job_title}</td>
                  <td class="p-3.5 text-slate-700 font-semibold">${formatEGP(p.base_salary)}</td>
                  <td class="p-3.5 text-emerald-600 font-semibold">+${formatEGP(p.bonuses)}</td>
                  <td class="p-3.5 text-rose-600 font-semibold">-${formatEGP(p.deductions + p.advances)}</td>
                  <td class="p-3.5 font-black text-slate-900">${formatEGP(p.net_salary)}</td>
                  <td class="p-3.5 font-bold text-emerald-600">${formatEGP(p.paid_amount)}</td>
                  <td class="p-3.5">${getStatusBadge(p.status)}</td>
                  <td class="p-3.5 text-center">
                    ${p.status !== 'paid' ? `
                      <button onclick="openPaySalaryModal(${p.id}, '${p.employee_name}', ${p.net_salary - p.paid_amount})" class="btn btn-primary text-[11px] py-1 px-3">
                        صرف الراتب
                      </button>
                    ` : `
                      <span class="text-xs text-emerald-600 font-bold">مسدد بالكامل ✓</span>
                    `}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>

    <!-- Active Employees List -->
    <div class="card bg-white p-4">
      <div class="font-bold text-xs text-slate-800 mb-3">قائمة كادر العمل والمعلمات المسجلات (${employees.length}):</div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        ${employees.map(e => `
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
            <div>
              <div class="font-bold text-slate-800">${e.full_name}</div>
              <div class="text-slate-500 text-[11px]">${e.job_title} • ${e.mobile}</div>
              <div class="text-[10px] text-teal-600 mt-0.5">الراتب المتفق عليه: ${formatEGP(e.agreed_salary)}</div>
            </div>
            <span class="font-mono text-xs font-bold text-slate-400">${e.code}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('btn-add-employee').addEventListener('click', openAddEmployeeModal);

  document.getElementById('btn-generate-payroll').addEventListener('click', async () => {
    const res = await api('/api/payroll/generate', {
      method: 'POST',
      body: JSON.stringify({ month: currentMonth })
    });
    if (res && res.success) {
      showToast(res.message, 'success');
      navigateTo('payroll');
    }
  });
}

function openAddEmployeeModal() {
  const content = `
    <form id="add-emp-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">اسم الموظف / المعلمة *</label>
          <input type="text" id="emp-name" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="الاسم بالكامل">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">المسمى الوظيفي *</label>
          <input type="text" id="emp-job" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="معلمة رياض أطفال، أخصائية تخاطب...">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف *</label>
          <input type="tel" id="emp-mobile" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="010xxxxxxxx">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">الراتب الشهري الأساسي (ج.م) *</label>
          <input type="number" id="emp-salary" min="0" step="100" value="4000" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none font-bold">
        </div>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">حفظ الموظف</button>
      </div>
    </form>
  `;

  openModal('إضافة موظف / معلمة جديدة', content, () => {
    document.getElementById('add-emp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        full_name: document.getElementById('emp-name').value.trim(),
        job_title: document.getElementById('emp-job').value.trim(),
        mobile: document.getElementById('emp-mobile').value.trim(),
        agreed_salary: Number(document.getElementById('emp-salary').value)
      };

      const res = await api('/api/employees', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        closeModal();
        showToast('تمت إضافة الموظف بنجاح', 'success');
        navigateTo('payroll');
      }
    });
  });
}

function openPaySalaryModal(payrollId, empName, dueAmount) {
  const content = `
    <form id="pay-salary-form" class="space-y-4">
      <div class="p-3 rounded-xl bg-teal-50 border border-teal-100 text-xs text-teal-800">
        صرف راتب الموظف/ة: <strong>${empName}</strong>.
        المتبقي المستحق: <strong>${formatEGP(dueAmount)}</strong>.
        (سيتم تسجيل هذا الصرف تلقائياً كمصروف مدفوع في الخزينة لضمان دقة الحسابات).
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">مبلغ الصرف (ج.م) *</label>
          <input type="number" id="sal-amount" value="${dueAmount}" min="1" step="50" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 outline-none">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">طريقة الدفع</label>
          <select id="sal-method" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none">
            <option value="cash" selected>نقداً</option>
            <option value="bank_transfer">تحويل بنكي / إنستاباي</option>
            <option value="vodafone_cash">محفظة إلكترونية</option>
          </select>
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">ملاحظات الصرف</label>
        <input type="text" id="sal-notes" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none" placeholder="اختياري">
      </div>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">تأكيد الصرف وتسجيل المصروف</button>
      </div>
    </form>
  `;

  openModal(`صرف الراتب: ${empName}`, content, () => {
    document.getElementById('pay-salary-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = Number(document.getElementById('sal-amount').value);
      const method = document.getElementById('sal-method').value;
      const notes = document.getElementById('sal-notes').value.trim();

      const res = await api('/api/payroll/pay', {
        method: 'POST',
        body: JSON.stringify({
          payroll_id: payrollId,
          amount,
          payment_method: method,
          notes
        })
      });

      if (res && res.success) {
        closeModal();
        showToast('تم صرف الراتب وتسجيل المصروف بنجاح', 'success');
        navigateTo('payroll');
      } else {
        showToast(res ? res.error : 'فشل صرف الراتب', 'error');
      }
    });
  });
}

// ============================================================================
// PAGE 7: ATTENDANCE & CLASSROOMS
// ============================================================================
async function renderAttendance(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل سجل الحضور...</div>';

  const today = new Date().toISOString().substring(0, 10);
  const classRes = await api('/api/classrooms');
  const classrooms = classRes ? classRes.classrooms : [];

  const attRes = await api(`/api/attendance?date=${today}`);
  if (!attRes || !attRes.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل الحضور</div>';
    return;
  }

  const list = attRes.list;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>📅</span> <span>تسجيل الحضور والغياب اليومي</span>
        </h2>
        <p class="text-xs text-slate-500">حفظ فوري لحضور الأطفال وأوقات الوصول والمغادرة</p>
      </div>
      <div class="flex items-center gap-2">
        <input type="date" id="att-date-picker" value="${today}" class="px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none bg-white font-bold">
        <button id="btn-att-mark-all-present" class="btn btn-secondary text-xs">
          تحديد الكل حاضر ✓
        </button>
        <button id="btn-save-attendance" class="btn btn-primary text-xs font-bold">
          💾 حفظ الحضور
        </button>
      </div>
    </div>

    <!-- Attendance Grid -->
    <div class="card bg-white overflow-hidden">
      ${list.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">لا يوجد أطفال نشطون لتسجيل الحضور</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">الكود</th>
                <th class="p-3.5">اسم الطفل</th>
                <th class="p-3.5">القاعة</th>
                <th class="p-3.5">حالة الحضور</th>
                <th class="p-3.5">وقت الوصول</th>
                <th class="p-3.5">ملاحظات / سبب الغياب</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100" id="att-table-body">
              ${list.map(item => `
                <tr data-student-id="${item.student_id}" data-class-id="${item.classroom_id || ''}" class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono font-bold text-teal-700">#${item.code}</td>
                  <td class="p-3.5 font-bold text-slate-800">${item.full_name}</td>
                  <td class="p-3.5 text-slate-600">${item.classroom_name || '-'}</td>
                  <td class="p-3.5">
                    <div class="flex items-center gap-1.5 att-status-buttons">
                      <button type="button" data-status="present" class="status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${item.status === 'present' || !item.status ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                        حاضر
                      </button>
                      <button type="button" data-status="absent" class="status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${item.status === 'absent' ? 'bg-rose-600 text-white border-rose-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                        غائب
                      </button>
                      <button type="button" data-status="late" class="status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${item.status === 'late' ? 'bg-amber-600 text-white border-amber-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                        متأخر
                      </button>
                      <button type="button" data-status="excused" class="status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${item.status === 'excused' ? 'bg-sky-600 text-white border-sky-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                        معذور
                      </button>
                    </div>
                  </td>
                  <td class="p-3.5">
                    <input type="time" class="att-time-input px-2 py-1 rounded-lg border border-slate-200 text-xs" value="${item.arrival_time || '08:00'}">
                  </td>
                  <td class="p-3.5">
                    <input type="text" class="att-notes-input w-full px-2 py-1 rounded-lg border border-slate-200 text-xs" placeholder="اختياري" value="${item.notes || ''}">
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // Status button switching
  document.querySelectorAll('#att-table-body tr').forEach(row => {
    row.querySelectorAll('.status-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        row.querySelectorAll('.status-btn').forEach(b => {
          b.className = 'status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition bg-slate-50 text-slate-600 border-slate-200';
        });
        const st = btn.dataset.status;
        const colorClass = st === 'present' ? 'bg-emerald-600 text-white border-emerald-600'
          : (st === 'absent' ? 'bg-rose-600 text-white border-rose-600'
            : (st === 'late' ? 'bg-amber-600 text-white border-amber-600' : 'bg-sky-600 text-white border-sky-600'));
        btn.className = `status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${colorClass}`;
        btn.dataset.active = 'true';
      });
    });
  });

  // Mark all present button
  document.getElementById('btn-att-mark-all-present').addEventListener('click', () => {
    document.querySelectorAll('#att-table-body tr').forEach(row => {
      row.querySelectorAll('.status-btn').forEach(b => {
        b.className = 'status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition bg-slate-50 text-slate-600 border-slate-200';
      });
      const presentBtn = row.querySelector('.status-btn[data-status="present"]');
      if (presentBtn) {
        presentBtn.className = 'status-btn px-2.5 py-1 rounded-lg text-[11px] font-bold border transition bg-emerald-600 text-white border-emerald-600';
      }
    });
  });

  // Save Attendance
  document.getElementById('btn-save-attendance').addEventListener('click', async () => {
    const records = [];
    const chosenDate = document.getElementById('att-date-picker').value;

    document.querySelectorAll('#att-table-body tr').forEach(row => {
      const studentId = row.dataset.studentId;
      const classId = row.dataset.classId;
      const activeBtn = row.querySelector('.status-btn.text-white');
      const status = activeBtn ? activeBtn.dataset.status : 'present';
      const timeVal = row.querySelector('.att-time-input').value;
      const notesVal = row.querySelector('.att-notes-input').value.trim();

      records.push({
        student_id: studentId,
        classroom_id: classId,
        status,
        arrival_time: timeVal,
        notes: notesVal
      });
    });

    const saveRes = await api('/api/attendance/bulk', {
      method: 'POST',
      body: JSON.stringify({ date: chosenDate, records })
    });

    if (saveRes && saveRes.success) {
      showToast('تم حفظ سجل الحضور والغياب بنجاح ✓', 'success');
    }
  });
}

// ============================================================================
// PAGE 8: SESSIONS & SPEECH THERAPY
// ============================================================================
async function renderSessions(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل الجلسات...</div>';

  const res = await api('/api/sessions');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل الجلسات</div>';
    return;
  }

  const sessions = res.sessions;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>🗣️</span> <span>جلسات التخاطب وصعوبات التعلم</span>
        </h2>
        <p class="text-xs text-slate-500">متابعة دقيقة للجلسات الفردية، التقييمات الإكلينيكية، والفوترة التلقائية</p>
      </div>
      <div>
        <button id="btn-add-session" class="btn btn-primary text-xs font-bold">
          <span>+</span> <span>تسجيل جلسة جديدة</span>
        </button>
      </div>
    </div>

    <div class="card bg-white overflow-hidden">
      ${sessions.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">لا توجد جلسات مسجلة بعد</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">الطفل</th>
                <th class="p-3.5">نوع الجلسة</th>
                <th class="p-3.5">الأخصائية / المعلمة</th>
                <th class="p-3.5">التاريخ والمدة</th>
                <th class="p-3.5">الرسوم والفوترة</th>
                <th class="p-3.5">ملاحظات التقدم</th>
                <th class="p-3.5">الحالة</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${sessions.map(s => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-bold text-slate-800">
                    <div>${s.student_name}</div>
                    <div class="text-[10px] font-mono text-slate-400">#${s.student_code}</div>
                  </td>
                  <td class="p-3.5 font-bold">
                    ${s.session_type === 'speech_therapy' ? '<span class="badge badge-purple">تخاطب ونطق</span>' : '<span class="badge badge-warning">صعوبات تعلم</span>'}
                  </td>
                  <td class="p-3.5 text-slate-700 font-semibold">${s.teacher_name || '-'}</td>
                  <td class="p-3.5 text-slate-500">${s.session_date} (${s.duration_minutes} دقيقة)</td>
                  <td class="p-3.5">
                    <div class="font-bold text-slate-800">${formatEGP(s.fee_amount)}</div>
                    <div class="text-[10px] text-teal-600">${s.is_billed ? 'مفوترة في الحساب ✓' : 'غير مفوترة'}</div>
                  </td>
                  <td class="p-3.5 text-slate-600 max-w-xs truncate">${s.progress_notes || '-'}</td>
                  <td class="p-3.5">${getStatusBadge(s.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  document.getElementById('btn-add-session').addEventListener('click', openAddSessionModal);
}

async function openAddSessionModal() {
  const sRes = await api('/api/students');
  const eRes = await api('/api/employees');
  const students = sRes ? sRes.students : [];
  const employees = eRes ? eRes.employees : [];

  const content = `
    <form id="add-session-form" class="space-y-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">الطفل *</label>
          <select id="sess-student" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 bg-white outline-none">
            <option value="">-- اختر الطفل --</option>
            ${students.map(s => `<option value="${s.id}">#${s.code} - ${s.full_name}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">نوع الجلسة *</label>
          <select id="sess-type" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white outline-none">
            <option value="speech_therapy">جلسة تخاطب وتعديل نطق</option>
            <option value="learning_difficulties">جلسة صعوبات تعلم وتنمية مهارات</option>
            <option value="extra_lesson">درس تقوية إضافي</option>
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">الأخصائية / المعلمة</label>
          <select id="sess-teacher" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white outline-none">
            <option value="">-- اختياري --</option>
            ${employees.map(e => `<option value="${e.id}">${e.full_name} (${e.job_title})</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تاريخ الجلسة</label>
          <input type="date" id="sess-date" value="${new Date().toISOString().substring(0, 10)}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none">
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">مدة الجلسة (بالدقائق)</label>
          <input type="number" id="sess-duration" value="45" min="15" step="15" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none font-bold">
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">رسوم الجلسة (ج.م)</label>
          <input type="number" id="sess-fee" value="200" min="0" step="25" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none font-bold">
        </div>
      </div>

      <div class="p-3 bg-teal-50 border border-teal-100 rounded-xl flex items-center gap-2">
        <input type="checkbox" id="sess-autobill" checked class="w-4 h-4 text-teal-600 rounded">
        <label for="sess-autobill" class="text-xs text-teal-900 font-semibold cursor-pointer">
          إضافة رسوم الجلسة تلقائياً لمطالبات وحساب الطفل (منع الازدواج المالي)
        </label>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">ملاحظات ونتائج الجلسة</label>
        <textarea id="sess-notes" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none" placeholder="مدى التجاوب، التدريبات المنفذة..."></textarea>
      </div>

      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">توصيات موجهة لولي الأمر في المنزل</label>
        <textarea id="sess-recom" rows="2" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs outline-none" placeholder="تدريبات نطق يومية، تقليل الشاشات..."></textarea>
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">حفظ الجلسة</button>
      </div>
    </form>
  `;

  openModal('تسجيل جلسة تخاطب / دعم تعليمي', content, () => {
    document.getElementById('add-session-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        student_id: document.getElementById('sess-student').value,
        session_type: document.getElementById('sess-type').value,
        teacher_id: document.getElementById('sess-teacher').value || null,
        session_date: document.getElementById('sess-date').value,
        duration_minutes: Number(document.getElementById('sess-duration').value),
        fee_amount: Number(document.getElementById('sess-fee').value),
        auto_bill: document.getElementById('sess-autobill').checked,
        progress_notes: document.getElementById('sess-notes').value.trim(),
        recommendations: document.getElementById('sess-recom').value.trim()
      };

      const res = await api('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        closeModal();
        showToast('تم تسجيل الجلسة بنجاح', 'success');
        navigateTo('sessions');
      }
    });
  });
}

function openAddSessionModalForStudent(studentId) {
  openAddSessionModal();
}

// ============================================================================
// PAGE 9: FINANCIAL REPORTS & CASH FLOW CENTER
// ============================================================================
async function renderReports(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري إعداد التقرير المالي الشامل...</div>';

  const res = await api('/api/reports/financial');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في توليد التقارير المالية</div>';
    return;
  }

  const r = res.report;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>📑</span> <span>المركز المالي الشامل والتدفقات النقدية</span>
        </h2>
        <p class="text-xs text-slate-500">فصل دقيق بين الأساس النقدي (السيولة الفعلية) وأساس الاستحقاق (الالتزامات والذمم)</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window.print()" class="btn btn-secondary text-xs">
          🖨️ طباعة التقرير الرسمي
        </button>
      </div>
    </div>

    <!-- Summary Statement Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      
      <div class="card p-5 bg-white border-teal-200">
        <div class="text-xs font-bold text-teal-800">إجمالي المقبوضات المحصلة (Cash In)</div>
        <div class="text-2xl font-black text-teal-900 mt-2">${formatEGP(r.totalRevenue)}</div>
        <div class="text-xs text-slate-500 mt-2 space-y-1">
          <div>المصروفات الشهرية: ${formatEGP(r.tuitionCollected)}</div>
          <div>الرسوم الإضافية: ${formatEGP(r.additionalCollected)}</div>
        </div>
      </div>

      <div class="card p-5 bg-white border-rose-200">
        <div class="text-xs font-bold text-rose-800">إجمالي المصروفات المدفوعة (Cash Out)</div>
        <div class="text-2xl font-black text-rose-900 mt-2">${formatEGP(r.totalExpensesPaid)}</div>
        <div class="text-xs text-slate-500 mt-2 space-y-1">
          <div>رواتب الكادر المسددة: ${formatEGP(r.salariesPaid)}</div>
          <div>النفقات التشغيلية الأخرى: ${formatEGP(r.totalExpensesPaid - r.salariesPaid)}</div>
        </div>
      </div>

      <div class="card p-5 bg-white border-sky-200">
        <div class="text-xs font-bold text-sky-800">صافي التدفق النقدي (Net Cash Flow)</div>
        <div class="text-2xl font-black ${r.netCashFlow >= 0 ? 'text-sky-900' : 'text-rose-900'} mt-2">${formatEGP(r.netCashFlow)}</div>
        <div class="text-xs text-slate-500 mt-2">
          المقبوضات النقدية ناقص المصروفات النقدية الفعلية
        </div>
      </div>

    </div>

    <!-- Accrual & Balance Sheet Obligations -->
    <div class="card p-5 bg-white">
      <h4 class="font-bold text-sm text-slate-900 mb-3 flex items-center gap-2">
        <span>⚖️</span> <span>الأرصدة المحاسبية والالتزامات المعلقة (أساس الاستحقاق)</span>
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        
        <div class="p-3.5 rounded-2xl bg-amber-50 border border-amber-100">
          <div class="text-xs text-amber-800 font-semibold">ذمم وأرصدة أولياء الأمور (مستحقة للحضانة)</div>
          <div class="text-xl font-black text-amber-900 mt-1">${formatEGP(r.outstandingCustomerBalances)}</div>
          <div class="text-[10px] text-amber-600 mt-0.5">رسوم تم استحقاقها ولم تُحصل بعد</div>
        </div>

        <div class="p-3.5 rounded-2xl bg-purple-50 border border-purple-100">
          <div class="text-xs text-purple-800 font-semibold">التزامات رواتب معلقة (واجبة الدفع)</div>
          <div class="text-xl font-black text-purple-900 mt-1">${formatEGP(r.outstandingSalaryObligations)}</div>
          <div class="text-[10px] text-purple-600 mt-0.5">مستحقات معلمات وموظفين</div>
        </div>

        <div class="p-3.5 rounded-2xl bg-rose-50 border border-rose-100">
          <div class="text-xs text-rose-800 font-semibold">مصروفات معلقة للموردين</div>
          <div class="text-xl font-black text-rose-900 mt-1">${formatEGP(r.outstandingExpensesLiabilities)}</div>
          <div class="text-[10px] text-rose-600 mt-0.5">فواتير ونفقات غير مسددة</div>
        </div>

      </div>
    </div>

    <!-- Expenses by Category Breakdown -->
    <div class="card p-5 bg-white">
      <h4 class="font-bold text-sm text-slate-900 mb-3">توزيع المصروفات حسب البنود:</h4>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        ${r.expensesByCategory.map(c => `
          <div class="p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div class="text-slate-500 font-medium">${getExpenseCategoryArabic(c.category)}</div>
            <div class="text-sm font-black text-slate-800 mt-1">${formatEGP(c.total)}</div>
            <div class="text-[10px] text-slate-400 mt-0.5">عدد العمليات: ${c.count}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// PAGE 10: AUDIT LOGS
// ============================================================================
async function renderAudit(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل سجل المراقبة...</div>';

  const res = await api('/api/audit-logs');
  if (!res || !res.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فقط الإدارة العليا يمكنها تصفح سجل المراقبة</div>';
    return;
  }

  const logs = res.logs;

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>🛡️</span> <span>سجل المراقبة والتدقيق الأمني (Audit Trail)</span>
        </h2>
        <p class="text-xs text-slate-500">سجل غير قابل للتعديل يوثق كافة العمليات الحساسة مع اسم المستخدم والتوقيت الدقيق</p>
      </div>
      <div>
        <span class="badge badge-primary font-bold">إجمالي السجلات: ${logs.length}</span>
      </div>
    </div>

    <div class="card bg-white overflow-hidden">
      ${logs.length === 0 ? `
        <div class="p-12 text-center text-slate-400 text-xs">السجل فارغ</div>
      ` : `
        <div class="overflow-x-auto">
          <table class="w-full text-right text-xs">
            <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
              <tr>
                <th class="p-3.5">#</th>
                <th class="p-3.5">المستخدم</th>
                <th class="p-3.5">نوع العملية</th>
                <th class="p-3.5">الكيان / المعرف</th>
                <th class="p-3.5">التفاصيل والتغييرات</th>
                <th class="p-3.5">السبب الموثق</th>
                <th class="p-3.5">التاريخ والوقت (القاهرة)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              ${logs.map(l => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="p-3.5 font-mono text-slate-400">${l.id}</td>
                  <td class="p-3.5 font-bold text-slate-800">${l.user_name}</td>
                  <td class="p-3.5">
                    <span class="badge badge-secondary font-bold">${l.action}</span>
                  </td>
                  <td class="p-3.5 font-mono text-teal-700">${l.entity_type} (#${l.entity_id || '-'})</td>
                  <td class="p-3.5 text-slate-600 max-w-sm font-mono text-[11px] truncate" title="${l.details || ''}">
                    ${l.details || '-'}
                  </td>
                  <td class="p-3.5 text-slate-500">${l.reason || '-'}</td>
                  <td class="p-3.5 text-slate-500 font-mono text-[11px]">${l.created_at}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ============================================================================
// PAGE 11: SETTINGS, USERS & DATA ADMINISTRATION
// ============================================================================
async function renderSettings(container) {
  container.innerHTML = '<div class="p-12 text-center text-slate-400">جاري تحميل إعدادات الحضانة...</div>';

  const setRes = await api('/api/settings');
  const userRes = await api('/api/users');

  if (!setRes || !setRes.success) {
    container.innerHTML = '<div class="p-8 text-center text-rose-500">فشل في تحميل الإعدادات</div>';
    return;
  }

  const s = setRes.settings;
  const users = userRes ? userRes.users : [];

  container.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-lg font-bold text-slate-900 flex items-center gap-2">
          <span>⚙️</span> <span>إعدادات الحضانة وإدارة المستخدمين</span>
        </h2>
        <p class="text-xs text-slate-500">ضبط بيانات الهوية، الصلاحيات، النسخ الاحتياطي والمهام المجدولة</p>
      </div>
    </div>

    <!-- Nursery Info Form -->
    <div class="card p-5 bg-white">
      <h3 class="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
        <span>🏢</span> <span>بيانات وهوية الحضانة</span>
      </h3>
      <form id="settings-form" class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">اسم الحضانة *</label>
            <input type="text" id="set-name" value="${s.nursery_name}" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:border-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">الشعار والوصف</label>
            <input type="text" id="set-slogan" value="${s.slogan || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">رقم الهاتف الأساسي</label>
            <input type="text" id="set-phone" value="${s.phone || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          </div>
          <div>
            <label class="block text-xs font-semibold text-slate-700 mb-1">العنوان</label>
            <input type="text" id="set-address" value="${s.address || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
          </div>
        </div>

        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">تذييل إيصالات القبض (الشروط والتنويهات)</label>
          <input type="text" id="set-footer" value="${s.receipt_footer || ''}" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none">
        </div>

        <div class="flex justify-end pt-2">
          <button type="submit" class="btn btn-primary text-xs font-bold">حفظ بيانات الحضانة</button>
        </div>
      </form>
    </div>

    <!-- Users & Permissions Management -->
    <div class="card p-5 bg-white">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-bold text-sm text-slate-900 flex items-center gap-2">
          <span>👥</span> <span>حسابات المستخدمين والصلاحيات</span>
        </h3>
        <button id="btn-add-user" class="btn btn-secondary text-xs font-bold">
          + إضافة مستخدم جديد
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-right text-xs">
          <thead class="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
            <tr>
              <th class="p-3">اسم المستخدم</th>
              <th class="p-3">الاسم بالكامل</th>
              <th class="p-3">الدور الوظيفي</th>
              <th class="p-3">الحالة</th>
              <th class="p-3">آخر تسجيل دخول</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            ${users.map(u => `
              <tr>
                <td class="p-3 font-mono font-bold text-teal-700">${u.username}</td>
                <td class="p-3 font-bold text-slate-800">${u.full_name}</td>
                <td class="p-3">
                  <span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">
                    ${u.role === 'admin' ? 'مدير عام (صلاحيات كاملة)' : (u.role === 'accountant' ? 'محاسب' : 'معلمة')}
                  </span>
                </td>
                <td class="p-3">${u.is_active ? '<span class="text-emerald-600 font-bold">نشط ✓</span>' : '<span class="text-rose-600">معطل</span>'}</td>
                <td class="p-3 text-slate-400 font-mono text-[11px]">${u.last_login || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Backup & Demo Data Tools -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      
      <div class="card p-5 bg-white">
        <h4 class="font-bold text-xs text-slate-900 mb-2 flex items-center gap-1.5">
          <span>💾</span> <span>النسخ الاحتياطي وحفظ البيانات</span>
        </h4>
        <p class="text-xs text-slate-500 mb-4">تصدير قاعدة البيانات بالكامل كملف JSON لضمان حفظ نسخ أرشيفية آمنة.</p>
        <a href="/api/backup/export-json" download class="btn btn-secondary text-xs font-bold w-full">
          ⬇️ تحميل نسخة احتياطية كاملة (JSON)
        </a>
      </div>

      <div class="card p-5 bg-white">
        <h4 class="font-bold text-xs text-slate-900 mb-2 flex items-center gap-1.5">
          <span>🧪</span> <span>البيانات التجريبية (Demo Data)</span>
        </h4>
        <p class="text-xs text-slate-500 mb-4">تحميل باقة بيانات واقعية لتجربة وفحص كافة مزايا النظام (معلمون، أطفال، حضور، وسندات).</p>
        <button id="btn-seed-demo" class="btn bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-bold w-full">
          ⚡ تحميل بيانات تجريبية (موسومة كـ Demo)
        </button>
      </div>

    </div>
  `;

  document.getElementById('settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      nursery_name: document.getElementById('set-name').value.trim(),
      slogan: document.getElementById('set-slogan').value.trim(),
      phone: document.getElementById('set-phone').value.trim(),
      address: document.getElementById('set-address').value.trim(),
      receipt_footer: document.getElementById('set-footer').value.trim()
    };
    const res = await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    if (res && res.success) {
      showToast('تم حفظ الإعدادات بنجاح', 'success');
    }
  });

  document.getElementById('btn-add-user').addEventListener('click', openAddUserModal);

  document.getElementById('btn-seed-demo').addEventListener('click', async () => {
    if (!confirm('هل تريد إضافة بيانات تجريبية للنظام؟ سيتم وسمها كبيانات تجريبية بوضوح.')) return;
    const res = await api('/api/demo-data/seed', { method: 'POST' });
    if (res && res.success) {
      showToast(res.message, 'success');
      navigateTo('dashboard');
    }
  });
}

function openAddUserModal() {
  const content = `
    <form id="add-user-form" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">اسم المستخدم (للدخول) *</label>
        <input type="text" id="usr-username" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="mona_teacher">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">كلمة المرور *</label>
        <input type="password" id="usr-pass" required minlength="6" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="6 أحرف على الأقل">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">الاسم بالكامل *</label>
        <input type="text" id="usr-name" required class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-teal-500 outline-none" placeholder="أ. منى السيد">
      </div>
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">الدور الوظيفي والصلاحيات *</label>
        <select id="usr-role" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-bold outline-none">
          <option value="teacher" selected>معلمة (حضور، جلسات، تقييمات فقط - محظورة من الماليات)</option>
          <option value="accountant">محاسب (سندات، رسوم، مصروفات، تقارير مالية)</option>
          <option value="admin">مدير عام (صلاحيات كاملة وغير محدودة)</option>
        </select>
      </div>
      <div class="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="btn btn-secondary text-xs">إلغاء</button>
        <button type="submit" class="btn btn-primary text-xs font-bold">إنشاء المستخدم</button>
      </div>
    </form>
  `;

  openModal('إضافة مستخدم جديد للنظام', content, () => {
    document.getElementById('add-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const role = document.getElementById('usr-role').value;
      let perms = [];
      if (role === 'admin') perms = ['*'];
      else if (role === 'accountant') perms = ['students_view', 'guardians_view_contact', 'finances_view', 'payments_record', 'expenses_manage', 'payroll_manage', 'financial_reports'];
      else perms = ['students_view', 'students_edit', 'attendance_record', 'sessions_manage', 'reports_create'];

      const payload = {
        username: document.getElementById('usr-username').value.trim(),
        password: document.getElementById('usr-pass').value,
        full_name: document.getElementById('usr-name').value.trim(),
        role,
        permissions: perms
      };

      const res = await api('/api/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (res && res.success) {
        closeModal();
        showToast('تم إنشاء الحساب بنجاح', 'success');
        navigateTo('settings');
      } else {
        showToast(res ? res.error : 'فشل إنشاء الحساب', 'error');
      }
    });
  });
}

// ============================================================================
// APP INITIALIZATION & EVENT LISTENERS
// ============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Navigation Bar Page Switching
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      navigateTo(btn.dataset.page);
    });
  });

  // Mobile drawer toggle
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.getElementById('sidebar-nav');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('hidden');
    });
  }

  // Quick Action Buttons in Sidebar
  document.getElementById('btn-quick-add-student').addEventListener('click', openAddStudentModal);
  document.getElementById('btn-quick-add-payment').addEventListener('click', openAddPaymentModal);

  // Logout Button
  document.getElementById('btn-logout').addEventListener('click', logout);

  // Notifications Dropdown Toggle
  const notifBtn = document.getElementById('btn-notifications');
  const notifDropdown = document.getElementById('notif-dropdown');
  if (notifBtn && notifDropdown) {
    notifBtn.addEventListener('click', () => {
      notifDropdown.classList.toggle('hidden');
    });
  }

  // Manual Scheduler Run Button
  const runSchedulerBtn = document.getElementById('btn-run-scheduler-now');
  if (runSchedulerBtn) {
    runSchedulerBtn.addEventListener('click', async () => {
      const res = await api('/api/scheduler/run', { method: 'POST' });
      if (res && res.success) {
        showToast('تم تشغيل الفحص الآلي للمتأخرات بنجاح', 'success');
        loadNotifications();
      }
    });
  }

// ============================================================================
// MOBILE ACCESS & CLOUDFLARE TUNNEL MODAL
// ============================================================================
async function openMobileAccessModal() {
  const statusRes = await api('/api/tunnel/status');
  const initialData = statusRes || { running: false, url: null, localIp: '127.0.0.1' };

  function renderModalBody(data) {
    const isRunning = !!(data && data.running && data.url);
    const tunnelUrl = data && data.url ? data.url : '';
    const localIp = data && data.localIp ? data.localIp : '127.0.0.1';
    const localLink = `http://${localIp}:3000`;

    return `
      <div class="flex flex-col gap-5 text-right" id="mobile-modal-content">
        <!-- Introduction Header -->
        <div class="bg-gradient-to-r from-teal-50 to-emerald-50 p-4 rounded-2xl border border-teal-100 flex items-start gap-3">
          <span class="text-2xl">📱</span>
          <div>
            <h4 class="font-bold text-slate-800 text-sm">الوصول للنظام من أي هاتف ذكي (Android / iPhone)</h4>
            <p class="text-xs text-slate-600 mt-1 leading-relaxed">
              يمكنك استخدام هاتفك لتسجيل الحضور، تسجيل الأطفال الجدد بكاميرا الموبايل، ومتابعة الحسابات والمدفوعات من أي مكان!
            </p>
          </div>
        </div>

        <!-- Section 1: Cloudflare Tunnel (Internet Access from anywhere) -->
        <div class="bg-white rounded-2xl border-2 ${isRunning ? 'border-emerald-300 shadow-md shadow-emerald-50' : 'border-slate-200'} p-5 transition-all">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl ${isRunning ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'} flex items-center justify-center font-bold text-sm">🌐</span>
              <div>
                <h5 class="font-bold text-slate-900 text-sm">1. الرابط السحابي عبر الإنترنت (Cloudflare Tunnel)</h5>
                <span class="text-[11px] text-slate-500">يعمل من أي مكان عبر باقة الموبايل (4G/5G) أو من المنزل</span>
              </div>
            </div>
            <span class="px-2.5 py-1 rounded-full text-[11px] font-bold ${isRunning ? 'bg-emerald-100 text-emerald-800 animate-pulse' : 'bg-slate-100 text-slate-600'}">
              ${isRunning ? '● متصل ومتاح الآن' : 'غير مفعّل'}
            </span>
          </div>

          <div class="mt-4">
            ${isRunning ? `
              <div class="flex flex-col items-center gap-4">
                <div class="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
                  <span class="font-mono text-xs text-teal-800 font-bold truncate select-all" id="tunnel-url-text">${tunnelUrl}</span>
                  <button id="btn-copy-tunnel" class="btn btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
                    📋 نسخ الرابط
                  </button>
                </div>

                <!-- QR Code -->
                <div class="flex flex-col items-center bg-white p-3 rounded-2xl border border-slate-200 shadow-sm">
                  <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(tunnelUrl)}" 
                       alt="QR Code" class="w-44 h-44 rounded-lg border border-slate-100" />
                  <span class="text-[11px] text-slate-500 font-semibold mt-2">📷 وجّه كاميرا الموبايل نحو الكود للدخول المباشر</span>
                </div>

                <button id="btn-stop-tunnel" class="btn btn-danger text-xs py-2 w-full mt-1">
                  ⏹️ إيقاف الرابط السحابي
                </button>
              </div>
            ` : `
              <div class="flex flex-col gap-3 py-2 text-center">
                <p class="text-xs text-slate-600">
                  انقر على الزر أدناه لتوليد رابط سحابي آمن ومشفّر (HTTPS) يمكنك مشاركته وفتحه من أي موبايل خارج الحضانة.
                </p>
                <button id="btn-start-tunnel" class="btn btn-primary text-sm py-2.5 w-full flex items-center justify-center gap-2 shadow-md">
                  <span>🚀</span> <span>تفعيل الرابط السحابي الآن (Cloudflare)</span>
                </button>
              </div>
            `}
          </div>
        </div>

        <!-- Section 2: Local Wi-Fi Network Access -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5">
          <div class="flex items-center justify-between pb-3 border-b border-slate-100">
            <div class="flex items-center gap-2">
              <span class="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold text-sm">📶</span>
              <div>
                <h5 class="font-bold text-slate-900 text-sm">2. عبر شبكة الواي فاي المحلية (Wi-Fi)</h5>
                <span class="text-[11px] text-slate-500">يعمل بدون إنترنت عندما يكون الموبايل واللابتوب على نفس الراوتر</span>
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-3">
            <div class="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-2">
              <span class="font-mono text-xs text-slate-800 font-bold select-all" id="local-url-text">${localLink}</span>
              <button id="btn-copy-local" class="btn btn-secondary text-xs py-1.5 px-3 flex-shrink-0">
                📋 نسخ
              </button>
            </div>
            <p class="text-[11px] text-slate-500 leading-relaxed">
              💡 <strong>ملاحظة:</strong> افتح متصفح هاتفك واكتب الرابط أعلاه، وسيفتح البرنامج فوراً وبشكل محلي فائق السرعة.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  function attachModalEvents(currentData) {
    // Copy Tunnel URL
    const copyTunnelBtn = document.getElementById('btn-copy-tunnel');
    if (copyTunnelBtn && currentData.url) {
      copyTunnelBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(currentData.url);
        copyTunnelBtn.innerText = 'تم النسخ ✓';
        setTimeout(() => { copyTunnelBtn.innerText = '📋 نسخ الرابط'; }, 2000);
        showToast('تم نسخ الرابط السحابي بنجاح', 'success');
      });
    }

    // Copy Local URL
    const copyLocalBtn = document.getElementById('btn-copy-local');
    if (copyLocalBtn && currentData.localIp) {
      copyLocalBtn.addEventListener('click', () => {
        const url = `http://${currentData.localIp}:3000`;
        navigator.clipboard.writeText(url);
        copyLocalBtn.innerText = 'تم النسخ ✓';
        setTimeout(() => { copyLocalBtn.innerText = '📋 نسخ'; }, 2000);
        showToast('تم نسخ رابط الواي فاي بنجاح', 'success');
      });
    }

    // Start Tunnel Button
    const startBtn = document.getElementById('btn-start-tunnel');
    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        startBtn.disabled = true;
        startBtn.innerHTML = `
          <span class="inline-block animate-spin ml-2">⏳</span>
          <span>جاري الاتصال بـ Cloudflare وتوليد الرابط الآمن...</span>
        `;
        try {
          const res = await api('/api/tunnel/start', { method: 'POST' });
          if (res && res.success && res.url) {
            showToast('تم تفعيل الرابط السحابي بنجاح! 🚀', 'success');
            const contentDiv = document.querySelector('.modal-content > div:nth-child(2)');
            if (contentDiv) {
              contentDiv.innerHTML = renderModalBody(res);
              attachModalEvents(res);
            }
          } else {
            showToast(res && res.error ? res.error : 'فشل بدء النفق السحابي', 'error');
            startBtn.disabled = false;
            startBtn.innerHTML = `<span>🚀</span> <span>تفعيل الرابط السحابي الآن (Cloudflare)</span>`;
          }
        } catch (e) {
          showToast('حدث خطأ أثناء محاولة الاتصال', 'error');
          startBtn.disabled = false;
          startBtn.innerHTML = `<span>🚀</span> <span>تفعيل الرابط السحابي الآن (Cloudflare)</span>`;
        }
      });
    }

    // Stop Tunnel Button
    const stopBtn = document.getElementById('btn-stop-tunnel');
    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        stopBtn.disabled = true;
        stopBtn.innerText = 'جاري الإيقاف...';
        await api('/api/tunnel/stop', { method: 'POST' });
        showToast('تم إيقاف الرابط السحابي بنجاح', 'info');
        const contentDiv = document.querySelector('.modal-content > div:nth-child(2)');
        if (contentDiv) {
          const updated = { running: false, url: null, localIp: currentData.localIp };
          contentDiv.innerHTML = renderModalBody(updated);
          attachModalEvents(updated);
        }
      });
    }
  }

  openModal('📱 تشغيل النظام على الموبايل (عبر الإنترنت أو الواي فاي)', renderModalBody(initialData), () => {
    attachModalEvents(initialData);
  });
}

  // Mobile Access Modal Button
  const mobileBtn = document.getElementById('btn-mobile-access');
  if (mobileBtn) {
    mobileBtn.addEventListener('click', openMobileAccessModal);
  }

  // Start Application
  const isAuth = await checkAuth();
  if (isAuth) {
    navigateTo('dashboard');
  }
});
