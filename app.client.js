// app.client.js - FULL FEATURES WITH DROPDOWNS & CHARTS FIXED
const API_BASE = '/api';

let currentUser = null;
let socket = null;
let qrScanner = null;
let performanceChart = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  console.log('🚀 WFMS Full Client Loaded');

  bindEvents();
  checkAuthStatus();
  initSocket();
  loadGlobalFunctions();
}

// ===== EVENT BINDING =====
function bindEvents() {
  const loginBtn = document.querySelector('#login-container .btn-primary');
  const registerBtn = document.querySelector('#register-container .btn-primary');
  loginBtn?.addEventListener('click', (e) => { e.preventDefault(); login(); });
  registerBtn?.addEventListener('click', (e) => { e.preventDefault(); register(); });

  // Attendance buttons
  document.querySelector('.attendance-buttons .btn-success')?.addEventListener('click', clockIn);
  document.querySelector('.attendance-buttons .btn-warning')?.addEventListener('click', breakStart);
  document.querySelector('.attendance-buttons .btn-info')?.addEventListener('click', breakEnd);
  document.querySelector('.attendance-buttons .btn-danger')?.addEventListener('click', clockOut);

  // Task form - create task button
  document.querySelector('#admin-panel [onclick="addTask()"]')?.addEventListener('click', addTask);
  document.querySelector('#admin-panel [onclick="createTeam()"]')?.addEventListener('click', createTeam);
}

function loadGlobalFunctions() {
  window.login = login;
  window.register = register;
  window.logout = logout;
  window.clockIn = clockIn;
  window.clockOut = clockOut;
  window.breakStart = breakStart;
  window.breakEnd = breakEnd;
  window.addTask = addTask;
  window.createTeam = createTeam;
  window.downloadReport = downloadReport;
  window.initQRScanner = initQRScanner;
  window.manualQREntry = manualQREntry;
  console.log('✅ Global onclick functions loaded');
}

// ===== AUTH =====
async function login() {
  const email = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!email || !password) return showMessage('Email/password required', 'error');

  showMessage('Signing in...', 'info');

  try {
    const resp = await fetch(`${API_BASE}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await resp.json();

    if (!data.ok) return showMessage(data.error, 'error');

    saveAuth(data);
    showDashboard(data.user);
    showMessage(`Welcome ${data.user.name}`, 'success');

  } catch (err) {
    showMessage(err.message, 'error');
  }
}

async function register() {
  const name = document.getElementById('regUsername').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;

  if (!name || !email || password.length < 6) return showMessage('Invalid input', 'error');

  try {
    const resp = await fetch(`${API_BASE}/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, role })
    });

    const data = await resp.json();

    if (!data.ok) return showMessage(data.error, 'error');

    showMessage('Account created!', 'success');
    backToLogin();

  } catch (err) {
    showMessage('Registration failed', 'error');
  }
}

// ===== UI FUNCTIONS =====
function showRegister() { toggleView('register'); }
function backToLogin() { toggleView('login'); }

function toggleView(view) {
  document.getElementById('login-container')?.classList.toggle('hidden', view !== 'login');
  document.getElementById('register-container')?.classList.toggle('hidden', view !== 'register');
}

// ===== DASHBOARD =====
async function showDashboard(user) {
  currentUser = user;

  document.getElementById('auth-overlay')?.classList.add('hidden');
  document.getElementById('dashboard')?.classList.remove('hidden');

  document.getElementById('welcome').textContent = `Welcome, ${user.name} (${user.role})`;

  await dashboardLoad();
}

async function dashboardLoad() {
  console.log('Loading dashboard...');
  
  await Promise.all([
    loadStats(),
    loadTasks(),
    loadAttendance(),
    currentUser.role === 'admin' ? loadEmployees() : Promise.resolve(),
    currentUser.role === 'admin' ? loadTeams() : Promise.resolve(),
    loadUsersForDropdowns(),
    loadCategoriesForDropdowns(),
    currentUser.role === 'admin' ? initPerformanceChart() : Promise.resolve(),
    loadLogs()
  ]);

  document.getElementById('admin-panel')?.classList.toggle('hidden', currentUser.role !== 'admin');
  document.getElementById('worker-panel')?.classList.toggle('hidden', currentUser.role !== 'worker');
  
  if (currentUser.role === 'admin') initImpersonationUI();
  
  loadNotifications();
  console.log('✅ Dashboard fully loaded with dropdowns & chart');
}

// ===== DATA LOADERS =====
async function loadStats() {
  try {
    const [usersResp, tasksResp, logsResp] = await Promise.all([
      apiGet('/users'),
      apiGet('/tasks'),
      apiGet('/logs/count')
    ]);
    document.getElementById('totalEmployees').textContent = usersResp.users?.length || usersResp.data?.length || 0;
    document.getElementById('totalTasks').textContent = tasksResp.data?.length || tasksResp.tasks?.length || 0;
    document.getElementById('totalLogs').textContent = logsResp.count || logsResp.totalLogs || 0;
  } catch (e) {
    console.error('Stats load error:', e);
  }
}

async function loadTasks() {
  try {
    const resp = await apiGet('/tasks');
    const tasks = resp.data || [];
    renderTasks(tasks, '#taskList');
    if (currentUser.role !== 'admin') renderTasks(tasks.filter(t => t.assigned_to === currentUser.id), '#myTaskList');
  } catch (e) {
    console.error('Tasks load error:', e);
  }
}

async function loadEmployees() {
  try {
    const resp = await apiGet('/users');
    const employees = resp.data || [];
    renderEmployees(employees, '#employeeList');
  } catch (e) {
    console.error('Employees load error:', e);
  }
}

async function loadTeams() {
  try {
    const resp = await apiGet('/teams');
    const teams = resp.data || [];
    renderTeams(teams, '#teamsList');
  } catch (e) {
    console.error('Teams load error:', e);
  }
}

async function loadAttendance() {
  try {
    let resp = await apiGet('/api/attendance/summary/weekly');
    if (!resp.summary) resp = await apiGet('/api/attendance/summary');
    const summary = resp.summary || {};
    renderAttendanceSummary(summary, '#attendanceSummary');
  } catch (e) {
    console.error('Attendance load error:', e);
  }
}

async function loadLogs() {
  try {
    const resp = await apiGet('/logs?limit=50');
    renderLogs(resp.logs || resp.data || [], '#log');
  } catch (e) {
    console.error('Logs load error:', e);
  }
}

// ===== DROPDOWN POPULATION (NEW) =====
async function loadUsersForDropdowns() {
  try {
    const resp = await apiGet('/users');
    const users = resp.users || resp.data || [];
    
    const assignSelect = document.getElementById('taskAssign');
    if (assignSelect) {
      assignSelect.innerHTML = '<option value="">Select Employee</option>' + 
        users.map(u => `<option value="${u._id}">${u.name} (${u.email})</option>`).join('');
    }
    
    const teamLeadSelect = document.getElementById('teamLead');
    if (teamLeadSelect) {
      teamLeadSelect.innerHTML = '<option value="">Select Team Lead</option>' + 
        users.filter(u => u.role !== 'worker').map(u => `<option value="${u._id}">${u.name}</option>`).join('');
    }
    
    const teamMembersSelect = document.getElementById('teamMembers');
    if (teamMembersSelect) {
      teamMembersSelect.innerHTML = users.map(u => `<option value="${u._id}">${u.name} - ${u.role}</option>`).join('');
    }
    
    console.log('✅ Dropdowns populated');
  } catch (e) {
    console.error('Dropdown load error:', e);
  }
}

async function loadCategoriesForDropdowns() {
  const categories = ['General', 'Development', 'Design', 'Support', 'HR', 'Finance'];
  const catSelect = document.getElementById('taskCategory');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Select Category</option>' + 
      categories.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('');
  }
}

// ===== CHART INITIALIZATION =====
async function initPerformanceChart() {
  try {
    const resp = await apiGet('/api/admin/performance-metrics');
    const data = resp || [];
    
    const ctx = document.getElementById('performanceChart')?.getContext('2d');
    if (ctx && window.Chart && !performanceChart) {
      performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.map(d => d.name),
          datasets: [{
            label: 'Completion Rate %',
            data: data.map(d => d.completion_rate),
            backgroundColor: 'rgba(16,185,129,0.6)',
            borderColor: '#10b981',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          scales: { y: { beginAtZero: true, max: 100 } }
        }
      });
      console.log('✅ Performance chart loaded');
    }
  } catch (e) {
    console.error('Chart init error:', e);
  }
}

// ===== IMPERSONATION UI =====
function initImpersonationUI() {
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel && !adminPanel.querySelector('.impersonation-section')) {
    const impSection = document.createElement('div');
    impSection.className = 'card impersonation-section';
    impSection.style.marginBottom = '20px';
    impSection.innerHTML = `
      <div class="card-header-custom">
        <h5>🔐 Impersonation</h5>
      </div>
      <button class="btn btn-warning" onclick="impersonateUser()">👤 Impersonate User</button>
    `;
    adminPanel.insertAdjacentElement('afterbegin', impSection);
  }
}

async function impersonateUser() {
  const userId = prompt('Enter user ID to impersonate:');
  if (!userId) return;
  
  try {
    const resp = await apiPost('/admin/impersonate', { target_user_id: userId, reason: 'Testing' });
    if (resp.ok) {
      localStorage.setItem('token', resp.token);
      location.reload();
      showMessage('Impersonation active', 'warning');
    }
  } catch (e) {
    showMessage('Impersonation failed: ' + e.message, 'error');
  }
}

// ===== RENDER FUNCTIONS =====
function renderTasks(tasks, containerId) {
  const container = document.querySelector(containerId);
  if (!container) return;
  
  container.innerHTML = tasks.map(task => `
    <div class="task-item">
      <strong>${task.title}</strong> 
      ${task.priority ? `<span class="badge priority-${task.priority.toLowerCase()}">${task.priority.toUpperCase()}</span>` : ''}
      <small>${task.status || 'pending'}</small>
    </div>
  `).join('');
}

function renderEmployees(employees, containerId) {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.innerHTML = employees.map(emp => `
    <div class="employee-card">
      <div class="employee-avatar">${emp.name?.[0] || '?'}</div>
      <div>${emp.name}</div>
      <small>${emp.role}</small>
    </div>
  `).join('');
}

function renderTeams(teams, containerId) {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.innerHTML = teams.map(team => `
    <div class="team-card">
      <strong>${team.name}</strong> - ${team.department}
      ${team.lead_name ? `<div class="team-lead-badge">Lead: ${team.lead_name}</div>` : ''}
    </div>
  `).join('');
}

function renderAttendanceSummary(summary, containerId) {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.innerHTML = `
    <div>Records: ${summary.total_records || 0} | Unique Users: ${summary.unique_users || 0}</div>
  `;
}

function renderLogs(logs, containerId) {
  const container = document.querySelector(containerId);
  if (!container) return;
  container.innerHTML = logs.map(log => `<p>[${log.level}] ${log.message}</p>`).join('');
}

function renderNotifications(notifications) {
  const panel = document.getElementById('notificationsPanel');
  if (!panel) return;
  panel.innerHTML = notifications.map(notif => `
    <div class="notification-item notification-${notif.type || 'info'}">
      <div class="toast-content">${notif.message}</div>
      <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
    </div>
  `).join('');
}

// ===== ATTENDANCE ACTIONS =====
async function recordAttendance(action) {
  try {
    await apiPost('/attendance', { action });
    showMessage(`${action.replace('_', ' ')} recorded`, 'success');
    loadAttendance();
  } catch (e) {
    showMessage('Attendance error', 'error');
  }
}

// ===== TASK CREATION =====
async function addTask() {
  const formData = {
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDesc').value,
    assigned_to: document.getElementById('taskAssign').value,
    priority: document.getElementById('taskPriority').value || 'medium',
    category: document.getElementById('taskCategory').value,
    tags: document.getElementById('taskTags').value.split(',').map(t => t.trim()).filter(Boolean),
    due_date: document.getElementById('taskDueDate').value
  };

  try {
    const resp = await apiPost('/tasks', formData);
    if (resp.ok) {
      showMessage('Task created!', 'success');
      document.getElementById('taskTitle').value = '';
      loadTasks();
    }
  } catch (e) {
    showMessage('Task creation failed', 'error');
  }
}

// ===== TEAM CREATION =====
async function createTeam() {
  const formData = {
    name: document.getElementById('teamName').value,
    department: document.getElementById('teamDepartment').value,
    description: document.getElementById('teamDescription').value,
    lead: document.getElementById('teamLead').value,
    members: Array.from(document.getElementById('teamMembers').selectedOptions).map(opt => opt.value)
  };

  try {
    const resp = await apiPost('/teams', formData);
    if (resp.ok) {
      showMessage('Team created!', 'success');
      loadTeams();
    }
  } catch (e) {
    showMessage('Team creation failed', 'error');
  }
}

// ===== REPORT DOWNLOAD =====
async function downloadReport(format) {
  try {
    const resp = await apiGet(`/admin/reports/${format}`);
    const blob = new Blob([resp.data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wfms-report-${format}-${new Date().toISOString().split('T')[0]}.${format}`;
    a.click();
    showMessage(`Report downloaded!`, 'success');
  } catch (e) {
    showMessage('Download failed', 'error');
  }
}

// ===== QR SCANNER =====
async function initQRScanner(mode = 'login') {
  const container = document.getElementById('qrScannerContainer');
  if (container) container.classList.remove('hidden');

  if (typeof Html5Qrcode === 'undefined') {
    showMessage('QR scanner loading...', 'info');
    return;
  }

  const reader = document.getElementById('qr-reader');
  qrScanner = new Html5Qrcode(reader);

  const config = { fps: 10, qrbox: { width: 250, height: 250 } };
  qrScanner.start(
    { facingMode: "environment" },
    config,
    (decodedText) => {
      qrScanner.stop().then(() => {
        closeQRScanner();
        showMessage(`QR scanned: ${decodedText.substring(0, 20)}...`, 'success');
      });
    },
    (error) => {}
  ).catch(err => showMessage('Camera error: ' + err, 'error'));
}

function manualQREntry() {
  const code = prompt('Enter QR code manually:');
  if (code) showMessage(`Manual QR: ${code}`, 'success');
}

// ===== UTILITIES =====
function apiGet(endpoint) {
  return fetch(`${API_BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  }).then(r => r.json());
}

async function apiPost(endpoint, data) {
  return fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`
    },
    body: JSON.stringify(data)
  }).then(r => r.json());
}

function showLogin() {
  document.getElementById('auth-overlay')?.classList.remove('hidden');
  document.getElementById('dashboard')?.classList.add('hidden');
}

function saveAuth(data) {
  localStorage.setItem('token', data.token);
  currentUser = data.user;
}

async function checkAuthStatus() {
  const token = localStorage.getItem('token');
  if (!token) return showLogin();

  try {
    const data = await apiGet('/auth/me');
    if (data.ok) showDashboard(data.user);
    else logout();
  } catch {
    logout();
  }
}

function initSocket() {
  if (typeof io === 'undefined') return;

  socket = io();

  socket.on('connect', () => console.log('✅ Socket connected'));

  socket.on('tasks_updated', () => loadTasks());
  socket.on('stats_updated', () => loadStats());
  socket.on('logs_updated', () => loadLogs());
  socket.on('attendance_updated', () => loadAttendance());
  socket.on('notification', (notif) => {
    showToast(notif.message, notif.type || 'info');
    loadNotifications();
  });
}

function closeQRScanner() {
  const container = document.getElementById('qrScannerContainer');
  if (container) container.classList.add('hidden');
  if (qrScanner) {
    qrScanner.stop().catch(() => {});
    qrScanner = null;
  }
}

function showToast(msg, type = 'info') {
  const toastTypes = {
    'critical': 'notification-critical',
    'error': 'notification-critical',
    'success': 'notification-success',
    'good': 'notification-success',
    'warning': 'notification-warning',
    'info': 'notification-info'
  };
  const toastClass = toastTypes[type] || 'notification-info';
  
  const toast = document.createElement('div');
  toast.className = `toast ${toastClass}`;
  toast.innerHTML = `
    <div class="toast-content">${msg}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;
  document.getElementById('toast-container').appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function showMessage(msg, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${msg}`);
  showToast(msg, type);
}

console.log('✅ WFMS Full Client Ready - Dropdowns, Charts, Impersonation Working');
