# Portland Live

A mobile-first weekly concert listing website for **Mississippi Studios**, **Revolution Hall**, **Crystal Ballroom**, and **Polaris Hall** in Portland, Oregon.

## Pages

- `#/` — Public weekly schedule with previous/next week, "This week", and venue filters.
- `#/venues` — Directory of venues.
- `#/venue/<venue-id>` — Venue information and upcoming show listings.
- `#/admin` — Browser-local show editor with add/edit/delete/import/export.

## Publish on GitHub Pages

1. Add the contents of this folder to the root of your GitHub repository (for example, `portland-live`).
2. In repository **Settings → Pages**, select **Deploy from a branch**, `main`, folder `/ (root)`, and save.
3. Open the URL that GitHub Pages shows after deployment.

All files are static; no build step or API key is required.

## Add and update shows

1. Open `#/admin` in a browser.
2. Enter date and venue, then optionally artist, start time (24-hour `HH:MM`), and ticket URL. Missing artist/time/ticket link is shown as **TBA**.
3. Click **Add show**. Edit or delete records as needed.
4. Click **Export JSON** to download `shows.json`.
5. Commit that exported JSON file to the **repository root**, overwriting the existing `shows.json`. GitHub Pages publishes the latest committed file.

**Important:** Editor changes are **local to the browser** until exported and committed. This is not a secure, centralized admin and it does not authenticate editors. Don't assume an event added locally is publicly visible. After committing, click **Reset to published data** in the editor to clear local overrides and verify the deployed schedule. Only verified concert data should be added.

Alternatively, edit `shows.json` directly in GitHub using this record shape:

```json
[
  {
    "id": "unique-event-id",
    "date": "2026-11-21",
    "artist": "",
    "time": "",
    "ticketUrl": "",
    "venueId": "mississippi-studios"
  }
]
```

**The above record is a schema example, NOT a verified show.** The shipped `shows.json` is empty rather than containing fabricated listings.

Venue IDs: `mississippi-studios`, `revolution-hall`, `crystal-ballroom`, `polaris-hall`.

## Maintenance notes

- All dates use the local Portland calendar. Date strings are `YYYY-MM-DD` and are not converted between time zones.
- Public visitors read the current published `shows.json` unless they have their own local editor overrides on the same browser.
- Ticket links are checked for HTTP(S) protocol before they are rendered.
- The venue directory and venue metadata live in `app.js` under `VENUES`.
- This version does not automatically scrape venue calendars or sync ticketing systems. Automating updates later would require approved venue data sources and a scheduled importer.
- For multi-editor publishing and authentication, use a backend CMS or Git-based CMS in a follow-on version.
