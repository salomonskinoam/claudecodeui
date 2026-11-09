#!/usr/bin/env node
// quests: after every server build, copies dist-server into its own folder,
// ~/.local/share/quests/builds/<time>-<commit>/, and points builds/current at it. A new chat service starts from
// current; a running one keeps the folder it started from, so a build never changes code under a running chat.
// Every other top-level entry of the repo (node_modules, package.json, public, ...) is a symlink, because the
// server finds its app root as the parent of dist-server. Old builds no open chat service uses are removed.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const builds = path.join(os.homedir(), '.local', 'share', 'quests', 'builds');
const commit = execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const id = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${commit}`;
const dir = path.join(builds, id);

fs.mkdirSync(dir, { recursive: true });
fs.cpSync(path.join(repo, 'dist-server'), path.join(dir, 'dist-server'), { recursive: true });
for (const entry of fs.readdirSync(repo)) {
  if (entry !== 'dist-server' && entry !== '.git' && !entry.startsWith('dist-server.')) fs.symlinkSync(path.join(repo, entry), path.join(dir, entry));
}
fs.symlinkSync(id, path.join(builds, 'current.next'));
fs.renameSync(path.join(builds, 'current.next'), path.join(builds, 'current'));
console.log(`snapshot-build: ${dir}`);

// Builds in use: the ones open chat services run (chat_hosts.build); a missing table means none yet.
let used = new Set();
try {
  const { default: Database } = await import(path.join(repo, 'node_modules', 'better-sqlite3', 'lib', 'index.js'));
  const db = new Database(path.join(os.homedir(), '.cloudcli', 'auth.db'), { readonly: true });
  used = new Set(db.prepare('SELECT build FROM chat_hosts WHERE ended_at IS NULL').all().map((r) => r.build));
} catch (error) {
  console.log(`snapshot-build: no chat service records (${error.message}); keeping builds younger than a day`);
}
for (const old of fs.readdirSync(builds)) {
  const p = path.join(builds, old);
  if (old === id || old === 'current' || used.has(old)) continue;
  if (Date.now() - fs.statSync(p).mtimeMs > 86_400_000) fs.rmSync(p, { recursive: true, force: true });
}
