# 🚀 WFMS Deployment Guide - Windows Server

## Deployment Status: ✅ READY

Since Docker and Azure are not available in your environment, here's the **Windows Server deployment** setup:

---

## 📋 Option 1: Local Windows Service (Recommended)

### Step 1: Install NSSM (Non-Sucking Service Manager)

```bash
# Download NSSM
# Visit: https://nssm.cc/download

# Or install via Chocolatey (if installed)
choco install nssm

# Extract to C:\nssm\
```

### Step 2: Create Windows Service

```bash
# Navigate to your project
cd "C:\Users\Otto Wilson\Desktop\wfms test"

# Create service called "WFMS"
nssm install WFMS "C:\Program Files\nodejs\node.exe" "C:\Users\Otto Wilson\Desktop\wfms test\server.js"

# Set working directory
nssm set WFMS AppDirectory "C:\Users\Otto Wilson\Desktop\wfms test"

# Start service
nssm start WFMS

# Verify it's running
nssm status WFMS
```

### Step 3: Configure Auto-Start

```bash
# Set to auto-start on boot
nssm set WFMS Start SERVICE_AUTO_START

# Set to restart on failure
nssm set WFMS AppExit Default Restart
```

### Step 4: Manage Service

```bash
# View service status
Get-Service WFMS

# Stop service
nssm stop WFMS

# Start service
nssm start WFMS

# Restart service
nssm restart WFMS

# Remove service
nssm remove WFMS confirm
```

---

## 📋 Option 2: Batch File with Auto-Restart

Create a file: `start-wfms.bat`

```batch
@echo off
cd /d "C:\Users\Otto Wilson\Desktop\wfms test"

:restart
echo Starting WFMS server...
npm start

echo Server stopped. Restarting in 5 seconds...
timeout /t 5 /nobreak
goto restart
```

Then:
1. Right-click on `start-wfms.bat`
2. Create shortcut
3. Place shortcut in `C:\ProgramData\Microsoft\Windows\Start Menu\Programs\Startup`

---

## 📋 Option 3: Use PM2 (Node Process Manager)

### Install PM2

```bash
npm install -g pm2
```

### Start Application

```bash
cd "C:\Users\Otto Wilson\Desktop\wfms test"

# Start with PM2
pm2 start server.js --name "wfms"

# Save configuration
pm2 save

# Create startup hook for Windows
pm2 install pm2-windows-startup
pm2 dump
```

### Commands

```bash
# View status
pm2 status

# View logs
pm2 logs wfms

# Restart
pm2 restart wfms

# Stop
pm2 stop wfms

# Delete
pm2 delete wfms
```

---

## 🔧 Configuration for Production

### 1. Update `.env` for Production

```env
DATABASE_TYPE=mysql
DB_HOST=localhost
DB_USER=root
DB_PASS=your_secure_password
DB_NAME=wfms
PORT=8000
NODE_ENV=production
```

### 2. Enable HTTPS (Optional)

Create `server-https.js`:

```javascript
const fs = require('fs');
const https = require('https');
const app = require('./app');

const options = {
  key: fs.readFileSync('path/to/key.pem'),
  cert: fs.readFileSync('path/to/cert.pem')
};

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS Server running on port 443');
});
```

### 3. Set Up Reverse Proxy

Use **IIS** or **nginx** on Windows to:
- Route HTTP to HTTPS
- Reverse proxy to Node.js port 8000
- Load balance (if multiple instances)

---

## 🔍 Verify Deployment

```bash
# Check if server is running
curl http://localhost:8000

# Check specific endpoint
curl http://localhost:8000/api/users

# Check with authentication
curl -X POST http://localhost:8000/api/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@wfms.local\",\"password\":\"admin\"}"
```

---

## 📊 Monitor & Maintain

### View Logs

```bash
# PM2 logs
pm2 logs wfms

# Windows Event Viewer
# Check Application logs for errors
```

### Restart Service

```bash
# PM2
pm2 restart wfms

# NSSM
nssm restart WFMS

# Windows Service
Get-Service WFMS | Restart-Service
```

### Update Application

```bash
# Stop service
pm2 stop wfms (or nssm stop WFMS)

# Pull/update code
git pull

# Restart service
pm2 restart wfms (or nssm start WFMS)
```

---

## 🚨 Troubleshooting

### Port 8000 Already in Use

```bash
# Find what's using port 8000
netstat -ano | findstr :8000

# Kill the process
taskkill /PID <PID> /F
```

### MySQL Connection Fails

```bash
# Check MySQL is running
sc query MySQL80

# Start MySQL
net start MySQL80

# Test connection
mysql -u root -p
```

### Service Won't Start

```bash
# Check logs
pm2 logs wfms
(or)
nssm query WFMS AppStderr

# Check Node.js is installed
node --version

# Check npm is installed
npm --version

# Try running manually
npm start
```

---

## 📈 Performance Tips

1. **Enable Keep-Alive**: Already configured in `db.js`
2. **Add Caching**: Use Redis for session caching
3. **Database Indexing**: Indexes already created
4. **Compression**: Enable gzip in production
5. **Monitor Memory**: Use `pm2 monit` to watch

---

## ✅ Deployment Checklist

- [ ] Node.js installed (v14+)
- [ ] MySQL running and configured
- [ ] .env file with correct credentials
- [ ] Service manager installed (NSSM or PM2)
- [ ] Application starts without errors
- [ ] API endpoints responding
- [ ] Database connected
- [ ] Admin credentials changed
- [ ] Firewall allows port 8000
- [ ] Auto-restart configured
- [ ] Logs being captured

---

## 🎯 Quick Deploy Commands

### Using NSSM
```bash
nssm install WFMS "C:\Program Files\nodejs\node.exe" "C:\Users\Otto Wilson\Desktop\wfms test\server.js"
nssm start WFMS
```

### Using PM2
```bash
pm2 start server.js --name "wfms"
pm2 startup
pm2 save
```

### Using Batch File
```bash
start-wfms.bat
```

---

## 🌐 Access After Deployment

- **Local Access**: http://localhost:8000
- **Network Access**: http://<your-computer-ip>:8000
- **Credentials**: admin@wfms.local / admin

---

**Deployment Status**: ✅ **READY TO DEPLOY**

Choose your preferred method above and let me know if you need help with the setup!
