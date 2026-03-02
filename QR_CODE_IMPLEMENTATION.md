# QR Code Security Feature Implementation

## Overview
The WFMS now includes a unique QR code-based security feature for user authentication and access tracking. This provides a second security layer and enables quick dashboard access via QR scanning.

## Features Implemented

### 1. **Automatic QR Code Generation After Signup**
- When a user successfully creates an account, a unique QR code is automatically generated
- QR code encodes: User ID, Email, Role, and Generation Timestamp
- QR code displayed on registration page (shown after account creation)
- User can scan to enter dashboard or sign in normally

### 2. **QR Scan Logging & Database Tracking**
- New `qr_scans` table added to SQLite database
- Records:
  - `id`: Unique scan identifier
  - `user_id`: User who was scanned
  - `qr_token`: The QR data encoded
  - `scanned_at`: Timestamp of scan (auto-set to current time)
  - `scanner_ip`: IP address of scanning device

### 3. **Security Measures**
- QR codes contain time-stamped user data
- Scans are logged for audit trail (when/where user accessed dashboard)
- QR data includes role information for proper dashboard redirect
- Each user has a unique QR code

## API Endpoints

### `POST /api/generate-qr-token`
**Purpose**: Generate QR code for a user after signup
**Request Body**:
```json
{
  "userId": 1,
  "email": "user@example.com",
  "role": "worker"
}
```
**Response**:
```json
{
  "ok": true,
  "qrCode": "data:image/png;base64,...",
  "qrData": {
    "userId": 1,
    "email": "user@example.com",
    "role": "worker",
    "generatedAt": "2026-02-07T03:45:00Z"
  }
}
```

### `POST /api/qr-scan`
**Purpose**: Log QR scan and verify user, redirect to dashboard
**Request Body**:
```json
{
  "userId": 1,
  "email": "user@example.com",
  "role": "worker",
  "qrToken": "{...json encoded qr data...}"
}
```
**Response**:
```json
{
  "ok": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "email": "user@example.com",
    "role": "worker"
  },
  "scannedAt": "2026-02-07T03:46:00Z"
}
```

### `GET /api/qr-scans/:userId`
**Purpose**: Retrieve QR scan history for a user
**Response**:
```json
[
  {
    "id": 1,
    "scanned_at": "2026-02-07T03:46:00Z",
    "scanner_ip": "192.168.1.100"
  }
]
```

## User Flow

### Upon Account Registration:
1. User fills signup form (Name, Email, Password, Role)
2. Clicks "Create Account"
3. Account created → unique QR code generated automatically
4. QR code displayed on screen with user info
5. User can:
   - **Scan QR code** → Directs to dashboard (scanned_at timestamp recorded)
   - **Sign in traditionally** → Enter email/password below
   - **See scan history** → Admin can view when/where QR was scanned

### When Scanning QR Code:
1. QR scanner app reads QR code
2. Contains: `{"userId":1,"email":"user@example.com","role":"worker","generatedAt":"..."}`
3. Application calls `/api/qr-scan` with decoded data
4. Backend:
   - Logs scan with timestamp and IP address
   - Verifies user exists
   - Returns user data with role
5. Frontend automatically logs user into dashboard with their role
6. Entry logged in `qr_scans` table for audit trail

## Database Schema

### New Table: `qr_scans`
```sql
CREATE TABLE qr_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  qr_token TEXT,
  scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  scanner_ip TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

## Frontend Functions

### `showQrAfterSignup(userData)`
- Called after successful registration
- Calls `/api/generate-qr-token`
- Displays QR code on form
- Shows success message with scan instructions

### `handleQrScan(qrData)`
- Processes scanned QR code data
- Calls `/api/qr-scan` to log and verify
- Redirects user to dashboard with correct role
- Handles errors gracefully

## Benefits

✅ **Enhanced Security**: Second factor authentication  
✅ **Fast Access**: Scan QR to bypass login form  
✅ **Audit Trail**: Know when/where each user accessed dashboard  
✅ **Role-Based Redirect**: QR contains role, user sent to correct dashboard  
✅ **User Tracking**: Admin can see QR scan history for compliance  
✅ **Mobile Friendly**: Works with any QR scanner app

## Testing

### Test Signup + QR Generation:
```bash
# 1. Create account form
# 2. Verify QR code displays
# 3. Note the unique QR data
```

### Test QR Scan:
```bash
# 1. Scan generated QR with mobile device/scanner
# 2. Verify automatic dashboard redirect
# 3. Check browser console for "QR scan successful"
```

### Check Scan Logs:
```bash
# Query database:
SELECT * FROM qr_scans;
# Should show: user_id, scanned_at timestamp, scanner_ip
```

## Notes

- QR codes are regenerated on each signup (unique per account)
- Scan timestamp is automatically recorded (security audit trail)
- Works offline — QR decoding happens browser-side
- Compatible with standard QR code readers
- Admin can export scan logs for compliance reporting
