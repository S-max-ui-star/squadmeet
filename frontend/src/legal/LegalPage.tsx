import { RESPONSIBLE, type LegalPageKind } from './legal'
import LegalLinks from './LegalLinks'

type Props = {
  kind: LegalPageKind
  // Photos are on (SCRUM-94). Off, the stored Photos are still named.
  photos: boolean
  navigate: (to: string) => void
}

// Privacy page and imprint (SCRUM-28): a full page over the map, reachable without login.
// Keep the privacy text true: a new feature that stores personal data or calls a new service
// (for example Photos, SCRUM-42, or web push, SCRUM-44) must add it here.
export default function LegalPage({ kind, photos, navigate }: Props) {
  return (
    <article className="legal-page">
      <a
        className="place-detail-back"
        href="/"
        onClick={(event) => {
          event.preventDefault()
          navigate('/')
        }}
      >
        ← Zur Karte
      </a>
      {kind === 'privacy' ? <Privacy photos={photos} /> : <Imprint />}
      <LegalLinks navigate={navigate} className="legal-links-inline" />
    </article>
  )
}

function Address() {
  return (
    <p>
      {RESPONSIBLE.name}
      <br />
      {RESPONSIBLE.street}
      <br />
      {RESPONSIBLE.city}
      <br />
      E-Mail: <a href={`mailto:${RESPONSIBLE.email}`}>{RESPONSIBLE.email}</a>
    </p>
  )
}

function Imprint() {
  return (
    <>
      <h1>Impressum</h1>
      <h2>Angaben gemäß § 5 DDG</h2>
      <Address />
      <h2>Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV</h2>
      <p>{RESPONSIBLE.name}, Anschrift wie oben.</p>
      <h2>Über dieses Projekt</h2>
      <p>
        Squadmeet ist ein nicht kommerzielles Abschlussprojekt einer Weiterbildung. Die Daten zu
        den Plätzen stammen von OpenStreetMap (© OpenStreetMap-Mitwirkende, Lizenz ODbL).
      </p>
    </>
  )
}

function Privacy({ photos }: { photos: boolean }) {
  return (
    <>
      <h1>Datenschutzerklärung</h1>

      <h2>Kurz gesagt</h2>
      <ul>
        <li>
          Wir speichern keine E-Mail-Adresse, keinen echten Namen und keinen Standort deines Geräts
          (Ausnahme: der Ort eines Platzes, den du vorschlägst, siehe unten).
        </li>
        <li>Es gibt keine Cookies, keine Werbung und kein Tracking.</li>
        <li>
          Du kannst dein Konto jederzeit selbst löschen. Dann entfernen wir deine Kontodaten und
          die unten beschriebenen Verbindungen zu dir sofort.
        </li>
      </ul>

      <h2>Verantwortlich</h2>
      <Address />

      <h2>Was wir speichern, wenn du ein Konto hast</h2>
      <ul>
        <li>
          <strong>Nickname und Avatar.</strong> Andere sehen sie bei deinen Treffen.
        </li>
        <li>
          <strong>Passwort</strong>, nur als Hash (Argon2). Dein Passwort selbst kennen wir nicht.
        </li>
        <li>
          <strong>Wiederherstellungscodes</strong>, nur als Hash, und ob ein Code schon benutzt ist.
        </li>
        <li>
          <strong>Zwei-Faktor-Anmeldung</strong> (wenn du sie einschaltest): den geheimen Schlüssel
          für deine Authenticator-App.
        </li>
        <li>
          <strong>Anmeldungen:</strong> pro angemeldetem Gerät einen Schlüssel (nur als Hash), wann
          die Anmeldung begann und wann sie endet (nach 30 Tagen). Eine abgelaufene Anmeldung löschen
          wir, sobald sich danach jemand anmeldet. Außerdem zählen wir falsche
          Anmeldeversuche, bis du dich wieder richtig anmeldest.
        </li>
        <li>
          <strong>Treffen:</strong> an welchem Platz, Beginn, Ende und wie viele ihr seid. Solange
          ein Treffen läuft, zeigt die Karte am Platz die Zahl der Personen. Wer den Platz öffnet,
          sieht die Zeit und die Personenzahl. Deinen Nickname mit Avatar sehen nur angemeldete
          Nutzer.
        </li>
        <li>
          <strong>Serien:</strong> an welchem Platz, an welchen Wochentagen und Uhrzeiten, bis
          wann und wie viele ihr seid. Jeder Termin einer Serie ist ein Treffen wie oben.
        </li>
        <li>
          <strong>Teilnahmen</strong> („Ich komme mit“): an welchem Treffen, mit wie vielen Personen
          und wann du beigetreten bist. Angemeldete Nutzer sehen bei dem Treffen deinen Nickname mit
          Avatar und deine Personenzahl. Mit „Verlassen“ löschen wir die Teilnahme.
        </li>
        <li>
          <strong>Bewertungen:</strong> pro Platz deine Sterne, deine Gründe und wann du bewertet
          hast. Andere sehen die Zusammenfassung aller Bewertungen (Durchschnitt und häufigste
          Gründe) und eine anonyme Liste der einzelnen Bewertungen mit Sternen, Gründen und dem
          Datum der letzten Änderung. Deinen Nickname sehen sie dabei nicht.
        </li>
        <li>
          <strong>Antworten auf „Ist das noch so?“:</strong> pro Mangel an einem Platz, ob du
          „noch so“ oder „behoben“ gesagt hast, und wann. Andere sehen nur, wie viele so
          geantwortet haben.
        </li>
        <li>
          <strong>Platzvorschläge und Bestätigungen:</strong> welchen Platz du vorgeschlagen oder
          bestätigt hast, und wann. Andere sehen nur die Zahl der Bestätigungen, nicht deinen
          Nickname. Beim Löschen deines Kontos werden deine Bestätigungen gelöscht; der
          vorgeschlagene Platz bleibt auf der Karte. Bevor ein Admin einen Vorschlag freigibt,
          fragt unser Server bei OpenStreetMap (Overpass-API) nach, was an diesem Punkt
          eingetragen ist. Dabei gehen nur die Koordinaten des Platzes mit, keine Daten über dich.
        </li>
        <li>
          <strong>Meldungen von Plätzen:</strong> welchen Platz du gemeldet hast, mit welchem Grund
          („Gibt es nicht“, „Nicht öffentlich“, „Gefährlich“), und wann. Andere sehen nur den
          häufigsten Grund und die Zahl der Meldungen, nicht deinen Nickname. Admins sehen die
          Gründe, aber nicht, wer gemeldet hat. Beim Löschen deines Kontos werden deine Meldungen
          gelöscht.
        </li>
        <li>
          <strong>Standort beim Vorschlagen und Bestätigen:</strong> Nur in diesen beiden Fällen
          fragt die App den Standort deines Geräts ab, und dein Browser fragt dich vorher um
          Erlaubnis. Beim Vorschlagen senden wir den Punkt an den Server: Er sucht damit nach
          ähnlichen Plätzen in der Nähe und speichert ihn als Ort des neuen Platzes, den alle auf
          der Karte sehen, ohne deinen Nickname. Beim Bestätigen prüft der Server nur, ob du
          höchstens 100 m vom Platz entfernt bist; diesen Standort speichern wir nicht.
        </li>
        <li>
          <strong>Kontakte:</strong> wem du eine Kontaktanfrage geschickt hast, ob sie angenommen
          oder abgelehnt wurde und wann. Deine Kontakte sehen deinen Nickname mit Avatar in ihrer
          Liste.
        </li>
        <li>
          <strong>Blockierungen:</strong> wen du blockiert hast und seit wann. Die blockierte Person
          erfährt das nicht; sie sieht nur deine Treffen und deinen Nickname nicht mehr.
        </li>
        <li>
          <strong>Benachrichtigungen:</strong> welches Treffen dich betrifft, der Anlass, wann die
          Benachrichtigung entstand und ob du sie gelesen hast. Wenn jemand, den du blockiert hast,
          demselben Treffen beitritt, erhältst nur du einen neutralen Hinweis; die blockierte Person
          erfährt dadurch nichts von der Blockierung. Eine Benachrichtigung löschen wir 14 Tage
          nach dem Ende ihres Treffens, gelesen oder nicht.
          Wenn du ein Treffen erstellst, bekommen deine Kontakte eine Benachrichtigung mit deinem
          Nickname, wann und wo es stattfindet. Lädst du Kontakte zu einem Treffen ein, sehen sie
          in der Einladung deinen Nickname. Wir speichern, wer wen eingeladen hat. Personen, die du
          blockiert hast oder die dich blockiert haben, bekommen nichts davon. Wenn du Push
          einschaltest, speichern wir zusätzlich die Push-Adresse deines Browsers und seine
          Verschlüsselungsschlüssel. Beim
          Ausschalten, beim Abmelden, bei Ablauf oder beim Löschen deines Kontos entfernen wir
          dieses Push-Abo.
          Wenn du einen Heimatbereich einschaltest, speichern wir den Punkt, den du auf der Karte
          gewählt hast, den Radius und die Sportarten, nie deinen aktuellen Standort. Damit melden
          wir dir neue Treffen in diesem Bereich. Nur du siehst diese Angaben, sie stehen nicht im
          Änderungsprotokoll, und beim Ausschalten oder beim Löschen deines Kontos löschen wir sie
          sofort.
        </li>
        <li>
          <strong>Änderungsprotokoll:</strong> Wenn du etwas anlegst, änderst oder löschst (zum
          Beispiel ein Treffen oder eine Meldung), speichern wir, was sich geändert hat, wer es war
          und wann. So finden wir Fehler und Missbrauch. Passwörter, Codes und Anmeldeschlüssel
          stehen nicht darin, und nur wir lesen es direkt auf dem Server. Beim Löschen deines
          Kontos löschen wir die Einträge mit deinem Nickname, und die übrigen Einträge zeigen
          nicht mehr, dass du es warst.
        </li>
        <li>
          <strong>Favoriten:</strong> welche Plätze du gespeichert hast sowie optionale Wochentage
          und Uhrzeiten für Benachrichtigungen über neue Treffen. Diese Angaben sind nur für dich
          sichtbar und werden gelöscht, wenn du den Favoriten oder dein Konto löschst.
        </li>
        {photos ? (
          <li>
            <strong>Fotos:</strong> wenn du ein Foto eines Platzes hochlädst, das Foto, zu welchem
            Platz es gehört, von wem es ist und wann. Unser Server speichert eine verkleinerte Kopie
            ohne die Zusatzdaten deiner Kamera (EXIF), also auch ohne Aufnahmeort. Ein Foto ist erst
            sichtbar, wenn ein Admin es freigegeben hat; der Admin sieht dabei deinen Nickname,
            andere sehen ihn nicht. Bitte fotografiere keine Personen. Ein abgelehntes Foto löschen
            wir.
          </li>
        ) : (
          // SCRUM-94: Photos are deferred. Stefan (product owner) checks this wording.
          <li>
            <strong>Fotos:</strong> Fotos sind zurzeit ausgeschaltet. Du kannst keine Fotos
            hochladen, und niemand sieht Fotos. Fotos, die schon hochgeladen wurden, bleiben
            gespeichert: das Foto als verkleinerte Kopie ohne Aufnahmeort, zu welchem Platz es
            gehört, von wem es ist und wann.
          </li>
        )}
      </ul>
      <p>
        Wir speichern den Zeitpunkt der Registrierung. Dein Alter speichern wir nicht: Du
        bestätigst nur, dass du 18 Jahre oder älter bist.
      </p>
      <p>
        <strong>Rechtsgrundlage:</strong> Art. 6 Abs. 1 lit. b DSGVO (du nutzt die App mit deinem
        Konto). Für den Schutz vor Missbrauch (Captcha, Begrenzung der Anmeldeversuche,
        Änderungsprotokoll) Art. 6
        Abs. 1 lit. f DSGVO: unser berechtigtes Interesse an einer sicheren App.
      </p>
      <p>
        <strong>Wie lange:</strong> bis du dein Konto löschst. Eine abgelaufene Anmeldung gilt
        nicht mehr. Benachrichtigungen löschen wir schon 14 Tage nach dem Ende ihres Treffens.
      </p>

      <h2>In deinem Browser</h2>
      <p>
        Wenn du dich anmeldest, legen wir deinen Anmeldeschlüssel im Speicher deines Browsers ab
        (localStorage). Ohne ihn bleibst du nicht angemeldet. Das ist technisch nötig (§ 25 Abs. 2
        Nr. 2 TDDDG). Beim Abmelden löschen wir ihn.
      </p>
      <p>
        Damit die Karte nach dem Neuladen dort bleibt, wo du warst, merkt sich dein Browser die
        Mitte und den Zoom der Karte (localStorage). Das bleibt nur in deinem Browser, wir bekommen
        es nicht. Du kannst es über die Website-Daten deines Browsers löschen.
      </p>
      <p>
        Push-Benachrichtigungen sind freiwillig. Erst nach deiner Zustimmung richtet dein Browser
        ein Push-Abo bei seinem Anbieter ein (zum Beispiel Apple, Google oder Mozilla). Dieser
        Anbieter verarbeitet für die Zustellung deine IP-Adresse und Zustellungsdaten; der Inhalt
        wird für deinen Browser verschlüsselt. Auf dem iPhone funktioniert Web Push nur, wenn du
        SquadMeet vorher zum Home-Bildschirm hinzugefügt hast.
      </p>

      <h2>Server (Amazon Web Services)</h2>
      <p>
        Die App läuft auf einem Server von Amazon Web Services EMEA SARL, 38 Avenue John F.
        Kennedy, L-1855 Luxemburg, in einem Rechenzentrum in Frankfurt am Main. Mit AWS gilt ein
        Vertrag zur Auftragsverarbeitung. Fotos liegen in einem nicht öffentlichen Speicher von
        AWS (Amazon S3) in derselben Region. Dein Browser lädt ein Foto über einen Link, der nach
        15 Minuten nicht mehr gilt, direkt von dort; dabei sieht AWS deine IP-Adresse.
      </p>
      <p>
        Dein Browser sendet bei jedem Aufruf deine IP-Adresse an den Server. Wir benutzen sie nur,
        um zu viele Anmeldeversuche von einer Adresse zu begrenzen. Dafür bleibt sie kurz im
        Arbeitsspeicher. Wir schreiben IP-Adressen nicht in die Datenbank und nicht in Protokolle.
      </p>

      <h2>Captcha (Cloudflare Turnstile)</h2>
      <p>
        Gegen Bots nutzen wir Turnstile von Cloudflare, Inc., 101 Townsend St., San Francisco, CA
        94107, USA. Turnstile erscheint nur bei der Registrierung, beim Zurücksetzen des Passworts
        und bei der Anmeldung nach 3 Fehlversuchen. Nur dann lädt dein Browser das Skript von
        Cloudflare. Wer nur die Karte ansieht, sendet nichts an Cloudflare.
      </p>
      <p>
        Das Skript prüft deinen Browser und erhält dabei unter anderem deine IP-Adresse. Unser
        Server sendet das Ergebnis (ein Token) und deine IP-Adresse zur Prüfung an Cloudflare.
        Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Cloudflare ist nach dem EU-US Data Privacy
        Framework zertifiziert. Mehr:{' '}
        <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">
          Datenschutzerklärung von Cloudflare
        </a>
        .
      </p>

      <h2>Karte (OpenStreetMap)</h2>
      <p>
        Die Kartenbilder lädt dein Browser direkt von tile.openstreetmap.org. Betreiber ist die
        OpenStreetMap Foundation, St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS,
        Großbritannien. Dabei erhält sie deine IP-Adresse und die Adresse dieser Seite. Für
        Großbritannien gibt es einen Angemessenheitsbeschluss der EU. Rechtsgrundlage: Art. 6 Abs.
        1 lit. f DSGVO (ohne Kartenbilder keine Karte). Mehr:{' '}
        <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noreferrer">
          Datenschutzerklärung der OpenStreetMap Foundation
        </a>
        .
      </p>
      <p>
        Für die Suche und für die Adresse eines Platzes fragt unser Server den Dienst Nominatim
        der OpenStreetMap Foundation (nominatim.openstreetmap.org). Bei der Suche geht dein
        Suchtext dorthin, bei der Adresse nur die Koordinaten des Platzes. Deine IP-Adresse und
        dein Nickname gehen nicht mit. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO (ohne diesen
        Dienst keine Adresssuche).
      </p>

      <h2>Routenplanung (Apple Maps oder Google Maps)</h2>
      <p>
        Im Platz-Detail kannst du „Route planen“ wählen. Erst wenn du diesen Link anklickst,
        öffnet dein Browser Apple Maps auf iPhone und iPad oder sonst Google Maps. Dabei erhält
        der jeweilige Dienst deine IP-Adresse und die Koordinaten des Ziels. Vor dem Klick stellt
        SquadMeet keine Verbindung zu Apple oder Google her. Für die weitere Verarbeitung gelten
        die{' '}
        <a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noreferrer">
          Datenschutzregeln von Apple
        </a>{' '}
        beziehungsweise die{' '}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Datenschutzerklärung von Google
        </a>
        .
      </p>

      <h2>Meldung an die Stadt</h2>
      <p>
        Bei einem Platz verlinken wir den offiziellen Mängelmelder der Stadt und die zuständige
        Stelle mit E-Mail und Telefon. Wir senden dabei nichts an die Stadt. Erst wenn du den Link
        öffnest, eine E-Mail aus deinem Mailprogramm schickst oder anrufst, gilt die
        Datenschutzerklärung der Stadt. „Ort kopieren“ legt Adresse und Koordinaten nur in die
        Zwischenablage deines Geräts.
      </p>

      <h2>Konto löschen</h2>
      <p>
        Angemeldet findest du oben rechts unter „Konto“ den Punkt „Konto löschen“. Wir fragen dein
        Passwort (und mit Zwei-Faktor-Anmeldung einen Code) ab. Dann löschen wir sofort dein Konto,
        deine Serien und Teilnahmen sowie deine Kontakte, Blockierungen, Bewertungen und Antworten.
        Ein von dir veranstaltetes offenes Treffen ohne Teilnehmende wird gelöscht. Sind bereits
        andere beigetreten, läuft es mit der zuerst beigetretenen Person als neuem Host weiter,
        ohne Verbindung zu deinem gelöschten Konto. Danach ist dein Nickname wieder frei. Deine
        Fotos bleiben am Platz, aber ohne Verbindung zu dir; noch nicht freigegebene prüft ein Admin
        weiter.
      </p>

      <h2>Deine Rechte</h2>
      <p>
        Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
        Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Schreib uns dazu an die Adresse
        oben. Du kannst dich auch bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel
        bei der für uns zuständigen: Die Sächsische Datenschutz- und Transparenzbeauftragte,
        Devrientstraße 5, 01067 Dresden.
      </p>
    </>
  )
}
