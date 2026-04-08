# WFMS Frontend Fix - Complete Feature Activation Plan
*Status: Approved by user - Implementation in progress*

## 📋 Steps to Fix UI (app.client.js)

### 1. **✅ CREATE TODO.md** 
*Current step - completed*

### 2. **Fix Event Binding Mismatch** (app.client.js)
```
Replace getElementById('loginBtn') → querySelector('.btn-primary')
Add global functions: window.login(), window.clockIn(), etc.
```

### 3. **Add Post-Login Dashboard Loading**
```
dashboardLoad() → Called in showDashboard()
- loadStats() → #totalEmployees, #totalTasks, #totalLogs
- loadTasks() → #taskList, #myTaskList
- loadEmployees() → #employeeList (admin only)
- loadTeams() → #teamsList (admin only)
- loadAttendance() → #attendanceSummary
```

### 4. **Role-Based Panel Toggle**
```
if (user.role === 'admin') → show #admin-panel
else → show #worker-panel
```

### 5. **Implement All onclick Functions**
```
- clockIn(), clockOut(), breakStart(), breakEnd()
- addTask(), createTeam()
- downloadReport('pdf'), downloadReport('excel')
- initQRScanner(), manualQREntry()
```

### 6. **Real-Time Socket Integration**
```
socket.on('tasks_updated', loadTasks)
socket.on('stats_updated', loadStats)
socket.on('logs_updated', loadLogs)
```

### 7. **QR Scanner & Notifications**
```
window.initQRScanner() → Full Html5Qrcode setup
loadNotifications() → #notificationsPanel
```

### 8. **Test & Verify**
```
1. npm start (server running)
2. localhost:8000 → Full login → All panels visible
3. Stats populate → Tasks list → Charts → QR scanner
4. Hard refresh → Session persists
5. All buttons work
```

## Progress Tracker
```
✅ Step 1: CREATE TODO.md
✅ Step 2: Edit app.client.js bindings (global functions + dashboardLoad + role panels + onclicks + sockets)
✅ Step 3: Fix client API calls to use existing backend endpoints
✅ Step 4: Test all features at localhost:8000
☐ Step 5: Complete → attempt_completion
```





**Next: Edit app.client.js**

