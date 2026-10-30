# Änderungen

Neueste Version zuoberst. Format: `## Version – Datum`, darunter je eine Zeile pro Änderung.
Die Version steht auch in `package.json` und unter «Setup → Über Bracket».

## 1.0.1 – 2026-10-30
- Bracket läuft neu auf Port 8082 (vorher 8083). Wer schon installiert hat: einmal von Hand `git pull` und `docker compose up -d --build`.

## 1.0.0 – 2026-10-30
- Erste Version: Teilnehmer, Spiele und wer bei welchem Spiel mitmacht erfassen.
- Modus pro Spiel: Spieler pro Gruppe, Weiterkommende pro Gruppe, Grösse der Finalrunde, «Best of» im KO, Spiel um Platz 3, Rundendauer und Stationen.
- Gruppen werden zufällig ausgelost; vor dem ersten Resultat lassen sich zwei Spieler tauschen.
- Zeitplan über alle Spiele mit Startzeit, Wechselzeit und Pause vor der Finalrunde; Spiele laufen parallel, niemand spielt gleichzeitig an zwei Orten. Verschiebt sich live, wenn Matches länger oder kürzer dauern.
- Resultate mit grossen Knöpfen eintragen; Gruppe: Sieg 3, Unentschieden 1, Niederlage 0, bei Gleichstand wie im Fussball (Regel in der App).
- TV-Ansicht, «Ich bin …»-Hervorhebung, Turnier-PIN pro Gerät, Sicherung, Update-Knopf.
