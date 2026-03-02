# Visual Testing Guide - What To Look For

## ✅ Error State - What You Should See

### Input Field Changes
```
❌ Red border appears around username input
❌ Input background becomes light red
```

### Error Message Appears
```
Below the username field, in RED TEXT:
"Invalid credentials"
```

### Animation
```
Message slides down smoothly
Stays for 4 seconds
Then fades out
```

### Button State
```
Button returns to normal "Sign In" text
Button becomes clickable again
```

---

## ✅ Success State - What You Should See

### Input Field Changes
```
✓ Green border appears around username input
✓ Input background becomes light green
```

### Success Message Appears
```
Below the username field, in GREEN TEXT:
"✓ Success"
```

### Animation
```
Message slides down smoothly
Stays for 2.5 seconds
Then fades out
```

### Next Action
```
Dashboard automatically loads
Welcome message appears with username
```

---

## ✅ Loading State - What You Should See

### Button Transforms
```
Sign In button shows:
  [Spinner icon] Loading...
```

### Visual Feedback
```
Button appears slightly disabled
Cursor changes to waiting state
```

### Duration
```
Shows until login response arrives
Usually 1-2 seconds for localhost
```

---

## ✅ Console Logs - What You Should See

### Step 1: Attempt Login
```
🔐 Attempting login with username: john
```

### Step 2: API Call
```
✓ API POST /api/login: {ok: true, user: {...}}
```

### Step 3: Response Received
```
📨 Login response: {ok: true, user: {id: 1, name: "john", role: "worker"}}
```

### Step 4: Success
```
✓ Login successful for user: john
✓ User saved to localStorage: {id: 1, username: "john", role: "employee"}
```

### Complete Log Sequence
```
🔐 Attempting login with username: john
✓ API POST /api/login: {ok: true, user: {id: 1, name: "john", role: "worker"}}
📨 Login response: {ok: true, user: {id: 1, name: "john", role: "worker"}}
✓ Login successful for user: john
✓ User saved to localStorage: {id: 1, username: "john", role: "employee"}
```

---

## ❌ Error Scenarios - What You'll See

### Scenario 1: Invalid Username
```
Visual:
- Red border on input
- Red text: "Invalid credentials"

Console:
🔐 Attempting login with username: baduser
✓ API POST /api/login: {ok: false, error: "Invalid credentials"}
📨 Login response: {ok: false, error: "Invalid credentials"}
❌ Login failed: Invalid credentials
❌ Form Error: Invalid credentials
```

### Scenario 2: Network Error (Server Down)
```
Visual:
- Red border on input  
- Red text: "Connection error. Please try again."

Console:
🔐 Attempting login with username: john
❌ API Error POST /api/login: TypeError: fetch failed
❌ Login error: ...
❌ Form Error: Connection error. Please try again.
```

### Scenario 3: Empty Username
```
Visual:
- Red border on input
- Red text: "Username is required"

Console:
❌ Form Error: Username is required

(No API call is made)
```

---

## Browser DevTools - How to Access

### Open DevTools
```
Windows/Linux: Press Ctrl + Shift + I
              or Right-click → Inspect
              or F12

Mac:          Press Cmd + Option + I
              or Right-click → Inspect
              or Cmd + Option + U
```

### Find Console Tab
```
1. DevTools opens on right side
2. Click "Console" tab at top
3. You should see the JavaScript logs
```

### Filter Logs
```
Type in search box to filter
Example: type "login" to see login-related logs
```

---

## Step-by-Step Visual Test

### Test 1: Register Account
```
1. Click "Don't have an account? Create one"
2. Enter Username: testuser
3. Select Role: Employee
4. Click "Create Account"

LOOK FOR:
✓ Green "✓ Success" message
✓ Alert box saying "Account created"
✓ Back to login form
```

### Test 2: Login Success
```
1. Enter Username: testuser
2. Click "Sign In"

LOOK FOR:
✓ Button shows [spinner] Loading...
✓ Green border on input
✓ Green "✓ Success" message
✓ Dashboard loads with welcome
```

### Test 3: Login Failure
```
1. Enter Username: nonexistent
2. Click "Sign In"

LOOK FOR:
✓ Button shows [spinner] Loading...
✓ Red border on input
✓ Red "Invalid credentials" message
✓ Message fades after 4 seconds
✓ Can try again
```

---

## Color Reference

### Error Colors
```
Red Border:     #ef4444 (CSS: var(--danger))
Light Red BG:   rgba(239, 68, 68, 0.05)
Red Text:       #ef4444
```

### Success Colors
```
Green Border:   #10b981 (CSS: var(--success))
Light Green BG: rgba(16, 185, 129, 0.05)
Green Text:     #10b981
```

### Primary Colors
```
Primary Blue:   #2563eb (for loading/focus)
Dark Blue:      #1e40af (hover state)
```

---

## Animation Details

### Message Entrance Animation
```
Keyframe: slideDown
Duration: 0.2 seconds
Start:    opacity 0, translateY -4px
End:      opacity 1, translateY 0px
Easing:   ease-out
```

### Button Loading Animation
```
Spinner Icon:   Rotating circle
Duration:       Indeterminate (until response)
Text Changes:   "Sign In" → "Loading..."
```

---

## Troubleshooting Checklist

- [ ] Do you see red/green borders on inputs?
- [ ] Do error/success messages appear below inputs?
- [ ] Do messages fade out automatically?
- [ ] Do you see spinner on button when loading?
- [ ] Does console show log messages?
- [ ] Does dashboard load on success?
- [ ] Can you see messages in both light and dark theme?

If any checks fail:
1. Open browser console (F12)
2. Look for error messages
3. Check if server is running
4. Try refreshing the page

---

## Animation Timing

| Event | Duration | What Happens |
|-------|----------|--------------|
| Message Entry | 0.2s | Slides down with fade in |
| Success Message Show | 2.5s | Visible to user |
| Error Message Show | 4s | Visible to user |
| Button Loading | 1-2s | Shows spinner |
| Dashboard Fade In | 0.5s | Smooth transition |

---

## Expected Console Output Examples

### Successful Login
```javascript
🔐 Attempting login with username: john
✓ API POST /api/login: 
   {ok: true, user: {id: 1, name: "john", role: "worker"}}
📨 Login response: 
   {ok: true, user: {id: 1, name: "john", role: "worker"}}
✓ Login successful for user: john
✓ User saved to localStorage: 
   {id: 1, username: "john", role: "employee"}
```

### Failed Login
```javascript
🔐 Attempting login with username: baduser
✓ API POST /api/login: {ok: false, error: "Invalid credentials"}
📨 Login response: {ok: false, error: "Invalid credentials"}
❌ Login failed: Invalid credentials
❌ Form Error: Invalid credentials
```

---

**Ready to test? Follow the "Step-by-Step Visual Test" section above!** ✅
