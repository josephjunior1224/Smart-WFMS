
# Workforce Management System (WFMS)

A professional web-based workforce management system built with Node.js, Express, and MySQL.

## Features

- **User Authentication**: Secure login/registration with role-based access (Admin/Employee)
- **Task Management**: Create, assign, and track tasks
- **Attendance Tracking**: Clock in/out, break tracking, and attendance records
- **Time Logging**: Automatic time logging for work hours
- **QR Code Generation**: Generate QR codes for quick check-ins
- **Responsive Design**: Mobile-friendly interface with dark/light theme toggle
- **Real-time Dashboard**: Live updates with performance metrics

## Requirements

- Node.js (v14+)
- npm or yarn
- MySQL 8.0+ (for local development)
- Or Docker (for containerized setup)

## Installation

### Local Setup

1. **Clone and navigate to project**
```bash
cd "wfms test"
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
# Edit .env file with your database credentials
DATABASE_TYPE=mysql
DB_HOST=localhost
DB_USER=root
DB_PASS=""
DB_NAME=wfms
PORT=8000
```

4. **Start the server**
```bash
npm start
```

Server will start at `http://localhost:8000`

### Docker Setup

```bash
docker-compose up --build
```

This will:
- Start MySQL database on port 3306
- Start the Node.js server on port 8000
- Auto-initialize database schema
- Seed default admin user

## Default Credentials

**Admin Account:**
- Username: `admin@wfms.local`
- Password: `admin`

## Project Structure

```
wfms test/
├── server.js              # Express server & API routes
├── app.js                 # Frontend JavaScript logic
├── db.js                  # Database connection manager
├── index.html             # Main HTML interface
├── style.css              # Styling (dark/light theme)
├── manifest.json          # PWA manifest
├── package.json           # Dependencies
├── .env                   # Configuration file
├── data/                  # Runtime data storage
├── models/                # Data models
├── docs/                  # Documentation (archived)
└── docker-compose.yml     # Docker configuration
```

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/signup` - User registration
- `POST /api/generate-qr` - Generate QR token
- `POST /api/validate-token` - Validate QR token

### Users
- `GET /api/users` - List all users
- `GET /api/attendance/:user_id` - Get user attendance
- `GET /api/time/:user_id` - Get user time logs

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task status

### Attendance
- `POST /api/attendance` - Record attendance
- `POST /api/time` - Log time entry

## Technologies

- **Backend**: Node.js, Express.js, MySQL2/Promise
- **Frontend**: Vanilla JavaScript, Bootstrap 5, Custom CSS
- **Security**: bcrypt, CORS
- **Utilities**: UUID, QRCode, jsPDF
- **PWA**: Service Workers, Manifest

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Security Notes

- Change default admin credentials after first login
- Use strong passwords in production
- Enable HTTPS in production environment
- Restrict CORS to trusted domains
- Use environment variables for sensitive data

## Troubleshooting

**Server won't start:**
- Check if port 8000 is available
- Verify MySQL is running
- Check .env configuration

**Database connection failed:**
- Ensure MySQL is running
- Verify DB_HOST, DB_USER, DB_PASS in .env
- Check if database `wfms` exists

**Frontend issues:**
- Clear browser cache
- Check browser console for errors
- Verify API endpoints in app.js

## Contributing

For bugs or feature requests, please update relevant files and test thoroughly.

## License

Proprietary - All rights reserved

Hey everyone, the project is about a smart workforce management system using QR-based scanning technology to monitor and track employee time accuracy and productivity in an organization 
  it mainly focuse on work assigned and their completion with a valuable report based on the task assigned to the individual, it's lightwaight easy to use and also very interesting in terms of design and flexibility.

