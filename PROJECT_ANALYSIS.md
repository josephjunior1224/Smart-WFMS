# WFMS Project Analysis & Implementation Plan

## Current Issues Analysis

### 1. **SQLite Unique Constraint Error During Registration**
**Problem**: Users get "sqlite invalid credential unique constraint" error
- **Root Cause**: Email column has `UNIQUE` constraint in the `users` table
- **Current Behavior**: First registration succeeds, but duplicate emails are rejected
- **Fix**: Add email validation on frontend before submission and provide clear error messages

### 2. **Browser Functionality Issues (Not Working After Hard Refresh)**
**Problems Identified**:
- **Service Worker (sw.js)**: May not be registering correctly
- **CORS Configuration**: API calls may fail due to CORS issues between frontend and backend
- **Asset Caching**: Service worker might be caching stale assets
- **Database Connection**: SQLite might not persist or connect properly
- **localStorage Dependency**: App relies heavily on localStorage which might be cleared on hard refresh
- **Session Loss**: After hard refresh, user session is lost, and no persistent token system

**Fixes Needed**:
- Add token persistence in backend (JWT tokens)
- Fix service worker registration
- Implement proper CORS headers
- Add API error handling and retry logic
- Handle network disconnections gracefully

### 3. **Missing Features**

#### A. Google OAuth / Social Login
- No Google Sign-in integration
- No OAuth provider implementation
- Need Firebase Google Auth or external OAuth provider

#### B. Role-Based Dashboards
- Currently only generic dashboard after login
- No separate admin and employee views
- No dashboard routing based on user role

#### C. Task Management System
- Tasks table exists but UI is missing
- No task assignment interface
- No task viewing for employees
- Status only has 'pending' but needs: pending, in-progress, completed, rejected

#### D. Real-Time Notifications
- No WebSocket integration (Socket.io)
- No notification system for task assignments
- No notification for approval/rejection status

#### E. Employee Task Completion & Reporting
- No mechanism for employees to update task status
- No daily report generation
- No file upload for task evidence

#### F. Admin Approval Workflow
- No approval/rejection endpoints
- No admin interface to review submissions
- No message back to employee

#### G. Performance Chart
- No performance data collection
- No performance tracking endpoints
- No analytics/charting UI
- Missing metrics: tasks completed, average completion time, approval rate, employee rating

---

## Implementation Plan

### Phase 1: Fix Core Issues (Priority 1)
1. **Fix localStorage & Persistence**
   - Implement JWT token system
   - Add token refresh endpoints
   - Auto-save session to backend

2. **Fix Service Worker**
   - Reset cache strategy
   - Add proper offline handling
   - Cache versioning

3. **Fix CORS & API Issues**
   - Test all API endpoints
   - Add proper error responses
   - Implement retry logic

### Phase 2: Authentication Enhancement (Priority 2)
1. **Add Google OAuth**
   - Integrate Firebase Google Sign-in
   - Add Google button to login form
   - Handle Google token verification

2. **Email Validation**
   - Add frontend validation
   - Provide clear error messages
   - Check if email exists before submission

### Phase 3: Dashboard & Navigation (Priority 3)
1. **Role-Based Dashboard Routing**
   - Create separate admin dashboard
   - Create separate employee dashboard
   - Route users based on role after login

2. **Admin Dashboard Features**
   - Employee list with status
   - Task assignment interface
   - Approval queue
   - Performance analytics

3. **Employee Dashboard Features**
   - Assigned tasks list
   - Task details and submission form
   - Daily report interface
   - Notification center

### Phase 4: Task Management & Notifications (Priority 4)
1. **Real-Time Notification System**
   - Install Socket.io for WebSockets
   - Implement notification events
   - Add notification UI component

2. **Task Workflow**
   - Employee receives task notification
   - Employee updates task status
   - Employee submits daily report
   - Admin sees pending approvals
   - Admin approves/rejects with message
   - Employee receives status notification

### Phase 5: Performance Chart (Priority 5)
1. **Performance Data Schema**
   - Create performance_metrics table
   - Track: task completion, approval rate, time taken
   - Store daily reports

2. **Analytics Endpoints**
   - Get employee performance data
   - Calculate metrics
   - Generate charts

3. **UI Components**
   - Chart.js or similar for visualization
   - Performance dashboard
   - Employee statistics

---

## Detailed Feature Requirements

### Database Schema Changes
```sql
-- New tables needed:

-- Add new columns to tasks table
ALTER TABLE tasks ADD COLUMN daily_report TEXT;
ALTER TABLE tasks ADD COLUMN submitted_at DATETIME;
ALTER TABLE tasks ADD COLUMN completed_at DATETIME;
ALTER TABLE tasks ADD COLUMN approval_status TEXT DEFAULT 'pending'; -- pending, approved, rejected
ALTER TABLE tasks ADD COLUMN admin_feedback TEXT;

-- Performance metrics table
CREATE TABLE performance_metrics (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  task_id INTEGER,
  date DATE,
  tasks_assigned INTEGER DEFAULT 0,
  tasks_completed INTEGER DEFAULT 0,
  tasks_approved INTEGER DEFAULT 0,
  tasks_rejected INTEGER DEFAULT 0,
  avg_completion_time REAL,
  approval_rate REAL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Notifications table
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY,
  recipient_id INTEGER NOT NULL,
  sender_id INTEGER,
  type TEXT, -- task_assigned, approval_status
  message TEXT,
  related_task_id INTEGER,
  read BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id) REFERENCES users(id)
);

-- OAuth tokens for social login
CREATE TABLE oauth_providers (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  provider TEXT, -- google, github, etc
  provider_id TEXT UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### New API Endpoints Needed

**Authentication**
- `POST /api/auth/google` - Google OAuth callback
- `POST /api/auth/refresh` - Refresh JWT token

**Tasks**
- `GET /api/tasks/my-tasks` - Get tasks assigned to user
- `PUT /api/tasks/:id/status` - Update task status
- `POST /api/tasks/:id/submit-report` - Submit daily report
- `GET /api/tasks/:id/report` - Get task report

**Admin**
- `POST /api/tasks/:id/approve` - Approve submitted task
- `POST /api/tasks/:id/reject` - Reject submitted task
- `GET /api/admin/pending-approvals` - Get pending approvals

**Notifications**
- `GET /api/notifications` - Get user notifications
- `PUT /api/notifications/:id/read` - Mark as read
- `DELETE /api/notifications/:id` - Delete notification

**Performance**
- `GET /api/performance/employee/:userId` - Get employee performance
- `GET /api/performance/chart` - Get all employees performance for chart

---

## Implementation Priority

1. **Fix Core Issues** (Day 1) - Session, localStorage, API reliability
2. **Fix Registration** (Day 1) - Email validation, error handling
3. **Add Google OAuth** (Day 2) - Social login integration
4. **Implement Dashboards** (Day 2-3) - Role-based routing
5. **Task Management** (Day 3-4) - Core workflow
6. **Notifications** (Day 4-5) - Real-time updates with Socket.io
7. **Performance Chart** (Day 5-6) - Analytics and visualization

---

## Technology Stack to Add

```json
{
  "socket.io": "^4.7.2",
  "socket.io-client": "^4.7.2",
  "jsonwebtoken": "^9.1.2",
  "chart.js": "^4.4.1",
  "react-chartjs-2": "^5.2.0"
}
```

---

## Next Steps

1. Run this analysis with the team
2. Confirm priorities
3. Start with Phase 1 (core issues)
4. Implement each phase sequentially
