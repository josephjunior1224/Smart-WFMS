# WFMS - Quick Start Guide

## ⚠️ Docker Issue
Docker Desktop daemon is not running. This is common on Windows. You have two options:

---

## ✅ Option 1: Run Directly (Recommended for Development)

### Prerequisites
- Node.js 16+ installed
- MySQL 8.0 running locally

### Step 1: Start MySQL
Open a terminal and run one of these:

**If MySQL is installed locally:**
```bash
# Windows (Command Prompt as Admin)
net start MySQL80

# Or use MySQL command directly
mysql -u root -p
```

**Or use Docker just for MySQL** (if Docker Desktop is running):
```bash
docker run -d ^
  --name wfms-mysql ^
  -e MYSQL_ROOT_PASSWORD=rootpass ^
  -e MYSQL_DATABASE=wfms ^
  -e MYSQL_USER=wfmsuser ^
  -e MYSQL_PASSWORD=wfms_pass ^
  -p 3306:3306 ^
  mysql:8.0
```

### Step 2: Update .env file
The `.env` file should look like this:
```
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=wfms
SEED_ADMIN_EMAIL=admin@wfms.local
SEED_ADMIN_PASS=admin
PORT=8000
```

### Step 3: Install Dependencies
```bash
cd "C:\Users\Otto Wilson\Desktop\wfms test"
npm install
```

### Step 4: Start the Server
```bash
npm start
```

### Step 5: Open in Browser
```
http://localhost:8000
```

### Demo Login
- Username: `admin`
- Password: `admin`

---

## 🐳 Option 2: Fix Docker Desktop (If Preferred)

### If Docker Desktop is installed but not running:

1. **Check if Docker Desktop is installed:**
   - Look for "Docker Desktop" in Windows Start Menu
   - If not installed, download from: https://www.docker.com/products/docker-desktop

2. **Start Docker Desktop:**
   - Click on "Docker Desktop" in Start Menu
   - Wait for it to fully start (watch the system tray icon)
   - You'll see "Docker is running" message

3. **Verify Docker is running:**
   ```bash
   docker ps
   ```
   Should show output without errors

4. **Then run:**
   ```bash
   cd "C:\Users\Otto Wilson\Desktop\wfms test"
   docker-compose up --build
   ```

---

## 🔧 Troubleshooting

### MySQL Connection Error
**Error:** "Access denied for user"

**Solution:**
1. Check `.env` file has correct credentials
2. Ensure MySQL service is running: `net start MySQL80`
3. If default MySQL is empty password, set `DB_PASS=` in `.env`

### Port Already in Use
**Error:** "Port 8000 already in use"

**Solution:**
```bash
# Find process on port 8000
netstat -ano | findstr :8000

# Kill it (replace PID with actual number)
taskkill /PID <PID> /F

# Or use different port in .env: PORT=8001
```

### Module Not Found
**Error:** "Cannot find module 'express'"

**Solution:**
```bash
npm install
```

### MySQL Not Running
**Error:** "ECONNREFUSED 127.0.0.1:3306"

**Solution:**
```bash
# Start MySQL service
net start MySQL80

# Verify it's running
mysqladmin -u root ping
```

---

## 📋 System Requirements

### Minimum
- Windows 10/11
- Node.js 16+
- MySQL 8.0 (or Docker)
- 2GB free disk space
- 512MB free RAM

### Recommended
- Windows 11
- Node.js 18 LTS
- MySQL 8.0.30+
- 5GB free disk space
- 2GB available RAM

---

## 🚀 Once Server is Running

### Access the Application
```
http://localhost:8000
```

### Admin Dashboard
- Username: `admin`
- Password: `admin`

### Create New Account
- Click "Create Account"
- Enter username and select role
- Login with same credentials

### Features Available
- ✅ User authentication
- ✅ Admin dashboard
- ✅ Worker dashboard
- ✅ Task management
- ✅ Attendance tracking
- ✅ Time logging
- ✅ Performance statistics
- ✅ Dark/Light theme

---

## 📝 Common Commands

```bash
# Install dependencies
npm install

# Start server
npm start

# Start MySQL service
net start MySQL80

# Stop MySQL service
net stop MySQL80

# Check MySQL status
mysqladmin -u root ping

# View server logs
# (Output will show in terminal where npm start was run)

# Stop server
# Press Ctrl+C in the terminal
```

---

## 🎯 Next Steps

1. **Run the server** using Option 1 (recommended)
2. **Open browser** to http://localhost:8000
3. **Login with demo credentials** (admin/admin)
4. **Explore the features**
5. **Create new accounts** as needed

---

## 💡 Tips

- Keep the terminal open while running the server
- Server logs will appear in the terminal
- For development, use Option 1 (Direct run)
- For production, use Docker when available
- All data is stored in MySQL database

---

## ✅ When You See This in Terminal

```
Server is running on port 8000
Database connection successful
```

**You're ready to use the system!** 🎉

---

## 📞 Still Having Issues?

1. **Check MySQL is running:**
   ```bash
   mysqladmin -u root ping
   ```

2. **Check port 8000 is free:**
   ```bash
   netstat -ano | findstr :8000
   ```

3. **Check Node is installed:**
   ```bash
   node --version
   npm --version
   ```

4. **Check dependencies are installed:**
   ```bash
   npm install
   ```

5. **View .env file:**
   ```bash
   type .env
   ```

---

**Recommended: Use Option 1 (Direct Run) for quickest start!** 🚀
