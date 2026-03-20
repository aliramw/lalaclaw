[English](../en/testing-e2e.md) | [Deutsch](../de/testing-e2e.md)

# Browser-E2E-Tests

Diese Anleitung definiert die Erwartungen an End-to-End-Tests auf Browser-Ebene für LalaClaw.

Nutze dieses Dokument zusammen mit [CONTRIBUTING.md](../../CONTRIBUTING.md). `CONTRIBUTING.md` beschreibt den allgemeinen Beitragsablauf; diese Datei erklärt, wann Playwright-Coverage ergänzt werden soll, wie sie stabil bleibt und was das Repository derzeit von Browser-Tests erwartet.

## Aktueller Stack

- Framework: Playwright
- Testverzeichnis: `tests/e2e/`
- Hauptkonfiguration: [`playwright.config.js`](../../playwright.config.js)
- Startskript für Testserver: [`scripts/playwright-dev-server.cjs`](../../scripts/playwright-dev-server.cjs)

Die aktuelle Konfiguration startet:

- den Frontend-Dev-Server unter `http://127.0.0.1:5173`
- den Backend-Dev-Server unter `http://127.0.0.1:3000`

Das Playwright-Startskript führt das Backend im Modus `COMMANDCENTER_FORCE_MOCK=1` aus, daher hängen Browser-Tests standardmäßig nicht von einer echten OpenClaw-Umgebung ab.

## Wann Browser-E2E erforderlich ist

Füge Browser-e2e-Coverage hinzu oder aktualisiere sie, wenn die Änderung einen oder mehrere dieser Bereiche betrifft:

- Verhalten beim Senden / Stoppen / Wiederholen von Nachrichten
- wartende Turns und verzögerter Eintritt in die Unterhaltung
- Session-Bootstrap, Session-Wechsel oder Tab-Routing
- Hydration- und Wiederherstellungsverhalten, das erst nach einem echten Render sichtbar wird
- browserseitige Regressionen, denen man mit Hook- oder Controller-Tests allein nicht genug vertrauen kann

Für reine Statusübergänge solltest du Controller- oder `App`-Level-Vitest-Tests bevorzugen. Browser-e2e ist dann sinnvoll, wenn das Risiko vom echten DOM-Timing, Fokusverhalten, Routing, der Request-Reihenfolge oder einem mehrstufigen UI-Flow abhängt.

## Was zuerst abgedeckt werden soll

Das Repository braucht keine breite Browser-Abdeckung, bevor die risikoreichsten Nutzerpfade stabil abgedeckt sind.

Priorität haben diese Abläufe:

1. App-Start und erster Render
2. ein normaler Senden-/Antwort-Zyklus
3. wartende Sends bleiben aus der Unterhaltung heraus, bis ihr Turn beginnt
4. stop / abort während einer laufenden Antwort
5. Session-Bootstrap-Pfade wie IM-Tabs oder Agent-Wechsel

Wenn ein Bugfix Queueing, Streaming, stop, Hydration oder Session-/Runtime-Sync verändert, sollte ein Browser-Regressions-Test normalerweise genau auf den sichtbaren Fehlerfall zielen.

## Stabilitätsregeln

Browser-e2e soll für Stabilität geschrieben werden, nicht für visuelle Kleinigkeiten.

- Bevorzuge Assertions auf sichtbares Nutzerverhalten statt auf Implementierungsdetails
- Prüfe Text, Rollen, Labels und stabile Controls
- Mache den Test nicht von Animations-Timing abhängig, außer der Bug betrifft genau dieses Timing
- Vermeide fragile Assertions auf Tailwind-Klassen, wenn die Klasse selbst nicht das getestete Verhalten ist
- Halte das Netzwerk deterministisch, indem relevante `/api/*`-Aufrufe im Test geroutet werden
- Nutze echte Browser-Interaktion für Eingaben, Klicks, Tab-Fokus und Request-Reihenfolge

Bei Queue- oder Streaming-Flows sollten vor allem diese Punkte geprüft werden:

- ist eine Nachricht im Gesprächsbereich sichtbar?
- bleibt sie nur im Queue-Bereich?
- erscheint sie erst, nachdem der vorherige Turn abgeschlossen ist?
- stimmt die sichtbare Reihenfolge mit der tatsächlichen Turn-Reihenfolge überein?

## Mock-Strategie

Leite Browser-e2e standardmäßig nicht gegen ein echtes OpenClaw-Deployment.

Empfohlene Reihenfolge:

1. relevante `/api/*`-Aufrufe direkt im Playwright-Test routen
2. den vorhandenen Mock-Modus des Repositories verwenden
3. eine echte externe Abhängigkeit nur nutzen, wenn die Aufgabe ausdrücklich eine gleichwertige Live-Validierung verlangt

Die aktuellen Beispiele in [`tests/e2e/chat-queue.spec.js`](../../tests/e2e/chat-queue.spec.js) folgen diesem Muster:

- `/api/auth/state` ist stubbed
- `/api/lalaclaw/update` ist stubbed
- `/api/runtime` ist stubbed
- `/api/chat` wird pro Test gesteuert, damit Queue-Reihenfolge und Abschluss-Timing deterministisch bleiben

## Autorenvorgaben

Halte jeden Browser-e2e-Test eng fokussiert.

- Eine Spec-Datei sollte sich meist auf einen Produktbereich konzentrieren
- Ein Test sollte meist genau einen Nutzerfluss prüfen
- Bevorzuge eine kleine Helper-/Fixture-Datei statt große JSON-Blöcke in jedem Test zu kopieren
- Nutze Snapshot-Builder nach Möglichkeit wieder, damit Browser-Tests mit `App.test.jsx` ausgerichtet bleiben

Gute Beispiele:

- "wartende Turns bleiben aus der Unterhaltung, bis sie wirklich starten"
- "stop bringt den Senden-Button nach dem Abbruch einer laufenden Antwort zurück"
- "ein Feishu-Bootstrap-Tab wird vor dem ersten Senden auf den nativen session user aufgelöst"

Weniger nützliche Beispiele:

- "der Button hat exakt diese Utility-Klassen"
- "drei unzusammenhängende Flows in einem Test"
- "ein echter Remote-Service wird verwendet, obwohl route mocking das Verhalten bereits abdecken würde"

## Lokal ausführen

Installiere den Playwright-Browser einmal:

```bash
npm run test:e2e:install
```

Browser-e2e ausführen:

```bash
npm run test:e2e
```

Mit sichtbarem Browser ausführen:

```bash
npm run test:e2e:headed
```

Mit der Playwright-UI ausführen:

```bash
npm run test:e2e:ui
```

## CI-Erwartungen

CI hat jetzt einen eigenen Browser-e2e-Job in [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml).

Dieser Job sollte fokussiert und stabil bleiben:

- halte die Browser-Suite klein genug, damit sie auf jedem PR zuverlässig läuft
- füge zuerst hochrelevante Regressionen hinzu, bevor du breitere explorative Szenarien ergänzt
- vermeide flaky waits oder lange sleeps

Wenn ein neuer Browser-Test zu langsam oder zu umgebungssensibel für die Standard-CI ist, sollte er nicht in den Standardpfad `test:e2e` aufgenommen werden, bevor er vereinfacht oder stabilisiert wurde.

## Empfohlene Review-Checkliste

Vor dem Mergen einer Browser-e2e-Änderung prüfen:

- braucht diese Änderung wirklich Browser-e2e, oder reicht `App`-/Controller-Coverage?
- prüft der Test sichtbares Nutzerverhalten statt Implementierungsdetails?
- ist der benötigte Netzwerkzustand deterministisch kontrolliert?
- ergibt dieser Test in sechs Monaten noch Sinn, wenn sich das UI-Styling ändert?
- schlägt der Test bei genau der Nutzerregression fehl, die uns wirklich wichtig ist?

## Zugehörige Dateien

- [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [playwright.config.js](../../playwright.config.js)
- [tests/e2e/chat-queue.spec.js](../../tests/e2e/chat-queue.spec.js)
- [src/App.test.jsx](../../src/App.test.jsx)
