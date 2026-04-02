// Global storage keys and helpers
const CURRENT_KEY = 'wfms_current_user';
const TOKEN_KEY = 'wfms_token';
const REFRESH_TOKEN_KEY = 'wfms_refresh_token';
const TOKEN_EXPIRES_KEY = 'wfms_token_expires';

function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

function load(key, defaultValue = null) {
    try {
        const raw = localStorage.getItem(key);
        if (raw === null || raw === undefined) return defaultValue;
        try { return JSON.parse(raw); } catch (e) { return raw; }
    } catch (e) { return defaultValue; }
}

function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:100001;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    toast.style.cssText = `background:${colors[type] || colors.info};color:white;padding:12px 20px;border-radius:8px;margin-bottom:10px;`;
    toast.innerHTML = `${msg}<button onclick="this.parentElement.remove()" style="margin-left:12px;background:none;border:none;color:white;">×</button>`;
    container.appendChild(toast);
    setTimeout(() => { if (toast.parentElement) toast.remove(); }, 5000);
    return toast;
}

// Add createTeam function at end of app.js (before console.log)
window.createTeam = async function() {
    const name = document.getElementById('teamName')?.value.trim();
    const department = document.getElementById('teamDepartment')?.value.trim();
    const description = document.getElementById('teamDescription')?.value.trim();
    const teamLead = document.getElementById('teamLead')?.value;
    const teamMembers = Array.from(document.getElementById('teamMembers')?.selectedOptions || []).map(opt => opt.value);
    
    if (!name) {
        showToast('Team name required', 'error');
        return;
    }
    
    showLoading();
    try {
        const response = await api('/api/teams', 'POST', {
            name, department, description, team_lead: teamLead, members: teamMembers
        });
        
        if (response.ok) {
            showToast(`✅ Team "${name}" created!`, 'success');
            // Clear form
            document.getElementById('teamName').value = '';
            document.getElementById('teamDepartment').value = '';
            document.getElementById('teamDescription').value = '';
            document.getElementById('teamLead').value = '';
            document.getElementById('teamMembers').selectedIndex = -1;
            // Refresh teams
            loadTeams();
        } else {
            showToast(response.error || 'Failed to create team', 'error');
        }
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
};

// Initialize team selects when employees load
window.loadTeams = async function() {
    // Existing loadTeams code...
    // After populating employees, populate team selects
    const employees = await api('/api/users');
    const teamLeadSelect = document.getElementById('teamLead');
    const teamMembersSelect = document.getElementById('teamMembers');
    if (teamLeadSelect) {
        teamLeadSelect.innerHTML = '<option value="">Select Leader</option>' + 
            (employees.users || []).filter(u => u.role !== 'admin').map(u => `<option value="${u._id}">${u.name}</option>`).join('');
    }
    if (teamMembersSelect) {
        teamMembersSelect.innerHTML = (employees.users || []).filter(u => u.role !== 'admin').map(u => `<option value="${u._id}">${u.name}</option>`).join('');
    }
};

function showLoading() {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.7); display: flex;
            align-items: center; justify-content: center;
            z-index: 10000; color: white; flex-direction: column;
        `;
        overlay.innerHTML = '<div class="spinner"></div><div style="margin-top: 10px;">Loading...</div>';
        document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

function sanitizeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

const taskCategories = [
    'General',
    'Operations',
    'Human Resources',
    'Engineering',
    'Support',
    'Compliance',
    'Maintenance',
    'Onboarding'
];

const taskTemplates = [
    {
        id: 'onboarding',
        name: 'New Employee Onboarding',
        title: 'Onboard new employee',
        description: 'Welcome the new hire, provide orientation, create required accounts, and assign first tasks.',
        category: 'Human Resources',
        priority: 'medium',
        tags: ['onboarding', 'hr']
    },
    {
        id: 'bug-fix',
        name: 'Bug Fix Task',
        title: 'Resolve reported bug',
        description: 'Review the bug report, reproduce the issue, fix the root cause, and document the solution.',
        category: 'Engineering',
        priority: 'high',
        tags: ['bug', 'urgent']
    },
    {
        id: 'attendance-review',
        name: 'Attendance Audit',
        title: 'Review attendance records',
        description: 'Verify the attendance logs for the current week and resolve any discrepancies.',
        category: 'Operations',
        priority: 'medium',
        tags: ['attendance', 'audit']
    }
];

function normalizeTasksResponse(response) {
    if (!response) return [];
    if (Array.isArray(response)) return response;
    return response.data || response.tasks || [];
}

function populateTaskFormOptions() {
    const categorySelect = document.getElementById('taskCategory');
    const templateSelect = document.getElementById('taskTemplate');
    if (categorySelect) {
        categorySelect.innerHTML = '<option value="">Select Category</option>' +
            taskCategories.map(category => `<option value="${category}">${category}</option>`).join('');
    }
    if (templateSelect) {
        templateSelect.innerHTML = '<option value="">Use Template</option>' +
            taskTemplates.map(template => `<option value="${template.id}">${template.name}</option>`).join('');
    }
}

window.applyTaskTemplate = function() {
    const templateId = document.getElementById('taskTemplate')?.value;
    if (!templateId) return;
    const template = taskTemplates.find(t => t.id === templateId);
    if (!template) return;

    const titleInput = document.getElementById('taskTitle');
    const descInput = document.getElementById('taskDesc');
    const categorySelect = document.getElementById('taskCategory');
    const prioritySelect = document.getElementById('taskPriority');
    const tagsInput = document.getElementById('taskTags');

    if (titleInput) titleInput.value = template.title;
    if (descInput) descInput.value = template.description;
    if (categorySelect) categorySelect.value = template.category;
    if (prioritySelect) prioritySelect.value = template.priority || 'medium';
    if (tagsInput) tagsInput.value = template.tags.join(', ');
}

// ============================================
// API HELPER
// ============================================
async function api(url, method = 'GET', body = null) {
    try {
        const token = localStorage.getItem(TOKEN_KEY);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            console.error(`API Error ${method} ${url}:`, data);
            return { ok: false, error: data.error || 'Request failed' };
        }
        return data;
    } catch (err) {
        console.error(`API Error ${method} ${url}:`, err);
        return { ok: false, error: err.message };
    }
}

// ============================================
// AUTH FUNCTIONS
// ============================================
window.showRegister = function() {
    console.log('showRegister called');
    const login = document.getElementById('login-container');
    const register = document.getElementById('register-container');
    if (login) login.classList.add('hidden');
    if (register) register.classList.remove('hidden');
};

window.backToLogin = function() {
    console.log('backToLogin called');
    const login = document.getElementById('login-container');
    const register = document.getElementById('register-container');
    if (register) register.classList.add('hidden');
    if (login) login.classList.remove('hidden');
};

window.login = async function() {
    console.log('login called');
    const email = document.getElementById('username')?.value.trim();
    const password = document.getElementById('password')?.value.trim();
    
    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    showLoading();
    
    try {
        const data = await api('/api/login', 'POST', { email, password });
        
        if (!data.ok) {
            showToast(data.error || 'Login failed', 'error');
            return;
        }
        
        if (data.user && data.token) {
            save(CURRENT_KEY, data.user);
            localStorage.setItem(TOKEN_KEY, data.token);
            if (data.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
            
            showToast(`Welcome ${data.user.name}!`, 'success');
            window.enterDashboard(data.user);
        }
    } catch (err) {
        showToast('Login error: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
};

window.register = async function() {
    console.log('register called');
    const name = document.getElementById('regUsername')?.value.trim();
    const email = document.getElementById('regEmail')?.value.trim();
    const password = document.getElementById('regPassword')?.value.trim();
    const role = document.getElementById('regRole')?.value || 'worker';
    
    if (!name || !email || !password) {
        showToast('Please fill all fields', 'error');
        return;
    }
    // Strong password validation (min 8 chars, upper/lower, number, special)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
        const pwdInput = document.getElementById('regPassword');
        if (pwdInput) showFormError(pwdInput, 'Password must be ≥8 chars with uppercase, lowercase, number and special char');
        showToast('Password does not meet security requirements', 'error');
        return;
    }
    
    showLoading();

    try {
        // Create user and get returned QR data (signup endpoint returns qrData)
        const data = await api('/api/signup', 'POST', { name, email, password, role });

        if (!data.ok) {
            showToast(data.error || 'Registration failed', 'error');
            return;
        }

        showToast('Registration successful! Logging you in...', 'success');

        // Sign in the user so we can show dashboard and user QR
        const signIn = await api('/api/login', 'POST', { email, password });
        if (signIn.ok) {
            localStorage.setItem(TOKEN_KEY, signIn.token);
            if (signIn.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, signIn.refreshToken);
            save(CURRENT_KEY, signIn.user);
            // Show dashboard first
            window.enterDashboard(signIn.user);

            // Show the QR code returned by signup (or fetch /api/qr/my-qr as fallback)
            try {
                const qrData = data.qrData || (await api('/api/qr/my-qr', 'GET')).qrData;
                const qrToken = data.qrToken || (await api('/api/qr/my-qr', 'GET')).qrToken;
                showQRCodeModal({ qrData, qrToken, name: signIn.user.name });
            } catch (e) {
                console.warn('Could not display QR immediately:', e);
            }

            return;
        }

        window.backToLogin();
    } catch (err) {
        showToast('Registration error: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
};

// Show QR Code modal with download/print instructions
window.showQRCodeModal = function({ qrData, qrToken, name, expiresAt } = {}) {
    if (!qrData) {
        showToast('QR not available', 'error');
        return;
    }

    // Remove existing modal if present
    const existing = document.getElementById('qrModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'qrModal';
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h5>Your QR Code</h5>
          <button class="btn-close" onclick="document.getElementById('qrModal')?.remove()">×</button>
        </div>
        <div class="modal-body" style="text-align:center;">
          <p style="color:var(--text-secondary);">Hello ${sanitizeHTML(name || '')}, below is your personal QR code. Save or print it and present it when scanning.</p>
          <div style="margin: 12px auto; max-width:340px;">
            <img id="qrImagePreview" src="${qrData}" alt="QR Code" style="width:100%; height:auto; border-radius:8px; border:1px solid var(--border-color); background:#fff; padding:8px;" />
          </div>
          <div style="margin-top:12px; color:var(--text-secondary); text-align:left; font-size:13px;">
            <ul>
              <li>Save the image to your device for offline use.</li>
              <li>Print the QR and keep it accessible for quick scanning.</li>
              <li>When scanned with the WFMS scanner it will auto-login and record time, date and your attendance.</li>
            </ul>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="document.getElementById('qrModal')?.remove()">Close</button>
          <button class="btn btn-outline" onclick="downloadQRCode()">Download</button>
          <button class="btn btn-primary" onclick="printQRCode()">Print</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
};

window.downloadQRCode = function() {
    const img = document.getElementById('qrImagePreview');
    if (!img) return showToast('QR image not found', 'error');
    const url = img.src;
    const a = document.createElement('a');
    a.href = url;
    const filename = `WFMS-QR-${(load(CURRENT_KEY)?.name || 'user').replace(/\s+/g,'_')}.png`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    showToast('QR downloaded', 'success');
};

window.printQRCode = function() {
    const img = document.getElementById('qrImagePreview');
    if (!img) return showToast('QR image not found', 'error');
    const w = window.open('');
    w.document.write(`<img src="${img.src}" style="width:100%;height:auto;">`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); w.close(); } catch(e) { console.warn(e); } }, 300);
};

// Show current user's QR (worker dashboard)
window.showMyQRCode = async function() {
    try {
        showLoading();
        const response = await api('/api/qr/my-qr', 'GET');
        if (!response.ok) return showToast(response.error || 'Could not fetch QR', 'error');
        showQRCodeModal({ qrData: response.qrData, qrToken: response.qrToken, name: load(CURRENT_KEY)?.name });
    } catch (err) {
        console.error('Error fetching my QR:', err);
        showToast('Error fetching QR: ' + err.message, 'error');
    } finally { hideLoading(); }
};

// Worker: download their own performance report (simple CSV)
window.downloadMyReport = async function() {
    try {
        const user = load(CURRENT_KEY);
        if (!user) return showToast('Not authenticated', 'error');
        showLoading();
        const resp = await api(`/api/employee/performance/${user.id}`);
        if (!resp.ok) return showToast(resp.error || 'Failed to fetch performance', 'error');
        const perf = resp.performance || {};
        let csv = 'Metric,Value\n';
        csv += `Tasks Assigned,${perf.tasks_assigned || 0}\n`;
        csv += `Tasks Completed,${perf.tasks_completed || 0}\n`;
        csv += `Tasks In Progress,${perf.tasks_in_progress || 0}\n`;
        csv += `Tasks Pending,${perf.tasks_submitted_pending || 0}\n`;
        csv += `Hours Worked,${perf.total_hours_worked || 0}\n`;
        csv += `Completion Rate,${perf.completion_rate || 0}%\n`;

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `WFMS-My-Report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Report downloaded', 'success');
    } catch (err) {
        console.error('Error downloading my report:', err);
        showToast('Failed to download report', 'error');
    } finally { hideLoading(); }
};

window.toggleRegPassword = function() {
    const pwd = document.getElementById('regPassword');
    if (pwd) {
        pwd.type = pwd.type === 'password' ? 'text' : 'password';
    }
};

window.isValidEmail = function(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

window.showFormError = function(input, msg) {
    if (!input) return;
    input.style.borderColor = '#ef4444';
    const error = document.createElement('div');
    error.className = 'form-error';
    error.textContent = msg;
    error.style.cssText = 'color:#ef4444;font-size:12px;margin-top:4px;';
    input.parentNode?.appendChild(error);
    setTimeout(() => {
        input.style.borderColor = '';
        error.remove();
    }, 4000);
};

window.showFormSuccess = function(input) {
    if (!input) return;
    input.style.borderColor = '#10b981';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
};

// ============================================
// QR SCANNER FUNCTIONS
// ============================================
window.ensureQRContainer = function() {
    if (document.getElementById('qrScannerContainer')) return true;
    const container = document.createElement('div');
    container.id = 'qrScannerContainer';
    container.className = 'qr-scanner-overlay hidden';
    container.innerHTML = `
        <div class="qr-scanner-box">
            <div class="qr-scanner-header">
                <h5>Scan QR Code</h5>
                <button onclick="window.stopQRScanner()">×</button>
            </div>
            <div id="qr-reader"></div>
            <div id="qr-scanner-status"></div>
        </div>
    `;
    document.body.appendChild(container);
    return true;
};

window.stopQRScanner = async function() {
    console.log('[QR] Stopping scanner...');
    
    if (window.currentScanner) {
        try {
            await window.currentScanner.stop();
        } catch(e) {}
        window.currentScanner = null;
    }
    
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }
    });
    
    const container = document.getElementById('qrScannerContainer');
    if (container) {
        container.classList.add('hidden');
    }
};

window.initQRScanner = async function(action = 'login') {
    console.log('[QR] initQRScanner called with action:', action);
    
    window.ensureQRContainer();
    
    if (typeof Html5Qrcode === 'undefined') {
        showToast('Loading QR scanner...', 'info');
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js';
            script.onload = resolve;
            script.onerror = () => {
                showToast('Failed to load QR library', 'error');
                resolve();
            };
            document.head.appendChild(script);
        });
        await new Promise(r => setTimeout(r, 200));
    }
    
    if (typeof Html5Qrcode === 'undefined') {
        showToast('QR library not available', 'error');
        return false;
    }
    
    const container = document.getElementById('qrScannerContainer');
    const reader = document.getElementById('qr-reader');
    if (!container || !reader) return false;
    
    await window.stopQRScanner();
    reader.innerHTML = '';
    container.classList.remove('hidden');
    
    const status = document.getElementById('qr-scanner-status');
    if (status) status.textContent = 'Starting camera...';
    
    try {
        const scanner = new Html5Qrcode('qr-reader');
        window.currentScanner = scanner;
        let scanned = false;
        
        await scanner.start(
            { facingMode: 'environment' },
            { fps: 15, qrbox: { width: 250, height: 250 } },
            async (text) => {
                if (scanned) return;
                scanned = true;
                if (status) status.textContent = 'QR detected!';
                await window.stopQRScanner();
                
                // Parse scanned text: QR payload may be a JSON string containing the token
                let qrTokenToSend = text;
                try {
                    const parsed = JSON.parse(text);
                    qrTokenToSend = parsed.token || parsed.qr_token || parsed.qrToken || text;
                } catch (e) {
                    // not JSON, use raw text
                    qrTokenToSend = text;
                }

                const response = await api('/api/qr/scan', 'POST', {
                    qrToken: qrTokenToSend,
                    action: action
                });
                
                if (response.ok && response.token) {
                    // **ENHANCED AUTO-LOGIN: Always handle token response**
                    localStorage.setItem(TOKEN_KEY, response.token);
                    if (response.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
                    
                    const userData = {
                        id: response.user?.id || response.userId,
                        name: response.user?.name || response.userName,
                        email: response.user?.email || response.userEmail,
                        role: response.user?.role || response.userRole
                    };
                    
                    save(CURRENT_KEY, userData);
                    showToast(`✅ QR Auto-Login: Welcome ${userData.name}!`, 'success');
                    
                    // Auto-enter dashboard for seamless phone experience
                    window.enterDashboard(userData);
                } else {
                    showToast(response.message || response.error || 'QR processed', response.ok ? 'success' : 'warning');
                }
            },
            (errorMessage) => {
                if (errorMessage && !errorMessage.includes('No MultiFormat')) {
                    console.debug('[QR] Scan error:', errorMessage);
                }
            }
        );
        
        if (status) status.textContent = 'Position QR code in frame';
        return true;
    } catch(e) {
        console.error('[QR] Scanner error:', e);
        showToast('Camera error: ' + (e.message || 'Unknown'), 'error');
        setTimeout(() => window.stopQRScanner(), 2000);
        return false;
    }
};

// Manual QR entry fallback (used by Manual QR Entry button)
window.manualQREntry = async function(action = 'login') {
    try {
        const input = prompt('Enter QR token or QR payload (paste token or JSON):');
        if (!input) return;

        let qrTokenToSend = input;
        try {
            const parsed = JSON.parse(input);
            qrTokenToSend = parsed.token || parsed.qr_token || parsed.qrToken || input;
        } catch (e) {
            // use raw input if not JSON
            qrTokenToSend = input;
        }

        showLoading();
        const response = await api('/api/qr/scan', 'POST', { qrToken: qrTokenToSend, action });
        if (response && response.ok && response.token) {
            localStorage.setItem(TOKEN_KEY, response.token);
            if (response.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);

            const userData = {
                id: response.user?.id || response.userId,
                name: response.user?.name || response.userName,
                email: response.user?.email || response.userEmail,
                role: response.user?.role || response.userRole
            };
            save(CURRENT_KEY, userData);
            showToast(`✅ QR Auto-Login: Welcome ${userData.name || 'user'}!`, 'success');
            window.enterDashboard(userData);
        } else {
            showToast(response?.message || response?.error || 'QR processed', response?.ok ? 'success' : 'warning');
        }
    } catch (err) {
        console.error('manualQREntry error', err);
        showToast('Manual QR failed: ' + (err.message || 'Unknown'), 'error');
    } finally {
        hideLoading();
    }
};

// ============================================
// DASHBOARD FUNCTIONS
// ============================================
window.enterDashboard = function(user) {
    console.log('📊 Entering dashboard for:', user.name);
    
    const auth = document.getElementById('auth-overlay');
    const dash = document.getElementById('dashboard');
    
    if (auth) auth.classList.add('hidden');
    if (dash) dash.classList.remove('hidden');
    
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.innerText = `Welcome, ${user.name}`;
    
    const adminPanel = document.getElementById('admin-panel');
    const workerPanel = document.getElementById('worker-panel');
    
    if (user.role === 'admin') {
        if (adminPanel) adminPanel.classList.remove('hidden');
        if (workerPanel) workerPanel.classList.add('hidden');
        populateTaskFormOptions();
        loadAdminDashboard();
        loadEmployees();
        loadTeams();
        initializeAdminApprovalPanel();
    } else {
        if (adminPanel) adminPanel.classList.add('hidden');
        if (workerPanel) workerPanel.classList.remove('hidden');
        loadWorkerDashboard(user);
    }
    
    updateDashboardStats();
    loadTasks();
    
    // Initialize realtime socket and UI
    try { window.initSocket(); } catch(e) { console.warn('Socket init failed', e); }
    setTimeout(() => addQRLogoutButton(user), 500);
};

// Initialize Socket.IO client and notification handlers
window.initSocket = function() {
    if (window.socket) return;
    try {
        window.socket = io();
        const currentUser = load(CURRENT_KEY) || null;
        window.socket.on('connect', () => {
            if (currentUser && currentUser.id) {
                window.socket.emit('register-user', currentUser.id);
            }
        });

        window.socket.on('notification', (data) => {
            try {
                showToast(data.message || 'Notification', 'info');
                // Refresh views on task events
                if (data.type === 'task_assigned' || data.type === 'task_created' || data.type === 'task_updated') {
                    loadTasks();
                }
                if (data.type === 'approval_status') {
                    // Admins should refresh approval panel
                    const u = load(CURRENT_KEY);
                    if (u && u.role === 'admin') initializeAdminApprovalPanel();
                    else loadWorkerPerformance(u);
                    updateDashboardStats();
                }
            } catch (e) { console.error('Notification handler error', e); }
        });

        window.socket.on('force-logout', () => {
            showToast('You were logged out by admin', 'error');
            window.logout();
        });
    } catch (err) {
        console.error('Socket init error:', err);
    }
};

// Impersonate a user (admin only)
window.impersonateUser = async function(userId) {
    if (!confirm('Impersonate this user? You will act as them until you logout.')) return;
    try {
        showLoading();
        const response = await api('/api/admin/impersonate', 'POST', { userId });
        if (!response.ok) {
            showToast(response.error || 'Failed to impersonate', 'error');
            return;
        }
        // Response contains token and user info
        if (response.token && response.user) {
            localStorage.setItem(TOKEN_KEY, response.token);
            if (response.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken);
            save(CURRENT_KEY, response.user);
            showToast(`Now impersonating ${response.user.name}`, 'success');
            // Re-register socket for new user
            if (window.socket && window.socket.connected) {
                window.socket.emit('register-user', response.user.id);
            }
            setTimeout(() => window.enterDashboard(response.user), 400);
        }
    } catch (err) {
        console.error('Impersonation error:', err);
        showToast('Impersonation failed', 'error');
    } finally {
        hideLoading();
    }
};

async function loadAdminDashboard() {
    try {
        // Load tasks for basic stats
        const tasksResponse = await api('/api/tasks');
        const tasks = normalizeTasksResponse(tasksResponse);
        const totalTasks = document.getElementById('totalTasks');
        if (totalTasks) totalTasks.innerText = tasks?.length || 0;

        // Load performance metrics for chart
        const perfResponse = await api('/api/admin/performance-metrics');
        const performanceData = perfResponse || [];
        
        const canvas = document.getElementById('performanceChart');
        if (canvas && typeof Chart !== 'undefined') {
            const ctx = canvas.getContext('2d');

            // enforce fixed canvas size to prevent vertical elongation
            canvas.style.width = '100%';
            canvas.style.maxWidth = '1200px';
            canvas.style.height = '420px';
            canvas.style.maxHeight = '420px';

            // Destroy existing chart if present to avoid stacking/updating issues
            if (window.performanceChart && typeof window.performanceChart.destroy === 'function') {
                try { window.performanceChart.destroy(); } catch (e) { console.warn('Error destroying previous chart', e); }
                window.performanceChart = null;
            }

            // normalize performance data to an array
            const perfArray = Array.isArray(performanceData) ? performanceData : (performanceData.performance || performanceData.data || []);
            const MAX_BARS = 20; // fixed number of bars to display
            const trimmed = perfArray.slice(0, MAX_BARS);

            window.performanceChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: trimmed.map(emp => emp.name?.substring(0, 15) || 'Unknown'),
                    datasets: [{
                        label: 'Tasks Completed',
                        data: trimmed.map(emp => emp.tasks_completed || 0),
                        backgroundColor: 'rgba(16, 185, 129, 0.8)',
                        borderColor: 'rgba(16, 185, 129, 1)',
                        borderWidth: 2
                    }, {
                        label: 'Tasks Assigned', 
                        data: trimmed.map(emp => emp.tasks_assigned || 0),
                        backgroundColor: 'rgba(245, 158, 11, 0.6)',
                        borderColor: 'rgba(245, 158, 11, 1)',
                        borderWidth: 2
                    }, {
                        label: 'Hours Worked',
                        data: trimmed.map(emp => emp.total_hours_worked || 0),
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: 'rgba(59, 130, 246, 1)',
                        borderWidth: 2,
                        yAxisID: 'y1'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: { display: true, text: 'Task Count' }
                        },
                        y1: {
                            type: 'linear',
                            display: true,
                            position: 'right',
                            title: { display: true, text: 'Hours' },
                            grid: { drawOnChartArea: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const emp = trimmed[context.dataIndex];
                                    const rate = emp && emp.completion_rate ? ` (${emp.completion_rate}%)` : '';
                                    return `${context.dataset.label}: ${context.parsed.y}${context.datasetIndex === 2 ? 'h' : ''}${rate}`;
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Update basic stats
        const adminStats = document.querySelector('.admin-stats');
        if (adminStats && tasks) {
            const completed = tasks.filter(t => t.status === 'completed').length;
            const pending = tasks.filter(t => t.status === 'pending').length;
            const inProgress = tasks.filter(t => t.status === 'in-progress').length;
            adminStats.innerHTML = `
                <div class="stat-box"><div class="stat-label">Total Tasks</div><div class="stat-number">${tasks.length}</div></div>
                <div class="stat-box"><div class="stat-label">In Progress</div><div class="stat-number">${inProgress}</div></div>
                <div class="stat-box"><div class="stat-label">Pending</div><div class="stat-number">${pending}</div></div>
                <div class="stat-box"><div class="stat-label">Completed</div><div class="stat-number">${completed}</div></div>
            `;
        }
    } catch (err) {
        console.error('Error loading admin dashboard:', err);
        showToast('Dashboard load error: ' + err.message, 'error');
    }
}


async function loadWorkerDashboard(user) {
    console.log('Loading worker dashboard for:', user.name);
    try {
        const tasksResponse = await api('/api/tasks');
        const tasks = normalizeTasksResponse(tasksResponse);
        const myTasks = tasks.filter(t => {
            const assignedId = t.assigned_to?._id || t.assigned_to;
            return String(assignedId) === String(user.id);
        });
        
        const myTaskList = document.getElementById('myTaskList');
        if (myTaskList) {
            if (myTasks.length === 0) {
                myTaskList.innerHTML = '<div class="text-center text-muted">📭 No tasks assigned to you yet</div>';
            } else {
                myTaskList.innerHTML = myTasks.map(task => `
                    <div class="task-item" style="margin-bottom: 15px; padding: 15px; border: 1px solid var(--border-color); border-radius: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <strong style="font-size: 16px;">📌 ${sanitizeHTML(task.title)}</strong>
                                <p style="margin: 8px 0; color: var(--text-secondary);">${sanitizeHTML(task.description || 'No description')}</p>
                                <span class="badge ${task.status === 'completed' ? 'bg-success' : 'bg-warning'}">${task.status || 'pending'}</span>
                            </div>
                            ${task.status === 'pending' ? `<button class="btn btn-sm btn-primary" onclick="startTask('${task._id}', '${task.title.replace(/'/g, "\\'")}')">▶️ Start Task</button>` : ''}
                            ${task.status === 'in-progress' ? `<button class="btn btn-sm btn-success" onclick="openTaskReport('${task._id}', '${task.title.replace(/'/g, "\\'")}')">📝 Submit Report</button>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        }
        
        await loadWorkerPerformance(user);
        await loadWorkerAttendance(user);
        await loadWorkerTimeLogs(user);
        
    } catch (err) {
        console.error('Error loading worker dashboard:', err);
    }
}

async function loadWorkerPerformance(user) {
    try {
        const response = await api(`/api/employee/performance/${user.id}`);
        if (response.ok && response.performance) {
            const perf = response.performance;
            const elements = {
                workerTasksAssigned: perf.tasks_assigned || 0,
                workerCompletedTasks: perf.tasks_completed || 0,
                workerInProgressTasks: perf.tasks_in_progress || 0,
                workerPendingTasks: perf.tasks_pending || 0,
                workerHoursWorked: perf.total_hours_worked || 0,
                workerAttendanceRate: `${perf.completion_rate || 0}%`
            };
            for (const [id, value] of Object.entries(elements)) {
                const el = document.getElementById(id);
                if (el) el.innerText = value;
            }
        }
    } catch (err) {
        console.error('Error loading performance:', err);
    }
}

async function loadWorkerAttendance(user) {
    try {
        const response = await api(`/api/attendance/${user.id}`);
        const records = response.records || response || [];
        if (!Array.isArray(records)) return;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayRecords = records.filter(r => new Date(r.timestamp) >= today);
        const clockedIn = todayRecords.some(r => r.action === 'clock_in');
        const onBreak = todayRecords.some(r => r.action === 'break_start') && !todayRecords.some(r => r.action === 'break_end');
        
        const attendanceDiv = document.getElementById('myAttendance');
        if (attendanceDiv) {
            attendanceDiv.innerHTML = `
                <div style="display: flex; gap: 10px;">
                    <div class="badge ${clockedIn ? 'bg-success' : 'bg-secondary'}">${clockedIn ? '✅ Clocked In' : '⏰ Not Clocked In'}</div>
                    <div class="badge ${onBreak ? 'bg-warning' : 'bg-secondary'}">${onBreak ? '☕ On Break' : '🔄 Not on Break'}</div>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error loading attendance:', err);
    }
}




    // 18. loadWorkerTimeLogs - Load time logs
    async function loadWorkerTimeLogs(user) {
        try {
            const logs = await api(`/api/time/${user.id}`);
            const timeLogsDiv = document.getElementById('myTimeLogs');
            if (timeLogsDiv && Array.isArray(logs) && logs.length > 0) {
                timeLogsDiv.innerHTML = logs.slice(0, 5).map(log => `
                    <div style="padding: 5px; border-bottom: 1px solid var(--border-color);">
                        ${log.action}: ${new Date(log.time || log.timestamp).toLocaleTimeString()}
                    </div>
                `).join('');
            } else if (timeLogsDiv) {
                timeLogsDiv.innerHTML = '<div class="text-center text-muted">No time logs yet</div>';
            }
        } catch (err) {
            console.error('Error loading time logs:', err);
        }
    }

async function updateDashboardStats() {
    try {
        const tasksResponse = await api('/api/tasks');
        const usersResponse = await api('/api/users');
        const tasks = normalizeTasksResponse(tasksResponse);
        const users = usersResponse?.users || [];
        const totalTasks = document.getElementById('totalTasks');
        const totalEmployees = document.getElementById('totalEmployees');
        if (totalTasks) totalTasks.innerText = tasks?.length || 0;
        if (totalEmployees) totalEmployees.innerText = users?.length || 0;
    } catch (err) {
        console.error('Error updating stats:', err);
    }
}

async function loadTasks() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;
    
    try {
        const tasksResponse = await api('/api/tasks');
        const tasks = normalizeTasksResponse(tasksResponse);
        const user = load(CURRENT_KEY);
        
        const filteredTasks = user?.role === 'admin' ? tasks : tasks.filter(t => {
            const assignedId = t.assigned_to?._id || t.assigned_to;
            return String(assignedId) === String(user?.id);
        });
        
        if (!filteredTasks || filteredTasks.length === 0) {
            taskList.innerHTML = '<div class="text-center text-muted">No tasks found</div>';
            return;
        }
        
        taskList.innerHTML = filteredTasks.map(task => `
            <div class="task-item">
                <strong>${sanitizeHTML(task.title)}</strong>
                <p>${sanitizeHTML(task.description || 'No description')}</p>
                <span class="badge ${task.status === 'completed' ? 'bg-success' : 'bg-warning'}">${task.status || 'pending'}</span>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading tasks:', err);
    }
}

async function loadEmployees() {
    try {
        const response = await api('/api/users');
        if (!response.ok) {
            throw new Error(response.error || 'Failed to load users');
        }

        const users = response.users || [];
        
        const select = document.getElementById('taskAssign');
        const list = document.getElementById('employeeList');
        
        if (select) {
            select.innerHTML = '<option value="">Select Employee</option>';
        }
        if (list) list.innerHTML = '';
        
        let workerCount = 0;
        const currentUser = load(CURRENT_KEY) || {};
        users.forEach(u => {
            if (u.role !== 'admin') {
                workerCount++;
                if (select) {
                    const opt = document.createElement('option');
                    opt.value = u.id || u._id;
                    opt.textContent = u.name || u.email;
                    select.appendChild(opt);
                }
                if (list) {
                    const div = document.createElement('div');
                    div.className = 'employee-card';
                    let actionsHtml = '';
                    // If current user is admin, show impersonate button
                    if (currentUser.role === 'admin') {
                        actionsHtml = `<div style="margin-top:8px;"><button class="btn btn-sm btn-outline" onclick="impersonateUser('${u._id || u.id}')">Impersonate</button></div>`;
                    }
                    div.innerHTML = `
                        <div class="employee-avatar">${(u.name || '?').charAt(0).toUpperCase()}</div>
                        <div>${u.name || 'Unknown'}</div>
                        <small>${u.email || ''}</small>
                        ${actionsHtml}
                    `;
                    list.appendChild(div);
                }
            }
        });
        
        const totalEmployees = document.getElementById('totalEmployees');
        if (totalEmployees) totalEmployees.innerText = workerCount;
    } catch (err) {
        console.error('Error loading employees:', err);
    }
}

async function loadTeams() {
    try {
        const teams = await api('/api/teams');
        const teamsList = document.getElementById('teamsList');
        if (!teamsList) return;
        
        if (!teams || teams.length === 0) {
            teamsList.innerHTML = '<div class="text-center text-muted">No teams created yet</div>';
            return;
        }
        
        teamsList.innerHTML = teams.map(team => `
            <div class="team-card">
                <strong>${team.name}</strong>
                <p>${team.description || ''}</p>
                <small>Lead: ${team.team_lead?.name || 'Not assigned'}</small>
                <small>Members: ${team.members?.length || 0}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading teams:', err);
    }
}

async function initializeAdminApprovalPanel() {
    try {
        const tasks = await api('/api/admin/pending-approvals');
        const approvalPanel = document.querySelector('[data-approval-panel]') || createApprovalPanel();
        if (!approvalPanel) return;
        
        if (!tasks || tasks.length === 0) {
            approvalPanel.innerHTML = '<div class="text-center text-muted">✓ No pending approvals</div>';
            return;
        }
        
        approvalPanel.innerHTML = `
            <h6 style="margin-bottom: 15px;">📋 Pending Approvals (${tasks.length})</h6>
            ${tasks.map(task => `
                <div class="approval-item" style="background: var(--bg-secondary); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <div>
                            <strong>${task.title}</strong>
                            <p style="margin: 5px 0;">Submitted by: ${task.submitted_by_name}</p>
                            <p style="margin: 5px 0;">Hours: ${task.hours_spent || 0}</p>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-sm btn-success" onclick="approveTask('${task._id}')">Approve</button>
                            <button class="btn btn-sm btn-danger" onclick="rejectTask('${task._id}')">Reject</button>
                        </div>
                    </div>
                </div>
            `).join('')}
        `;
    } catch (err) {
        console.error('Error loading approval panel:', err);
    }
}

function createApprovalPanel() {
    const panel = document.createElement('div');
    panel.setAttribute('data-approval-panel', '');
    panel.className = 'card';
    panel.style.marginBottom = '20px';
    const adminPanel = document.getElementById('admin-panel');
    if (adminPanel) adminPanel.appendChild(panel);
    return panel;
}

window.approveTask = async function(taskId) {
    const feedback = prompt('Optional feedback for the employee:');
    const response = await api(`/api/tasks/${taskId}/approve`, 'POST', { feedback });
    if (response.ok) {
        showToast('✅ Task approved!', 'success');
        initializeAdminApprovalPanel();
    }
};

window.rejectTask = async function(taskId) {
    const feedback = prompt('Please provide feedback for rejection:');
    if (!feedback) return;
    const response = await api(`/api/tasks/${taskId}/reject`, 'POST', { feedback });
    if (response.ok) {
        showToast('⚠️ Task rejected', 'warning');
        initializeAdminApprovalPanel();
    }
};

// ============================================
// TASK MANAGEMENT FUNCTIONS
// ============================================
window.startTask = async function(taskId, taskTitle) {
    if (!confirm(`Start working on "${taskTitle}"?`)) return;
    
    const response = await api(`/api/tasks/${taskId}`, 'PUT', { status: 'in-progress' });
    if (response.ok) {
        showToast(`✓ Started working on: ${taskTitle}`, 'success');
        const user = load(CURRENT_KEY);
        if (user.role === 'worker') loadWorkerDashboard(user);
        setTimeout(() => openTaskReport(taskId, taskTitle), 500);
    }
};

window.openTaskReport = function(taskId, taskTitle) {
    const modal = document.getElementById('taskReportModal');
    if (!modal) return;
    
    const titleInput = document.getElementById('reportTaskTitle');
    const taskIdInput = document.getElementById('reportTaskId');
    const contentInput = document.getElementById('reportContent');
    const hoursInput = document.getElementById('reportHours');
    
    if (titleInput) titleInput.value = taskTitle || '';
    if (contentInput) contentInput.value = '';
    if (hoursInput) hoursInput.value = '';
    
    if (!taskIdInput) {
        const hiddenId = document.createElement('input');
        hiddenId.type = 'hidden';
        hiddenId.id = 'reportTaskId';
        hiddenId.value = taskId;
        modal.querySelector('.modal-body')?.appendChild(hiddenId);
    } else {
        taskIdInput.value = taskId;
    }
    
    modal.style.display = 'flex';
};

window.closeTaskReport = function() {
    const modal = document.getElementById('taskReportModal');
    if (modal) modal.style.display = 'none';
};

window.submitTaskReport = async function() {
    const taskId = document.getElementById('reportTaskId')?.value;
    const content = document.getElementById('reportContent')?.value.trim();
    const hours = parseFloat(document.getElementById('reportHours')?.value) || 0;
    const status = document.getElementById('reportStatus')?.value;
    
    if (!taskId || !content || hours <= 0) {
        showToast('Please fill all fields', 'warning');
        return;
    }
    
    const user = load(CURRENT_KEY);
    const response = await api(`/api/tasks/${taskId}/submit-report`, 'POST', {
        daily_report: content,
        status: status,
        hours_spent: hours,
        submitted_by: user.id
    });
    
    if (response.ok) {
        showToast('✅ Report submitted for review!', 'success');
        window.closeTaskReport();
        if (user.role === 'worker') loadWorkerDashboard(user);
    }
};

window.addTask = async function() {
    const title = document.getElementById('taskTitle')?.value.trim();
    const description = document.getElementById('taskDesc')?.value.trim();
    const assigned_to = document.getElementById('taskAssign')?.value;
    
    if (!title || !assigned_to) {
        showToast('Please fill all fields', 'warning');
        return;
    }
    
    const priority = document.getElementById('taskPriority')?.value || 'medium';
    const category = document.getElementById('taskCategory')?.value || 'General';
    const tags = (document.getElementById('taskTags')?.value || '')
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean);
    const dueDate = document.getElementById('taskDueDate')?.value || null;

    const response = await api('/api/tasks', 'POST', {
        title,
        description,
        assigned_to,
        priority,
        category,
        tags,
        due_date: dueDate
    });
    if (response.ok) {
        showToast('✅ Task assigned!', 'success');
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDesc').value = '';
        document.getElementById('taskTags').value = '';
        document.getElementById('taskDueDate').value = '';
        document.getElementById('taskCategory').value = '';
        document.getElementById('taskTemplate').value = '';
        loadTasks();
    }
};

// ============================================
// ATTENDANCE FUNCTIONS
// ============================================
window.clockIn = async function() {
    const user = load(CURRENT_KEY);
    if (!user) return;
    await api('/api/time', 'POST', { user_id: user.id, action: 'clock_in', time: new Date().toISOString() });
    showToast('✅ Clocked in', 'success');
    if (user.role !== 'admin') loadWorkerAttendance(user);
};

window.clockOut = async function() {
    const user = load(CURRENT_KEY);
    if (!user) return;
    await api('/api/time', 'POST', { user_id: user.id, action: 'clock_out', time: new Date().toISOString() });
    showToast('👋 Clocked out', 'success');
    if (user.role !== 'admin') loadWorkerAttendance(user);
};

window.breakStart = async function() {
    const user = load(CURRENT_KEY);
    if (!user) return;
    await api('/api/time', 'POST', { user_id: user.id, action: 'break_start', time: new Date().toISOString() });
    showToast('☕ Break started', 'success');
    if (user.role !== 'admin') loadWorkerAttendance(user);
};

window.breakEnd = async function() {
    const user = load(CURRENT_KEY);
    if (!user) return;
    await api('/api/time', 'POST', { user_id: user.id, action: 'break_end', time: new Date().toISOString() });
    showToast('🔄 Break ended', 'success');
    if (user.role !== 'admin') loadWorkerAttendance(user);
};

// ============================================
// REPORT FUNCTIONS - COMPLETE
// ============================================

window.downloadPDFReport = async function() {
    try {
        const user = load(CURRENT_KEY);
        if (!user || user.role !== 'admin') {
            showToast('❌ Only admins can download reports', 'error');
            return;
        }

        showLoading();
        console.log('📊 Requesting PDF report from server...');

        const token = localStorage.getItem(TOKEN_KEY);
        const response = await fetch('/api/admin/report/pdf', {
            method: 'GET',
            headers: {
                'Authorization': token ? `Bearer ${token}` : ''
            }
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Unable to download PDF report (${response.status})`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const filename = `WFMS-Report-${new Date().toISOString().split('T')[0]}.pdf`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        showToast(`✅ PDF Report downloaded as "${filename}"`, 'success');
    } catch (err) {
        console.error('❌ PDF report download error:', err);
        showToast('Failed to download PDF report: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
};

window.downloadCSVReport = async function() {
    try {
        const user = load(CURRENT_KEY);
        if (!user || user.role !== 'admin') {
            showToast('❌ Only admins can download reports', 'error');
            return;
        }
        showLoading();
        const token = localStorage.getItem(TOKEN_KEY);
        const response = await fetch('/api/admin/report/csv', {
            method: 'GET',
            headers: { 'Authorization': token ? `Bearer ${token}` : '' }
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Unable to download CSV (${response.status})`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `WFMS-Report-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('✅ CSV Report downloaded successfully', 'success');
    } catch (err) {
        console.error('❌ CSV generation error:', err);
        showToast('Failed to generate CSV: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
};

window.downloadSimpleReport = async function() {
    try {
        const user = load(CURRENT_KEY);
        if (!user || user.role !== 'admin') {
            showToast('❌ Only admins can download reports', 'error');
            return;
        }

        const [tasksResponse, usersResponse] = await Promise.all([
            api('/api/tasks'),
            api('/api/users')
        ]);
        
        const tasks = normalizeTasksResponse(tasksResponse);
        const users = usersResponse?.users || [];
        
        const completed = tasks.filter(t => t.status === 'completed' || t.approval_status === 'approved').length;
        const inProgress = tasks.filter(t => t.status === 'in-progress').length;
        const pending = tasks.filter(t => t.status === 'pending').length;
        const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
        const employees = users.filter(u => u.role !== 'admin').length;
        
        let report = 'WFMS QUICK REPORT\n';
        report += '='.repeat(50) + '\n';
        report += `Date: ${new Date().toLocaleString()}\n`;
        report += `Generated by: ${user.name}\n`;
        report += '='.repeat(50) + '\n\n';
        report += `📊 STATISTICS\n`;
        report += `Total Employees: ${employees}\n`;
        report += `Total Tasks: ${tasks.length}\n`;
        report += `Completed: ${completed}\n`;
        report += `In Progress: ${inProgress}\n`;
        report += `Pending: ${pending}\n`;
        report += `Completion Rate: ${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%\n`;
        report += `Total Hours Worked: ${totalHours.toFixed(1)}\n\n`;
        
        const blob = new Blob([report], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `WFMS-Quick-Report-${new Date().toISOString().split('T')[0]}.txt`;
        link.click();
        URL.revokeObjectURL(url);
        
        showToast('✅ Quick report downloaded', 'success');
    } catch (err) {
        console.error('Error:', err);
        showToast('Failed to generate report', 'error');
    }
};

// Make report functions globally available
window.downloadReport = async function(format = 'pdf') {
    if (format === 'pdf') await window.downloadPDFReport();
    else if (format === 'csv') await window.downloadCSVReport();
    else await window.downloadSimpleReport();
};

// ============================================
// LOGOUT & UI FUNCTIONS
// ============================================
function addQRLogoutButton(user) {
    const headerRight = document.querySelector('.header-right');
    if (!headerRight || document.getElementById('qrLogoutBtn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'qrLogoutBtn';
    btn.className = 'btn-icon-circle';
    btn.title = 'QR Logout';
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
        <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 7h10v10H7z" />
    </svg>`;
    btn.onclick = () => window.logout();
    
    const logoutBtn = document.querySelector('.btn-outline-danger');
    if (logoutBtn) headerRight.insertBefore(btn, logoutBtn);
    else headerRight.appendChild(btn);
}

window.logout = function() {
    console.log('Logging out...');
    localStorage.removeItem(CURRENT_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    
    const auth = document.getElementById('auth-overlay');
    const dash = document.getElementById('dashboard');
    if (auth) auth.classList.remove('hidden');
    if (dash) dash.classList.add('hidden');
    
    const username = document.getElementById('username');
    const password = document.getElementById('password');
    if (username) username.value = '';
    if (password) password.value = '';
    
    showToast('Logged out successfully', 'success');
};

function logUI(msg) {
    const log = document.getElementById('log');
    if (!log) return;
    const p = document.createElement('p');
    p.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    log.prepend(p);
    const totalLogs = document.getElementById('totalLogs');
    if (totalLogs) totalLogs.innerText = log.children.length;
}

// ============================================
// INITIALIZATION
// ============================================
function checkSession() {
    const user = load(CURRENT_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (user && token) {
        window.enterDashboard(user);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkSession);
} else {
    checkSession();
}

console.log('✅ app.js loaded - all functions defined');
console.log('📊 Report functions:', {
    pdf: typeof window.downloadPDFReport,
    csv: typeof window.downloadCSVReport,
    simple: typeof window.downloadSimpleReport,
    main: typeof window.downloadReport
});