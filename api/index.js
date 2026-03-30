// api/index.js
const app = require('../server');
module.exports = app;

// Also serve root static files for backward compatibility
app.use(express.static(path.join(__dirname, '../public')));

// ========== 3. HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WFMS API is running', 
    timestamp: new Date().toISOString(),
    testCredentials: {
      admin: { email: 'admin@wfms.com', password: 'admin123' },
      worker: { email: 'john@wfms.com', password: 'worker123' }
    }
  });
});

// ========== 4. AUTH ROUTES ==========

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    // Convert to object and remove password
    const userObj = user.toObject();
    delete userObj.password;
    
    // Generate JWT token (use _id instead of id)
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({ 
      ok: true, 
      user: userObj,
      token,
      refreshToken,
      expiresIn: 604800 // 7 days in seconds
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate inputs
    if (!email) return res.status(400).json({ ok: false, error: 'Email is required' });
    if (!name) return res.status(400).json({ ok: false, error: 'Full name is required' });
    if (!password) return res.status(400).json({ ok: false, error: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email format' });
    }
    
    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered. Please login or use a different email.' });
    }
    
    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      name,
      email,
      password: hash,
      role: role || 'worker'
    });
    
    await user.save();
    
    res.json({ ok: true, userId: user._id });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Check if email exists
app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
    const newToken = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      ok: true,
      token: newToken,
      expiresIn: 604800
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Google OAuth endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with empty password (Google account)
      const newUser = new User({
        name: name || email,
        email,
        password: '',
        role: 'worker'
      });
      await newUser.save();
      user = newUser;
    }
    
    // Generate JWT tokens
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    const userObj = user.toObject();
    delete userObj.password;
    
    res.json({
      ok: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      user: userObj,
      token,
      refreshToken,
      expiresIn: 604800
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 5. USER ROUTES ==========

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name role email');
    res.json({ ok: true, users });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get user by ID
app.get('/api/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id, 'name role email');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 6. TASK ROUTES ==========

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assigned_to', 'name email')
      .populate('submitted_by', 'name email');
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get task by ID
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await Task.findById(req.params.id)
      .populate('assigned_to', 'name email')
      .populate('submitted_by', 'name email');
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to } = req.body;

    const task = new Task({
      title,
      description,
      assigned_to,
      status: 'pending'
    });
    
    await task.save();
    
    res.json({ ok: true, taskId: task._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update task status
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await Task.findByIdAndUpdate(id, { status });
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Submit task report
app.post('/api/tasks/:id/submit-report', async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_report, status, hours_spent, submitted_by } = req.body;

    // Get task and employee info
    const task = await Task.findById(id);
    const employee = await User.findById(submitted_by);
    const adminUsers = await User.find({ role: 'admin' });

    // Update task
    task.status = status;
    task.daily_report = daily_report;
    task.hours_spent = hours_spent;
    task.submitted_by = submitted_by;
    task.submitted_at = new Date();
    task.approval_status = 'pending';
    
    await task.save();

    // Update performance metrics
    let performance = await Performance.findOne({ user_id: submitted_by });
    
    if (performance) {
      // Calculate updated metrics
      const completedTasks = await Task.countDocuments({ 
        assigned_to: submitted_by, 
        approval_status: 'approved' 
      });
      
      const assignedTasks = await Task.countDocuments({ 
        assigned_to: submitted_by 
      });
      
      const completionRate = assignedTasks > 0 
        ? (completedTasks / assignedTasks) * 100 
        : 0;

      performance.tasks_completed = completedTasks;
      performance.tasks_assigned = assignedTasks;
      performance.total_hours_worked = (performance.total_hours_worked || 0) + hours_spent;
      performance.completion_rate = completionRate;
      performance.last_updated = new Date();
      
      await performance.save();
    } else {
      // Create new performance metrics record
      performance = new Performance({
        user_id: submitted_by,
        task_id: id,
        tasks_completed: 0,
        tasks_assigned: 1,
        total_hours_worked: hours_spent,
        completion_rate: 0
      });
      await performance.save();
    }

    // Send email notification to all admins
    if (employee && adminUsers.length > 0) {
      for (const admin of adminUsers) {
        await emailService.sendTaskSubmissionEmail(
          admin.email,
          admin.name,
          employee.name,
          task.title,
          id,
          daily_report
        );
      }
    }

    console.log(`✓ Task report submitted for approval (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true, taskId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin approval endpoint
app.post('/api/tasks/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    // Get task and employee info
    const task = await Task.findById(id);
    const employee = await User.findById(task.submitted_by);

    // Update task
    task.approval_status = 'approved';
    task.status = 'completed';
    task.admin_feedback = feedback;
    task.approved_at = new Date();
    
    await task.save();

    // Update performance metrics
    const performance = await Performance.findOne({ user_id: task.submitted_by });
    if (performance) {
      const completedTasks = await Task.countDocuments({ 
        assigned_to: task.submitted_by, 
        approval_status: 'approved' 
      });
      const assignedTasks = await Task.countDocuments({ 
        assigned_to: task.submitted_by 
      });
      
      const completionRate = assignedTasks > 0 
        ? (completedTasks / assignedTasks) * 100 
        : 0;

      performance.tasks_completed = completedTasks;
      performance.completion_rate = completionRate;
      performance.last_updated = new Date();
      
      await performance.save();
    }

    // Send email notification to employee
    if (employee) {
      await emailService.sendTaskApprovalEmail(
        employee.email,
        employee.name,
        task.title,
        feedback || 'Well done!'
      );
    }

    console.log(`✓ Task approved (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin rejection endpoint
app.post('/api/tasks/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    // Get task and employee info
    const task = await Task.findById(id);
    const employee = await User.findById(task.submitted_by);

    // Update task
    task.approval_status = 'rejected';
    task.admin_feedback = feedback;
    
    await task.save();

    // Send email notification to employee
    if (employee) {
      await emailService.sendTaskRejectionEmail(
        employee.email,
        employee.name,
        task.title,
        feedback || 'Please review and resubmit'
      );
    }

    console.log(`✓ Task rejected (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get pending task approvals for admin
app.get('/api/admin/pending-approvals', async (req, res) => {
  try {
    const tasks = await Task.find({ 
      approval_status: 'pending',
      submitted_by: { $exists: true, $ne: null }
    })
    .populate('submitted_by', 'name email')
    .sort({ submitted_at: -1 });
    
    // Format tasks to include submitted_by_name
    const formattedTasks = tasks.map(task => {
      const taskObj = task.toObject();
      taskObj.submitted_by_name = task.submitted_by?.name || 'Unknown';
      return taskObj;
    });
    
    res.json(formattedTasks);
  } catch (err) {
    console.error('Error in pending-approvals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get performance metrics for all employees
app.get('/api/admin/performance-metrics', async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker' });
    const performanceData = [];
    
    for (const worker of workers) {
      const tasks = await Task.find({ assigned_to: worker._id });
      const completed = tasks.filter(t => t.approval_status === 'approved').length;
      const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
      const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
      
      performanceData.push({
        user_id: worker._id,
        name: worker.name,
        email: worker.email,
        tasks_completed: completed,
        tasks_assigned: tasks.length,
        total_hours_worked: totalHours,
        completion_rate: Math.round(completionRate)
      });
    }
    
    res.json(performanceData);
  } catch (err) {
    console.error('Error in performance-metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get individual employee performance metrics
app.get('/api/employee/performance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const tasks = await Task.find({ assigned_to: userId });
    const completed = tasks.filter(t => t.approval_status === 'approved').length;
    const submitted = tasks.filter(t => t.approval_status === 'pending' && t.status === 'submitted').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
    const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

    const user = await User.findById(userId);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      performance: {
        tasks_completed: completed,
        tasks_submitted_pending: submitted,
        tasks_in_progress: inProgress,
        tasks_assigned: tasks.length,
        total_hours_worked: parseFloat(totalHours.toFixed(2)),
        completion_rate: Math.round(completionRate)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 7. QR CODE ROUTES ==========

// Generate QR code for user
app.post('/api/generate-user-qr', async (req, res) => {
  try {
    const { userId, email, name } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Check if user already has a QR code
    let existingQR = await QRCode.findOne({ user_id: userId });
    if (existingQR) {
      return res.json({ 
        ok: true, 
        qrToken: existingQR.qr_token,
        qrData: existingQR.qr_data,
        isActivated: existingQR.is_activated
      });
    }

    const qrToken = uuidv4();
    const qrPayload = JSON.stringify({
      userId,
      email,
      name,
      token: qrToken,
      timestamp: new Date().toISOString()
    });

    // Generate QR code as data URL
    const qrData = await QR.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store in database
    const qrCode = new QRCode({
      user_id: userId,
      qr_token: qrToken,
      qr_data: qrData
    });
    
    await qrCode.save();

    console.log('✓ QR code generated for user:', userId);
    res.json({ 
      ok: true, 
      qrToken,
      qrData,
      isActivated: false
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// Get user QR code
app.get('/api/user-qr/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json({
      ok: true,
      qrToken: qrCode.qr_token,
      qrData: qrCode.qr_data,
      isActivated: qrCode.is_activated,
      generatedAt: qrCode.generated_at,
      firstScanAt: qrCode.first_scan_at,
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Scan QR code
app.post('/api/scan-qr', async (req, res) => {
  try {
    let { qrToken, userId, scanResult } = req.body;

    if (!qrToken && scanResult) {
      if (typeof scanResult === 'string') {
        try {
          const payload = JSON.parse(scanResult);
          qrToken = qrToken || payload.token || payload.qr_token;
          userId = userId || payload.userId || payload.user_id || payload.id;
        } catch (e) {
          qrToken = qrToken || scanResult;
        }
      }
    }

    if (!qrToken) {
      return res.status(400).json({ error: 'qrToken required' });
    }

    let qrCode;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      qrCode = await QRCode.findOne({ qr_token: qrToken, user_id: userId });
    } else {
      qrCode = await QRCode.findOne({ qr_token: qrToken });
      if (qrCode) userId = qrCode.user_id.toString();
    }

    if (!qrCode) {
      return res.status(404).json({ error: 'Invalid QR code' });
    }

    if (userId && !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    const now = new Date();
    const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';

    // Record scan
    const scan = new QRScan({
      user_id: userId,
      qr_token: qrToken,
      scanned_at: now,
      scanner_ip: scanIp
    });
    
    await scan.save();

    // Update QR code activation and scan count
    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = now;
      qrCode.scan_count = 1;
    } else {
      qrCode.scan_count += 1;
    }
    
    await qrCode.save();

    console.log('✓ QR code scanned for user:', userId, 'at', now);
    res.json({
      ok: true,
      message: 'QR code scanned successfully',
      scanTime: now.toISOString(),
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    console.error('QR scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get QR scan records for a user
app.get('/api/qr-scans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const scans = await QRScan.find({ user_id: userId })
      .sort({ scanned_at: -1 });

    const qrCode = await QRCode.findOne({ user_id: userId });

    res.json({
      ok: true,
      qrCode: qrCode ? {
        qrToken: qrCode.qr_token,
        generatedAt: qrCode.generated_at,
        isActivated: qrCode.is_activated,
        firstScanAt: qrCode.first_scan_at,
        scanCount: qrCode.scan_count
      } : null,
      scans: scans.map(s => ({
        id: s._id,
        scannedAt: s.scanned_at,
        scannerIp: s.scanner_ip,
        scanTime: new Date(s.scanned_at).toLocaleString()
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all QR scan records
app.get('/api/admin/qr-scan-records', async (req, res) => {
  try {
    const scans = await QRScan.find()
      .populate('user_id', 'name email')
      .sort({ scanned_at: -1 });
    
    const records = await Promise.all(scans.map(async (scan) => {
      const qrCode = await QRCode.findOne({ user_id: scan.user_id._id });
      return {
        id: scan._id,
        userId: scan.user_id._id,
        userName: scan.user_id.name,
        userEmail: scan.user_id.email,
        scannedAt: scan.scanned_at,
        scanTime: new Date(scan.scanned_at).toLocaleString(),
        scannerIp: scan.scanner_ip,
        qrActivated: qrCode?.is_activated || false,
        totalScans: qrCode?.scan_count || 0
      };
    }));

    res.json({
      ok: true,
      records
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 8. ATTENDANCE ROUTES ==========

// Record attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action required' });
    }
    
    const attendance = new Attendance({
      user_id,
      action,
      timestamp: new Date()
    });
    
    await attendance.save();
    
    res.json({ ok: true, id: attendance._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a user
app.get('/api/attendance/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const records = await Attendance.find({ user_id })
      .sort({ timestamp: -1 });
    
    res.json({ ok: true, records });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Record time log
app.post('/api/time', async (req, res) => {
  try {
    const { user_id, action, time } = req.body;

    const timeLog = new TimeLog({
      user_id,
      action,
      time: time || new Date()
    });
    
    await timeLog.save();
    
    res.json({ ok: true, id: timeLog._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get time logs for a user
app.get('/api/time/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const logs = await TimeLog.find({ user_id })
      .sort({ time: -1 });
    
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== 9. LEGACY QR ENDPOINTS ==========

// Generate QR token (legacy)
app.post('/api/generate-qr-token', async (req, res) => {
  try {
    const { userId, email, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const timestamp = new Date().toISOString();
    const qrData = {
      userId,
      email,
      role,
      generatedAt: timestamp
    };
    
    const qrString = JSON.stringify(qrData);
    const qrImage = await QR.toDataURL(qrString, { errorCorrectionLevel: 'H' });
    
    res.json({ 
      ok: true, 
      qrCode: qrImage,
      qrData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Generate QR (legacy and fallback to user QR generation)
app.post('/api/generate-qr', async (req, res) => {
  try {
    const { userId, email, name, username, role } = req.body;

    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ error: 'Invalid userId format' });
      }

      const existingQR = await QRCode.findOne({ user_id: userId });
      if (existingQR) {
        return res.json({ ok: true, qrToken: existingQR.qr_token, qrData: existingQR.qr_data, isActivated: existingQR.is_activated });
      }

      const qrToken = uuidv4();
      const qrPayload = JSON.stringify({ userId, email, name, token: qrToken, timestamp: new Date().toISOString() });
      const qrData = await QR.toDataURL(qrPayload, { errorCorrectionLevel: 'H', type: 'image/png', width: 300, margin: 2 });

      const qrCode = new QRCode({ user_id: userId, qr_token: qrToken, qr_data: qrData });
      await qrCode.save();

      return res.json({ ok: true, qrToken, qrData, isActivated: false });
    }

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    const token = uuidv4();
    let tokens = {};
    try {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    } catch (e) {
      tokens = {};
    }

    tokens[token] = { username, role, createdAt: new Date().toISOString() };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');

    const qrData = await QR.toDataURL(token);
    res.json({ ok: true, token, qrData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// Validate token (legacy)
app.post('/api/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    
    let tokens = {};
    try {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    } catch (e) {
      tokens = {};
    }
    
    const info = tokens[token];
    if (!info) return res.status(404).json({ ok: false });
    
    res.json({ ok: true, user: info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

// ========== 10. API 404 HANDLER ==========
app.all('/api/*', (req, res) => {
  res.status(404).json({ 
    ok: false,
    error: 'API endpoint not found',
    method: req.method,
    path: req.path
  });
});

// ========== 11. ERROR HANDLER ==========
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message);
  
  if (res.headersSent) {
    return next(err);
  }
  
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Internal server error'
    });
  }
  
  next(err);
});

// ========== 12. CATCH-ALL ROUTE FOR SPA ==========
// This must be the LAST route
app.get('*', (req, res) => {
  // Don't serve index.html for API routes (return 404 instead)
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'API endpoint not found' });
  }
  
  // For all other routes, serve the SPA
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ========== EXPORT FOR VERCEL ==========
module.exports = app;