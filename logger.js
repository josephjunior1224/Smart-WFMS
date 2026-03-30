const winston = require("winston");

// Check if we are on Vercel (serverless environment)
const isVercel = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";

// Create a simple console-only logger for Vercel
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Only add file transport if NOT on Vercel
if (!isVercel) {
  try {
    const fs = require("fs");
    const path = require("path");
    const logDir = path.join(process.cwd(), "logs");
    
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    logger.add(new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }));
  } catch (err) {
    console.warn("Could not create file transport:", err.message);
  }
}

module.exports = logger;
