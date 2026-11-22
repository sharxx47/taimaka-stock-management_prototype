# Taimaka stock management prototype

A working prototype of a stock management app for Taimaka's outpatient (OTP) and inpatient (ITP) sites and central store in Gombe State, Nigeria. Built for Taimaka's Operations Associate test task (Task 1).

It runs entirely in the browser, with no server. The demo data is built from the sample files on every load, and what you enter is saved in this browser only (with a "Reset demo data" link on the sign-in screen).

## Open it

- Online: https://sharxx47.github.io/taimaka-stock-management_prototype/
- On your computer: from this folder, run `node tools/serve.mjs` and open http://localhost:8080. Any local web server that serves this folder works; opening `index.html` straight from the disk does not, because browsers block loading the data files that way.

Sign in with any test user and the test PIN shown on screen (1234): pick one of the five quick picks or find anyone with the search box (name, role or facility). The page then remembers who signed in on this browser and opens with "Welcome back". After 3 wrong PINs an account locks for 1 minute (the real app would use a longer time) and the person can ask logistics to unlock it. The demo clock starts at Friday 30 October 2026, 6:05 PM, the date of the Jigawan Iro bin card, and moves on with real time until the end of that day.

## A short walkthrough

1. **Muhammad S., Lead Triage Officer, Jigawan Iro OTP.** Home shows the summary, the three actions, "Needs attention", then every item in bin card order; tapping a summary pill shows only those items. Enter today's count (one line per item; RUTF as sealed cartons plus loose sachets) and submit it. Then request emergency stock for the 4 items that are out of stock, and receive shipment 1042 (the October monthly shipment, already on its way): each amount shows a tick when it matches what was sent, and batch and expiry, entered by logistics, only need checking.
2. **Hajara Nuhu, supervisor.** The Amoxicillin escalation ("3 differences in 11 days", from 20 to 30 October; more if Muhammad's new count also differs) and the RUTF correction of -180 sachets waiting for her: approve it or not.
3. **Nasiru Bello, logistics.** "Needs attention today" in three groups. Muhammad's request shows as "Approve request": set the amounts (there is no usage data for these items), approve, then send. Also: all 31 stores, suggested shipments, shipments in transit, recounts, receiving at the central store, the ODK usage upload (it shows the last upload, the expected format and a preview of what a file will change before Apply), and settings (including Users, where logistics can remove or restore a person's access).
4. **Muhammad S. again.** Receive the emergency shipment.
5. **Management.** Indicators for the month; each card opens the records behind its number (facility, supervisor, item, dates). Then RUTF across the network (months of stock, where the stock is, the central store against its target, facilities that need RUTF) and RUTF use by month, with the details of each month on hover or tap.
6. **Pharmacy Technician, GH Deba ITP.** The daily log: the app works out use from the counts.

On a phone, each screen has one compact header row (the initials button opens the name, role, sync status and Sign out) and one bottom bar with the tabs; for facility staff the bar also holds their three actions (Today, Count or Log, Receive, Emergency, History). The app can be added to the home screen and opens without signal once it has been loaded.

## Where the numbers come from

- `data/Facility list.csv`: the 31 stores, supervisors and linked ITPs.
- `data/ODK OTP usage Jan-Oct 2026.csv`: monthly use per OTP and item. Average monthly use is the average of August and September (October is a partial month).
- `data/ITP item list.csv`: ITP items and units.
- `data/Bin_card_example.jpeg`: the Jigawan Iro OTP bin card of 30 October 2026. Every Jigawan Iro count on that date in the app comes from this photo (26 rows, in the card's order; Amoxicillin susp 60ml was counted at 80 against 86 on the card).
- Everything else (other sites' stock, the central store, shipments, batches, ITP daily logs, the management figures for 1 to 29 October) is sample data. `BUILD-NOTES.md` lists every demo value and where it came from.

## Assumptions to confirm with Taimaka

Units:
- Ciprotap ear drop counted in bottles (the same form as Otomed drops); Tom Brown in packs.
- Items whose unit is in neither source show "units": Tabs ACT AL 2, Z AA (Toddler), Z AA (Infant), Z Sups. Cefixime, TB Bucket, BMS, Soap, Sponge.
- TB Bucket and the ODK item "Tom Brown container" are treated as the same item.

Stock types (logistics can change any of them in Settings):
- Tom Brown and BMS: therapeutic food.
- TB Bucket: medical and non-medical consumables.
- MUAC tape (a demo item held at the central store only): non-consumables.

## How it works

- `index.html`, `css/tm.css` (the design stylesheet, copied unchanged), `css/app.css` (layout additions, phone text sizes and the measured pill centering), `css/fonts.css` and `fonts/` (Atkinson Hyperlegible, bundled).
- `js/`: data loading, the master item list, the append-only ledger, stock rules (`stock.js`), alerts in the agreed order (`alerts.js`), actions with role checks and stamps (`actions.js`), browser storage (`storage.js`), the management indicators (`kpis.js`), the demo seed (`seed.js`).
- `js/ui/`: the screens, one module per area.
- `manifest.webmanifest` and `sw.js`: "Add to home screen" (name, icon made from the Taimaka logo, navy theme color) and a service worker that keeps the app's own files, network first, so the newest version shows when online and the app opens without signal.
- `tools/serve.mjs`: a small local web server for testing.
- `tools/check.mjs`: a logic check that compares the app's results with the agreed values (`node tools/check.mjs`; the last output is in `tools/check-output.md`).

## Not in the prototype

Real sign-in, the ODK API connection, reading bin card photos, sending data to a server (the prototype saves in the browser and only shows the online or offline state), voice entry, Hausa, practice mode, temperature loggers, and push or SMS notifications.
