// Datenschutz-Check: verhindert, dass persönliche Daten ins (öffentliche) Repo gelangen.
// Läuft auf GitHub bei jedem Push und lokal mit «npm run privacy». Prüft alle eingecheckten Dateien:
//  - keine Daten-, Sicherungs-, Excel- oder CSV-Dateien
//  - keine echten E-Mail-Adressen (erlaubt: example.org/.com)
//  - keine persönlichen Begriffe aus der geheimen Liste PRIVATE_PATTERNS (GitHub-Secret, nie im Repo)
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
const add = (file, msg) => problems.push(`${file}: ${msg}`);

const FORBIDDEN = /\.(xlsx|xlsm|xls|csv|ods|numbers)$/i;
const DATA_FILES = /(^|\/)(data\/(?!\.gitkeep$)|bracket(-sicherung)?[^/]*\.json$|pin\.json$|sessions\.json$)/;
const EMAIL = /[A-Z0-9._%+-]+@([A-Z0-9-]+\.)+[A-Z]{2,}/gi;
const EMAIL_OK = (e) => /@(example\.(org|com|net)|.*\.example)$/i.test(e) || /^noreply@anthropic\.com$/i.test(e);
const secret = String(process.env.PRIVATE_PATTERNS || '').split(/[,\n]/).map((s) => s.trim()).filter((s) => s.length >= 3);

for (const file of files) {
  if (DATA_FILES.test(file)) { add(file, 'Daten-/Sicherungsdatei gehört nicht ins Repo'); continue; }
  if (FORBIDDEN.test(file)) { add(file, 'Excel/CSV gehört nicht ins Repo'); continue; }
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  if (/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(file) || bytes.includes(0)) continue;
  const text = bytes.toString('utf8');
  for (const e of text.match(EMAIL) || []) if (!EMAIL_OK(e)) add(file, `E-Mail-Adresse «${e}» – bitte durch …@example.org ersetzen`);
  for (const p of secret) if (text.toLowerCase().includes(p.toLowerCase())) add(file, 'enthält einen Begriff aus PRIVATE_PATTERNS');
}

if (problems.length) {
  console.error('Datenschutz-Check: ' + problems.length + ' Problem(e)\n' + problems.map((p) => ' ✗ ' + p).join('\n'));
  process.exit(1);
}
console.log(`Datenschutz-Check: ${files.length} Dateien geprüft – alles in Ordnung.`);
