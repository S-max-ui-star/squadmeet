# Ticket-Übersicht — wer womit anfängt

Snapshot von Jira (Projekt `SCRUM`) am 20.10.2026, in Sprint 3. Jira ist die Single Source of Truth; diese Datei kann veraltet sein. Die Liste jeder Person ist in Arbeitsreihenfolge: Bearbeite das oberste offene Ticket, dessen Blocker erledigt sind.

- **✓ = erledigt** (Done in Jira).
- **● = in Arbeit** (In Progress oder In Review in Jira).
- **▶ = jetzt starten** (alle Blocker erledigt).
- **Blockiert von** = Jira "is blocked by" Verknüpfung. Starte ein Ticket, wenn diese erledigt (Done) sind.
- **Prio**: Must / Should / Could. Must zuerst.

Arbeitsende: Fr 23.10. Präsentation: Mo 26.10. Die Sprint-3-Tickets ab `SCRUM-76` kommen aus dem Testlauf vom 19.10. (`docs/testlauf.md`).
Erledigte Tickets aus Sprint 1 und 2 stehen in Jira.

## Steven

| | Key | Titel | Epic | Prio | Blockiert von |
|-|-----|-------|------|------|---------------|
| ✓ | SCRUM-27 | Captcha (Turnstile) und Login-Rate-Limit | SCRUM-2 Anmeldung | Must | 22 |
| ✓ | SCRUM-39 | Admin: Platz sperren, entsperren und löschen | SCRUM-13 Admin & Moderation | Must | 26, 37 |
| ✓ | SCRUM-48 | Übergabe: Stefan hostet und besitzt Squadmeet nach der Präsentation | SCRUM-6 Infrastruktur | Must | — |
| ✓ | SCRUM-68 | Backend-Review 1/7: Auth, MFA, Captcha, Rate-Limits | SCRUM-49 Review | Must | — |
| ✓ | SCRUM-91 | Passwort-Feld: Passwort-Manager und Einfügen (Safari AutoFill) | SCRUM-2 Anmeldung | Must | — |
| ✓ | SCRUM-30 | Einen Platz vorschlagen, mit der Duplikat-Warnung | SCRUM-9 Platzvorschläge | Should | 22, 21 |
| ✓ | SCRUM-36 | Platzvorschlag am Platz bestätigen (+ Konto ab 7 Tagen, Kennzeichnung) | SCRUM-9 Platzvorschläge | Should | 30 |
| ✓ | SCRUM-56 | Admin-Freigabe für Platzvorschläge, 24 h, OSM-Hinweis | SCRUM-9 Platzvorschläge | Should | 36, 39 |
| ✓ | SCRUM-66 | Audit-Log: wer hat welche Zeile wann geändert | SCRUM-13 Admin & Moderation | Should | — |
| ✓ | SCRUM-57 | Platz melden | SCRUM-13 Admin & Moderation | Could | 39 |
| ✓ | SCRUM-60 | Refactor: ein Modul für den Platzstatus | SCRUM-7 Plätze & Karte | Could | — |
| ✓ | SCRUM-65 | Fallow-Codeanalyse für das Frontend (CI nur Bericht, Commit-Hook) | SCRUM-6 Infrastruktur | — | — |
| ● | SCRUM-93 | Live-Daten ohne Neuladen (Server-Sent Events) — live, Browser-Check fehlt | SCRUM-12 Benachrichtigungen | Could | — |
| ▶ | SCRUM-69 | Backend-Review 2/7: Datenmodell, Migrationen, Audit-Log, Test-Setup | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-70 | Backend-Review 3/7: Plätze, Kartendaten, OSM-Import, Geocoding | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-71 | Backend-Review 4/7: Platzvorschläge, Meldungen, Admin | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-72 | Backend-Review 5/7: Meetups, Lebenszyklus, Serien | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-73 | Backend-Review 6/7: Bewertungen, Fotos, Favoriten | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-74 | Backend-Review 7/7: Kontakte, Blockieren, Benachrichtigungen, Web-Push, Home-Bereich | SCRUM-49 Review | Must | — |
| ▶ | SCRUM-80 | Eine Person ist in höchstens 2 zeitlich überlappenden Meetups | SCRUM-8 Treffen | Should | — |
| ▶ | SCRUM-83 | Höchstens 5 Fotos pro Platz | SCRUM-10 Bewertungen & Fotos | Should | — |
| ▶ | SCRUM-84 | Kontakte: Haken für eingeladene/beigetretene Kontakte, Bestätigung vor Blockieren | SCRUM-11 Kontakte | Should | — |
| ▶ | SCRUM-92 | Admin löscht freigegebene Fotos | SCRUM-13 Admin & Moderation | Should | — |
| ▶ | SCRUM-75 | Audit-Log in einer Datenbank-App auf dem Laptop lesen (SSM-Port-Forward) | SCRUM-13 Admin & Moderation | Could | 66 |

## Stefan

| | Key | Titel | Epic | Prio | Blockiert von |
|-|-----|-------|------|------|---------------|
| ✓ | SCRUM-28 | Datenschutzseite, Impressum und "Mein Konto löschen" | SCRUM-14 Datenschutz & Konto | Must | 22 |
| ✓ | SCRUM-35 | Meetup zu einer späteren Zeit | SCRUM-8 Treffen | Must | 29 |
| ✓ | SCRUM-34 | Einem Meetup mit Party-Größe beitreten, und Verlassen | SCRUM-8 Treffen | Must | 29 |
| ✓ | SCRUM-37 | Host: Absagen, Übergabe und Geschlossen | SCRUM-8 Treffen | Must | 34 |
| ✓ | SCRUM-32 | Kontaktanfrage, annehmen, entfernen und Blockieren | SCRUM-11 Kontakte | Should | 22 |
| ✓ | SCRUM-55 | Meldung an die Stadt (City report) | SCRUM-10 Bewertungen & Fotos | Should | 31 |
| ✓ | SCRUM-38 | Wöchentliche Serie mit Terminen | SCRUM-8 Treffen | Should | 34, 35 |
| ✓ | SCRUM-42 | Foto-Upload und Admin-Freigabe | SCRUM-10 Bewertungen & Fotos | Should | 39, 20 |
| ✓ | SCRUM-76 | Platzdetails: Schließen-Button, Kartentipp schließt, geöffneter Platz markiert | SCRUM-7 Plätze & Karte | Should | — |
| ✓ | SCRUM-43 | Kontakte: Benachrichtigung für deren Meetups und Einladungen | SCRUM-11 Kontakte | Could | 32, 40 |
| ✓ | SCRUM-45 | Home-Bereich Benachrichtigungen | SCRUM-12 Benachrichtigungen | Could | 40 |
| ✓ | SCRUM-61 | Refactor: Meetup-Regeln aus den Route-Handlern herausziehen | SCRUM-8 Treffen | Could | — |
| ▶ | SCRUM-77 | Karte behält Position und Zoom nach dem Neuladen | SCRUM-7 Plätze & Karte | Should | — |
| ▶ | SCRUM-78 | Meetups und Kontakte aktualisieren sich selbst — großteils durch SCRUM-93 erledigt, offen: Kontakte-Dialog (Kommentar in Jira) | SCRUM-8 Treffen | Should | — |
| ▶ | SCRUM-79 | Meetup-Buttons: klarere Wörter, ein Button wenn der Host allein ist | SCRUM-8 Treffen | Should | — |
| ▶ | SCRUM-81 | Serie: mehreren Terminen auf einmal beitreten | SCRUM-8 Treffen | Should | — |
| ▶ | SCRUM-82 | Bewertungen in den Platzdetails: Button, City report ausklappbar, Wortwahl | SCRUM-10 Bewertungen & Fotos | Should | — |
| ▶ | SCRUM-85 | Leiste rechts vom Suchfeld: Kontakte, Favoriten, Home-Bereich als Icons | SCRUM-7 Plätze & Karte | Should | — |

## Dominik

| | Key | Titel | Epic | Prio | Blockiert von |
|-|-----|-------|------|------|---------------|
| ✓ | SCRUM-52 | Ort oder Adresse suchen, Adresse in den Platzdetails | SCRUM-7 Plätze & Karte | Should | — |
| ✓ | SCRUM-53 | Route-Link in den Platzdetails | SCRUM-7 Plätze & Karte | Should | — |
| ✓ | SCRUM-54 | Treffen-Liste mit Zeitfilter für den sichtbaren Kartenausschnitt | SCRUM-8 Treffen | Should | 29 |
| ✓ | SCRUM-40 | In-App Benachrichtigungsliste | SCRUM-12 Benachrichtigungen | Should | 37 |
| ✓ | SCRUM-41 | Favoriten mit Zeit-Regeln | SCRUM-12 Benachrichtigungen | Should | 40 |
| ● | SCRUM-44 | Web-Push für Benachrichtigungen — Code live, Gerätetest wartet auf VAPID-Schlüssel auf dem Server (Stefan) | SCRUM-12 Benachrichtigungen | Could | 40 |
| ▶ | SCRUM-50 | Manueller Test der ganzen App (`docs/testlauf.md`) | SCRUM-15 Präsentation | Must | — |
| ▶ | SCRUM-86 | Suche: Ergebnisse bleiben nach Kartentipp und leerer Eingabe offen | SCRUM-7 Plätze & Karte | Must | — |
| ▶ | SCRUM-87 | Treffen-Liste zeigt, welche Kontakte teilnehmen | SCRUM-8 Treffen | Should | — |
| ▶ | SCRUM-88 | Benachrichtigungen (Glocke): eine löschen, alle löschen | SCRUM-12 Benachrichtigungen | Should | — |
| ▶ | SCRUM-89 | Benachrichtigungstext: "<Kontakt> hat ein Treffen erstellt: …" mit Grund | SCRUM-12 Benachrichtigungen | Should | — |
| ▶ | SCRUM-90 | Tipp auf Benachrichtigung zoomt und zentriert den Platz | SCRUM-12 Benachrichtigungen | Should | — |

## Refactors ohne Owner (aus dem Architektur-Review vom 13.10.)

Alle Could, Label `needs-triage`. Wer Zeit hat, nimmt eins und trägt sich in Jira ein.

| | Key | Titel | Epic | Blockiert von |
|-|-----|-------|------|---------------|
| ▶ | SCRUM-62 | Eine Prüfung für Passwort/Code bei heiklen Konto-Aktionen | SCRUM-2 Anmeldung | — |
| ▶ | SCRUM-63 | Frontend: Session-Modul und eine Request-Funktion (abgelaufener Token) | SCRUM-2 Anmeldung | — |
| ▶ | SCRUM-64 | Gemeinsame Test-Helfer des Backends in `conftest.py` | SCRUM-6 Infrastruktur | — |

## Alle drei

| | Key | Titel | Blockiert von |
|-|-----|-------|---------------|
| ✓ | SCRUM-67 | Test-Checkliste für die ganze App im Repo (`docs/testlauf.md`) | — |
| ● | SCRUM-49 | Die ganze Codebase reviewen — Backend-Teil: SCRUM-68 bis 74 (Steven) | — |

## Epics

| Key | Epic | Owner |
|-----|------|-------|
| SCRUM-6 | Infrastruktur & Pipeline | Steven |
| SCRUM-2 | Anmeldung und Registrierung | Steven |
| SCRUM-14 | Datenschutz & Konto | Steven |
| SCRUM-12 | Benachrichtigungen | Dominik |
| SCRUM-8 | Treffen (Haupt-Workflow) | Stefan |
| SCRUM-10 | Bewertungen & Fotos | Stefan |
| SCRUM-11 | Kontakte & Blockieren | Stefan |
| SCRUM-15 | Präsentation & Doku | Stefan |
| SCRUM-7 | Plätze & Karte | Stefan |
| SCRUM-9 | Platzvorschläge & Bestätigungen | Steven |
| SCRUM-13 | Admin & Moderation | Steven |
