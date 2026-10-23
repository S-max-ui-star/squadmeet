import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchPlace, fetchPlaces, underReview, type MapArea, type Place, type PlaceSearchHit } from './api/places'
import {
  clearToken,
  fetchMe,
  loadToken,
  logout,
  saveToken,
  type LoginResult,
  type User,
} from './api/auth'
import { fetchContacts, type Contacts } from './api/contacts'
import { announceMeetupChange, announceRatingChange, announceTopicChange, connectLive } from './api/live'
import { fetchNotifications, type Notification } from './api/notifications'
import { fetchPhotosEnabled } from './api/photos'
import { countFor, type RequestCount } from './auth/requestCount'
import { fetchMapMeetups, type Meetup, type TimeSpan } from './api/meetups'
import AccountDialog from './auth/AccountDialog'
import ContactsDialog from './auth/ContactsDialog'
import AuthDialog from './auth/AuthDialog'
import DeleteAccountDialog from './auth/DeleteAccountDialog'
import type { AdminDialogKind } from './auth/AdminDialog'
import MfaDialog from './auth/MfaDialog'
import RecoveryCodesDialog from './auth/RecoveryCodesDialog'
import FavoritesDialog from './auth/FavoritesDialog'
import { AVATARS } from './auth/avatars'
import { legalPageFromPath } from './legal/legal'
import LegalLinks from './legal/LegalLinks'
import ActivityFilter from './places/ActivityFilter'
import { ACTIVITY_TYPES, activityOf, type ActivityType } from './places/activities'
import { activeFilterCount, filterPlaces } from './places/filter'
import { placeIcon, spotIcon } from './places/markers'
import PlaceDetail from './places/PlaceDetail'
import PlaceMeetups from './places/PlaceMeetups'
import SuggestPlaceDialog from './places/SuggestPlaceDialog'
import PlacePhotos from './places/PlacePhotos'
import PlaceRatings from './places/PlaceRatings'
import PlaceSearch from './places/PlaceSearch'
import MapToolbar from './places/MapToolbar'
import BottomNav from './places/BottomNav'
import FilterSheet from './places/FilterSheet'
import MyMeetupsDialog from './places/MyMeetupsDialog'
import MeetupMap from './places/MeetupMap'
import FavoriteButton from './places/FavoriteButton'
import NotificationsDialog from './notifications/NotificationsDialog'
import HomeAreaDialog from './notifications/HomeAreaDialog'
import PushOnboarding from './notifications/PushOnboarding'
import PushSettingsDialog from './notifications/PushSettingsDialog'
import { dropPushSubscription } from './notifications/push'
import { notificationsFor, type NotificationState } from './notifications/notificationState'
import { placeIdFromPath, placePath, usePath } from './places/route'
import CenterOn from './places/CenterOn'
import { useFocusRequest } from './places/focus'
import { groupBySpot } from './places/spots'
import { clusterSpots, NO_CLUSTER_ZOOM } from './places/clusters'
import ClusterMarker from './places/ClusterMarker'
import { pageVisible, whileVisible } from './whileVisible'
import { loadMapView, saveMapView } from './places/mapView'

// Rarely opened, so they load only when needed: a smaller first download (review 21.10.).
const AdminDialog = lazy(() => import('./auth/AdminDialog'))
const LegalPage = lazy(() => import('./legal/LegalPage'))

const LEIPZIG: [number, number] = [51.3397, 12.3731]
// Zoomed out further, an area could hold more Places than the API sends (MAX_PLACES).
const MIN_ZOOM = 11

// The middle of the last map area, where the Home area map starts (SCRUM-45).
function areaCenter(area: MapArea | null): [number, number] {
  return area ? [(area.south + area.north) / 2, (area.west + area.east) / 2] : LEIPZIG
}
// Meetups end by themselves (SCRUM-29); the map asks again so an ended one leaves the map.
const PLACES_REFRESH_MS = 60_000
const NOTIFICATIONS_REFRESH_MS = 60_000
// Lifts the open Place's marker above its neighbours (SCRUM-76).
const SELECTED_Z = 1000

// Calls onMove with the visible map area at the start and after each pan or zoom.
function MapAreaWatcher({ onMove }: { onMove: (area: MapArea) => void }) {
  const map = useMap()
  const report = () => {
    const bounds = map.getBounds()
    onMove({ west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() })
  }
  useMapEvents({ moveend: report })
  useEffect(report, [map, onMove])
  return null
}

// Stores center and zoom after each pan or zoom, so a reload starts there (SCRUM-77).
function RememberView() {
  const map = useMapEvents({
    moveend: () => {
      const { lat, lng } = map.getCenter()
      saveMapView({ center: [lat, lng], zoom: map.getZoom() })
    },
  })
  return null
}

// Reports the zoom after each zoom, so the clusters split or join (SCRUM-166).
function ZoomWatcher({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  return null
}

// A tap on the map itself closes overlays. Markers and popups do not pass their clicks on to the
// map, and a pan or zoom is no click.
function CloseOnMapTap({ onTap }: { onTap: () => void }) {
  useMapEvents({ click: onTap })
  return null
}

type SearchTarget = { lat: number; lon: number; request: number }

// At most one dialog is open at a time (review 21.10.: one state instead of a flag per dialog).
type OpenDialog =
  | {
      kind:
        | 'auth'
        | 'account'
        | 'mfa'
        | 'suggest'
        | 'delete'
        | 'recoveryCodes'
        | 'contacts'
        | 'favorites'
        | 'myMeetups'
        | 'notifications'
        | 'pushSettings'
        // Phones: the filters from the bottom bar (SCRUM-175).
        | 'filter'
    }
  | { kind: 'admin'; admin: AdminDialogKind }
  // Where the Home area map starts (SCRUM-45).
  | { kind: 'homeArea'; center: [number, number] }
type DialogKind = OpenDialog['kind']

function CenterOnSearch({ target }: { target: SearchTarget | null }) {
  const map = useMap()
  useEffect(() => {
    if (target) map.setView([target.lat, target.lon], 17)
  }, [map, target])
  return null
}

// fallow-ignore-next-line complexity -- Existing top-level composition; feature logic stays in focused modules.
export default function App() {
  // Where the map starts: the view before the last reload, else Leipzig (SCRUM-77). A shared
  // /platz/<id> link still wins: CenterOn moves to that Place when it is not in view.
  const [startView] = useState(() => loadMapView(MIN_ZOOM))
  const [places, setPlaces] = useState<Place[]>([])
  const [mapMeetups, setMapMeetups] = useState<Meetup[]>([])
  const [mapLoading, setMapLoading] = useState(false)
  const [timeSpan, setTimeSpan] = useState<TimeSpan | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The request for the last map area; a newer pan or zoom cancels it, so an old answer
  // cannot replace a newer one.
  const placesRequest = useRef<AbortController | null>(null)
  // The last visible map area, to load it again after a Meetup changed or a minute passed.
  const lastArea = useRef<MapArea | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const show = (kind: Exclude<DialogKind, 'admin' | 'homeArea'>) => setDialog({ kind })
  const closeDialog = () => setDialog(null)
  const isOpen = (kind: DialogKind) => dialog?.kind === kind
  const loginNeeded = () => show('auth')
  // Contact requests waiting for the user's answer, shown on the "Konto" button (SCRUM-32).
  const [requests, setRequests] = useState<RequestCount | null>(null)
  const [notificationState, setNotificationState] = useState<NotificationState | null>(null)
  const [chosen, setChosen] = useState<Set<ActivityType>>(() => new Set(ACTIVITY_TYPES))
  const [path, navigate, closePlace] = usePath()
  const selectedId = placeIdFromPath(path)
  // Set by a tap on a Notification: the map zooms in on that Place (SCRUM-90).
  const [focus, focusOn] = useFocusRequest()
  const legalPage = legalPageFromPath(path)
  // The answer for the Place in the detail URL. It keeps its id, so an old answer never shows.
  const [detail, setDetail] = useState<{
    id: number
    viewerId: number | null
    place?: Place
    error?: string
  } | null>(null)
  // Counts the tries for the open Place, so "Nochmal versuchen" or a new tap loads it again.
  const [detailTry, setDetailTry] = useState(0)
  const [searchTarget, setSearchTarget] = useState<SearchTarget | null>(null)
  const [searchDismissRequest, setSearchDismissRequest] = useState(0)
  // Photos are deferred (SCRUM-94): hidden until the server switch PHOTOS_ENABLED is on.
  const [photos, setPhotos] = useState(false)
  const current = detail && detail.id === selectedId && detail.viewerId === (user?.id ?? null) ? detail : null
  const selected = current?.place ?? null
  // A reported Place that an Admin reviews: the detail only shows it (SCRUM-158).
  const reviewOnly = selected !== null && underReview(selected)

  useEffect(() => {
    void fetchPhotosEnabled().then(setPhotos)
  }, [])

  // The API, not the loaded map Places: a shared link can point outside the visible area.
  useEffect(() => {
    if (selectedId === null) return
    let stillWanted = true
    const viewerId = user?.id ?? null
    fetchPlace(selectedId, user ? loadToken() : null)
      .then((place) => stillWanted && setDetail({ id: selectedId, viewerId, place }))
      .catch((err: Error) => stillWanted && setDetail({ id: selectedId, viewerId, error: err.message }))
    return () => {
      stillWanted = false
    }
  }, [selectedId, detailTry, user])

  // A tap on the open Place loads it again (helps after a network error); otherwise it opens it.
  function openPlace(id: number) {
    if (id === selectedId) setDetailTry((n) => n + 1)
    else navigate(placePath(id))
  }

  // Point 8 of Steven's review: only when the Places, the filter or the open Place change.
  const visiblePlaces = useMemo(
    () => filterPlaces(places, chosen, selectedId),
    [places, chosen, selectedId],
  )
  const spots = useMemo(() => groupBySpot(visiblePlaces), [visiblePlaces])
  const [zoom, setZoom] = useState(startView?.zoom ?? 13)
  // Overlapping markers become clusters (SCRUM-166); someone there now and the open Place stay apart.
  const clustered = useMemo(() => {
    if (zoom >= NO_CLUSTER_ZOOM) return { singles: spots, clusters: [] }
    const project = (lat: number, lon: number) => L.CRS.EPSG3857.latLngToPoint(L.latLng(lat, lon), zoom)
    return clusterSpots(spots, project, (spot) =>
      spot.places.some((place) => place.id === selectedId || place.people_now > 0),
    )
  }, [spots, zoom, selectedId])

  const loadPlaces = useCallback((area: MapArea) => {
    lastArea.current = area
    placesRequest.current?.abort()
    const request = new AbortController()
    placesRequest.current = request
    setPlaces([])
    setMapMeetups([])
    setTruncated(false)
    setError(null)
    setMapLoading(true)
    const token = user ? loadToken() : null
    const answer = timeSpan
      ? fetchMapMeetups(area, timeSpan, request.signal, token)
      : fetchPlaces(area, request.signal, token).then((placesAnswer) => ({
          ...placesAnswer,
          meetups: [] as Meetup[],
        }))
    answer
      .then((answer) => {
        if (request.signal.aborted || placesRequest.current !== request) return
        setPlaces(answer.places)
        setTruncated(answer.truncated)
        setMapMeetups(answer.meetups)
        setError(null)
        setMapLoading(false)
      })
      .catch((err: Error) => {
        if (!request.signal.aborted && placesRequest.current === request) {
          setError(err.message)
          setMapLoading(false)
        }
      })
  }, [timeSpan, user])

  function reloadPlaces() {
    if (lastArea.current) loadPlaces(lastArea.current)
  }

  function changeTimeSpan(span: TimeSpan | null) {
    placesRequest.current?.abort()
    setPlaces([])
    setMapMeetups([])
    setTruncated(false)
    setError(null)
    setMapLoading(true)
    setTimeSpan(span)
  }

  function pickSearchHit(hit: PlaceSearchHit) {
    setSearchTarget({ lat: hit.lat, lon: hit.lon, request: Date.now() })
    if (hit.kind === 'place' && hit.place_id !== null) navigate(placePath(hit.place_id))
    else navigate('/')
  }

  function closeOnMapTap() {
    setSearchDismissRequest((request) => request + 1)
    if (selectedId !== null) closePlace()
  }

  // Not in the background; once when the page comes back to the front (SCRUM-78).
  useEffect(
    () =>
      whileVisible(() => {
        if (lastArea.current) loadPlaces(lastArea.current)
      }, PLACES_REFRESH_MS),
    [loadPlaces],
  )

  // Restore the login from an earlier visit; drop the token when the server no longer knows it.
  useEffect(() => {
    const token = loadToken()
    if (!token) return
    fetchMe(token)
      .then((me) => {
        if (me) setUser(me)
        else clearToken()
      })
      .catch(() => {})
  }, [])

  // The number on the "Konto" button: open Contact requests to the user (SCRUM-32).
  const userId = user?.id
  const incomingRequests = countFor(requests, userId)
  const updateRequests = useCallback(
    (contacts: Contacts) => {
      if (userId) setRequests({ userId, count: contacts.incoming.length })
    },
    [userId],
  )

  // Notifications: keep every answer with its user so a late response after logout cannot
  // expose that user's unread count to the next login.
  const notifications = notificationsFor(notificationState, userId)
  const unreadNotifications = notifications.filter((notice) => !notice.read).length
  const updateNotifications = useCallback(
    (found: Notification[]) => {
      if (userId) setNotificationState({ userId, items: found })
    },
    [userId],
  )

  // Live events about Meetups (SCRUM-93): the map loads again (people and Meetups on it).
  const [meetupEvents, setMeetupEvents] = useState(0)
  useEffect(() => {
    if (meetupEvents && lastArea.current) loadPlaces(lastArea.current)
  }, [meetupEvents, loadPlaces])

  // Contact requests and Notifications load at login and again on each live event (SCRUM-93),
  // for the counts on the buttons.
  // Notifications also every 60 s, in case the live stream does not get through.
  useEffect(() => {
    const token = loadToken()
    if (!userId || !token) return
    // A late answer for a user who has logged out since must not set the counts.
    let current = true
    const reloadContacts = () =>
      fetchContacts(token)
        .then((contacts) => {
          if (current) updateRequests(contacts)
        })
        .catch(() => {})
    const reloadNotifications = () =>
      fetchNotifications(token)
        .then((found) => {
          if (current) updateNotifications(found)
        })
        .catch(() => {})
    void reloadContacts()
    void reloadNotifications()
    // Not in the background (SCRUM-78); the stream opens again in front and loads them then.
    const timer = setInterval(() => {
      if (pageVisible()) void reloadNotifications()
    }, NOTIFICATIONS_REFRESH_MS)
    const stopLive = connectLive(token, {
      // Open dialogs load again too.
      onOpen: () => {
        void reloadContacts()
        void reloadNotifications()
        announceTopicChange('contacts')
        announceTopicChange('notifications')
      },
      // In the background nothing loads (SCRUM-78): back in front, the stream opens again
      // (onOpen) and the map and Place panel load once (whileVisible).
      onTopic: (topic) => {
        if (!pageVisible()) return
        void (topic === 'contacts' ? reloadContacts() : reloadNotifications())
        announceTopicChange(topic)
      },
      onMeetups: (placeId) => {
        if (!pageVisible()) return
        setMeetupEvents((count) => count + 1)
        announceMeetupChange(placeId)
      },
      onRatings: (placeId) => {
        if (pageVisible()) announceRatingChange(placeId)
      },
    })
    return () => {
      current = false
      clearInterval(timer)
      stopLive()
    }
  }, [userId, updateRequests, updateNotifications])

  function handleLoggedIn(result: LoginResult) {
    saveToken(result.token)
    placesRequest.current?.abort()
    setPlaces([])
    setMapMeetups([])
    setDetail(null)
    setTruncated(false)
    setError(null)
    setMapLoading(true)
    setUser(result.user)
    closeDialog()
  }

  function startSuggesting() {
    show(user ? 'suggest' : 'auth')
  }

  function openFromSuggest(id: number) {
    closeDialog()
    reloadPlaces()
    openPlace(id)
  }

  // No open overlay or cached account badge belongs to the next person who signs in.
  function resetUserUi() {
    closeDialog()
    setRequests(null)
    setNotificationState(null)
    placesRequest.current?.abort()
    setPlaces([])
    setMapMeetups([])
    setDetail(null)
    setTruncated(false)
    setError(null)
    setMapLoading(true)
  }

  // From the desktop toolbar and from Konto (SCRUM-169).
  function openHomeArea() {
    setDialog({ kind: 'homeArea', center: areaCenter(lastArea.current) })
  }

  async function handleLogout() {
    const token = loadToken()
    clearToken()
    setUser(null)
    resetUserUi()
    if (!token) return
    // First, while the token still works: no more Push messages of this account here (SCRUM-146).
    await dropPushSubscription(token)
    await logout(token).catch(() => {})
  }

  // The server already ended all sessions of the account; only the browser is left.
  function handleDeleted() {
    clearToken()
    setUser(null)
    resetUserUi()
  }

  return (
    <>
      {error && <div className="error">Plätze konnten nicht geladen werden: {error}</div>}
      {truncated && !error && <div className="error">Zu viele Plätze. Bitte näher heranzoomen.</div>}
      <div className="account">
        {user ? (
          <>
            <span className="account-name">
              {AVATARS[user.avatar]?.emoji} {user.nickname}
            </span>
            <button
              type="button"
              className="notification-button"
              aria-label={`Benachrichtigungen${unreadNotifications ? `, ${unreadNotifications} ungelesen` : ''}`}
              onClick={() => show('notifications')}
            >
              🔔{unreadNotifications > 0 && <span className="notification-count">{unreadNotifications}</span>}
            </button>
            {/* Abmelden is in Konto (SCRUM-169). A phone shows only the Avatar, a round button
                (SCRUM-174); a laptop shows the word. */}
            <button type="button" className="account-button" aria-label="Konto" onClick={() => show('account')}>
              <span className="account-button-avatar" aria-hidden="true">
                {AVATARS[user.avatar]?.emoji ?? '👤'}
              </span>
              <span className="account-button-text" aria-hidden="true">
                Konto
              </span>
            </button>
          </>
        ) : (
          <button type="button" onClick={loginNeeded}>
            Anmelden
          </button>
        )}
      </div>
      {isOpen('auth') && <AuthDialog onLoggedIn={handleLoggedIn} onClose={closeDialog} />}
      {user && !isOpen('pushSettings') && (
        <PushOnboarding
          key={user.id}
          userId={user.id}
          token={loadToken() ?? ''}
          onConfigure={() => show('pushSettings')}
        />
      )}
      {isOpen('notifications') && user && (
        <NotificationsDialog
          key={user.id}
          token={loadToken() ?? ''}
          onChanged={updateNotifications}
          onOpenMeetup={(placeId) => {
            closeDialog()
            focusOn(placeId)
            openPlace(placeId)
          }}
          onClose={closeDialog}
        />
      )}
      {isOpen('pushSettings') && user && (
        <PushSettingsDialog key={user.id} token={loadToken() ?? ''} onClose={closeDialog} />
      )}
      {dialog?.kind === 'homeArea' && user && (
        <HomeAreaDialog token={loadToken() ?? ''} fallbackCenter={dialog.center} onClose={closeDialog} />
      )}
      {isOpen('account') && user && (
        <AccountDialog
          user={user}
          photos={photos}
          onPush={() => show('pushSettings')}
          onHomeArea={openHomeArea}
          onMfa={() => show('mfa')}
          onLogout={handleLogout}
          onDelete={() => show('delete')}
          onLockedPlaces={() => setDialog({ kind: 'admin', admin: 'locked' })}
          onSuggestions={() => setDialog({ kind: 'admin', admin: 'approvals' })}
          onReports={() => setDialog({ kind: 'admin', admin: 'reports' })}
          onPhotos={() => setDialog({ kind: 'admin', admin: 'photos' })}
          onClose={closeDialog}
        />
      )}
      {isOpen('contacts') && user && (
        <ContactsDialog
          token={loadToken() ?? ''}
          onChanged={updateRequests}
          onClose={() => {
            closeDialog()
            // A Block changes which Meetups the user sees.
            reloadPlaces()
          }}
        />
      )}
      {isOpen('favorites') && user && (
        <FavoritesDialog
          token={loadToken() ?? ''}
          onOpenPlace={(id) => {
            closeDialog()
            openPlace(id)
          }}
          onClose={closeDialog}
        />
      )}
      {isOpen('myMeetups') && user && (
        <MyMeetupsDialog
          token={loadToken() ?? ''}
          onOpenPlace={(placeId) => {
            closeDialog()
            focusOn(placeId)
            openPlace(placeId)
          }}
          onClose={closeDialog}
        />
      )}
      {dialog?.kind === 'admin' && user && (
        <Suspense fallback={null}>
          <AdminDialog
            kind={dialog.admin}
            token={loadToken() ?? ''}
            onChanged={() => {
              reloadPlaces()
              // The open Place may be the one that just changed.
              setDetailTry((n) => n + 1)
            }}
            onOpenPlace={(id) => {
              closeDialog()
              openPlace(id)
            }}
            onClose={closeDialog}
          />
        </Suspense>
      )}
      {isOpen('mfa') && user && (
        <MfaDialog
          token={loadToken() ?? ''}
          user={user}
          onChanged={setUser}
          onNewRecoveryCodes={() => show('recoveryCodes')}
          onClose={closeDialog}
        />
      )}
      {isOpen('suggest') && user && (
        <SuggestPlaceDialog
          token={loadToken() ?? ''}
          onCreated={(place) => openFromSuggest(place.id)}
          onOpenPlace={openFromSuggest}
          onClose={closeDialog}
        />
      )}
      {isOpen('filter') && (
        <FilterSheet
          span={timeSpan}
          chosen={chosen}
          onSpanChange={changeTimeSpan}
          onChosenChange={setChosen}
          onClose={closeDialog}
        />
      )}
      {/* Phones (SCRUM-165), also for a visitor (SCRUM-175); before the elements it pushes up, so
          the CSS reaches them with "~". */}
      <BottomNav
        loggedIn={user !== null}
        activeFilters={activeFilterCount(timeSpan, chosen)}
        incomingRequests={incomingRequests}
        onFilter={() => show('filter')}
        onLogin={loginNeeded}
        onMyMeetups={() => show('myMeetups')}
        onFavorites={() => show('favorites')}
        onContacts={() => show('contacts')}
      />
      {/* A rare action: on a phone only a round ＋ (SCRUM-174). */}
      <button type="button" className="suggest-button" aria-label="Platz vorschlagen" onClick={startSuggesting}>
        <span aria-hidden="true">＋</span>
        <span className="suggest-button-text" aria-hidden="true">
          {' '}
          Platz vorschlagen
        </span>
      </button>
      {isOpen('delete') && user && (
        <DeleteAccountDialog token={loadToken() ?? ''} user={user} onDeleted={handleDeleted} onClose={closeDialog} />
      )}
      {legalPage && (
        <Suspense fallback={null}>
          <LegalPage kind={legalPage} photos={photos} navigate={navigate} />
        </Suspense>
      )}
      {/* A visitor reaches the Impressum in one step; a logged-in user finds it in Konto (SCRUM-174). */}
      {!user && <LegalLinks navigate={navigate} />}
      {isOpen('recoveryCodes') && user && (
        <RecoveryCodesDialog token={loadToken() ?? ''} user={user} onClose={closeDialog} />
      )}
      {/* Right of the search field (SCRUM-85); right before it, so the CSS can make room. */}
      {user && (
        <MapToolbar
          incomingRequests={incomingRequests}
          onContacts={() => show('contacts')}
          onFavorites={() => show('favorites')}
          onHomeArea={openHomeArea}
          onMyMeetups={() => show('myMeetups')}
        />
      )}
      <PlaceSearch onPick={pickSearchHit} dismissRequest={searchDismissRequest} />
      <MeetupMap
        span={timeSpan}
        meetups={mapMeetups}
        places={visiblePlaces}
        onSpanChange={changeTimeSpan}
        onOpenPlace={openPlace}
        showList={selectedId === null}
        loading={mapLoading}
        error={Boolean(error)}
      />
      <ActivityFilter chosen={chosen} onChange={setChosen} />
      {selectedId !== null && (
        <PlaceDetail
          place={selected}
          error={current?.error ?? null}
          onRetry={() => setDetailTry((n) => n + 1)}
          key={selectedId}
          onClose={closePlace}
          user={user}
          onLoginNeeded={loginNeeded}
          onConfirmed={(updated) => {
            setDetail({ id: updated.id, viewerId: user?.id ?? null, place: updated })
            reloadPlaces()
          }}
          onRemoved={() => {
            closePlace()
            reloadPlaces()
          }}
          // Only the map: the detail stays open with the thanks, even when the Place leaves the map.
          onReported={reloadPlaces}
          // "Karte" in the side actions: zoom the map in on the Place (SCRUM-176).
          onShowOnMap={() => focusOn(selectedId)}
          parts={{
            favorite: (
              <FavoriteButton
                key={`favorite-${selectedId}-${user?.id ?? 'guest'}`}
                placeId={selectedId}
                token={user ? loadToken() : null}
                onLoginNeeded={loginNeeded}
              />
            ),
            meetups: (
              <PlaceMeetups
                key={selectedId}
                placeId={selectedId}
                activityType={selected?.activity_type ?? null}
                user={user}
                onLoginNeeded={loginNeeded}
                onChanged={reloadPlaces}
                readOnly={reviewOnly}
              />
            ),
          }}
        >
          {/* A new key per user, so a logout does not keep the old user's own Rating. */}
          <PlaceRatings
            key={`${selectedId}-${user?.id ?? 'guest'}`}
            placeId={selectedId}
            place={selected}
            user={user}
            onLoginNeeded={loginNeeded}
            readOnly={reviewOnly}
          />
          {/* A new key per Admin decision too: an approved Photo shows at once. */}
          {photos && (
            <PlacePhotos
              key={`${selectedId}-${user?.id ?? 'guest'}-${detailTry}`}
              placeId={selectedId}
              user={user}
              onLoginNeeded={loginNeeded}
              readOnly={reviewOnly}
            />
          )}
        </PlaceDetail>
      )}
      <MapContainer
        center={startView?.center ?? LEIPZIG}
        zoom={startView?.zoom ?? 13}
        minZoom={MIN_ZOOM}
        maxBounds={[[-90, -180], [90, 180]]}
        maxBoundsViscosity={1}
        worldCopyJump
        style={{ height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapAreaWatcher onMove={loadPlaces} />
        <RememberView />
        <ZoomWatcher onZoom={setZoom} />
        <CenterOnSearch target={searchTarget} />
        <CloseOnMapTap onTap={closeOnMapTap} />
        {selected && (
          <CenterOn place={selected} focus={focus?.id === selected.id ? focus.request : null} />
        )}
        {clustered.clusters.map((cluster) => (
          <ClusterMarker key={`cluster-${cluster.spots[0].places[0].id}`} cluster={cluster} />
        ))}
        {clustered.singles.map((spot) => {
          const isSelected = spot.places.some((place) => place.id === selectedId)
          if (spot.places.length === 1) {
            const [place] = spot.places
            return (
              <Marker
                key={place.id}
                position={[spot.lat, spot.lon]}
                icon={placeIcon(place.activity_type, isSelected, place.people_now, place.is_suggestion)}
                zIndexOffset={isSelected ? SELECTED_Z : 0}
                title={place.name}
                eventHandlers={{ click: () => openPlace(place.id) }}
              />
            )
          }
          // Several Activity types on one spot: the marker shows how many; a tap shows the choice.
          return (
            <Marker
              key={`spot-${spot.places[0].id}`}
              position={[spot.lat, spot.lon]}
              icon={spotIcon(spot, isSelected)}
              zIndexOffset={isSelected ? SELECTED_Z : 0}
            >
              <Popup>
                <ul className="spot-choice">
                  {spot.places.map((place) => {
                    const activity = activityOf(place.activity_type)
                    return (
                      <li key={place.id}>
                        <a
                          href={placePath(place.id)}
                          onClick={(event) => {
                            event.preventDefault()
                            openPlace(place.id)
                          }}
                        >
                          {activity.emoji} {activity.label}
                          <span className="spot-choice-name">{place.name}</span>
                        </a>
                      </li>
                    )
                  })}
                </ul>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>
    </>
  )
}
