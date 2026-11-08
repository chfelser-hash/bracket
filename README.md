# Bracket

Unser alljährliches Game-Turnier als Web-App – Geschwister von [Kässeli](https://github.com/chfelser-hash/kaesseli) und [Reisli](https://github.com/chfelser-hash/reisli).
Läuft im Browser auf Handy, PC und TV, die Daten liegen auf der eigenen Synology NAS.

- **Jetzt** – was läuft und was als Nächstes kommt, pro Spiel und Station, mit Uhrzeit. «Start» markiert ein Match als laufend, **Resultat** öffnet die Eingabe: Name antippen = +1, grosse − / + Knöpfe, Zahl lässt sich auch direkt tippen. Oben die Phase («Gruppenphase · fertig ca. 17:20», «Pause», «Finalrunde»), unten die zuletzt gespielten Matches zum Korrigieren. **Weitere Matches vorziehen** (pro Spiel) zeigt alle späteren Matches – wer dem Zeitplan voraus ist, startet einfach das nächste; dabei steht, ob beide frei sind oder wer gerade woanders spielt.
- **Ich bin …** (oben rechts) – auf jedem Handy wählbar: Die eigenen Matches werden hervorgehoben, «Jetzt» zeigt zuoberst «Dein nächstes Match», der Zeitplan hat einen Filter «Mein Plan».
- **Zeitplan** – alle Matches aller Spiele in zeitlicher Reihenfolge, mit Station, Pause und geschätztem Ende. Filter nach Spiel.
- **Tabellen** – pro Spiel die Gruppen (Weiterkommende grün), die Gruppenspiele, die Wertungsregel und der Turnierbaum mit Spiel um Platz 3; am Schluss das Podest.
- **Setup** – Turnier (Name, Datum, Startzeit, Wechselzeit, Pause), Teilnehmer, Spiele mit Modus, «Wer spielt was» als Kreuzchen-Tabelle, Auslosung, PIN, Sicherung, Update.
- **Erinnerung als PDF** (unter Tabellen und Setup) – das ganze Turnier als schönes A4-Dokument: Titelseite mit den Siegern jedes Spiels, Zahlen und einer Übersicht «Wer ist wie weit gekommen», danach pro Spiel eine Seite mit Podest, Gruppentabellen, Turnierbaum und allen Resultaten. «Als PDF speichern» öffnet das Druckfenster des Browsers – dort «Als PDF speichern» wählen (Handy: Teilen → Drucken → PDF). Geht auch mitten im Turnier, dann steht «Zwischenstand» darauf.
- **TV-Ansicht** (`/#tv`, Knopf unter Setup) – links «Jetzt und als Nächstes» in grosser Schrift, rechts abwechselnd Tabellen und Turnierbaum jedes Spiels, grosse Uhr. Aktualisiert sich alle paar Sekunden.

Keine externen Abhängigkeiten: nur Node.js. Daten als JSON-Datei mit täglicher automatischer Sicherung (30 Tage).

> **Datenschutz:** Im Repo liegt kein einziger persönlicher Wert. Der Ordner `data/` (Turnier, PIN, Sicherungen) ist per `.gitignore` ausgeschlossen. Bitte nichts davon manuell einchecken.

---

## So funktioniert das Turnier

### Pro Spiel einstellbar

| Einstellung | Bedeutung |
|---|---|
| **Dauer einer Runde** | Wie lange ein Match ungefähr dauert (inkl. Einstellen). Bestimmt den Zeitplan. |
| **Stationen** | Wie viele Matches gleichzeitig laufen können (z.B. «Switch 1», «Switch 2»). Die Namen erscheinen im Zeitplan. |
| **Spieler pro Gruppe** | Höchstens so viele. Bracket bildet so wenige Gruppen wie möglich, gleich gross (±1). Beispiel: 10 Spieler, max. 4 → Gruppen mit 4, 3, 3. **1 = reines KO** ohne Gruppenphase. |
| **Weiter pro Gruppe** | Wie viele pro Gruppe in die Finalrunde kommen. |
| **Grösse der Finalrunde** | *Automatisch* = Gruppen × Weiter. Oder fest 4/8/16 …: Fehlen Plätze, kommen die besten Gruppen-Nächsten weiter (verglichen pro Match, weil Gruppen verschieden gross sein können). Ist die Zahl keine Zweierpotenz, bekommen die Besten ein **Freilos**. |
| **Runden im KO** | 1 Runde oder «Best of 3/5/7» – eingetragen wird dann, wer wie viele Runden gewonnen hat (z.B. 2:1). |
| **Spiel um Platz 3** | Ein/aus. |

Die Vorschau im Spiel-Dialog zeigt sofort, was herauskommt: Anzahl Gruppen, Gruppenspiele, ab welcher Runde das KO beginnt, Freilose und die reine Spielzeit.

### Wertung in der Gruppe

Sieg 3 Punkte, Unentschieden 1, Niederlage 0. Bei Punktgleichheit der Reihe nach (wie an der EM):
1. **Direktbegegnung** – Mini-Tabelle nur aus den Spielen der Punktgleichen untereinander (Punkte, Tordifferenz, Tore). Trennt sie bei drei oder mehr nur einen Teil, wird sie für die übrigen wiederholt.
2. Tordifferenz aus allen Gruppenspielen
3. Mehr erzielte Tore aus allen Gruppenspielen
4. **Stechen** – ist dann noch alles gleich und geht es um einen Platz, der zählt (Weiterkommen, Setzung in der Finalrunde, Podest ohne Finalrunde), spielen die Betroffenen ein Entscheidungsmatch ohne Unentschieden (bei drei oder mehr jeder gegen jeden; bleibt es gleich, gibt es eine weitere Runde). Das Stechen erscheint automatisch unter «Jetzt», im Zeitplan und bei der Gruppe; die Finalrunde wartet darauf. Geht es um nichts, steht **(=)** und es gibt kein Stechen.

In der Tabelle steht dann, was entschieden hat: **(D)** Direktbegegnung, **(T)** Tordifferenz/Tore, **(S)** Stechen. Die Regel steht in der App unter «Tabellen → So wird gewertet».

### Finalrunde

- Gruppenerste werden so verteilt, dass sie sich möglichst spät treffen; in der ersten KO-Runde spielen nie zwei aus derselben Gruppe gegeneinander (sofern es mehrere Gruppen gibt).
- Im KO gibt es kein Unentschieden.
- Rangliste: Sieger Final, Verlierer Final, Sieger Platz 3 (ohne Spiel um Platz 3: beide Halbfinal-Verlierer auf Platz 3). Jedes Spiel wird einzeln ausgewertet.

### Zeitplan

- Alle Spiele laufen parallel. Erst alle Gruppenphasen, dann die **Pause**, dann alle Finalrunden.
- Niemand spielt gleichzeitig an zwei Orten; zwischen zwei Matches liegt für Spieler und Station die **Wechselzeit**.
- Live: «Start» merkt sich die Startzeit, das Resultat die Endzeit. Dauert etwas länger oder kürzer, verschiebt sich der Rest automatisch (gerechnet ab jetzt). Ohne «Start» schätzt Bracket den Beginn aus der Rundendauer.

### Korrigieren

- Resultat antippen → ändern oder löschen. Wurde danach schon weitergespielt und ändert sich dadurch der Sieger, fragt Bracket nach und löscht die betroffenen Folge-Resultate.
- Teilnehmer, Gruppengrösse oder «Wer spielt was» nach der Auslosung ändern → Bracket fragt nach, weil das Spiel neu ausgelost werden muss.
- **Tauschen:** Vor dem ersten Resultat unter «Setup → Auslosung» einen Spieler antippen, dann einen anderen – die beiden tauschen die Gruppe.

### PIN

Anschauen kann jeder mit dem Link. **Neue Resultate eintragen und Matches starten** geht ebenfalls ohne PIN, so können die Spieler ihre Matches selbst eintragen (abschaltbar unter «Setup → Turnier»).

Für alles andere gibt man auf dem Gerät einmal die **Turnier-PIN** ein (gilt 30 Tage, 🔒/🔓 oben rechts): ein bestehendes Resultat ändern oder löschen, Teilnehmer, Spiele, Modus, Auslosung, Sicherung und Update. Nach 8 falschen Versuchen ist 15 Minuten Pause. «PIN ändern» meldet alle anderen Geräte ab.

## 1. Lokal starten (Windows)

1. [Node.js](https://nodejs.org) (LTS, ab Version 20) installieren.
2. Repo herunterladen oder klonen.
3. `start.bat` doppelklicken – der Browser öffnet <http://localhost:8082>.
4. Beim ersten Aufruf Turnier-Name und PIN festlegen.

Alternativ im Terminal: `npm start` (Port ändern mit `set PORT=3000`).

## 2. Betrieb auf der Synology DS218+

Gleich wie Reisli – **Container Manager** (DSM 7.2). Bracket nutzt Port **8082** (Kässeli 8080, Reisli 8081).

1. Per SSH auf die NAS und das Repo klonen (Git ist installiert):
   ```sh
   sudo git clone https://github.com/chfelser-hash/bracket.git /volume1/docker/bracket
   ```
2. Container Manager → **Projekt** → **Erstellen**
   - Projektname: `bracket`
   - Pfad: `/docker/bracket`
   - Quelle: «Vorhandene docker-compose.yml verwenden»
   - Erstellen – das Image wird auf der NAS gebaut und gestartet.
3. Im Heimnetz `http://<IP-der-NAS>:8082` öffnen und **sofort** Turnier-Name und PIN festlegen (wer zuerst kommt, legt die PIN fest – darum vor dem Freischalten über Cloudflare).

Die Daten liegen in `/docker/bracket/data` und werden von Hyper Backup mitgesichert, wenn der Ordner `docker` im Backup-Job ist.

## 3. Von aussen erreichbar über Cloudflare

Das Turnier findet in einem anderen Heimnetz statt – Bracket läuft trotzdem auf der eigenen NAS, erreichbar über den bestehenden Cloudflare Tunnel:

1. <https://one.dash.cloudflare.com> → **Networks → Tunnels** → den Tunnel der NAS → **Public Hostname → Add a public hostname**
   - Subdomain: z.B. `turnier`, Domain: deine Domain
   - Service: **HTTP**, URL: `<IP-der-NAS>:8082` (oder `bracket:8082`, wenn cloudflared im selben Docker-Netz läuft)
2. Speichern – Bracket ist unter `https://turnier.<deine-domain>` erreichbar.
3. Den Link vor dem Turnier verteilen. Die Spieler können damit selbst Resultate eintragen; die PIN braucht nur, wer korrigiert oder einrichtet.

Bracket erkennt HTTPS über Cloudflare selbst (Cookie dann nur über HTTPS). Am Turnier braucht es nur Internet im fremden WLAN.

**Als App installieren:** Android (Chrome): Menü ⋮ → «App installieren». Windows (Edge/Chrome): Installieren-Symbol in der Adressleiste. Für den TV: Browser des TVs oder ein Laptop am HDMI, `https://turnier.<deine-domain>/#tv` im Vollbild (F11).

### Update

**Über die App:** «Setup → Über Bracket → Nach Updates suchen». Angeboten werden nur Versionen, die auf GitHub alle Tests bestanden haben. Bracket sichert vorher, holt den neuen Stand und startet von selbst neu; auch «zurück zu einer früheren Version» ist dort möglich.

**Von Hand:** `cd /volume1/docker/bracket && sudo git pull && sudo docker compose up -d --build`. Nötig nur, wenn sich `Dockerfile` oder `docker-compose.yml` ändern – die Änderungsliste sagt es dann ausdrücklich.

## 4. Sicherung und nächstes Jahr

- **Automatisch:** Bei der ersten Änderung des Tages wird `data/backups/bracket-JJJJ-MM-TT.json` angelegt, 30 Tage aufbewahrt. Zusätzlich vor jeder Wiederherstellung, jedem Update und jedem «Neues Turnier».
- **Setup → Sicherung:** herunterladen, einspielen, «Jetzt sichern», frühere Stände auf dem Server laden oder wiederherstellen.
- **Neues Turnier:** «Resultate löschen» behält Teilnehmer und Spiele (nur Auslosung und Resultate weg), «Alles löschen» auch Teilnehmer und Spiele. Name, Zeiten und PIN bleiben.

## Qualität und Versionen

- **Version** in `package.json`, Änderungen in `CHANGELOG.md` (zu sehen unter «Setup → Über Bracket»). Fehlerkorrekturen → 1.0.**x**, neue Funktionen → 1.**x**.0, grosse Umbauten → **x**.0.0.
- **Tests:** Turnier-Logik (Gruppen, Tabellen, Baum, Zeitplan) möglichst lückenlos, jeder API-Aufruf mit Erfolgs- und Fehlerfällen, Browser-Abläufe für die wichtigsten Wege. Nur erfundene Testdaten. Auf GitHub muss die Testabdeckung Mindestwerte erreichen (Zeilen 85 %, Zweige 70 %, Funktionen 80 %).
- **Datenschutz-Check** bei jedem Push (`npm run privacy`): keine Daten- oder Sicherungsdateien, keine echten E-Mail-Adressen. Eigene Begriffe als GitHub-Secret `PRIVATE_PATTERNS` (kommagetrennt) hinterlegen – nie im Repo.
- **Freigabe:** Ist alles grün, markiert GitHub die Version als `vX.Y.Z`. Nur solche Versionen bietet «Aktualisieren» in der App an.

## Technisches

| | |
|---|---|
| Server | `server/` – Node.js ohne Abhängigkeiten, REST-API unter `/api` |
| Oberfläche | `public/` – HTML/CSS/JavaScript-Module, PWA |
| Turnier-Logik | `public/js/turnier.js` – Auslosung, Tabellen, KO-Baum, Zeitplan; von Browser, Server und Tests gemeinsam genutzt |
| Daten | `data/bracket.json`, `data/pin.json`, `data/sessions.json`, `data/backups/` |
| Konfiguration | `PORT` (8082), `DATA_DIR` (./data), `COOKIE_SECURE`, `RESTART_ON_UPDATE`, `UPDATE_ENABLED` |
| Tests | `npm test` (schnell: Turnier-Logik), `npm run test:e2e` (API, Update, Browser – braucht Playwright), `npm run test:coverage` (alles mit Testabdeckung) |
