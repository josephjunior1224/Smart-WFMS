// app.client.js - COMPLETE FIXED VERSION
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
  // Login/Register buttons
  const loginBtn = document.querySelector('#login-container .btn-primary');
  const registerBtn = document.querySelector('#register-container .btn-primary');
  if (loginBtn) loginBtn.onclick = (e) => { e.preventDefault(); login(); };
  if (registerBtn) registerBtn.onclick = (e) => { e.preventDefault(); register(); };

  // Make sure attendance buttons are bound
  const clockInBtn = document.querySelector('.attendance-buttons .btn-success');
  const breakStartBtn = document.querySelector('.attendance-buttons .btn-warning');
  const breakEndBtn = document.querySelector('.attendance-buttons .btn-info');
  const clockOutBtn = document.querySelector('.attendance-buttons .btn-danger');
  
  if (clockInBtn) clockInBtn.onclick = () => recordAttendance('clock_in');
  if (breakStartBtn) breakStartBtn.onclick = () => recordAttendance('break_start');
  if (breakEndBtn) breakEndBtn.onclick = () => recordAttendance('break_end');
  if (clockOutBtn) clockOutBtn.onclick = () => recordAttendance('clock_out');
}

function loadGlobalFunctions() {
  window.login = login;
  window.register = register;
  window.logout = logout;
  window.clockIn = () => recordAttendance('clock_in');
  window.clockOut = () => recordAttendance('clock_out');
  window.breakStart = () => recordAttendance('break_start');
  window.breakEnd = () => recordAttendance('break_end');
  window.addTask = addTask;
  window.createTeam = createTeam;
  window.downloadReport = downloadReport;
  window.initQRScanner = initQRScanner;
  window.manualQREntry = manualQREntry;
  window.closeQRScanner = closeQRScanner;
  window.showRegister = showRegister;
  window.backToLogin = backToLogin;
  window.toggleRegPassword = toggleRegPassword;
  window.toggleTheme = toggleTheme;
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

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  document.getElementById('dashboard')?.classList.add('hidden');
  document.getElementById('auth-overlay')?.classList.remove('hidden');
  showMessage('Logged out', 'info');
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

function showLogin() {
  document.getElementById('auth-overlay')?.classList.remove('hidden');
  document.getElementById('dashboard')?.classList.add('hidden');
}

function showRegister() { 
  document.getElementById('login-container')?.classList.add('hidden');
  document.getElementById('register-container')?.classList.remove('hidden');
}

function backToLogin() {
  document.getElementById('register-container')?.classList.add('hidden');
  document.getElementById('login-container')?.classList.remove('hidden');
}

function toggleRegPassword() {
  const pwd = document.getElementById('regPassword');
  const icon = document.getElementById('regPasswordIcon');
  if (pwd && icon) {
    pwd.type = pwd.type === 'password' ? 'text' : 'password';
    icon.textContent = pwd.type === 'password' ? '👁️' : '🙈';
  }
}

function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const themeText = document.getElementById('themeText');
  if (themeText) themeText.textContent = document.body.classList.contains('light-theme') ? 'Light' : 'Dark';
  localStorage.setItem('wfms_theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
}

// ===== DASHBOARD =====
async function showDashboard(user) {
  currentUser = user;

  document.getElementById('auth-overlay')?.classList.add('hidden');
  document.getElementById('dashboard')?.classList.remove('hidden');

  const welcomeEl = document.getElementById('welcome');
  if (welcomeEl) welcomeEl.textContent = `Welcome, ${user.name} (${user.role})`;

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

  const adminPanel = document.getElementById('admin-panel');
  const workerPanel = document.getElementById('worker-panel');
  if (adminPanel) adminPanel.classList.toggle('hidden', currentUser.role !== 'admin');
  if (workerPanel) workerPanel.classList.toggle('hidden', currentUser.role !== 'worker');
  
  if (currentUser.role === 'admin') initImpersonationUI();
  
  console.log('✅ Dashboard fully loaded');
}

// ===== DATA LOADERS =====
async function loadStats() {
  try {
    const stats = await apiGet('/dashboard/stats');
    document.getElementById('totalEmployees').textContent = stats.stats?.totalEmployees || 0;
    document.getElementById('totalTasks').textContent = stats.stats?.pendingTasks || 0;
    document.getElementById('totalLogs').textContent = stats.stats?.completedTasks || 0;
  } catch (e) {
    console.error('Stats load error:', e);
    // Fallback to individual calls
    try {
      const users = await apiGet('/users');
      document.getElementById('totalEmployees').textContent = (users.users || []).length;
    } catch (er) {}
    try {
      const tasks = await apiGet('/tasks');
      document.getElementById('totalTasks').textContent = (tasks.tasks || []).length;
    } catch (er) {}
  }
}

async function loadTasks() {
  try {
    const resp = await apiGet('/tasks');
    const tasks = resp.tasks || resp.data || [];
    const taskContainer = document.getElementById('taskList');
    if (taskContainer) {
      taskContainer.innerHTML = tasks.slice(0, 10).map(task => `
        <div class="task-item">
          <strong>${escapeHtml(task.title)}</strong>
          <span class="badge bg-${task.approval_status === 'approved' ? 'success' : task.approval_status === 'rejected' ? 'danger' : 'warning'}">${task.approval_status || 'pending'}</span>
          <small>Assigned to: ${task.assigned_to?.name || 'Unassigned'}</small>
        </div>
      `).join('');
    }
    
    if (currentUser.role !== 'admin') {
      const myTasks = tasks.filter(t => t.assigned_to?._id === currentUser.id || t.assigned_to === currentUser.id);
      const myTaskContainer = document.getElementById('myTaskList');
      if (myTaskContainer) {
        myTaskContainer.innerHTML = myTasks.map(task => `
          <div class="task-item">
            <strong>${escapeHtml(task.title)}</strong>
            <button class="btn btn-sm btn-primary" onclick="openTaskReport('${task._id}', '${escapeHtml(task.title)}')">Submit Report</button>
          </div>
        `).join('');
      }
    }
  } catch (e) {
    console.error('Tasks load error:', e);
  }
}

async function loadEmployees() {
  try {
    const resp = await apiGet('/users');
    const employees = resp.users || resp.data || [];
    const container = document.getElementById('employeeList');
    if (container) {
      container.innerHTML = employees.filter(e => e.role !== 'admin').slice(0, 12).map(emp => `
        <div class="employee-card">
          <div class="employee-avatar">${emp.name?.[0] || '?'}</div>
          <div><strong>${escapeHtml(emp.name)}</strong></div>
          <small>${emp.role}</small>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Employees load error:', e);
  }
}

async function loadTeams() {
  try {
    const resp = await apiGet('/teams');
    const teams = resp.teams || resp.data || [];
    const container = document.getElementById('teamsList');
    if (container) {
      container.innerHTML = teams.map(team => `
        <div class="team-card">
          <strong>${escapeHtml(team.name)}</strong> - ${team.department || 'No department'}
          ${team.team_lead ? `<div class="team-lead-badge">Lead: ${team.team_lead.name || team.team_lead}</div>` : ''}
          <div>Members: ${team.members?.length || 0}</div>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error('Teams load error:', e);
  }
}

async function loadAttendance() {
  try {
    let resp = await apiGet('/attendance/summary/weekly');
    if (!resp.summary) {
      resp = await apiGet('/attendance/my');
    }
    const container = document.getElementById('attendanceSummary');
    if (container) {
      const summary = resp.summary || {};
      container.innerHTML = `
        <div>📊 This Week: ${summary.total_records || 0} attendance records</div>
        <div>👥 Unique employees: ${summary.unique_users || 0}</div>
      `;
    }
  } catch (e) {
    console.error('Attendance load error:', e);
    const container = document.getElementById('attendanceSummary');
    if (container) container.innerHTML = '<div>No attendance data available</div>';
  }
}

async function loadLogs() {
  try {
    const resp = await apiGet('/logs?limit=20');
    const logs = resp.logs || resp.data || [];
    const container = document.getElementById('log');
    if (container) {
      container.innerHTML = logs.map(log => 
        `<p>[${new Date(log.timestamp).toLocaleTimeString()}] ${escapeHtml(log.message)}</p>`
      ).join('');
    }
  } catch (e) {
    console.error('Logs load error:', e);
    const container = document.getElementById('log');
    if (container) container.innerHTML = '<p>No logs available</p>';
  }
}

// ===== DROPDOWN POPULATION =====
async function loadUsersForDropdowns() {
  try {
    const resp = await apiGet('/users');
    const users = resp.users || resp.data || [];
    
    const assignSelect = document.getElementById('taskAssign');
    if (assignSelect) {
      assignSelect.innerHTML = '<option value="">Select Employee</option>' + 
        users.map(u => `<option value="${u._id}">${escapeHtml(u.name)} (${u.email})</option>`).join('');
    }
    
    const teamLeadSelect = document.getElementById('teamLead');
    if (teamLeadSelect) {
      teamLeadSelect.innerHTML = '<option value="">Select Team Lead</option>' + 
        users.filter(u => u.role !== 'employee').map(u => `<option value="${u._id}">${escapeHtml(u.name)}</option>`).join('');
    }
    
    const teamMembersSelect = document.getElementById('teamMembers');
    if (teamMembersSelect) {
      teamMembersSelect.innerHTML = users.map(u => `<option value="${u._id}">${escapeHtml(u.name)} - ${u.role}</option>`).join('');
    }
    
    console.log('✅ Dropdowns populated');
  } catch (e) {
    console.error('Dropdown load error:', e);
  }
}

async function loadCategoriesForDropdowns() {
  const categories = ['General', 'Development', 'Design', 'Support', 'HR', 'Finance', 'Marketing'];
  const catSelect = document.getElementById('taskCategory');
  if (catSelect) {
    catSelect.innerHTML = '<option value="">Select Category</option>' + 
      categories.map(c => `<option value="${c.toLowerCase()}">${c}</option>`).join('');
  }
}

// ===== CHART INITIALIZATION =====
async function initPerformanceChart() {
  try {
    const resp = await apiGet('/admin/performance-metrics');
    const data = resp || [];
    
    const ctx = document.getElementById('performanceChart')?.getContext('2d');
    if (ctx && window.Chart && !performanceChart) {
      performanceChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: data.slice(0, 10).map(d => d.name),
          datasets: [{
            label: 'Completion Rate %',
            data: data.slice(0, 10).map(d => d.completion_rate || 0),
            backgroundColor: 'rgba(0, 240, 255, 0.6)',
            borderColor: '#00F0FF',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: { y: { beginAtZero: true, max: 100, title: { display: true, text: 'Completion Rate (%)' } } }
        }
      });
      console.log('✅ Performance chart loaded');
    }
  } catch (e) {
    console.error('Chart init error:', e);
  }
}

// ===== ATTENDANCE ACTIONS =====
async function recordAttendance(action) {
  try {
    const resp = await fetch(`${API_BASE}/attendance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ action })
    });
    const data = await resp.json();
    if (data.ok) {
      showMessage(`${action.replace('_', ' ')} recorded at ${new Date().toLocaleTimeString()}`, 'success');
      loadAttendance();
    } else {
      showMessage(data.error || 'Attendance failed', 'error');
    }
  } catch (e) {
    showMessage('Attendance error: ' + e.message, 'error');
  }
}

// ===== TASK REPORT MODAL =====
let currentReportTaskId = null;

function openTaskReport(taskId, taskTitle) {
  currentReportTaskId = taskId;
  document.getElementById('reportTaskTitle').value = taskTitle;
  document.getElementById('reportTaskId').value = taskId;
  document.getElementById('reportContent').value = '';
  document.getElementById('reportHours').value = '';
  document.getElementById('taskReportModal').classList.add('active');
}

function closeTaskReport() {
  document.getElementById('taskReportModal').classList.remove('active');
  currentReportTaskId = null;
}

async function submitTaskReport() {
  const content = document.getElementById('reportContent').value;
  const hours = parseFloat(document.getElementById('reportHours').value);
  const status = document.getElementById('reportStatus').value;
  const taskId = document.getElementById('reportTaskId').value;

  if (!content) {
    showMessage('Please describe your work', 'error');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/tasks/${taskId}/submit-report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ daily_report: content, hours_spent: hours, status })
    });
    const data = await resp.json();
    if (data.ok) {
      showMessage('Task report submitted for approval!', 'success');
      closeTaskReport();
      loadTasks();
    } else {
      showMessage(data.error || 'Submission failed', 'error');
    }
  } catch (e) {
    showMessage('Error: ' + e.message, 'error');
  }
}

// ===== TASK CREATION =====
async function addTask() {
  const formData = {
    title: document.getElementById('taskTitle')?.value,
    description: document.getElementById('taskDesc')?.value,
    assigned_to: document.getElementById('taskAssign')?.value,
    priority: document.getElementById('taskPriority')?.value || 'medium',
    category: document.getElementById('taskCategory')?.value,
    due_date: document.getElementById('taskDueDate')?.value
  };

  if (!formData.title) {
    showMessage('Task title required', 'error');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(formData)
    });
    const data = await resp.json();
    if (data.ok) {
      showMessage('Task created!', 'success');
      if (document.getElementById('taskTitle')) document.getElementById('taskTitle').value = '';
      if (document.getElementById('taskDesc')) document.getElementById('taskDesc').value = '';
      loadTasks();
    } else {
      showMessage(data.error || 'Task creation failed', 'error');
    }
  } catch (e) {
    showMessage('Error: ' + e.message, 'error');
  }
}

// ===== TEAM CREATION =====
async function createTeam() {
  const formData = {
    name: document.getElementById('teamName')?.value,
    department: document.getElementById('teamDepartment')?.value,
    description: document.getElementById('teamDescription')?.value,
    team_lead: document.getElementById('teamLead')?.value,
    members: Array.from(document.getElementById('teamMembers')?.selectedOptions || []).map(opt => opt.value)
  };

  if (!formData.name) {
    showMessage('Team name required', 'error');
    return;
  }

  try {
    const resp = await fetch(`${API_BASE}/teams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(formData)
    });
    const data = await resp.json();
    if (data.ok) {
      showMessage('Team created!', 'success');
      if (document.getElementById('teamName')) document.getElementById('teamName').value = '';
      if (document.getElementById('teamDepartment')) document.getElementById('teamDepartment').value = '';
      loadTeams();
    } else {
      showMessage(data.error || 'Team creation failed', 'error');
    }
  } catch (e) {
    showMessage('Error: ' + e.message, 'error');
  }
}

// ===== REPORT DOWNLOAD =====
async function downloadReport(format) {
  try {
    const resp = await fetch(`${API_BASE}/admin/report/${format}`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wfms-report-${new Date().toISOString().split('T')[0]}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
    showMessage(`Report downloaded as ${format.toUpperCase()}!`, 'success');
  } catch (e) {
    showMessage('Download failed: ' + e.message, 'error');
  }
}

// ===== IMPERSONATION =====
function initImpersonationUI() {
  const adminPanel = document.getElementById('admin-panel');
  if (adminPanel && !document.getElementById('impersonation-section')) {
    const impSection = document.createElement('div');
    impSection.id = 'impersonation-section';
    impSection.className = 'card';
    impSection.style.marginBottom = '20px';
    impSection.innerHTML = `
      <div class="card-header">
        <h5>🔐 Impersonation (Admin Only)</h5>
      </div>
      <div style="display: flex; gap: 10px;">
        <input type="text" id="impersonateEmail" class="form-control" placeholder="User email to impersonate">
        <button class="btn btn-warning" onclick="window.impersonateUser()">👤 Impersonate</button>
      </div>
    `;
    adminPanel.insertBefore(impSection, adminPanel.firstChild);
  }
}

window.impersonateUser = async function() {
  const email = document.getElementById('impersonateEmail')?.value;
  if (!email) {
    showMessage('Enter user email', 'error');
    return;
  }
  
  try {
    // First get user ID from email
    const users = await apiGet('/users');
    const user = (users.users || []).find(u => u.email === email);
    if (!user) {
      showMessage('User not found', 'error');
      return;
    }
    
    const resp = await fetch(`${API_BASE}/admin/impersonate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ target_user_id: user._id, reason: 'Admin impersonation' })
    });
    const data = await resp.json();
    if (data.ok) {
      localStorage.setItem('token', data.token);
      location.reload();
      showMessage(`Impersonating ${user.name}`, 'warning');
    } else {
      showMessage(data.error || 'Impersonation failed', 'error');
    }
  } catch (e) {
    showMessage('Error: ' + e.message, 'error');
  }
};

// ===== QR SCANNER =====
async function initQRScanner(mode = 'login') {
  const container = document.getElementById('qrScannerContainer');
  if (container) container.classList.remove('hidden');

  // Wait for Html5Qrcode to be available
  if (typeof window.Html5Qrcode === 'undefined') {
    showMessage('QR scanner loading, please wait...', 'info');
    // Try again in 1 second
    setTimeout(() => initQRScanner(mode), 1000);
    return;
  }

  const readerDiv = document.getElementById('qr-reader');
  if (!readerDiv) return;
  
  readerDiv.innerHTML = ''; // Clear previous
  
  try {
    qrScanner = new Html5Qrcode(readerDiv);
    
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };
    await qrScanner.start(
      { facingMode: "environment" },
      config,
      async (decodedText) => {
        await qrScanner.stop();
        closeQRScanner();
        
        // Handle QR login
        if (mode === 'login') {
          try {
            const resp = await fetch(`${API_BASE}/qr-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: decodedText })
            });
            const data = await resp.json();
            if (data.ok) {
              saveAuth(data);
              showDashboard(data.user);
              showMessage('QR Login successful!', 'success');
            } else {
              showMessage(data.error || 'QR login failed', 'error');
            }
          } catch (err) {
            showMessage('QR login error: ' + err.message, 'error');
          }
        } else {
          showMessage(`QR Scanned: ${decodedText.substring(0, 30)}...`, 'success');
        }
      },
      (error) => {
        // Silent error - just continue scanning
      }
    );
  } catch (err) {
    showMessage('Camera error: ' + err.message, 'error');
    closeQRScanner();
  }
}

function manualQREntry() {
  const code = prompt('Enter QR code manually:');
  if (code) {
    // Handle manual QR entry for login
    fetch(`${API_BASE}/qr-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: code })
    })
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        saveAuth(data);
        showDashboard(data.user);
        showMessage('QR Login successful!', 'success');
      } else {
        showMessage(data.error || 'Invalid QR code', 'error');
      }
    })
    .catch(err => showMessage('Error: ' + err.message, 'error'));
  }
}

function closeQRScanner() {
  const container = document.getElementById('qrScannerContainer');
  if (container) container.classList.add('hidden');
  if (qrScanner) {
    qrScanner.stop().catch(() => {});
    qrScanner = null;
  }
}

// ===== NOTIFICATIONS =====
function loadNotifications() {
  // Notifications are handled via socket.io
  const panel = document.getElementById('notificationsPanel');
  if (panel) {
    // Keep panel but don't auto-populate - socket will handle
  }
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast`;
  toast.style.background = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#00F0FF';
  toast.style.color = type === 'error' || type === 'warning' ? 'white' : '#0B0B0B';
  toast.innerHTML = `
    <div class="toast-content">${msg}</div>
    <button class="toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function showMessage(msg, type = 'info') {
  console.log(`[${type.toUpperCase()}] ${msg}`);
  showToast(msg, type);
}

// ===== UTILITIES =====
async function apiGet(endpoint) {
  const token = localStorage.getItem('token');
  const resp = await fetch(`${API_BASE}${endpoint}`, {
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  });
  return resp.json();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

function initSocket() {
  if (typeof io === 'undefined') {
    console.log('Socket.io not available');
    return;
  }

  socket = io();

  socket.on('connect', () => console.log('✅ Socket connected'));

  socket.on('notification', (notif) => {
    showToast(notif.message, notif.type || 'info');
    const panel = document.getElementById('notificationsPanel');
    if (panel) {
      const notifDiv = document.createElement('div');
      notifDiv.className = 'notification-item';
      notifDiv.innerHTML = `
        <div>${notif.message}</div>
        <small>${new Date(notif.timestamp).toLocaleTimeString()}</small>
      `;
      panel.prepend(notifDiv);
      setTimeout(() => notifDiv.remove(), 5000);
    }
  });
}

console.log('✅ WFMS Full Client Ready');