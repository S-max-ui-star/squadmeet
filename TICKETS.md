# Ticket-Übersicht — wer woran arbeitet

Snapshot von Jira (Projekt `SCRUM`) am 21.10.2026 abends, Sprint 3. Jira ist die Single Source of Truth; diese Datei kann veraltet sein.

- **● = in Arbeit** (In Arbeit oder Wird überprüft in Jira). **▶ = offen** (Zu erledigen). **⏸ = zurückgestellt** (Label `deferred`, Fotos sind aus seit `SCRUM-94`).
- **Prio**: Must / Should / Could (Jira-Label). Erledigte Tickets (Fertig) stehen nur als Liste unter jeder Person.
- Feature-Freeze seit Mi 21.10. abends. Arbeitsende: Fr 23.10. Präsentation: Mo 26.10. Neue Titel stehen englisch wie in Jira.

## Steven

| | Key | Titel | Epic / Eltern | Prio |
|-|-----|-------|---------------|------|
| ▶ | SCRUM-75 | Audit-Log in einer Datenbank-App auf dem Laptop lesen (SSM-Port-Forward) | Admin & Moderation | Could |
| ● | SCRUM-80 | Eine Person ist in höchstens 2 zeitlich überlappenden Meetups | Treffen | Should |
| ⏸ | SCRUM-83 | Höchstens 5 Fotos pro Platz | Bewertungen & Fotos | Should |
| ● | SCRUM-84 | Kontakte: Haken für eingeladene/beigetretene Kontakte, Bestätigung vor Blockieren | Kontakte | Should |
| ● | SCRUM-90 | Tipp auf Benachrichtigung zoomt und zentriert den Platz | Benachrichtigungen | Should |
| ⏸ | SCRUM-92 | Admin löscht freigegebene Fotos | Admin & Moderation | Should |
| ● | SCRUM-93 | Live-Daten ohne Neuladen (Server-Sent Events) | Benachrichtigungen | Could |
| ● | SCRUM-94 | Fotos aus: ein Schalter blendet Upload, Fotos und Admin-Freigabe aus | Bewertungen & Fotos | Must |
| ● | SCRUM-97 | Move answer open: duplicate buttons ("Gar nicht" + "Verlassen", "Ich komme mit" on the new Meetup) | Treffen | Should |
| ● | SCRUM-98 | Ratings and Condition in the Place detail refresh by themselves | Bewertungen & Fotos | Should |
| ● | SCRUM-101 | Notifications (bell): "Alle gelesen" and "Gelesene löschen" | Benachrichtigungen | Should |
| ● | SCRUM-102 | "Meine Treffen": overview of the user's own Meetups with time and Place | Treffen | Should |
| ● | SCRUM-123 | Two map loads at the same moment can give a 500 (Series fill) | Treffen | Should |
| ● | SCRUM-124 | Move answer "go" gets around a Block, and the move offer names the blocker | Treffen | Should |
| ● | SCRUM-125 | "Serie absagen" cancels Occurrences that a handover gave to another Host | Treffen | Should |
| ● | SCRUM-140 | Send Web Push after the request, not inside it | Benachrichtigungen | Could |
| ● | SCRUM-141 | Delete old Notifications automatically | Benachrichtigungen | Could |
| ▶ | SCRUM-148 | Live updates: a savepoint must not send or drop the pending events | Benachrichtigungen | Could |

**Erledigt (24):** `SCRUM-26`, `SCRUM-27`, `SCRUM-30`, `SCRUM-33`, `SCRUM-36`, `SCRUM-39`, `SCRUM-47`, `SCRUM-48`, `SCRUM-56`, `SCRUM-57`, `SCRUM-60`, `SCRUM-65`, `SCRUM-66`, `SCRUM-68`, `SCRUM-69`, `SCRUM-70`, `SCRUM-71`, `SCRUM-72`, `SCRUM-73`, `SCRUM-74`, `SCRUM-91`, `SCRUM-114`, `SCRUM-115`, `SCRUM-139`

## Stefan

| | Key | Titel | Epic / Eltern | Prio |
|-|-----|-------|---------------|------|
| ● | SCRUM-96 | Host cannot Cancel a Meetup when others have joined, only Leave it | Treffen | Should |
| ● | SCRUM-107 | Frontend review 5/7: Ratings, Favorites, Photos and Place actions | Frontend-Review (SCRUM-103) | Must |
| ▶ | SCRUM-163 | Ratings and sharing: stars not read out, copy and share without fallback, summary reload without token | — | Could |

**Erledigt (35):** `SCRUM-28`, `SCRUM-29`, `SCRUM-31`, `SCRUM-32`, `SCRUM-34`, `SCRUM-35`, `SCRUM-37`, `SCRUM-38`, `SCRUM-42`, `SCRUM-43`, `SCRUM-45`, `SCRUM-55`, `SCRUM-61`, `SCRUM-76`, `SCRUM-77`, `SCRUM-78`, `SCRUM-79`, `SCRUM-81`, `SCRUM-82`, `SCRUM-85`, `SCRUM-99`, `SCRUM-108`, `SCRUM-109`, `SCRUM-113`, `SCRUM-132`, `SCRUM-133`, `SCRUM-134`, `SCRUM-135`, `SCRUM-136`, `SCRUM-142`, `SCRUM-143`, `SCRUM-144`, `SCRUM-145`, `SCRUM-146`, `SCRUM-147`

## Dominik

| | Key | Titel | Epic / Eltern | Prio |
|-|-----|-------|---------------|------|
| ● | SCRUM-44 | Web-Push für Benachrichtigungen | Benachrichtigungen | Could |
| ▶ | SCRUM-50 | Manueller Test der ganzen App (`docs/testlauf.md`) | Präsentation & Doku | Must |
| ● | SCRUM-86 | Suche: Ergebnisse bleiben nach Kartentipp und leerer Eingabe offen | Plätze & Karte | Must |
| ● | SCRUM-87 | Treffen-Liste zeigt, welche Kontakte teilnehmen | Treffen | Should |
| ● | SCRUM-88 | Benachrichtigungen (Glocke): eine löschen, alle löschen | Benachrichtigungen | Should |
| ● | SCRUM-89 | Benachrichtigungstext: "<Kontakt> hat ein Treffen erstellt: …" mit Grund | Benachrichtigungen | Should |
| ● | SCRUM-95 | Place detail: "Teilen" button sends the Place link by a social app or copies it | Plätze & Karte | Should |
| ● | SCRUM-100 | Place detail: list of the single Ratings with date | Bewertungen & Fotos | Should |
| ● | SCRUM-103 | Review the whole frontend before the presentation | Präsentation & Doku | Must |
| ● | SCRUM-149 | Prevent duplicate Meetup and Series submissions | — | Should |
| ● | SCRUM-150 | Keep Series cancellation available after an occurrence host handover | — | Should |
| ● | SCRUM-151 | Make Place Meetup reloads request-safe and distinguish loading from empty | — | Should |
| ● | SCRUM-152 | Reject recurring Series that would create no occurrences | — | Should |
| ● | SCRUM-153 | Align Meetup time bounds with server rules across DST and timezones | — | Should |
| ● | SCRUM-154 | Refactor PlaceMeetups into focused lifecycle components and hooks | — | Should |
| ● | SCRUM-155 | Scroll Meetup deep links only once per navigation | — | Should |
| ▶ | SCRUM-156 | Keep Rating reloads ordered and recover stale errors | — | Should |
| ▶ | SCRUM-157 | Wait for the own Rating before opening the editor | — | Should |
| ▶ | SCRUM-158 | Hide unavailable Place mutations during report review | — | Should |
| ▶ | SCRUM-159 | Accept valid image uploads without reliable browser MIME metadata | — | Should |
| ▶ | SCRUM-160 | Fall back to clipboard when Web Share fails | — | Should |
| ▶ | SCRUM-161 | Refresh expired signed Photo links in an open Place | — | Should |
| ▶ | SCRUM-162 | Show failure feedback when City report copying is unavailable | — | Should |

**Erledigt (18):** `SCRUM-40`, `SCRUM-41`, `SCRUM-52`, `SCRUM-53`, `SCRUM-54`, `SCRUM-104`, `SCRUM-105`, `SCRUM-106`, `SCRUM-110`, `SCRUM-111`, `SCRUM-112`, `SCRUM-116`, `SCRUM-117`, `SCRUM-118`, `SCRUM-119`, `SCRUM-120`, `SCRUM-121`, `SCRUM-122`

## Ohne Owner

| | Key | Titel | Epic / Eltern | Prio |
|-|-----|-------|---------------|------|
| ● | SCRUM-49 | Die ganze Codebase reviewen | Präsentation & Doku | Must |
| ▶ | SCRUM-62 | Eine Prüfung für Passwort/Code bei heiklen Konto-Aktionen | Anmeldung | Could |
| ▶ | SCRUM-63 | Frontend: Session-Modul und eine Request-Funktion (abgelaufener Token) | Anmeldung | Could |
| ▶ | SCRUM-64 | Gemeinsame Test-Helfer des Backends in `conftest.py` | Infrastruktur | Could |

**Erledigt ohne Owner:** `SCRUM-67`, `SCRUM-126`, `SCRUM-127`, `SCRUM-128`, `SCRUM-129`, `SCRUM-130`, `SCRUM-131`, `SCRUM-137`, `SCRUM-138`

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
