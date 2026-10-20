# Projekt-Tagebuch

Jedes Teammitglied schreibt pro Arbeitstag einen kurzen Eintrag: was du an dem Tag gemacht hast.
Die Details stehen in Jira. Nenne also den Ticket-Key und kopiere nicht den Ticket-Text.

**Regeln**

- Ein Block pro Tag, der neueste Tag oben.
- Eine Zeile pro Person, 1–3 kurze Punkte. Schreib deine Zeile, bevor du für den Tag aufhörst.
- Nenne den Jira-Key, wenn es einen gibt: `SCRUM-22 Login-Endpoint fertig`.
- Nichts zu berichten? Schreib, was dich blockiert hat.
- Auf Deutsch schreiben, damit alle im Team es verstehen.

---

## Di 20.10.2026 — Tag 10

- **Dominik:** `SCRUM-86` Suchergebnisse schließen jetzt beim Kartenklick und nach dem Leeren des Suchfelds; test-first umgesetzt und automatisiert geprüft.

## Mo 19.10.2026 — Tag 9

- **Steven:** `SCRUM-68` Backend-Review (Login, MFA, Captcha, Limits): 5 Funde test-first behoben, MFA einschalten braucht jetzt das Passwort (PR #81). `SCRUM-91` Safari-AutoFill füllt das Passwort in den Konto-Dialogen (PR #84); Release-PR #85 als Entwurf. `SCRUM-93` Live-Daten ohne Neuladen per Server-Sent Events: Kontaktanfragen, Benachrichtigungen und Treffen erscheinen sofort (PR #86).
- **Stefan:** Besprechung des Testdokuments (`SCRUM-67`, docs/testlauf.md) im Team; daraus 17 Tickets für Sprint 3 angelegt (`SCRUM-76` – `SCRUM-92`) und auf alle drei verteilt. `SCRUM-76` Platzdetails gebaut (× zum Schließen, Tippen auf die Karte schließt, offener Platz markiert, Impressum raus), PR #83 gemergt und mit Release #85 live. VAPID-Schlüssel auf dem Server eingerichtet, damit Push (`SCRUM-44`) gehen kann.
- **Dominik:** `SCRUM-44` beim Test nachgebessert: einmaliger freiwilliger Hinweis zur Push-Einrichtung nach der Anmeldung mit „Push einrichten“ und „Später“; fehlende VAPID-Konfiguration auf dem Live-Server identifiziert.

## Fr 16.10.2026 — Tag 8

- **Steven:** `SCRUM-66` Änderungsprotokoll test-first gebaut: neue Tabelle `audit_log` speichert bei jedem Anlegen, Ändern und Löschen wer, wann und was (ohne Passwörter, Codes und Anmeldeschlüssel); beim Konto-Löschen verschwinden Nickname und Urheber. `psql`-Abfrage in deploy/README.md, Satz in der Datenschutzerklärung. PR #69 im Review, CI grün.
- **Stefan:** `SCRUM-42` Fotos (S3) und `SCRUM-43` Kontakt-Benachrichtigungen gemergt, Release #75 läuft live; `SCRUM-48` Doku nach der Übergabe (PR #74). `SCRUM-45` Heimatbereich von Dominik übernommen und gebaut: Punkt, Radius und Sportarten auf eigener Karte, neue Treffen im Bereich melden sich einmal (PR #77).
- **Dominik:** `SCRUM-41` Favoriten mit Zeitfenstern und Benachrichtigungen fertiggestellt, Konflikt mit `SCRUM-42` behoben und gemergt; `SCRUM-44` Web Push mit VAPID, Service Worker, Geräte-Abo und iPhone-Hinweis test-first umgesetzt, automatisierte Tests grün.

## Do 15.10.2026 — Tag 7

- **Steven:** `SCRUM-48` Übergabe an Stefan: Repo an `S-max-ui-star` übertragen, PRs #61 und #62 gemergt. Datenbank per pg_dump auf Stefans Server umgezogen, danach meinen AWS-Server, Turnstile-Widget, GHCR-Pakete und Zugänge abgebaut. Wizard-Fehler behoben: Datenfrage wurde übersprungen, wenn der Name schon umgeschaltet war (PR #64).
- **Stefan:** `SCRUM-48` Übergabe-Wizard gebaut (PR #59) und Stufe 1–9 durchlaufen: eigener AWS-Server (t2.micro, Free Tier), Images in `ghcr.io/s-max-ui-star`, Turnstile-Schlüssel, Domain squadmeet.duckdns.org umgestellt; Release #63 hat das automatische Deploy auf den neuen Server bewiesen. DuckDNS-Prüfung im Wizard korrigiert (PR #62).
- **Dominik:** `SCRUM-40` In-App-Benachrichtigungen test-first umgesetzt; Glocke, Ungelesen-Zähler, Ereignis, Platz und Adresse sowie Absage und Hostwechsel im Browser geprüft.

## Mi 14.10.2026 — Tag 6

- **Steven:** CI für PRs #48, #50, #51, #52 geprüft; `SCRUM-60`, `SCRUM-53`, `SCRUM-55`, `SCRUM-65` auf Done gesetzt, `TICKETS.md` aktualisiert. `SCRUM-56` Admin-Freigabe für Platzvorschläge gebaut (wartet nach 3 Bestätigungen auf Admin, Freigabe frühestens nach 24 h, OSM-Hinweis Gebäude/privat/Wohngebiet ohne Sperre; PR im Review). Fallow-Hook vergleicht jetzt mit `dev` statt `main`.
- **Stefan:** `SCRUM-38` Wöchentliche Serien gemergt; Datenschutz-Text zum Gerätestandort gemergt. `SCRUM-61` Meetup-Regeln in ein Modul gezogen (Server liefert Zustand und erlaubte Aktionen, 25 neue Tests), Review-Hinweis von Dominik behoben, gemergt.
- **Dominik:** `SCRUM-53` gemergt; `SCRUM-54` Treffen-Liste und Zeitfilter für den sichtbaren Kartenausschnitt test-first implementiert und automatisiert getestet.

## Di 13.10.2026 — Tag 5

- **Steven:** `SCRUM-39` Admin: Platz sperren, entsperren und löschen gebaut (Sperren/Löschen sagt kommende Treffen ab und beendet laufende; gelöschter Platz kommt beim OSM-Import nicht zurück), gemergt (PR #45) und nach Stefans Bestätigung erledigt. Release-PR #46 (`dev` → `main`) gemergt, läuft live. `SCRUM-60` Platzstatus in einem Modul: Design im Grilling festgelegt, test-first gebaut (PR #48 im Review).
- **Stefan:** `SCRUM-32` Kontakte und Blockieren gebaut und gemergt (PR #49). `SCRUM-55` Meldung an die Stadt: offizielle Mängelmelder und zuständige Grünflächen-Stellen der 5 Städte recherchiert und eingebaut (PR #51). Releases und Entscheidungen zu `SCRUM-39` mit Steven abgestimmt.
- **Dominik:** `SCRUM-52` gemergt; `SCRUM-53` Route-Link zu Apple Maps auf iOS und Google Maps auf anderen Geräten implementiert und automatisiert getestet.

## Mo 12.10.2026 — Tag 4

- **Team:** Dominik ist neu im Team; offene Tickets und neue Features aufgeteilt (`SCRUM-51`).
- **Steven:** `SCRUM-30` Platzvorschlag nach Stefans Entscheidung (keine Bewertungen an Vorschlägen) fertiggestellt und gemergt (PR #34). `SCRUM-36` Platzvorschlag vor Ort bestätigen gebaut (100-m-Prüfung, Konto-Mindestalter 7 Tage, Kennzeichnung „Von Nutzern hinzugefügt", PR #41 im Review). `TICKETS.md` aktualisiert.
- **Dominik:** `SCRUM-52` Suche nach Plätzen und Adressen sowie gespeicherte Platzadressen implementiert und automatisiert getestet; Jira-Zugriff in Codex hergestellt.
- **Stefan:** Neue Features und Neuverteilung mit Dominik geplant (`SCRUM-51`, Tickets `SCRUM-52`–`57`). `SCRUM-28` Datenschutz/Impressum/Konto löschen fertiggestellt und gemergt (PR #39). `SCRUM-35` späteres Treffen mit „Zeit ändern“ gebaut (PR #40, approved). Entscheidungen zu Platzvorschlägen für Steven getroffen.


## Fr 09.10.2026 — Tag 3

- **Steven:** `SCRUM-26` Fixes aus Stefans Review gemergt (PR #31). `SCRUM-27` Captcha (Cloudflare Turnstile) und Login-Limit (PR #32), `SCRUM-33` Passwort-Reset + neue Recovery-Codes (PR #35) und `SCRUM-47` eingeschränkte Deploy-Rolle per SSM-Dokument (PR #36) gebaut und gemergt. `SCRUM-28` Datenschutz/Impressum/Konto-löschen vorbereitet und `SCRUM-30` Platzvorschlag mit Duplikat-Warnung gestartet (PR #34).
- **Stefan:** _bitte ausfüllen_

## Do 08.10.2026 — Tag 2

- **Team:** David hat das Projekt verlassen. Seine Tickets sind aufgeteilt (`SCRUM-46`).
- **Stefan:** `SCRUM-18` Begründungen pro Aktivitätstyp und `SCRUM-17` klickbarer Meetup-Prototyp (Karte + Panel) gemergt; Stevens Review beantwortet (Gastgeber darf verlassen, Zustand = was die Stadt beheben muss). Umfang zu zweit entschieden (`SCRUM-46`).
- **Steven:** `SCRUM-20` App läuft live auf AWS mit HTTPS (https://squadmeet.duckdns.org), `SCRUM-19` CI fertig, Stefans `SCRUM-21`/`SCRUM-24` reviewt. `SCRUM-23` automatisches Deploy bei Merge in `main` läuft (erster Deploy scheiterte am AWS-Login per OIDC, behoben in PR #24). Sprint 1 abgeschlossen, Sprint 2 geplant; `SCRUM-26` Zwei-Faktor-Anmeldung (Authenticator-App) gemergt.

## Mi 07.10.2026 — Tag 1: Thema und Planung

- **Team:** Stefans Idee gewählt (Karte mit Aktivitäts-Plätzen und Meetups). Rollen aufgeteilt.
- **Steven:** Design-Interview zur Idee geleitet; Glossar und Entscheidungen geschrieben (ADR-0001–0005). Jira eingerichtet: 11 Epics, 30 Stories/Tasks, Sprint 1. GitHub-Repo erstellt. `SCRUM-16` lokales Skeleton gemergt (Karte mit einem Platz aus der DB). `SCRUM-22` Registrieren/Anmelden/Abmelden mit Nickname gemergt. `SCRUM-19` CI-Pipeline gebaut (Tests + Docker-Images bei jedem PR, PR #6 grün, wartet auf Review); rote Pipeline blockiert jetzt den Merge.
- **Stefan:** _bitte ausfüllen_
- **David:** _bitte ausfüllen_
