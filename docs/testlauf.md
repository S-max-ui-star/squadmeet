# SquadMeet Testlauf

Alle Features von https://squadmeet.duckdns.org gemeinsam durchtesten, auf Handy und Laptop. Jeden Punkt abhaken, wenn er klappt. Bei einem Fehler: Punktnummer und was passiert ist als Kommentar unter dieses Issue (oder ein eigenes Issue, verlinkt).

**Legende:** 👤 allein · 👥 zu zweit · 🔑 Admin-Konto

## 1 Start und Karte

- [X] **1.1 Seite und Karte laden** 👤 — Auf Handy und Laptop öffnen. Die Karte zeigt Plätze als Marker, der OpenStreetMap-Hinweis ist sichtbar.
- [?] **1.2 Weit herauszoomen** 👤 — Bei sehr großem Ausschnitt erscheint „Zu viele Plätze. Bitte näher heranzoomen.“
- [x] **1.3 Aktivitätsfilter** 👤 — Nur Tischtennis, dann nur Basketball usw. wählen. Die Karte zeigt nur passende Plätze.
- [X] **1.4 Zeitfilter** 👤 — Jetzt, nächste 3 Stunden, nächste 6 Stunden, Heute. Karte und Treffen-Liste zeigen nur Plätze mit Treffen in dieser Zeit.
- [X] **1.5 Treffen-Liste folgt der Karte** 👤 — Kartenausschnitt verschieben und zoomen. Die Liste wird kürzer oder länger. Leer: „Keine Treffen in diesem Kartenausschnitt.“
- [X] **1.6 Suche** 👤 — Nach einer Adresse und nach einem Platznamen suchen. SquadMeet-Plätze sind markiert. Unsinn eingeben: „Keine Treffer.“
- [?] **1.7 Platzdetails und Link** 👥 — Platz öffnen. Die Adresse /platz/… teilen, im anderen Browser öffnen und neu laden. Der Zurück-Button führt zur Karte.
- [X] **1.8 Route** 👤 — In den Platzdetails die Route öffnen. Apple Maps oder Google Maps startet mit dem Platz als Ziel.
- [X] **1.9 Impressum und Datenschutz** 👤 — Beide Seiten öffnen. Stimmen die Angaben, fehlt ein Punkt (Push, Heimatbereich, Fotos)?
- [X] **1.10 Als App aufs Handy** 👤 — Im Handy-Browser „Zum Home-Bildschirm“. Symbol und Name stimmen, die App öffnet ohne Browserleiste.

## 2 Konto

- [X] **2.1 Registrieren** 👤 — Nickname, Passwort, Avatar wählen, Captcha. Danach erscheinen die Wiederherstellungscodes „nur jetzt“. Codes aufschreiben.
- [X] **2.2 Nickname schon vergeben** 👥 — Die zweite Person versucht denselben Nickname. Es kommt eine verständliche Fehlermeldung.
- [X] **2.3 Abmelden und Anmelden** 👤 — Abmelden, falsches Passwort probieren, dann richtig anmelden.
- [X] **2.4 Passwort vergessen** 👤 — „Passwort vergessen?“ mit einem Wiederherstellungscode. Neues Passwort setzen, derselbe Code geht danach nicht noch einmal.
- [X] **2.5 Zwei-Faktor-Anmeldung** 👤 — Unter Konto einschalten, mit einer Authenticator-App koppeln. Anmelden mit Passwort und Code, dann einmal mit Wiederherstellungscode statt App. Seit `SCRUM-68` (PR #81) fragt „Einschalten“ zuerst das Passwort; ein falsches Passwort zeigt „Passwort falsch“. Dieser Schritt ist noch nicht getestet.
- [X] **2.6 Neue Wiederherstellungscodes** 👤 — Neue Codes erzeugen (Passwort nötig). Ein alter Code funktioniert danach nicht mehr.

## 3 Treffen

- [X] **3.1 Später treffen** 👥 — Person A legt an einem Platz ein Treffen für später an. Person B sieht es in der Liste und in den Platzdetails.
- [X] **3.2 Ich komme mit** 👥 — B tritt mit Personenzahl 3 bei. A sieht die neue Zahl. B ändert sie oder verlässt das Treffen wieder.
- [X] **3.3 Ich bin jetzt hier** 👤 — Dauer 1 bis 4 Stunden wählen. Das Treffen ist LIVE. Der Host beendet es früher.
- [X] **3.4 Verschieben mit Teilnehmer** 👥 — A verschiebt ein Treffen, dem B beigetreten ist. B wählt Mitgehen, Hierbleiben oder Verlassen. Beide Varianten einmal.
- [X] **3.5 Host verlässt** 👥 — A verlässt ein Treffen, in dem B ist. B ist danach Gastgeber und kann bearbeiten und absagen.
- [X] **3.6 Absagen** 👥 — Host sagt ein Treffen ab. Es bleibt als „Abgesagt“ sichtbar bis zur Endzeit.
- [X] **3.7 Alle verlassen** 👥 — Beide verlassen ein Treffen. Es ist danach geschlossen.
- [X] **3.8 Serie** 👥 — Wöchentliche Serie mit zwei Wochentagen, eigener Uhrzeit, optional Enddatum. Termine der nächsten 30 Tage erscheinen. B tritt nur einem Termin bei.

## 4 Bewertungen, Zustand und Fotos

- [X] **4.1 Bewerten** 👤 — 1 bis 5 Sterne und mindestens eine Begründung. Ohne Stern oder Begründung kommt ein Hinweis. Pro Person nur eine Bewertung je Platz, ändern geht.
- [X] **4.2 Zustand: Mängel** 👤 — Eine Bewertung mit z. B. „Netz kaputt“ oder „Scherben“. Der Platz zeigt „Zustand: Mängel gemeldet“. „Oft überfüllt“ ändert den Zustand nicht.
- [X] **4.3 Schon repariert?** 👥 — Beide sagen „repariert“. Prüfen, was nach 2 von 3 Stimmen angezeigt wird.
- [Ist da aber ist immer da. Wie können wir das sinnvoll ändern?] **4.4 Meldung an die Stadt** 👤 — Bei einem Mangel erscheint „Willst du das der Stadt melden?“. Link öffnen, „Ort für die Meldung kopieren“ ausprobieren.
- [Zurückgestellt] **4.5 Foto hochladen** (Fotos aus seit 20.10., `SCRUM-94`) 👤 — In den Platzdetails ein Foto hochladen. Hinweis „erscheint, sobald ein Admin es freigegeben hat“. Mehr als 3 offene Fotos geht nicht.
- [X] **4.6 Platz melden** 👥 — „Platz melden“ mit einem Grund. Der Platz zeigt „Von Nutzern gemeldet“. Erst bei 3 Personen verschwindet er von der Karte.

## 5 Kontakte

- [X] **5.1 Kontaktanfrage** 👥 — A schickt B eine Anfrage mit dem genauen Nickname. B lehnt ab, A sieht das und fragt erneut. B nimmt an.
- [X] **5.2 Kontakt-Benachrichtigung** 👥 — A erstellt ein Treffen. B bekommt eine Benachrichtigung mit A's Namen in der Glocke.
- [X] **5.3 Kontakte einladen** 👥 — A ist im Treffen und lädt B ein. B sieht die Einladung und tritt mit „Ich komme mit“ direkt bei. Zweite Einladung an B geht nicht.
- [X] **5.4 Blockieren** 👥 — B blockiert A. A kann B keine Anfrage mehr schicken und sieht B's Treffen nicht. B wird gewarnt, wenn beide im selben Treffen sind. Danach wieder entsperren.

## 6 Benachrichtigungen und Push

- [X] **6.1 Glocke und Liste** 👤 — Neueste zuerst. Antippen markiert gelesen und öffnet den Platz mit seinen Treffen.
- [X] **6.2 Favorit ohne Zeitfenster** 👥 — B setzt einen Platz als Favorit. A erstellt dort ein Treffen. B wird benachrichtigt.
- [ ] **6.3 Favorit mit Zeitfenster** 👥 — B legt z. B. Mo–Fr 17–20 Uhr fest. Ein Treffen innerhalb benachrichtigt, eines außerhalb nicht. Startzeit genau 20:00 zählt nicht mehr.
- [ ] **6.4 Nur eine Nachricht** 👥 — B hat A als Kontakt und den Platz als Favorit. A erstellt ein Treffen: B bekommt nur eine Benachrichtigung, nicht zwei.
- [ ] **6.5 Heimatbereich** 👥 — B setzt Punkt, Radius (1–20 km) und Sportarten. A erstellt ein Treffen innerhalb: eine Nachricht. Außerhalb oder andere Sportart: keine.
- [ ] **6.6 Heimatbereich und Serie** 👥 — A legt im Heimatbereich von B eine Serie an. B wird nur einmal benachrichtigt. Danach Heimatbereich ausschalten.
- [ ] **6.7 Push einschalten** 👤 — Nach der Anmeldung erscheint einmalig „Push-Benachrichtigungen?“; „Später“ schließt den Hinweis. Über „Push einrichten“ oder Konto → Push-Benachrichtigungen → Push einschalten die Browser-Erlaubnis geben. Danach steht dort „Push ist eingeschaltet.“ Falls „noch nicht eingerichtet“: VAPID-Schlüssel fehlen auf dem Server.
- [ ] **6.8 Push kommt an** 👥 — Tab im Hintergrund oder geschlossen. A erstellt ein Treffen, B bekommt eine Push-Nachricht. Antippen öffnet den Platz.
- [ ] **6.9 Push ausschalten** 👥 — Push ausschalten. Ein neues Treffen erscheint nur noch in der Glocke.

## 7 Admin

Nur mit dem Admin-Konto. Am besten an einem Testplatz, nicht an einem echten Platz mit Treffen anderer.

- [Zurückgestellt] **7.1 Fotos freigeben** (Fotos aus seit 20.10., `SCRUM-94`) 🔑 — Konto → Fotos freigeben. Ein Foto freigeben (erscheint in den Platzdetails), ein anderes ablehnen (zweiter Schritt „Ja, ablehnen“).
- [X] **7.2 Gemeldete Plätze** 🔑 — Liste der gemeldeten Plätze. „Verwerfen“ schließt die Meldungen, der Platz bleibt.
- [X] **7.3 Platz sperren und entsperren** 🔑 — Platz sperren: weg von der Karte, künftige Treffen abgesagt. Unter „Gesperrte Plätze“ entsperren, abgesagte Treffen bleiben abgesagt.
- [X] **7.4 Platz löschen** 🔑 — Nur an einem Testplatz. Danach für niemanden mehr sichtbar.

## 8 Zum Schluss drinnen

- [ ] **8.1 Konto löschen** 👤 — Erst nach den Draußen-Tests und nur mit einem Testkonto. Passwort nötig. Danach Anmelden unmöglich. (Fotos bleiben ohne Namen: zurückgestellt, `SCRUM-94`.)

## 9 Nur draußen

An einem echten Platz mit Handy, GPS und mobilem Netz. Platz vorschlagen und bestätigen braucht ein Konto, das mindestens 7 Tage alt ist.

- [ ] **9.1 Platz vorschlagen** 👤 — Am Platz „Platz vorschlagen“. „Standort wird bestimmt …“, Aktivität wählen. Liegt ein gleicher Platz in 50 m Umkreis, kommt „Ist es einer davon?“.
- [ ] **9.2 Vor Ort bestätigen** 👥 — Die zweite Person tippt beim Vorschlag „📍 Vor Ort bestätigen“. Es zählt jetzt 2 von 3. Für „wartet auf Freigabe“ braucht ihr eine dritte Person.
- [ ] **9.3 Bestätigen aus der Ferne** 👤 — Mehr als 100 m entfernt bestätigen. Es kommt „Du musst am Platz sein (höchstens 100 m entfernt)“.
- [ ] **9.4 Vorschlag freigeben** 🔑 — Frühestens 24 Stunden nach dem Vorschlag und nach 3 Bestätigungen: Admin gibt ihn unter Platzvorschläge frei. Der Platz zeigt „Von Nutzern hinzugefügt“.
- [ ] **9.5 Mit der Route hinfinden** 👤 — Von zuhause die Route öffnen und wirklich hinlaufen oder hinfahren. Stimmt der Punkt auf der Karte mit dem echten Platz überein?
- [ ] **9.6 Ich bin jetzt hier am Platz** 👥 — Am Platz ein Jetzt-Treffen starten. Die zweite Person sieht es unterwegs live und tritt bei.
- [ ] **9.7 Zustand am echten Platz** 👤 — Stimmt der angezeigte Zustand? Bei „Ist das noch so?“ ehrlich antworten.
- [Zurückgestellt] **9.8 Foto mit der Handykamera** (Fotos aus seit 20.10., `SCRUM-94`) 👤 — Direkt mit der Kamera ein Foto vom Platz hochladen. Nach der Freigabe prüfen: kein Standort in den Bilddaten.
- [ ] **9.9 Push unterwegs** 👥 — App geschlossen, Handy in der Tasche, mobiles Netz. Die andere Person erstellt ein Treffen. Kommt die Push-Nachricht, und wie schnell?
- [ ] **9.10 Bedienung draußen** 👤 — In der Sonne lesbar? Mit einer Hand bedienbar? Lädt die Karte mit schwachem Netz?

## Tickets aus dem Testlauf (20.10.)

- 1.7: `SCRUM-95` Button „Teilen“ in den Platzdetails (Teilen-Menü am Handy, sonst Link kopieren)
- 3: `SCRUM-96` Host kann nicht absagen, wenn andere dabei sind, nur verlassen
- 3.4: `SCRUM-97` doppelte Buttons bei offener Verschieben-Antwort („Gar nicht“ = „Verlassen“, „Ich komme mit“ am neuen Treffen)
- 4.2/4.3: `SCRUM-98` Bewertungen und Zustand aktualisieren sich live
- 4.3: `SCRUM-99` behobener Mangel wird durchgestrichen, die Bewertung bleibt
- 4: `SCRUM-100` einzelne Bewertungen mit Datum
- 6: `SCRUM-101` „Alle gelesen“ und „Gelesene löschen“
- allgemein: `SCRUM-102` „Meine Treffen“, Übersicht der eigenen Treffen

## Fertig, wenn

- [ ] Alle Punkte oben abgehakt oder als Fehler kommentiert
- [ ] Jeder Fehler hat ein eigenes Issue bzw. Jira-Ticket
