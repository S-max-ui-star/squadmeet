/**
 * SquadMeet – Abschlusspräsentation (Google Slides), 26.10.2026
 *
 * Baut das ganze Deck in Google Slides: 13 Folien, Diagramme als echte Formen,
 * Sprechernotizen auf jeder Folie.
 *
 * So geht's:
 * 1. squadmeet-titel-hintergrund.jpg in Google Drive hochladen.
 * 2. Die Datei-ID unten bei MAP_FILE_ID eintragen. Die ID ist der lange Teil im
 *    Freigabe-Link: https://drive.google.com/file/d/<DATEI-ID>/view
 * 3. https://script.google.com → Neues Projekt → diesen Code einfügen → speichern.
 * 4. Oben die Funktion "buildDeck" wählen → Ausführen → Zugriff erlauben.
 * 5. Im Ausführungsprotokoll steht der Link zum neuen Deck.
 *
 * Wichtig: Jeder Lauf baut ein NEUES Deck. Nur einmal ausführen. Danach direkt in
 * Google Slides weiterarbeiten, sonst gehen die Änderungen im Team verloren.
 */

const MAP_FILE_ID = 'HIER_DIE_DATEI_ID_EINTRAGEN';
const DECK_NAME = 'SquadMeet – Abschlusspräsentation';

const C = {
  ink: '#16181D', grey: '#505663', line: '#D5D8DE', code: '#EEF0F3', white: '#FFFFFF',
  teal: '#0B7285', orange: '#D9480F', green: '#2B8A3E', gold: '#B8860B', purple: '#5F3DC4',
};
// Name, Füllung, Schriftfarbe, Breite in pt (Gold braucht dunkle Schrift für den Kontrast).
const SPORTS = [
  ['TISCHTENNIS', C.teal, C.white, 92],
  ['BASKETBALL', C.orange, C.white, 86],
  ['FUSSBALL', C.green, C.white, 72],
  ['BEACHVOLLEYBALL', C.gold, C.ink, 114],
  ['OUTDOOR-FITNESS', C.purple, C.white, 114],
];
// Farben der fünf Zeilen auf Inhaltsfolien, wie in Entwurf C.
const ROW_COLORS = [[C.teal, C.white], [C.orange, C.white], [C.purple, C.white], [C.green, C.white], [C.gold, C.ink]];

const COND = 'Barlow Condensed';
const BODY = 'Barlow';
const MONO = 'JetBrains Mono';
const W = 720, H = 405, M = 44;
const PAD = 7; // Innenabstand eines Textfelds in Google Slides

function buildDeck() {
  const deck = SlidesApp.create(DECK_NAME);
  const first = deck.getSlides()[0];

  titleSlide_(deck);
  problemSlide_(deck);
  demoSlide_(deck);
  architectureSlide_(deck);
  frontendSlide_(deck);
  debugFrontendSlide_(deck);
  backendSlide_(deck);
  debugBackendSlide_(deck);
  hostingSlide_(deck);
  pipelineSlide_(deck);
  debugDeploySlide_(deck);
  lessonsSlide_(deck);
  questionsSlide_(deck);

  first.remove();
  if (deck.getPageWidth() !== W || deck.getPageHeight() !== H) {
    Logger.log('Achtung: Das Deck ist nicht 16:9 (' + deck.getPageWidth() + ' × ' + deck.getPageHeight() + ' pt). Die Positionen stimmen dann nicht.');
  }
  Logger.log('Fertig: ' + deck.getUrl());
}

// ---------- Folien ----------

function titleSlide_(deck) {
  const s = blank_(deck);
  if (MAP_FILE_ID && MAP_FILE_ID.indexOf('HIER_') !== 0) {
    s.insertImage(DriveApp.getFileById(MAP_FILE_ID).getBlob(), 0, 0, W, H).sendToBack();
  } else {
    Logger.log('Kein Hintergrundbild: MAP_FILE_ID ist nicht gesetzt. Das Bild kann später von Hand eingefügt werden.');
  }
  text_(s, 'ABSCHLUSSPROJEKT · SYNTAX MODUL 4', 0, 86, W, 24, { font: COND, weight: 700, size: 13, color: C.grey, align: 'center' });
  text_(s, 'SQUADMEET', 0, 104, W, 88, { font: COND, weight: 900, size: 76, align: 'center' });
  text_(s, 'Freie Sportplätze finden. Treffen ansagen. Mitspielen.', 0, 190, W, 30, { weight: 600, size: 17, align: 'center' });
  sportChips_(s, null, 232, 22, 11);
  text_(s, 'Stefan Kallinich  ·  Dominik Fischer  ·  Steven Tanu  ·  26.10.2026', 0, 266, W, 24, { size: 12, color: C.grey, align: 'center' });
  text_(s, 'Karte: © OpenStreetMap-Mitwirkende', W - 230, H - 22, 226, 18, { size: 7, color: C.grey, align: 'end' });
  notes_(s, [
    'STEFAN · ca. 0:30',
    '',
    '- Begrüßung. Wir sind Stefan, Dominik und Steven.',
    '- SquadMeet in einem Satz: eine Karte mit freien Sportplätzen, auf der man Treffen ansagt und mitmacht.',
    '- Ablauf: Problem, Live-Demo, Architektur, Frontend, Backend, Deployment, Lessons Learned.',
    '- Der Hintergrund ist ein echter Ausschnitt unserer App: Potsdam mit allen Plätzen.',
  ]);
}

function problemSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'PROBLEM & LÖSUNG', 'PLÄTZE GIBT ES. MITSPIELER FEHLEN.');
  label_(s, 'PROBLEM', M, 112, 118, 26, C.teal, C.white, 13);
  text_(s, [
    'In jeder Stadt gibt es freie Sportplätze: Tischtennisplatten, Basketballkörbe, Bolzplätze.',
    'Aber niemand weiß, wer wann dort spielt.',
    'Wer neu in der Stadt ist, kennt weder die Plätze noch Leute zum Spielen.',
  ].join('\n'), M, 146, 300, 170, { size: 15, spaceBelow: 8 });
  label_(s, 'LÖSUNG', 380, 112, 118, 26, C.green, C.white, 13);
  text_(s, [
    'SquadMeet zeigt die freien Plätze auf einer Karte.',
    'Man sagt ein Treffen an: jetzt oder später.',
    'Andere sehen es und machen mit. So findet man Mitspieler und neue Freunde.',
  ].join('\n'), 380, 146, 296, 170, { size: 15, spaceBelow: 8 });
  sportChips_(s, M, 336, 22, 11);
  notes_(s, [
    'STEFAN · ca. 1:30',
    '',
    'ENTWURF: Stefan passt den Text an.',
    '- Problem: Die Plätze sind da, aber man spielt allein oder gar nicht. Man weiß nicht, wann dort jemand ist.',
    '- Besonders für Leute, die neu in der Stadt sind: Sie kennen die Plätze nicht und haben noch keine Leute zum Spielen.',
    '- Lösung: Karte mit Plätzen für fünf Sportarten. Ein Treffen ansagen dauert ein paar Sekunden. Andere sehen es und kommen dazu.',
    '- Nebeneffekt: Aus Mitspielern werden Kontakte, aus Kontakten Freunde.',
    '- Bewusst ohne Chat und ohne E-Mail-Adresse (dazu mehr bei den Lessons Learned).',
  ]);
}

function demoSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'LIVE-DEMO', 'EIN TREFFEN VON A BIS Z');
  const steps = [
    ['1 PLATZ FINDEN', 'Karte mit Filter „Tischtennis“ und „Jetzt“.', C.teal, C.white],
    ['2 TREFFEN ANSAGEN', 'Konto A sagt an einem Platz ein Treffen an.', C.orange, C.white],
    ['3 BENACHRICHTIGT', 'Konto B ist Kontakt von A und bekommt sofort eine Benachrichtigung.', C.purple, C.white],
    ['4 MITMACHEN', 'B macht mit. A sieht es ohne Neuladen.', C.green, C.white],
  ];
  const w = 140, gap = 24, y = 150;
  steps.forEach(([lab, body, fill, color], i) => {
    const x = M + i * (w + gap);
    label_(s, lab, x, y, w, 34, fill, color, 12);
    text_(s, body, x, y + 44, w, 90, { size: 13 });
    if (i < steps.length - 1) arrow_(s, x + w + 2, y + 17, x + w + gap - 2, y + 17);
  });
  text_(s, 'squadmeet.duckdns.org', 0, 320, W, 34, { font: COND, weight: 700, size: 22, color: C.teal, align: 'center' });
  notes_(s, [
    'STEFAN · ca. 5:00',
    '',
    'Vorher: beide Browser nebeneinander, beide schon eingeloggt (der Turnstile-Check kostet Zeit). B hat A als Kontakt.',
    'Konten: A = [KONTO A], B = [KONTO B]. Platz: [PLATZ].',
    '',
    'Klick-Skript:',
    '1. Karte zeigen, Filter „Tischtennis“ und „Jetzt“ wählen. Die Karte zeigt nur passende Plätze.',
    '2. In Browser A: Platz [PLATZ] öffnen, Treffen ansagen.',
    '3. In Browser B: Die Glocke zeigt die Benachrichtigung. Antippen öffnet den Platz.',
    '4. In Browser B: „Ich komme mit“. In Browser A erscheint die Teilnahme ohne Neuladen (Server-Sent Events).',
    'Vorher prüfen: Erscheint die Teilnahme in A wirklich ohne Neuladen?',
    '',
    'Web Push nur zeigen, wenn die VAPID-Schlüssel auf dem AWS-Host eingerichtet sind (SCRUM-44).',
    'Fotos sind auf der Live-Seite aus (SCRUM-94): nicht zeigen.',
    'Wenn die Seite oder das WLAN ausfällt: Backup-Video abspielen: [PFAD ZUM VIDEO].',
  ]);
}

function architectureSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'ARCHITEKTUR', 'EIN HOST, DREI CONTAINER');

  box_(s, 'BROWSER', 'PWA auf Handy und Laptop', 44, 182, 110, 60, C.grey);

  const host = s.insertShape(SlidesApp.ShapeType.RECTANGLE, 180, 116, 350, 206);
  host.getFill().setTransparent();
  host.getBorder().getLineFill().setSolidFill(C.grey);
  host.getBorder().setWeight(1);
  host.getBorder().setDashStyle(SlidesApp.DashStyle.DASH);
  text_(s, 'AWS EC2 (t2.micro, Frankfurt) · DOCKER COMPOSE', 190, 122, 330, 20, { font: COND, weight: 700, size: 11, color: C.grey });

  box_(s, 'WEB', 'Caddy (HTTPS) + PWA', 196, 182, 88, 60, C.teal);
  box_(s, 'BACKEND', 'FastAPI', 312, 182, 88, 60, C.orange);
  box_(s, 'DB', 'PostgreSQL + PostGIS', 428, 182, 88, 60, C.green);
  arrow_(s, 154, 212, 196, 212);
  edgeLabel_(s, 'HTTPS', 150, 194, 50);
  arrow_(s, 284, 212, 312, 212);
  edgeLabel_(s, '/api', 280, 194, 36);
  arrow_(s, 400, 212, 428, 212);
  edgeLabel_(s, 'SQL', 396, 194, 36);
  text_(s, 'Backups: Datenbank-Dump vor jedem Deploy, täglicher Disk-Snapshot.', 196, 262, 320, 40, { size: 11, color: C.grey });

  box_(s, 'GITHUB ACTIONS', 'Tests + Images', 562, 116, 114, 52, C.grey);
  box_(s, 'GHCR', 'Docker-Images', 562, 196, 114, 52, C.grey);
  box_(s, 'PUSH-DIENSTE', 'der Browser', 562, 272, 114, 52, C.grey);
  arrow_(s, 619, 168, 619, 196);
  arrow_(s, 562, 222, 530, 222);
  edgeLabel_(s, 'Deploy', 528, 204, 36);
  arrow_(s, 530, 298, 562, 298);
  edgeLabel_(s, 'Web Push', 520, 280, 48);

  text_(s, 'Ein Host statt ECS und RDS: am günstigsten und einfach zu erklären (ADR-0002).', M, 340, W - 2 * M, 30, { size: 13 });
  notes_(s, [
    'DOMINIK · ca. 1:30',
    '',
    '- Der Browser lädt die PWA über HTTPS. Caddy liefert die Dateien aus und holt das Zertifikat automatisch.',
    '- Anfragen an /api leitet Caddy an das FastAPI-Backend weiter. Das Backend spricht mit PostgreSQL + PostGIS.',
    '- Alle drei laufen als Docker-Container mit Docker Compose auf einer EC2-Instanz (t2.micro, eu-central-1).',
    '- GitHub Actions baut die Images und legt sie in GHCR ab. Beim Deploy holt der Host die Images von dort.',
    '- Web Push: Das Backend schickt Benachrichtigungen an die Push-Dienste der Browser.',
    '- Warum ein Host? ECS Fargate + RDS wäre „cloud-nativer“, aber mehr Aufwand und über unserem Budget (ADR-0002).',
  ]);
}

function frontendSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'FRONTEND', 'EINE APP FÜR HANDY UND LAPTOP');
  rows_(s, [
    ['PWA', 'React + TypeScript + Vite. Eine Codebasis für Handy und Laptop, ohne App Store (ADR-0001).'],
    ['KARTE', 'Leaflet mit OpenStreetMap. Jede Sportart hat ihren eigenen Marker in ihrer Farbe.'],
    ['LIVE', 'Server-Sent Events: Neue Treffen und Teilnahmen erscheinen ohne Neuladen.'],
    ['TESTS', 'Über 270 Vitest-Tests. Lint und TypeScript-Check laufen in jeder Pipeline.'],
    ['FALLOW', 'Prüft vor jedem Commit die Komplexität. Zu große Komponenten mussten wir aufteilen.'],
  ]);
  notes_(s, [
    'STEVEN · ca. 1:30',
    '',
    '- PWA statt nativer App: eine Codebasis, installierbar über „Zum Home-Bildschirm“, kein App Store (ADR-0001).',
    '- Karte: Leaflet mit OpenStreetMap-Kacheln. Marker mit Emoji im Ring der Sportart-Farbe.',
    '- Live-Updates: Der Browser hält eine Server-Sent-Events-Verbindung offen (SCRUM-93). Bei einem neuen Treffen lädt die Liste neu.',
    '- Tests: Vitest, dazu ESLint und tsc in der CI.',
    '- Fallow: Code-Qualitäts-Check vor jedem Commit. Er hat z. B. zu komplexe Dialoge blockiert; wir haben sie in kleinere Komponenten geteilt.',
  ]);
}

function debugFrontendSlide_(deck) {
  debugSlide_(deck, 'FRONTEND', 'SCRUM-16', 'DER MARKER, DER NICHT DA WAR', [
    'Karte lädt, die API liefert den Platz, der Marker steht im DOM. Kein Pin, kein Fehler.',
    'Der übliche Fix L.Icon.Default.mergeOptions() mit Vite-Imports.',
    'Leaflet setzt den eigenen Bildpfad vor die URL: …/images//node_modules/… → 404.',
    'Ein explizites L.icon({…}) für jeden Marker.',
    'Erst die echte URL im Browser prüfen, dann einen Fix kopieren.',
  ], ['L.Icon.Default.mergeOptions()', '…/images//node_modules/…', 'L.icon({…})'], [
    'STEVEN · ca. 1:00',
    '',
    '- Symptom: alles sah richtig aus. Keine Fehlermeldung in der Konsole.',
    '- Falsche Spur: Den bekannten Fix aus Stack Overflow kopiert. Half nicht.',
    '- Gefunden: im Browser img.src und naturalWidth (= 0) des Markers gelesen. Die URL war doppelt zusammengesetzt.',
    '- Lösung: jedem Marker ein eigenes L.icon geben (frontend/src/App.tsx).',
    '- Lektion: Bei einem fehlenden Bild zuerst die echte URL ansehen, die der Browser anfragt.',
  ]);
}

function backendSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'BACKEND', 'FASTAPI, POSTGIS UND VIELE TESTS');
  rows_(s, [
    ['FASTAPI', 'FastAPI + SQLModel. Der Kurs-Stack: Das Team kennt ihn.'],
    ['POSTGIS', 'Radius-Abfragen: „Plätze in meiner Nähe“ und der Heimatbereich für Benachrichtigungen.'],
    ['ALEMBIC', 'Migrationen halten die Daten auf AWS bei jeder Schema-Änderung.'],
    ['PUSH', 'Benachrichtigungen in der App und als Web Push. Der Push geht erst nach dem Commit raus.'],
    ['TESTS', 'Über 900 pytest-Tests. Fehler zuerst als roten Test schreiben, dann beheben.'],
  ]);
  notes_(s, [
    'STEVEN · ca. 1:30',
    '',
    '- FastAPI + SQLModel: Kurs-Stack, schnell, automatische API-Doku.',
    '- PostGIS: Abfragen nach Entfernung. Der Heimatbereich ist ein Punkt mit Radius, den jede Person selbst setzt, nicht der Live-Standort (ADR-0003).',
    '- Alembic: Jede Schema-Änderung ist eine Migration. Die Daten auf dem Host bleiben erhalten.',
    '- Web Push nach dem Commit (SCRUM-140): Die Antwort an den Browser wartet nicht auf den Push-Dienst. Bei einem Rollback geht kein Push raus.',
    '- Tests: pytest gegen eine echte PostGIS-Datenbank, auch in der CI. Fixes test-first: erst rot, dann grün.',
  ]);
}

function debugBackendSlide_(deck) {
  debugSlide_(deck, 'BACKEND', 'SCRUM-29', 'DAS TREFFEN, DAS NIE BEGANN', [
    'pytest legt ein Treffen an. Der Platz zeigt es nicht als aktiv. 3 neue Tests sind rot.',
    'Ein Zeitzonen-Mix zwischen Python und der timestamptz-Spalte.',
    'now() in PostgreSQL ist die Startzeit der Transaktion. Das Treffen beginnt also „nach“ now().',
    'Die App übergibt ihre eigene Uhr: is_active(now).',
    'Zeiten immer mit derselben Uhr vergleichen.',
  ], ['timestamptz', 'now()', 'is_active(now)'], [
    'STEVEN · ca. 1:00',
    '',
    '- Symptom: Anlegen und Beenden klappten, aber das Treffen war nie „aktiv“.',
    '- Falsche Spur: Zeitzonen. Python nutzt datetime.now(UTC), die Spalte ist timestamptz.',
    '- Ursache: Jeder Test läuft in einer Transaktion (Rollback-Fixture). now() ist in PostgreSQL für die ganze Transaktion eingefroren. Ein Treffen, das in der Transaktion startet, liegt nach now(). In Produktion gibt es dieselbe Lücke innerhalb einer Anfrage.',
    '- Lösung: Die App übergibt ihre Uhr an is_active(now), dieselbe Uhr, die starts_at setzt (backend/app/meetups.py).',
    '- Lektion: clock_timestamp() ist nicht eingefroren, now() schon. Zeiten von einer Uhr vergleichen.',
  ]);
}

function hostingSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'DOCKER & AWS', 'GÜNSTIG, SICHER, ERKLÄRBAR');
  rows_(s, [
    ['EIN HOST', 'Eine EC2-Instanz (t2.micro) in Frankfurt. Am günstigsten und einfach zu erklären (ADR-0002).'],
    ['COMPOSE', 'Drei Container: web (Caddy + PWA), backend (FastAPI), db (PostGIS). Lokal ebenfalls Docker Compose.'],
    ['HTTPS', 'Caddy holt das Zertifikat automatisch. Web Push und Standort brauchen HTTPS.'],
    ['OHNE KEYS', 'GitHub meldet sich per OIDC bei AWS an, der Deploy läuft über SSM. Keine AWS-Keys, kein offener SSH-Port.'],
    ['BACKUPS', 'Dump vor jedem Deploy, täglicher Snapshot. Rollback = Deploy mit einem älteren Commit-SHA.'],
  ]);
  notes_(s, [
    'DOMINIK · ca. 1:00',
    '',
    '- Ein Host mit Docker Compose statt ECS Fargate + RDS: günstiger und für unsere Last genug (ADR-0002).',
    '- Domain über DuckDNS, Captcha über Cloudflare Turnstile.',
    '- OIDC: GitHub bekommt für jeden Lauf ein kurzlebiges Token. AWS prüft es gegen die Trust Policy der Rolle. Es gibt keine gespeicherten Schlüssel.',
    '- SSM: AWS führt den Deploy-Befehl auf dem Host aus. Port 22 bleibt zu.',
    '- Rollback: Die Images jedes Commits bleiben in GHCR. Ein Deploy mit einem älteren SHA ist der Rollback.',
  ]);
}

function pipelineSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'CI/CD', 'NUR EIN GRÜNER BUILD KOMMT LIVE');

  const yc = 193; // Mittellinie des Hauptflusses
  box_(s, 'PR / PUSH', 'auf dev oder main', 44, yc - 28, 96, 56, C.grey);
  box_(s, 'BACKEND', 'pytest', 164, 130, 112, 56, C.orange);
  box_(s, 'FRONTEND', 'Lint, Build, Vitest', 164, 200, 112, 56, C.teal);
  box_(s, 'IMAGES', 'backend, frontend, db, deploy → GHCR', 300, yc - 28, 124, 56, C.purple);
  box_(s, 'DEPLOY', 'OIDC + SSM auf EC2', 448, yc - 28, 112, 56, C.green);
  box_(s, 'SMOKE-TEST', 'App antwortet?', 584, yc - 28, 92, 56, C.gold);
  const report = box_(s, 'BERICHTE', 'Fallow, Dependency-Audit', 164, 278, 112, 48, C.grey);
  report.getBorder().setDashStyle(SlidesApp.DashStyle.DASH);

  arrow_(s, 140, yc - 6, 164, 158);
  arrow_(s, 140, yc + 6, 164, 228);
  arrow_(s, 276, 158, 300, yc - 6);
  arrow_(s, 276, 228, 300, yc + 6);
  arrow_(s, 424, yc, 448, yc);
  arrow_(s, 560, yc, 584, yc);
  text_(s, 'nur bei Merge in main', 440, yc - 50, 130, 18, { size: 10, color: C.grey, align: 'center' });

  text_(s, 'Images und Deploy starten nur, wenn beide Test-Jobs grün sind. Fallow und Audit berichten nur, sie blockieren nicht.', M, 340, W - 2 * M, 34, { size: 13 });
  notes_(s, [
    'DOMINIK · ca. 1:00',
    '',
    '- Jeder Pull Request nach dev oder main startet die Pipeline (GitHub Actions, .github/workflows/ci.yml).',
    '- Backend: pytest gegen PostGIS. Frontend: ESLint, Build, Vitest. Beide laufen parallel.',
    '- Nur wenn beide grün sind, baut die Pipeline vier Docker-Images. Bei einem Merge landen sie in GHCR, mit dem Commit-SHA als Tag.',
    '- Nur ein Merge in main deployt: Anmeldung bei AWS per OIDC, Deploy per SSM, danach ein Smoke-Test.',
    '- Ein neuer Push bricht alte Läufe ab, aber nie auf main: Ein Deploy darf nicht halb fertig stehen bleiben.',
    '- Actions sind auf einen Commit-SHA gepinnt. Ein verschobenes Tag kann nicht ändern, was läuft.',
  ]);
}

function debugDeploySlide_(deck) {
  debugSlide_(deck, 'DEPLOYMENT', 'SCRUM-23', 'DER DEPLOY, DER NICHT REIN DURFTE', [
    'Der erste automatische Deploy scheitert 12-mal: Not authorized to perform sts:AssumeRoleWithWebIdentity.',
    'Ein abgelaufener lokaler AWS-Login. Aber die CI nutzt keine lokalen Zugangsdaten.',
    'GitHub nutzt den unveränderlichen OIDC-Subject mit IDs. Die Trust Policy erwartete den alten Namen.',
    'Neuer sub in der Trust Policy. Das Setup-Skript fragt GitHub jetzt nach dem Präfix.',
    'Bei OIDC-Fehlern zuerst die echten Claims mit der Trust Policy vergleichen.',
  ], ['sts:AssumeRoleWithWebIdentity'], [
    'DOMINIK · ca. 1:00',
    '',
    '- Symptom: nach dem ersten Merge von dev nach main (PR #21) scheitert der Job „Deploy to AWS + smoke test“ 12-mal.',
    '- Falsche Spur: lokaler AWS-Login abgelaufen. Ein neuer „aws login“ änderte nichts, denn die CI nutzt keine lokalen Zugangsdaten.',
    '- Ursache: Das Token hatte als sub „repo:GitGitRice@160424208/squadmeet@1408673415:ref:refs/heads/main“. Die Trust Policy erwartete „repo:GitGitRice/squadmeet:ref:refs/heads/main“.',
    '- Gefunden mit: gh api repos/<owner>/squadmeet/actions/oidc/customization/sub',
    '- Lösung: neuer sub in der Trust Policy. deploy/setup-github-deploy.sh fragt GitHub jetzt nach dem Präfix.',
  ]);
}

function lessonsSlide_(deck) {
  const s = blank_(deck);
  header_(s, 'LESSONS LEARNED', 'WAS WIR MITNEHMEN');
  rows_(s, [
    ['TESTLAUF', 'Ein gemeinsamer Testlauf auf echten Handys brachte über 20 neue Tickets.'],
    ['MIGRATION', 'Ein Merge ohne Git-Konflikt kann die Migrationskette trotzdem brechen. Vorher: alembic heads.'],
    ['NOTIEREN', 'Debugging-Fälle sofort aufschreiben. Eine Woche später sind die Details weg.'],
    ['ÜBERGABE', 'Ein Teammitglied ging, ein neues kam. Schriftliche Übergabe und Jira machten den Wechsel leicht.'],
    ['NEIN SAGEN', 'Kein Chat, keine E-Mail-Adresse: weniger Moderation, weniger Daten, mehr Zeit (ADR-0004, ADR-0005).'],
  ], ['alembic heads']);
  notes_(s, [
    'DOMINIK · ca. 1:30',
    '',
    'VORSCHLÄGE aus HANDOFF.md: Das Team prüft und passt sie an.',
    '- Testlauf: Am 19./20.10. haben wir alle Features zusammen auf Handy und Laptop getestet (docs/testlauf.md). Daraus kamen die Tickets für Sprint 3.',
    '- Migrationen (SCRUM-30): Zwei Branches bekamen beide eine Migration mit Nummer 0007. Git zeigte keinen Konflikt. Eine lokale Datenbank hatte danach eine Tabelle zu wenig. Seitdem: vor jedem Merge „alembic heads“, mehr als ein Head = Kollision.',
    '- Notieren: Unsere vier Debugging-Fälle stehen in HANDOFF.md, weil wir sie sofort aufgeschrieben haben.',
    '- Übergabe: David hat das Projekt am 08.10. verlassen, Dominik kam am 12.10. dazu. HANDOFF.md, TICKETS.md und Jira haben den Einstieg leicht gemacht.',
    '- Nein sagen: Chat zwischen Fremden braucht Moderation und Meldewege, die drei Leute in zwei Wochen nicht bauen können (ADR-0004). Ohne E-Mail kein Mail-Anbieter und weniger personenbezogene Daten (ADR-0005).',
  ]);
}

function questionsSlide_(deck) {
  const s = blank_(deck);
  text_(s, 'FRAGEN?', M - PAD, 110, 400, 110, { font: COND, weight: 900, size: 96 });
  text_(s, 'squadmeet.duckdns.org', M - PAD, 222, 400, 34, { font: COND, weight: 700, size: 24, color: C.teal });
  text_(s, 'Stefan Kallinich  ·  Dominik Fischer  ·  Steven Tanu', M - PAD, 262, 400, 24, { size: 13, color: C.grey });
  // Fünf schräge Bänder in den Sportfarben rechts, wie auf der Titelfolie von Entwurf C.
  const bw = 80, step = 60;
  SPORTS.forEach(([, fill], i) => {
    const band = s.insertShape(SlidesApp.ShapeType.PARALLELOGRAM, 440 + i * step, 0, bw, H);
    band.getFill().setSolidFill(fill);
    band.getBorder().setTransparent();
  });
  notes_(s, [
    'ALLE',
    '',
    '- Danke fürs Zuhören.',
    '- Mögliche Fragen vorbereiten: Warum kein Kubernetes/ECS? Warum PWA? Was kostet der Betrieb? Wie sicher ist der Login ohne E-Mail (MFA, Wiederherstellungscodes)?',
  ]);
}

// ---------- Bausteine ----------

function blank_(deck) {
  const s = deck.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  s.getBackground().setSolidFill(C.white);
  return s;
}

function header_(s, kicker, title, meta) {
  text_(s, kicker, M - PAD, 22, 460, 22, { font: COND, weight: 700, size: 13, color: C.grey });
  if (meta) text_(s, meta, W - M - 200 + PAD, 22, 200, 22, { size: 11, color: C.grey, align: 'end' });
  text_(s, title, M - PAD, 40, W - 2 * M + 2 * PAD, 54, { font: COND, weight: 900, size: 36 });
}

// Fünf Zeilen: schräges Farblabel links, Text rechts (Entwurf C).
function rows_(s, rows, monoParts) {
  return rows.map(([lab, body], i) => {
    const y = 112 + i * 50;
    const [fill, color] = ROW_COLORS[i % ROW_COLORS.length];
    label_(s, lab, M, y, 118, 28, fill, color, 14);
    return text_(s, body, M + 132, y - 8, W - 2 * M - 132 + PAD, 44, { size: 13, valign: 'middle', mono: monoParts });
  });
}

function debugSlide_(deck, part, ticket, title, bodies, monoParts, notes) {
  const s = blank_(deck);
  header_(s, 'DEBUGGING-FALL · ' + part, title, ticket);
  const labels = ['SYMPTOM', 'FALSCHE SPUR', 'URSACHE', 'LÖSUNG', 'LEKTION'];
  const boxes = rows_(s, labels.map((lab, i) => [lab, bodies[i]]), monoParts);
  // Die falsche Spur grau, die Lektion fett, wie in Entwurf C.
  boxes[1].getText().getTextStyle().setForegroundColor(C.grey);
  boxes[4].getText().getTextStyle().setBold(true);
  notes_(s, notes);
  return s;
}

function label_(s, str, x, y, w, h, fill, color, size) {
  const shape = s.insertShape(SlidesApp.ShapeType.PARALLELOGRAM, x, y, w, h);
  shape.getFill().setSolidFill(fill);
  shape.getBorder().setTransparent();
  shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  const t = shape.getText();
  t.setText(str);
  t.getTextStyle().setFontFamilyAndWeight(COND, 800).setFontSize(size).setForegroundColor(color);
  t.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  return shape;
}

function sportChips_(s, x0, y, h, size) {
  const gap = 6;
  const total = SPORTS.reduce((sum, sp) => sum + sp[3], 0) + gap * (SPORTS.length - 1);
  let x = x0 === null ? (W - total) / 2 : x0;
  SPORTS.forEach(([name, fill, color, w]) => {
    label_(s, name, x, y, w, h, fill, color, size);
    x += w + gap;
  });
}

// Diagramm-Kasten: Name in Barlow Condensed, darunter eine Zeile in grau.
function box_(s, name, sub, x, y, w, h, border) {
  const shape = s.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  shape.getFill().setSolidFill(C.white);
  shape.getBorder().getLineFill().setSolidFill(border);
  shape.getBorder().setWeight(border === C.grey ? 1 : 2);
  shape.setContentAlignment(SlidesApp.ContentAlignment.MIDDLE);
  const t = shape.getText();
  t.setText(name + '\n' + sub);
  t.getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.CENTER);
  const [p1, p2] = t.getParagraphs();
  p1.getRange().getTextStyle().setFontFamilyAndWeight(COND, 700).setFontSize(13).setForegroundColor(C.ink);
  p2.getRange().getTextStyle().setFontFamilyAndWeight(BODY, 400).setFontSize(9).setForegroundColor(C.grey);
  return shape;
}

function arrow_(s, x1, y1, x2, y2) {
  const line = s.insertLine(SlidesApp.LineCategory.STRAIGHT, x1, y1, x2, y2);
  line.setWeight(1.25);
  line.getLineFill().setSolidFill(C.grey);
  line.setEndArrow(SlidesApp.ArrowStyle.FILL_ARROW);
  return line;
}

function edgeLabel_(s, str, x, y, w) {
  return text_(s, str, x, y, w, 16, { size: 8, color: C.grey, align: 'center' });
}

function text_(s, str, x, y, w, h, o) {
  o = o || {};
  const box = s.insertTextBox(str, x, y, w, h);
  const t = box.getText();
  t.getTextStyle()
    .setFontFamilyAndWeight(o.font || BODY, o.weight || 400)
    .setFontSize(o.size || 14)
    .setForegroundColor(o.color || C.ink);
  const align = { start: SlidesApp.ParagraphAlignment.START, center: SlidesApp.ParagraphAlignment.CENTER, end: SlidesApp.ParagraphAlignment.END };
  t.getParagraphStyle().setParagraphAlignment(align[o.align || 'start']);
  if (o.spaceBelow) t.getParagraphStyle().setSpaceBelow(o.spaceBelow);
  box.setContentAlignment(o.valign === 'middle' ? SlidesApp.ContentAlignment.MIDDLE : SlidesApp.ContentAlignment.TOP);
  (o.mono || []).forEach((part) => {
    t.find(escapeRegex_(part)).forEach((r) => {
      r.getTextStyle().setFontFamilyAndWeight(MONO, 500).setFontSize(Math.round((o.size || 14) * 0.85)).setBackgroundColor(C.code);
    });
  });
  return box;
}

function notes_(s, lines) {
  s.getNotesPage().getSpeakerNotesShape().getText().setText(lines.join('\n'));
}

function escapeRegex_(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
