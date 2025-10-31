#!/usr/bin/env node

console.error('=== DEBUG: Environment Variables ===');
console.error('All PG_PROFILE vars:');
for (const key in process.env) {
  if (key.startsWith('PG_PROFILE_')) {
    console.error(`  ${key} = ${process.env[key]}`);
  }
}

console.error('\n=== DEBUG: Parsing Profiles ===');

const profileNames = new Set();
for (const key in process.env) {
  if (key.startsWith('PG_PROFILE_')) {
    const match = key.match(/^PG_PROFILE_([^_]+)_/);
    if (match) {
      console.error(`  Found profile: ${match[1]}`);
      profileNames.add(match[1]);
    }
  }
}

console.error(`\nTotal profiles found: ${profileNames.size}`);
console.error(`Profile names: ${Array.from(profileNames).join(', ')}`);
