# WFMS Project - Setup & Organization Guide

## Project Structure Overview

```
wfms-test/
├── server.js                    # Express server with all API routes
├── models/
│   └── db.js                   # Database module (MySQL/Firebase selector)
├── firebase-config.js          # Firebase Admin SDK initialization
├── app.js                       # Frontend JavaScript
├── index.html                   # Main HTML
├── style.css                    # Styles
├── sw.js                        # Service Worker
├── package.json                 # Dependencies
├── .env                         # Environment variables (local)
├── .env.example                 # Template for .env
├── firebase-service-account.json # Firebase credentials (NEVER commit!)
├── data/
│   └── tokens.json             # QR token storage
└── FIREBASE_SETUP.md           # Firebase setup instructions
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Choose Your Database

**Option A: MySQL (Default)**
```bash
# Create .env file
cp .env.example .env

# Edit .env with MySQL settings:
DATABASE_TYPE=mysql
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=wfms
```

**Option B: Firebase**
```bash
# Get credentials from Firebase Console
# Project Settings → Service Accounts → Generate New Private Key
# Save as firebase-service-account.json

# Create .env file:
DATABASE_TYPE=firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

### 3. Start Server
```bash
npm start
```

**Expected Output:**
```
========================================
✓ Server running at http://localhost:8000/
✓ Database: MySQL (or Firebase)
========================================
```

---

## Project Organization

### Files Updated
- ✅ `server.js` - Cleaned up, removed duplicate code, added Firebase support
- ✅ `db.js` - Enhanced with dual-database support
- ✅ `package.json` - Firebase dependencies included
- ✅ `firebase-config.js` - Proper initialization
- ✅ `.env.example` - Configuration template

### Key Features

#### 1. **Dual Database Support**
- Switch between MySQL and Firebase by changing `DATABASE_TYPE` in `.env`
- All routes automatically use the selected database
- MySQL initialization only happens when needed

#### 2. **API Routes (Work with Both Databases)**
```
POST   /api/signup                  # User registration
POST   /api/login                   # User login
GET    /api/users                   # Get all users
POST   /api/tasks                   # Add task
GET    /api/tasks                   # Get all tasks
PUT    /api/tasks/:id               # Update task status
POST   /api/attendance              # Clock in/out
GET    /api/attendance/:user_id     # Get user attendance
POST   /api/time                    # Log time entry
GET    /api/time/:user_id           # Get time logs
POST   /api/generate-qr             # Generate QR token
POST   /api/validate-token          # Validate QR token
```

#### 3. **Auto-Initialization**
- MySQL: Creates tables, seeds admin user automatically
- Firebase: Reads from configured Firestore collections
- QR tokens stored in `data/tokens.json` (works with both)

---

## Troubleshooting

### Port Already in Use
```bash
# Change port in .env
PORT=9000
```

### MySQL Connection Failed
```
Error: Database connection failed
```
**Solutions:**
- Check MySQL is running: `mysql -u root -p`
- Verify credentials in `.env`
- Ensure database exists: `CREATE DATABASE wfms;`

### Firebase Not Initializing
```
Error: Firebase initialization error
```
**Solutions:**
- Check `firebase-service-account.json` exists
- Verify `FIREBASE_PROJECT_ID` in `.env`
- Ensure file path is correct in `FIREBASE_SERVICE_ACCOUNT_PATH`
- Check Firebase permissions in Console

### Module Not Found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## Environment Variables Reference

```env
# Database Selection
DATABASE_TYPE=mysql                    # or 'firebase'

# MySQL Configuration
DB_HOST=localhost
DB_USER=root
DB_PASS=password
DB_NAME=wfms

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# Server Configuration
PORT=8000
NODE_ENV=development

# Optional: Seed Admin User (MySQL only)
SEED_ADMIN_EMAIL=admin@wfms.local
SEED_ADMIN_PASS=admin
```

---

## Next Steps

1. **Configure Database** - Follow steps above
2. **Start Server** - Run `npm start`
3. **Test API** - Use Postman or frontend
4. **Deploy** - Use Dockerfile or cloud platform

---

## Support

For issues or questions, check:
- `FIREBASE_SETUP.md` - Firebase-specific guide
- `README.md` - General project info
- Server console logs - Error messages

---

**Last Updated:** January 19, 2026
