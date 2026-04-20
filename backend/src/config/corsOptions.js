const parseAllowedOrigins = () => {
  const configured = process.env.FRONTEND_URL || '';
  const configuredEntries = configured
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  // Always allow local frontend dev servers in addition to configured origins.
  const devOrigins = ['http://localhost:5173', 'http://localhost:3000'];
  return Array.from(new Set([...configuredEntries, ...devOrigins]));
};

const isAllowedOrigin = (origin, allowedOrigins) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return /^https:\/\/.*\.vercel\.app$/i.test(origin);
};

const createCorsOptions = () => {
  const allowedOrigins = parseAllowedOrigins();

  return {
    origin(origin, callback) {
      if (isAllowedOrigin(origin, allowedOrigins)) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  };
};

module.exports = { createCorsOptions };
