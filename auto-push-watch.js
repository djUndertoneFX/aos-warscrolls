#!/usr/bin/env node
/**
 * auto-push-watch.js
 *
 * Watches this project folder for file changes and automatically commits +
 * pushes them to git. Both Railway services (frontend "easygoing-embrace" /
 * aoswarscrolls.com, and backend "aos-warscrolls") are already configured to
 * auto-deploy on push via their GitHub integration, so once this script
 * pushes, Railway builds and deploys on its own — no Railway CLI or
 * dashboard action needed. Cloudflare just proxies DNS/CDN in front of the
 * frontend service, so it needs nothing either.
 *
 * Usage:
 *   node auto-push-watch.js
 *   (or just double-click start-auto-push.bat)
 *
 * Leave the window open in the background. Stop it any time with Ctrl+C.
 */

const { exec } = require('child_process');
const fs = require('fs');

const ROOT = __dirname;
const DEBOUNCE_MS = 5000;

// Paths to ignore entirely — git/build noise and this tool's own files,
// not real source changes worth committing.
const IGNORE_PATTERNS = [
  /(^|[\\/])\.git([\\/]|$)/,
  /(^|[\\/])node_modules([\\/]|$)/,
  /(^|[\\/])frontend[\\/]build([\\/]|$)/,
  /\.db-shm$/,
  /\.db-wal$/,
  /(^|[\\/])auto-push-watch\.js$/,
  /(^|[\\/])start-auto-push\.bat$/,
  /(^|[\\/])auto-push\.log$/,
];

function shouldIgnore(relPath) {
  return IGNORE_PATTERNS.some((p) => p.test(relPath));
}

function log(msg) {
  const ts = new Date().toLocaleString();
  console.log(`[${ts}] ${msg}`);
}

function run(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { cwd: ROOT, maxBuffer: 1024 * 1024 * 10 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || stdout || err.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

let pending = false;
let timer = null;

async function commitAndPush() {
  try {
    const status = await run('git status --porcelain');
    if (!status) {
      log('No changes to commit.');
      return;
    }

    log('Changes detected, staging...');
    await run('git add -A');

    const summary = status
      .split('\n')
      .slice(0, 5)
      .map((l) => l.trim())
      .join(', ');

    const message = `Auto-update via Claude: ${summary}`.slice(0, 200).replace(/"/g, '\\"');
    await run(`git commit -m "${message}"`);
    log(`Committed: ${message}`);

    await run('git push');
    log('Pushed to origin. Railway will auto-build and deploy shortly.');
  } catch (err) {
    log(`ERROR: ${err.message}`);
  } finally {
    pending = false;
  }
}

function scheduleCommit() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (!pending) {
      pending = true;
      commitAndPush();
    }
  }, DEBOUNCE_MS);
}

log(`Watching ${ROOT} for changes...`);
log('Press Ctrl+C to stop.');

// Flush anything already sitting uncommitted before we start watching —
// e.g. an edit made just before this script was started.
pending = true;
commitAndPush();

fs.watch(ROOT, { recursive: true }, (eventType, filename) => {
  if (!filename) return;
  const rel = filename.toString();
  if (shouldIgnore(rel)) return;
  log(`Change detected: ${rel}`);
  scheduleCommit();
});
