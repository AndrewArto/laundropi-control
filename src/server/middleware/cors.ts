import cors = require('cors');

let ALLOWED_ORIGINS: string[] = [];

export const initCorsMiddleware = (origins: string[]) => {
  ALLOWED_ORIGINS = origins;
};

export const isOriginAllowed = (origin: string): boolean => {
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(allowed => {
    if (allowed === '*') return true;
    if (allowed.endsWith('*')) {
      const prefix = allowed.slice(0, -1);
      return origin.startsWith(prefix);
    }
    return origin === allowed;
  });
};

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);

    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
});
