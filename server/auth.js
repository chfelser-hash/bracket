// Turnier-PIN: Anschauen ist frei, zum Eintragen gibt man einmal pro Gerät die PIN ein.
// PIN gehasht (scrypt), Geräte-Sitzungen als Cookie, Sperre nach zu vielen Fehlversuchen.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SESSION_DAYS = 30;

export class Auth {
  constructor(dataDir) {
    this.pinFile = path.join(dataDir, 'pin.json');
    this.sessionsFile = path.join(dataDir, 'sessions.json');
    this.pin = readJson(this.pinFile, null);
    this.sessions = readJson(this.sessionsFile, {});
    this.failures = new Map(); // ip -> {count, until}
    this.#prune();
  }

  get hasPin() {
    return !!(this.pin && this.pin.hash);
  }

  setPin(pin) {
    pin = String(pin ?? '').trim();
    if (!/^\d{4,12}$/.test(pin)) throw httpError(400, 'PIN: 4 bis 12 Ziffern');
    const salt = crypto.randomBytes(16).toString('hex');
    this.pin = { salt, hash: hashPin(pin, salt) };
    writeJson(this.pinFile, this.pin);
    // Neue PIN: alle Geräte müssen sie neu eingeben (ausser dem eigenen, das ruft danach unlock auf)
    this.sessions = {};
    this.#save();
  }

  unlock(pin, ip) {
    if (!this.hasPin) throw httpError(400, 'Noch keine PIN festgelegt');
    const f = this.failures.get(ip);
    if (f && f.count >= 8 && f.until > Date.now()) throw httpError(429, 'Zu viele Fehlversuche. Bitte in 15 Minuten nochmals versuchen.');
    if (!verify(pin, this.pin)) {
      const cur = f && f.until > Date.now() ? f : { count: 0 };
      this.failures.set(ip, { count: cur.count + 1, until: Date.now() + 15 * 60 * 1000 });
      throw httpError(401, 'PIN falsch');
    }
    this.failures.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions[token] = { expires: Date.now() + SESSION_DAYS * 864e5 };
    this.#save();
    return token;
  }

  lock(token) {
    if (token && this.sessions[token]) {
      delete this.sessions[token];
      this.#save();
    }
  }

  canEdit(token) {
    const s = token && this.sessions[token];
    return !!(s && s.expires > Date.now());
  }

  #prune() {
    let changed = false;
    for (const [t, s] of Object.entries(this.sessions)) {
      if (!s || s.expires < Date.now()) { delete this.sessions[t]; changed = true; }
    }
    if (changed) this.#save();
  }

  #save() {
    writeJson(this.sessionsFile, this.sessions);
  }
}

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 64).toString('hex');
}

function verify(pin, stored) {
  const a = Buffer.from(hashPin(String(pin ?? '').trim(), stored.salt), 'hex');
  const b = Buffer.from(stored.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, o) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(o, null, 1), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

export function httpError(status, message, extra) {
  const e = new Error(message);
  e.status = status;
  if (extra) e.extra = extra;
  return e;
}
