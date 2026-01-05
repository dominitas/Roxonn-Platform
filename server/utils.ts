import { fileURLToPath } from "url";
import path, { dirname } from "path";
import express, { type Express } from "express";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Patterns for sensitive data that should be redacted in logs
 */
const SENSITIVE_PATTERNS = [
  // Private keys (64 hex chars, with or without 0x prefix)
  {
    pattern: /\b(0x)?[0-9a-f]{64}\b/gi,
    replacement: '[PRIVATE_KEY_REDACTED]'
  },
  // Wallet addresses (40 hex chars after 0x, or 42 chars starting with xdc)
  {
    pattern: /\b0x[0-9a-f]{40}\b/gi,
    replacement: (match: string) => `${match.substring(0, 6)}...${match.substring(match.length - 4)}`
  },
  {
    pattern: /\bxdc[0-9a-f]{40}\b/gi,
    replacement: (match: string) => `${match.substring(0, 6)}...${match.substring(match.length - 4)}`
  },
  // Mnemonics (12-24 words)
  {
    pattern: /\b(?:[a-z]+\s+){11,23}[a-z]+\b/gi,
    replacement: '[MNEMONIC_REDACTED]'
  },
  // API keys and tokens (common patterns)
  {
    pattern: /\b[A-Za-z0-9]{20,}\b/g,
    replacement: (match: string) => {
      if (match.length >= 20 && /^[A-Za-z0-9]+$/.test(match)) {
        return `${match.substring(0, 4)}...[${match.length - 8} chars]...${match.substring(match.length - 4)}`;
      }
      return match;
    }
  },
  // GitHub tokens
  {
    pattern: /\bgh[pousr]_[A-Za-z0-9]{36}\b/gi,
    replacement: '[GITHUB_TOKEN_REDACTED]'
  },
  // Session IDs and JWTs
  {
    pattern: /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
    replacement: (match: string) => {
      if (match.length >= 40) {
        return `${match.substring(0, 8)}...[TOKEN_REDACTED]`;
      }
      return match;
    }
  }
];

/**
 * Redact sensitive information from log messages
 * @param message The log message to sanitize
 * @returns Sanitized message with sensitive data redacted
 */
function redactSensitiveData(message: string): string {
  let sanitized = message;
  
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    if (typeof replacement === 'function') {
      sanitized = sanitized.replace(pattern, replacement);
    } else {
      sanitized = sanitized.replace(pattern, replacement);
    }
  }
  
  return sanitized;
}

/**
 * Enhanced logging function with sensitive data redaction
 * @param message The message to log
 * @param source The source/module name
 * @param level Log level (info, warn, error, security)
 */
export function log(message: string, source = "express", level: 'info' | 'warn' | 'error' | 'security' = 'info') {
  // Simple filtering for noisy logs
  if (source === 'cors-debug' || source === 'cookies' || source === 'express') {
    // Skip these noisy logs
    return;
  }
  
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Redact sensitive data from the message
  const sanitizedMessage = redactSensitiveData(message);
  
  // Add level indicator
  const levelPrefix = level === 'info' ? '' : `[${level.toUpperCase()}] `;
  
  // Log with timestamp, level, source, and sanitized message
  console.log(`[${formattedTime}] ${levelPrefix}[${source}] ${sanitizedMessage}`);
  
  // For security events, also log to a separate security log if needed
  if (level === 'security') {
    // In production, you might want to send security logs to a SIEM or security monitoring system
    console.log(`[SECURITY] [${formattedTime}] [${source}] ${sanitizedMessage}`);
  }
}

/**
 * CRITICAL-5 FIX: Sanitize user input to prevent command injection
 *
 * WHY THIS IS NEEDED:
 * - GitHub issue titles and bodies are user-controlled
 * - They may contain shell metacharacters, backticks, or code injection sequences
 * - Bot comments could be parsed by CLI tools, scripts, or automation
 * - Need to escape dangerous characters before:
 *   - Inserting into GitHub comments
 *   - Storing in database (though parameterized queries help)
 *   - Logging to files
 *
 * ESCAPES:
 * - Backticks: ` → \`
 * - $(...): command substitution
 * - ${...}: variable expansion
 * - \n$(cmd): newline command injection
 * - |, &, ;: shell operators
 * - <, >: redirection
 *
 * @param input - User-controlled string to sanitize
 * @param options - Sanitization options
 * @returns Sanitized string safe for use in various contexts
 */
export function sanitizeUserInput(
  input: string | null | undefined,
  options: {
    maxLength?: number;
    allowNewlines?: boolean;
    context?: 'markdown' | 'log' | 'db' | 'all';
  } = {}
): string {
  if (!input) return '';

  const {
    maxLength = 10000,
    allowNewlines = true,
    context = 'all'
  } = options;

  let sanitized = input.substring(0, maxLength);

  // Escape shell command injection sequences
  if (context === 'all' || context === 'log') {
    // Escape backticks (command substitution in bash)
    sanitized = sanitized.replace(/`/g, '\\`');

    // Escape $(...) command substitution
    sanitized = sanitized.replace(/\$\(/g, '\\$(');

    // Escape ${...} variable expansion
    sanitized = sanitized.replace(/\$\{/g, '\\${');
  }

  // Escape markdown special characters if needed
  if (context === 'all' || context === 'markdown') {
    // Don't completely remove markdown formatting, just escape problematic sequences
    // that could lead to XSS or rendering issues

    // Escape HTML tags
    sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Escape script tags in any case variation
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '[removed script tag]');
  }

  // Remove or escape control characters
  if (context === 'all' || context === 'log') {
    // Remove null bytes (can cause issues in logs and strings)
    sanitized = sanitized.replace(/\0/g, '');

    // Escape shell operators if not allowing newlines
    if (!allowNewlines) {
      sanitized = sanitized.replace(/\n/g, '\\n');
      sanitized = sanitized.replace(/\r/g, '\\r');
    }

    // Remove ANSI escape codes (can mess up terminals)
    sanitized = sanitized.replace(/\x1b\[[0-9;]*m/g, '');
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  return sanitized;
}

/**
 * Sanitize GitHub issue data before using in bot comments or storing in DB
 *
 * @param issue - GitHub issue object
 * @returns Sanitized issue object
 */
export function sanitizeGitHubIssue(issue: {
  title?: string;
  body?: string | null;
  [key: string]: any;
}): typeof issue {
  return {
    ...issue,
    title: issue.title ? sanitizeUserInput(issue.title, {
      maxLength: 500,
      allowNewlines: false,
      context: 'all'
    }) : '',
    body: issue.body ? sanitizeUserInput(issue.body, {
      maxLength: 10000,
      allowNewlines: true,
      context: 'all'
    }) : null
  };
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "..", "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}