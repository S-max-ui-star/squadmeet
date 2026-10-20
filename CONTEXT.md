# SquadMeet

A map of free public places for activities (table tennis, basketball and similar). Adults use it
to meet new people: they say when they will be at a place, and others join them. The UI is
German; the German UI word is in brackets.

## Places

**Place** (Platz):
A public, free location where one Activity type can be done, for example one table tennis table.
_Avoid_: Ort, spot, location, venue

**Place detail** (Platzdetails; URL `/platz/<id>`):
The panel over the map that opens for one Place: name, Activity type, address, Favorite, start a
Meetup, the Place's Meetups, Ratings, Condition, City report and Photos. It sits at the bottom on a
phone and is a card on the left on a laptop. A Notification tap or a shared link opens it.
_Avoid_: popup, window, sheet, card, Place page, Place view

**Activity type** (Aktivität):
The kind of activity a Place is for: table tennis, basketball, football pitch, beach volleyball,
outdoor fitness.
_Avoid_: sport, category

**Place suggestion** (Platzvorschlag):
A Place that a user added and that is not yet confirmed. It becomes an active Place when 3 different
users confirm it at the Place and then an Admin approves it, at least 24 hours after the suggestion.
Between the 3rd Confirmation and the approval it is "waiting for Admin" (wartet auf Freigabe). The
Admin can also reject it; then it is gone, like a Deleted place.
The user who suggested it counts as one of the 3. Suggesting and confirming need an account that is
at least 7 days old. A Place that came from a suggestion is marked as added by users.
_Avoid_: draft, new place

**Confirmation** (Bestätigung):
A user's statement, made at the Place, that a Place suggestion is real.
_Avoid_: vote, verification

**Place report** (Platz melden):
A user's statement that a Place does not exist, is not public, or is dangerous, chosen from fixed
reasons. A reported Place shows that users reported it; after reports from 3 different users it
leaves the map until an Admin dismisses the reports or locks the Place. While it is off the map,
only Admins can open it, and nobody can start a Meetup or rate it there; its Meetups stay.
Dismissing or locking closes the reports; a user can report the Place again later.
_Avoid_: complaint, flag, City report

**Locked place** (gesperrter Platz):
A Place that an Admin marked as not publicly accessible. It is not on the map, and its future
Meetups are cancelled (running ones end at once). An Admin can unlock it; cancelled Meetups stay
cancelled. An Admin can also delete a Place: like locking, but it never comes back.
_Avoid_: closed, hidden, disabled

**Deleted place** (gelöschter Platz):
A Place that an Admin removed for good. Users and Admins cannot see it any more. The record stays,
so the next OSM import does not bring the Place back.
_Avoid_: removed, archived

**Place status** (Platzstatus):
The one status of a Place: active, Place suggestion, waiting for Admin (a Place suggestion with 3
Confirmations), reported (open Place reports from 3 users), Locked place or Deleted place. When two
apply, the stronger one counts (deleted, then locked, then waiting, then suggestion, then
reported). The status decides what users and Admins may do at the Place.
_Avoid_: state, visibility

## Meetups

**Meetup** (Treffen):
A user's announcement that they (alone or with a Party) will be at a Place from a start time.
A Meetup can start now or later.
_Avoid_: event, check-in, appointment, Termin

**Host** (Gastgeber):
The one user who can edit and Cancel a Meetup. First the creator; when the Host Leaves, the role
passes to the user who joined earliest.
_Avoid_: owner, organizer, creator

**Cancel** (absagen):
The Host calls off a Meetup for everyone before it starts. It stays visible as cancelled until its
end time. A running Meetup is ended early instead.
_Avoid_: delete, close

**Leave** (verlassen):
A user takes back their own Join. A Host can Leave instead of Cancel when others have joined.
_Avoid_: unjoin, cancel

**Move** (verschieben):
The Host changes the start of a Meetup that has not started. If others have joined, the Meetup
stays at the old time for them (the Host Leaves it) and the Host gets a new Meetup at the new
time; everyone who was in chooses to go along, stay or Leave.
_Avoid_: reschedule, edit

**Closed** (geschlossen):
The state of a Meetup that has no users left after everyone Left.
_Avoid_: cancelled, ended

**Now-meetup** ("Ich bin jetzt hier"):
A Meetup that starts at the moment it is created and ends automatically after 1–4 hours (the Host
chooses; default 2). The Host can end it early.
_Avoid_: check-in, presence

**Meetup list** (Treffen-Liste):
The Meetups at the Places in the visible part of the map that fall inside the Time filter. Zooming in
makes it shorter.
_Avoid_: feed, timeline, today list

**Time filter** (Zeitfilter):
The choice of a time span (now, next 3 hours, next 6 hours, today) that limits the map and the Meetup
list to Places with Meetups in that span.
_Avoid_: Time rule, schedule

**Series** (Serie):
A weekly repeating set of Meetups at one Place, on one or more weekdays, each with its own start
time and duration, optionally until an end date. Its Occurrences exist for the next 30 days.
_Avoid_: recurring event

**Occurrence** (Termin einer Serie):
One date of a Series. It behaves like a Meetup. Users join each Occurrence on its own; there is
no joining a whole Series.
_Avoid_: instance

**Join** ("Ich komme mit"):
A user's statement that they will come to one Occurrence or Meetup, with a Party size.
_Avoid_: RSVP, attendance, registration

**Overlap limit** (höchstens 2 gleichzeitig):
A user is in at most 2 Meetups at one moment, as Host or with a Join. Cancelled, ended and Closed
Meetups do not count. Each Occurrence of a Series counts on its own.
_Avoid_: double booking, conflict

**Party size** (Personenzahl):
The number of people a user brings, including themselves (1–10). Extra people need no account.
_Avoid_: group, guests

## Ratings

**Rating** (Bewertung):
A user's 1–5 star judgement of a Place, with at least one Reason. One per user per Place.
_Avoid_: review, comment

**Reason** (Begründung):
A predefined text block that explains a Rating, positive or negative. Users cannot write free text.
_Avoid_: comment, tag

**Condition** (Zustand):
The state of a Place, derived from the negative Reasons in recent Ratings that name a problem the
city or the operator must fix (broken or missing equipment, litter, broken glass, standing water).
Negative Reasons such as "Oft überfüllt" do not change it. An issue that nobody confirmed for
two months stays, and users are asked "Ist das noch so?"; three "still there" confirm it for two
more months. Three "fixed", which users can say at any time, end it.
_Avoid_: status, quality

**City report** (Meldung an die Stadt):
A link from a Place to the city's own defect report, so a user can tell the city about a problem
in the Condition. The app sends nothing itself.
_Avoid_: complaint, ticket, Place report

**Photo** (Foto):
A picture of a Place uploaded by a user. It is visible only after an Admin approves it; a
rejected Photo is deleted. Stored as a smaller JPEG without EXIF (no location). At most 3 pending
per user and Place; none at a Place suggestion. After an account delete it stays without a name.
_Avoid_: image, upload

## People

**Nickname**:
The only name other users see, and the login name. Unique.
_Avoid_: username, display name

**Recovery code** (Wiederherstellungscode):
A one-time code shown at registration that lets a user reset a forgotten password, or log in
without the authenticator app when MFA is on.
_Avoid_: backup code, reset link

**Avatar**:
A profile picture chosen from a predefined set. Users cannot upload their own.
_Avoid_: profile photo

**Contact** (Kontakt):
Another user that both sides agreed to connect with.
_Avoid_: friend, follower, connection

**Contact request** (Kontaktanfrage):
A request to become a Contact, sent by the exact Nickname. The other user must accept it. If they
decline, the asker sees that and may ask again.
_Avoid_: friend request, invite

**Block** (Blockieren):
A user's choice that works in one direction: the blocked user can no longer send them requests,
does not see the Meetups they host, and does not see their Nickname in other Meetups. The
blocking user still sees the blocked user and is warned when they are in the same Meetup.
_Avoid_: mute, report

**Admin**:
A team member who moderates Photos and can lock or delete Places.
_Avoid_: moderator, owner

## Notifications

**Home area** (Heimatbereich):
A point and a radius (1–20 km) that a user sets, with the Activity types they care about. The
user gets a Notification for a new Meetup inside it at a Place of one of those types; a Series
only once, for its first Occurrence. A user who got a Contact or Favorite Notification for the
Meetup gets no second one. Turning it off deletes the point (ADR-0003).
_Avoid_: location, current position, radius

**Favorite** (Favorit):
A Place a user marks to get Notifications about it at any distance.
_Avoid_: bookmark, saved place

**Time rule** (Zeitfenster):
Weekdays plus a time range on a Favorite. A Notification goes out only for Meetups that start
inside a Time rule in `Europe/Berlin` local time. The start is inclusive and the end is exclusive;
a rule must end on the same day. A Favorite without Time rules notifies always. Each newly stored
occurrence of a Series follows the same rule as an individually created Meetup.
_Avoid_: schedule, filter

**Notification** (Benachrichtigung):
A message about a Meetup, kept in the in-app list newest first. A tap marks it read and opens the
affected Place and its Meetups. If the user turned on Web Push, the same event also reaches each
subscribed browser; tapping it opens the affected Place. An expired browser subscription is
removed automatically.
_Avoid_: alert, pop-up, message

**Contact Notification** (Kontakt-Benachrichtigung):
A Notification to a user's Contacts when the user makes a Meetup or Now-meetup; it names the
user. A Series sends one, for its first Occurrence. A Contact who also has the Place as Favorite
gets only this one, not the Favorite Notification. Never to users blocked in either direction.
_Avoid_: friend alert, follow

**Invitation** (Einladung):
A Notification that someone in a Meetup (the Host or a Join) sends to chosen Contacts of their
own. It names the inviter and offers "Ich komme mit" (Party size 1). At most one per user and
Meetup; nobody already in the Meetup, nobody blocked with the inviter or the Host.
_Avoid_: request, invite link

**Push subscription** (Push-Abo):
One browser endpoint plus its encryption keys, stored for one user after browser permission. It is
private account data and disappears when the user turns Push off, the provider reports it expired,
or the account is deleted. The VAPID private key is only server configuration.
_Avoid_: device token, Notification
