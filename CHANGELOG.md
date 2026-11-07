# Änderungen

Neueste Version zuoberst. Format: `## Version – Datum`, darunter je eine Zeile pro Änderung.
Die Version steht auch in `package.json` und unter «Setup → Über Bracket».

## 1.3.0 – 2026-11-07
- Gruppenwertung: Bei Punktgleichheit zählt jetzt zuerst die Direktbegegnung, erst danach Tordifferenz und Tore aus allen Spielen (wie an der EM). Bei drei oder mehr Punktgleichen wird die Direktbegegnung für die übrigen wiederholt.
- In der Tabelle steht neu (D) Direktbegegnung, (T) Tordifferenz/Tore oder (L) Los.

## 1.2.0 – 2026-11-07
- Spieler können neue Resultate ohne PIN eintragen und Matches starten. Ein bestehendes Resultat ändern oder löschen und das ganze Setup brauchen weiterhin die PIN.
- Neue Einstellung unter «Setup → Turnier»: «Spieler dürfen Resultate ohne PIN eintragen» (Standard: ein).

## 1.1.1 – 2026-10-30
- Fehler behoben: Unter «Jetzt» werden immer alle laufenden Matches angezeigt – auch wenn mehrere vorgezogen wurden und «Weitere Matches» eingeklappt ist. Für besetzte Stationen steht darunter, was danach kommt.

## 1.1.0 – 2026-10-30
- Neu: «Jetzt» → «Weitere Matches vorziehen» pro Spiel – zeigt alle späteren Matches. Wer dem Zeitplan voraus ist, kann sie direkt starten oder das Resultat eintragen; der Zeitplan rechnet danach neu.
- Bei jedem dieser Matches steht, ob beide frei sind oder wer gerade woanders spielt; «Jetzt starten» nimmt eine freie Station.

## 1.0.1 – 2026-10-30
- Bracket läuft neu auf Port 8082 (vorher 8083). Wer schon installiert hat: einmal von Hand `git pull` und `docker compose up -d --build`.

## 1.0.0 – 2026-10-30
- Erste Version: Teilnehmer, Spiele und wer bei welchem Spiel mitmacht erfassen.
- Modus pro Spiel: Spieler pro Gruppe, Weiterkommende pro Gruppe, Grösse der Finalrunde, «Best of» im KO, Spiel um Platz 3, Rundendauer und Stationen.
- Gruppen werden zufällig ausgelost; vor dem ersten Resultat lassen sich zwei Spieler tauschen.
- Zeitplan über alle Spiele mit Startzeit, Wechselzeit und Pause vor der Finalrunde; Spiele laufen parallel, niemand spielt gleichzeitig an zwei Orten. Verschiebt sich live, wenn Matches länger oder kürzer dauern.
- Resultate mit grossen Knöpfen eintragen; Gruppe: Sieg 3, Unentschieden 1, Niederlage 0, bei Gleichstand wie im Fussball (Regel in der App).
- TV-Ansicht, «Ich bin …»-Hervorhebung, Turnier-PIN pro Gerät, Sicherung, Update-Knopf.
