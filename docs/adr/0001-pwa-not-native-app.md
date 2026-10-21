# The client is a PWA, not a native app

The app must work on smartphones (input on the move) and on laptops. We build one React PWA
instead of a native app (React Native/Expo, Flutter, Kotlin Multiplatform). Reasons: one code base
and one map library for phone and laptop; the whole team knows React from the course; it deploys
like a website, which keeps Docker and CI/CD simple. Compose for the web was Beta and its map
library did not support the web well (checked 2026-10-07).

## Consequences

- Push, location and camera need HTTPS, so HTTPS is a must, not a bonus.
- The web cannot track location in the background, so radius Notifications use the Home area
  (ADR-0003).
- On iPhone, push works only after the user adds the PWA to the home screen.
- David plans a separate native Android app after the project. The backend must therefore be a
  clean, documented API that a second client can use.

## Update 2026-10-21

David left the project on 2026-10-08 (`SCRUM-46`), so nobody plans the Android app now. The
decision stays: the API is still a clean, documented API (`/docs`).
