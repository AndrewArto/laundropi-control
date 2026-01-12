#!/usr/bin/env node
'use strict';

const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-ui-password.js "your-password"');
  process.exit(1);
}

const N = 16384;
const r = 8;
const p = 1;
const keylen = 64;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, keylen, { N, r, p });
const encoded = `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;

console.log(encoded);
