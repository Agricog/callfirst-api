// ============================================================
// CallFirst API — Structured Logger
// ============================================================

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

function formatEntry(level: LogLevel, message: string, meta?: Record<string, unknown>): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };
}

/** Strips sensitive fields before logging */
function redact(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const redacted = { ...meta };
  const sensitiveKeys = ['phone', 'customerPhone', 'apiKey', 'password', 'token', 'secret'];
  for (const key of sensitiveKeys) {
    if (key in redacted && typeof redacted[key] === 'string') {
      const val = redacted[key] as string;
      redacted[key] = val.length > 4 ? `***${val.slice(-4)}` : '***';
    }
  }
  return redacted;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>): void {
    console.log(JSON.stringify(formatEntry('info', message, redact(meta))));
  },
  warn(message: string, meta?: Record<string, unknown>): void {
    console.warn(JSON.stringify(formatEntry('warn', message, redact(meta))));
  },
  error(message: string, meta?: Record<string, unknown>): void {
    console.error(JSON.stringify(formatEntry('error', message, redact(meta))));
  },
  debug(message: string, meta?: Record<string, unknown>): void {
    if (process.env['NODE_ENV'] !== 'production') {
      console.debug(JSON.stringify(formatEntry('debug', message, redact(meta))));
    }
  },
};
