# Presentation (SCRUM-164)

The final presentation on **Mon 26.10.2026**: 15–20 min with a live demo. A Google Apps Script
builds the deck in Google Slides.

| File | What it is |
|------|------------|
| [squadmeet-slides.gs](squadmeet-slides.gs) | The script. It builds 13 slides in German, with speaker notes on each slide. |
| [squadmeet-titel-hintergrund.jpg](squadmeet-titel-hintergrund.jpg) | The title slide background: the live map with a white center (1920×1080). |

## Build the deck

1. Upload `squadmeet-titel-hintergrund.jpg` to Google Drive.
2. Copy its file ID from the share link (`https://drive.google.com/file/d/<FILE-ID>/view`) and
   put it into `MAP_FILE_ID` at the top of the script.
3. Open https://script.google.com, make a new project, paste the script and save.
4. Choose the function `buildDeck`, run it, and allow the access Google asks for.
5. The execution log shows the link to the new deck. Share it with the team.

**Run it only once.** Each run makes a new deck. After the team starts to edit in Google Slides,
a new run does not have their changes.

## The look

Two design drafts were chosen on 22.10.:

- **Title slide:** the map from the app in the background, with a white center for the text.
- **All other slides:** the "sport poster" look: Barlow Condensed in upper case, slanted labels
  in the five sport colors from `frontend/src/places/activities.ts`.

The map image shows OpenStreetMap data. Keep the credit line "Karte: © OpenStreetMap-Mitwirkende"
on every slide that shows the map.

## Before the talk

- Fill in the placeholders in the demo notes: `[KONTO A]`, `[KONTO B]`, `[PLATZ]`,
  `[PFAD ZUM VIDEO]`.
- The problem text is a draft. Stefan adjusts it.
- The Lessons Learned are proposals from `HANDOFF.md`. The team checks them.
- Check the numbers on the slides: 900+ pytest tests, 270+ Vitest tests, 20+ tickets from the
  test run.
- Check in the demo: does the Host see a Join without a reload?

## Make the background again

The image comes from a screenshot of the live map. The app controls were cropped away (search,
filters, account bar, "Platz vorschlagen"). Then ImageMagick lightened the map by 15 % and added
the white center:

```sh
D="hypot((i-w/2)/(w/2*1.4142),(j-h/2)/(h/2*1.4142))"
magick map-clean.jpg -resize 1920x1080^ -gravity center -extent 1920x1080 \
  -fill white -colorize 15% \
  \( -size 1920x1080 xc:white -alpha set -channel A \
     -fx "$D<=0.40?0.96:($D>=0.78?0:0.96*(1-($D-0.40)/0.38))" +channel \) \
  -composite -quality 85 squadmeet-titel-hintergrund.jpg
```
