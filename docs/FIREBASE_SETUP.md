# Firebase Integration Setup Guide

## Overview
This project now supports **both MySQL and Firebase** as database backends. You can switch between them using the `DATABASE_TYPE` environment variable.

## Setup Instructions

### 1. Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Go to **Project Settings** → **Service Accounts**
4. Click **Generate New Private Key**
5. Save the JSON file as `firebase-service-account.json` in your project root

### 2. Configure Environment Variables

Create or update your `.env` file with:

```env
# Database Configuration
DATABASE_TYPE=firebase
# OR for MySQL: DATABASE_TYPE=mysql

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json

# MySQL Configuration (if using MySQL)
DB_HOST=localhost
DB_USER=root
DB_PASS=
DB_NAME=wfms

# Server
PORT=8000
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Choose Your Database

**Option A: Use Firebase (Recommended for Scalability)**
```env
DATABASE_TYPE=firebase
```

**Option B: Keep Using MySQL (Legacy)**
```env
DATABASE_TYPE=mysql
```

## Firebase Features Available

- ✅ Firestore (for structured data)
- ✅ Realtime Database (for real-time updates)
- ✅ Firebase Authentication
- ✅ Cloud Storage integration ready

## API Integration Examples

### Query Users with Firebase

```javascript
const db = require('./firebase-config');

// Get all users
const snapshot = await db.db.collection('users').get();
const users = [];
snapshot.forEach(doc => {
  users.push({ id: doc.id, ...doc.data() });
});

// Get specific user
const user = await db.db.collection('users').doc(userId).get();
```

### Add Data to Firebase

```javascript
// Add user
await db.db.collection('users').add({
  name: 'John Doe',
  email: 'john@example.com',
  role: 'employee',
  createdAt: new Date()
});

// Set specific document
await db.db.collection('users').doc(userId).set({
  name: 'John Doe',
  email: 'john@example.com'
});
```

## Update Server Routes for Firebase

If you want to use Firebase, update `server.js` routes to use:

```javascript
const { firebase, useFirebase } = require('./models/db');

if (useFirebase) {
  // Use Firebase operations
  // Example: await firebase.db.collection('users').get()
} else {
  // Use MySQL operations
  // Example: const [rows] = await pool.query(...)
}
```

## Troubleshooting

- **Firebase not initializing?** Check that `firebase-service-account.json` exists and `FIREBASE_PROJECT_ID` is set
- **Still connecting to MySQL?** Ensure `DATABASE_TYPE=firebase` is set in `.env`
- **Permission denied?** Update Firebase Firestore Rules in console to allow read/write

## Security Notes

⚠️ **Never commit `firebase-service-account.json` to Git!**
- Add to `.gitignore`: `firebase-service-account.json`
- Keep the file private and secure
- Use different credentials for development/production

---

For more info, see [Firebase Admin SDK Docs](https://firebase.google.com/docs/admin/setup)
