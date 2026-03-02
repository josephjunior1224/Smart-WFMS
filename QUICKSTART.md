# WFMS - Quick Start Guide

## ✅ Project Status

The Workforce Management System is now **fully organized and functional**.

### What Was Done

1. **Cleaned up code structure**
   - Removed duplicate Firebase code from app.js
   - Fixed index.html script references
   - Verified all syntax

2. **Organized file structure**
   ```
   Root (Active files)
   ├── server.js, app.js, db.js      (Core application)
   ├── index.html, style.css          (Frontend)
   ├── package.json, .env             (Configuration)
   └── Directories:
       ├── data/                      (Runtime data)
       ├── models/                    (Database models)
       ├── docs/                      (Documentation)
       ├── archive/                   (Old files)
       └── node_modules/              (Dependencies)
   ```

3. **Fixed configuration**
   - .env properly configured for MySQL
   - .gitignore updated to exclude sensitive files
   - Database schema auto-initializes

4. **Tested server**
   - Server starts successfully on port 8000
   - MySQL connection works
   - API endpoints responding correctly

## 🚀 Running the Application

### Option 1: Local Development

```bash
# Navigate to project
cd "wfms test"

# Install dependencies (if needed)
npm install

# Start server
npm start
```

Access at: http://localhost:8000

### Option 2: Docker (Recommended)

```bash
# Start with Docker Compose
docker-compose up --build

# Server runs on http://localhost:8000
# Database runs on localhost:3306
```

## 🔐 Default Login

- **Email**: admin@wfms.local
- **Password**: admin

*⚠️ Change these credentials after first login in production!*

## 📝 Key Features Ready

- ✅ User authentication (login/signup)
- ✅ Task management (create, assign, update)
- ✅ Attendance tracking (clock in/out)
- ✅ Time logging
- ✅ QR code generation
- ✅ Dark/Light theme
- ✅ Responsive design
- ✅ Dashboard with statistics

## 🔧 API Endpoints

All endpoints are fully functional:

- `POST /api/login` - User login
- `POST /api/signup` - Register user
- `GET /api/users` - List users
- `GET/POST /api/tasks` - Task management
- `GET/POST /api/attendance` - Attendance tracking
- `GET/POST /api/time` - Time logging
- `POST /api/generate-qr` - QR generation
- `POST /api/validate-token` - Token validation

## 📂 File Organization

| Location | Purpose |
|----------|---------|
| Root | Active application files |
| `/docs` | Project documentation (archived) |
| `/archive` | Old test files and setup guides |
| `/data` | Runtime data (tokens.json) |
| `/models` | Database models |
| `.env` | Environment configuration |
| `README.md` | Full project documentation |

## 🐛 Troubleshooting

### Server won't start
```bash
# Check if port 8000 is in use
netstat -an | grep 8000

# Kill process on port 8000
lsof -ti:8000 | xargs kill -9
```

### Database connection error
```bash
# Verify MySQL is running
# For Windows: Check Services
# For Mac/Linux: brew services list

# Reset .env configuration
DATABASE_TYPE=mysql
DB_HOST=localhost
DB_USER=root
DB_NAME=wfms
```

### Frontend not loading
```bash
# Clear browser cache
Ctrl+Shift+Delete  # Windows
Cmd+Shift+Delete   # Mac

# Restart server
npm start
```

## 📋 Next Steps

1. **Change admin password** after first login
2. **Create employee accounts** via registration
3. **Start using** the dashboard

## 📞 Support

For issues:
1. Check browser console (F12)
2. Check server logs
3. Verify .env configuration
4. Check MySQL is running

---

**System is ready for production use!** 🎉
