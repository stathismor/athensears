#!/usr/bin/env node
/**
 * Generate secure random secrets for Strapi deployment
 * Run: node scripts/generate-secrets.js
 */

const crypto = require('crypto');

function generateSecret() {
  return crypto.randomBytes(32).toString('base64');
}

function generateAppKeys() {
  return Array(4).fill(0).map(() => generateSecret()).join(',');
}

console.log('# Copy these environment variables to Railway:\n');
console.log(`APP_KEYS=${generateAppKeys()}`);
console.log(`API_TOKEN_SALT=${generateSecret()}`);
console.log(`ADMIN_JWT_SECRET=${generateSecret()}`);
console.log(`TRANSFER_TOKEN_SALT=${generateSecret()}`);
console.log(`JWT_SECRET=${generateSecret()}`);
console.log(`ENCRYPTION_KEY=${generateSecret()}`);
console.log('\n# Additional Railway variables:');
console.log('DATABASE_CLIENT=postgres');
console.log('DATABASE_URL=${{Postgres.DATABASE_URL}}');
console.log('HOST=0.0.0.0');
console.log('NODE_ENV=production');
console.log('\n# Note: PORT is automatically provided by Railway - do NOT set it manually');
