/**
 * Authentication Middleware for Grace AI
 * Supports multiple auth strategies: API Key, JWT, Session
 */

import crypto from 'crypto';

// ============================================
// CONFIGURATION - Move to environment variables!
// ============================================
const AUTH_CONFIG = {
  // API Key authentication (simple, for development/trusted clients)
  apiKeys: new Set(process.env.API_KEYS?.split(',') || []),
  
  // JWT secret (for token-based auth)
  jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  
  // Rate limiting
  enableRateLimiting: process.env.RATE_LIMIT_ENABLED !== 'false',
  
  // Authentication mode: 'none', 'api-key', 'jwt', 'both'
  authMode: process.env.AUTH_MODE || 'api-key',
};

// ============================================
// In-Memory Store (replace with Redis in production!)
// ============================================
const rateLimitStore = new Map();
const requestLogStore = new Map();

/**
 * Clean up old rate limit entries every 10 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitStore.entries()) {
    if (now - data.resetTime > 0) {
      rateLimitStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * API Key Authentication Middleware
 */
export function requireApiKey(req, res, next) {
  if (AUTH_CONFIG.authMode === 'none') {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide an API key via X-API-Key header or api_key query parameter',
    });
  }

  if (!AUTH_CONFIG.apiKeys.has(apiKey)) {
    logSecurityEvent('invalid_api_key', req, { providedKey: apiKey.substring(0, 8) + '...' });
    return res.status(403).json({
      error: 'Invalid API key',
      message: 'The provided API key is not valid',
    });
  }

  // Attach API key to request for logging
  req.apiKey = apiKey;
  req.authenticated = true;
  next();
}

/**
 * JWT Authentication Middleware (for user-based auth)
 */
export function requireJWT(req, res, next) {
  if (AUTH_CONFIG.authMode === 'none') {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid JWT token via Authorization: Bearer <token> header',
    });
  }

  const token = authHeader.substring(7);

  try {
    // In production, use a proper JWT library like jsonwebtoken
    // This is a simplified version for demonstration
    const decoded = verifyJWT(token, AUTH_CONFIG.jwtSecret);
    req.user = decoded;
    req.authenticated = true;
    next();
  } catch (error) {
    logSecurityEvent('invalid_jwt', req, { error: error.message });
    return res.status(403).json({
      error: 'Invalid token',
      message: 'The provided JWT token is invalid or expired',
    });
  }
}

/**
 * Flexible authentication - supports both API key and JWT
 */
export function requireAuth(req, res, next) {
  if (AUTH_CONFIG.authMode === 'none') {
    return next();
  }

  // Try API key first
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (apiKey && AUTH_CONFIG.apiKeys.has(apiKey)) {
    req.apiKey = apiKey;
    req.authenticated = true;
    return next();
  }

  // Try JWT
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const decoded = verifyJWT(token, AUTH_CONFIG.jwtSecret);
      req.user = decoded;
      req.authenticated = true;
      return next();
    } catch (error) {
      // JWT invalid, fall through to error
    }
  }

  // No valid authentication found
  return res.status(401).json({
    error: 'Authentication required',
    message: 'Please provide either an API key (X-API-Key header) or JWT token (Authorization: Bearer)',
  });
}

/**
 * Rate Limiting Middleware
 * Limits requests per IP address or authenticated user
 */
export function rateLimiter(options = {}) {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    maxRequests = 100, // 100 requests per window
    keyGenerator = (req) => req.ip || req.connection.remoteAddress,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
  } = options;

  return (req, res, next) => {
    if (!AUTH_CONFIG.enableRateLimiting) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    }

    record.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - record.count));
    res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

    if (record.count > maxRequests) {
      logSecurityEvent('rate_limit_exceeded', req, { count: record.count, limit: maxRequests });
      return res.status(429).json({
        error: 'Too many requests',
        message: `You have exceeded the rate limit of ${maxRequests} requests per ${windowMs / 1000 / 60} minutes`,
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
    }

    next();
  };
}

/**
 * Request Logger Middleware - logs all API requests
 */
export function requestLogger(req, res, next) {
  const startTime = Date.now();
  const requestId = crypto.randomBytes(8).toString('hex');

  req.requestId = requestId;

  // Log request
  const logEntry = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'],
    authenticated: req.authenticated || false,
    apiKey: req.apiKey ? req.apiKey.substring(0, 8) + '...' : null,
    userId: req.user?.id || null,
  };

  console.log(`[${logEntry.timestamp}] ${logEntry.method} ${logEntry.path} - Request ID: ${requestId}`);

  // Intercept response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - startTime;
    logEntry.statusCode = res.statusCode;
    logEntry.duration = duration;
    logEntry.success = res.statusCode < 400;

    console.log(
      `[${new Date().toISOString()}] ${logEntry.method} ${logEntry.path} - ` +
        `${res.statusCode} - ${duration}ms - Request ID: ${requestId}`
    );

    // Store log entry (in production, send to logging service)
    requestLogStore.set(requestId, logEntry);

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Cost Tracking Middleware - tracks LLM usage costs
 */
export function costTracker(req, res, next) {
  req.costTracking = {
    startTime: Date.now(),
    llmCalls: 0,
    estimatedCost: 0,
  };

  // Override for tracking
  req.trackLLMCall = (tokens = 0) => {
    req.costTracking.llmCalls++;
    // Estimate: $0.002 per 1K tokens (adjust based on your model)
    req.costTracking.estimatedCost += (tokens / 1000) * 0.002;
  };

  // Log costs on response
  const originalSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - req.costTracking.startTime;
    console.log(
      `💰 Cost tracking: ${req.costTracking.llmCalls} LLM calls, ` +
        `~$${req.costTracking.estimatedCost.toFixed(4)} estimated cost, ` +
        `${duration}ms duration`
    );
    return originalSend.call(this, data);
  };

  next();
}

/**
 * Security Event Logger
 */
function logSecurityEvent(eventType, req, details = {}) {
  const event = {
    type: eventType,
    timestamp: new Date().toISOString(),
    ip: req.ip || req.connection.remoteAddress,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ...details,
  };

  console.warn(`🚨 SECURITY EVENT: ${eventType}`, event);

  // In production: send to security monitoring service (e.g., Sentry, DataDog)
}

/**
 * Simple JWT verification (use jsonwebtoken library in production!)
 */
function verifyJWT(token, secret) {
  // This is a placeholder - use proper JWT library in production
  try {
    const [headerB64, payloadB64, signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());

    // Check expiration
    if (payload.exp && payload.exp < Date.now() / 1000) {
      throw new Error('Token expired');
    }

    return payload;
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Generate a new API key (admin utility)
 */
export function generateApiKey() {
  return 'gsk_' + crypto.randomBytes(32).toString('hex');
}

/**
 * CORS configuration with origin validation
 */
export function configureCORS(allowedOrigins = []) {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // Allow requests from configured origins only
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      // Origin not allowed
      return res.status(403).json({
        error: 'Origin not allowed',
        message: `Requests from ${origin} are not permitted`,
      });
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

    // Handle preflight
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    next();
  };
}

export default {
  requireApiKey,
  requireJWT,
  requireAuth,
  rateLimiter,
  requestLogger,
  costTracker,
  generateApiKey,
  configureCORS,
};
