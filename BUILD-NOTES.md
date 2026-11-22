# Build notes

Working notes for the Taimaka stock management prototype. If a session stops part way, start here.

## Summary (read this first)

**Build steps 1 to 8 are done and committed locally.** Step 9 (GitHub repository, Pages, final walkthrough on the live link) waits for you. Nothing was pushed or deployed.

### What works

Every screen in CLAUDE.md, for every role, at 375px, 768px and 1280px:
1. Test sign-in (all 41 test users, PIN 1234, wrong-PIN state, "Reset demo data" with a confirm step).
2. Facility home: summary pills, three actions, "Needs attention" in the agreed order (one combined Out of stock alert), item cards in bin card order with picture, quantity, "Lasts until", status and "Counted today". On a phone it switches to the phone layout: urgent-first list and the actions pinned at the bottom (stacked when a label would wrap past two lines).
3. Receive a shipment (per batch: cartons and loose sachets, batch, expiry, read-back, Short / Damaged / Extra with a note) and Request emergency stock (filled in from today's count; "No usage data for this item. Logistics will set the amount."; request status with the step tracker).
4. Daily count in compact rows: save as you go (per line, kept in the browser), live "Check" flags with Recount and Add a note, RUTF as sealed cartons plus loose with read-back, the "did you mean loose sachets?" check, blank rows allowed, review with "Store is cool, dry and locked today", submit. The same screen does the logistics recount, marked "Recount by logistics".
5. ITP pharmacy daily log: previous count, received today, today's count, "used" worked out, "We ran out of this today" (records a stock-out day and offers emergency stock).
6. Supervisor home: escalations ("sent to you (Hajara Nuhu)"), corrections waiting for approval (approve or not), facility cards with one structure, equal heights and buttons lined up.
7. Logistics: "Needs attention today" in three groups with counts, every alert with its button; all 31 stores with an item selector and stock-type filter; every item at a store; suggested shipments (approve, set amounts, send, with frozen targets and soonest-expiring batch); the November monthly round (propose, approve, send all); transfers; shipments in transit; record a recount; receive at central store; plan a supplier order; upload ODK usage (CSV) with errors for a wrong file.
8. Management overview: the six indicators, the central store decision banner, RUTF use by month (real ODK data, lean season shaded, October dashed).
9. Item history: every movement newest first with the balance after each line, notes, approvals; "Correct this entry" with the fixed reasons and second-person approval for large RUTF corrections.
10. Settings: facilities and "Add a facility" (creates a test user for it), items with stock type, lean-season multipliers with a reason, target overrides with a reason, change log.

Also: name and role in every header, the sync indicator naming the device type ("Saved on this laptop, will send when online" / "Sent. Last sync 6:07 PM"; offline shows the amber version), "Data as of" for management, loading, empty, saving, success and error states, and saved entries survive a reload (replayed on top of the demo data; 0 dropped in testing).

### How to open it locally

From the `prototype` folder:

```
node tools/serve.mjs
```

then open http://localhost:8080 (port 8080; pass another number as an argument if that one is busy). Opening `index.html` directly from the disk will not work: browsers block loading the CSV files that way, and the app says so. The logic check runs with `node tools/check.mjs`.

### Check table

`node tools/check.mjs` passes: **all values match** (full output in `tools/check-output.md`). All 26 Jigawan Iro rows match the agreed values (with Malaria RDT as "Above target", as you decided). The other agreed values:

| Check | Result |
|---|---|
| Zaune RUTF | 3,630 sachets (24 cartons + 30 loose), 13,750 a month, lasts until 7 Nov (8 days), Order now, estimated target 27,500, emergency top-up 23,870 sachets (159 cartons + 20 loose) |
| Kalshingi / Ashaka Gari RUTF | 3,900, 2.0 months, OK, estimated / 9,600, 1.7 months, OK |
| Network RUTF use a month | 188,205 sachets |
| Central store RUTF | 410,000 + 40,000 on order = 2.4 months, below the 3-month target of 564,615 |
| Kurjale | 1 item with too much (your decision), counted today 5:25 PM |
| Maikaho, Tumfure | Not counted today, last counted 29 Oct 5:15 PM and 5:20 PM |
| Jigawan Iro escalation | to Hajara Nuhu on 30 Oct, first flag 20 Oct, management on 19 Nov |
| Shipments 1042 / 1037 | 32 hours in Sent, 1,800 sachets (12 cartons) + 23 packs / 100 hours, overdue, 600 x 1000 ml + 100 vials |
| RUTF use by month | 48,677, 44,489 (your rounding), 72,249, 146,179, 140,694, 205,652, 211,573, 187,420, 188,990, 117,705 |
| GH Deba log (design) | F75 240 + 0 - 214 = 26 used; F100 410 + 120 - 468 = 62; Ceftriaxone 48 - 36 = 12; IV Artesunate 6 - 0 = 6 (Out of stock) |
| Will expire before use (design) | GH Bajoga F100 batch F1-2501, expires 30 Nov, about 210 x 1000 ml unused |
| Jigawan Iro RUTF history (design) | +600 (1029) = 4,660; -98 = 4,562; count 4,526 corrected to 4,562; -100 = 4,462; recount 4,432; -101 = 4,331; count 4,331; -180 waiting |
| Today's requests (design) | Zaune 1043, 23,870 sachets, target locked 5:10 PM; Jigawan Iro 1044, 4 items, sent 5:55 PM |
| Management (design) | 6 stock-out days (4 in Sept), 94% on time (846 of 900), accuracy 96.2%, 3 unexplained, 14% emergency (5 of 36), RUTF 3.7 months |
| Every status appears somewhere | yes |

Logistics "Needs attention today": Stock-out risk (4): Jigawan Iro out of stock (Approve request), GH Deba IV Artesunate out of stock, Zaune RUTF Order now (Send emergency shipment), shipment 1037 over 72 hours (Check shipment). Data checks (3): Jigawan Iro escalation (View history), Maikaho and Tumfure not counted (Send a reminder), RUTF correction waiting for Hajara Nuhu (Remind approver). Planning (3): central store RUTF low (Plan supplier order), GH Bajoga F100 will expire before use (Move to another facility), Jigawan Iro Otomed to Ashaka Gari (Plan transfer).

Browser checks (built-in browser, local server): every route for every role renders with no error; no sideways overflow at 375px or 768px; no text under 16px on phones; all 728 icons and pictures on the checked screens render; the bundled font loads and nothing is fetched from Google; pill and button text measured centered (0.00px difference at every size after the fix in decision 23); the Jigawan Iro walkthrough (count, flags, submit, receive 1042 with a damaged carton, emergency request, approval by Hajara Nuhu, correction, logistics approve and send, transfer, central receipt, ODK upload, reminders) works, and survives a reload.

### Decisions

All listed below under "Decisions I made while you were away" (1 to 18 from the seed step, 19 to 42 from the screens). The ones you may want to look at first: 3 (non-RUTF differences reach logistics only through escalation), 8 (Otomed transfer is 8 bottles, not 20), 9 and 10 (GH Deba), 12 (Jigawan Iro's emergency request is already sent), 16 (management figures), 19 (daily count is compact rows on phones too), 22 (only the latest count can be corrected) and 23 (pill centering).

### Cut

See "Cut or not built" below: the phone keypad count, management period tabs, editing an existing facility, adding extra batches when receiving, real reminders (they are recorded, not sent).

### Open questions for you

See "Open questions for Shahzeb" at the end.

## Where things stand

- Build steps 1 to 8: done (commits 48d019f, 22c2a37, 4d4a6f5, 175ed83, 8ad2970 and the final notes commit).
- Next: step 9 (create the public repository, turn on GitHub Pages, test the Jigawan Iro walkthrough on the live link). Nothing in the app needs a build step: publish the folder as it is.

## Decisions I made while you were away

(Each with the reason. Where two options were equally good, the note says so.)

1. **Logo.** `Assets/taimaka-logo.svg` is `design/taimaka-logo.svg` with the content-credentials `<metadata>` element and the `xmlns:c2pa` attribute removed, as design/README.md says. Its sha256 matches the canvas logo (98d2070e...c040). Windows does not tell `assets` from `Assets`, so the file sits in the existing `Assets` folder; the app uses that exact spelling, which matters on GitHub Pages.
2. **Font files.** Atkinson Hyperlegible regular and bold (Latin subset, woff2) were fetched once from Google Fonts' own file server (fonts.gstatic.com, the source the design uses) into `fonts/`: `atkinson-hyperlegible-400.woff2` (17,208 bytes) and `atkinson-hyperlegible-700.woff2` (17,524 bytes). The font is under the SIL Open Font License, which allows bundling. Nothing loads from Google at runtime.
3. **Non-RUTF count differences at logistics.** As you decided: they reach logistics through escalation only. So the design's "Count difference" alert for Amoxicillin on the logistics dashboard does not appear there; it shows on the facility home and in the escalation.
4. **Logistics recounts do not count towards escalation.** The design's RUTF history has a logistics recount on 29 Oct with a 30 sachet difference. Counting it as a facility flag would add RUTF to Jigawan Iro's escalation, but the design (supervisor home) says the escalation is about Amoxicillin only. A recount is the follow-up to a difference, so only the facility's own counts escalate.
5. **A count fixed with "Count correction" is judged on the corrected amount.** The design's 28 Oct RUTF count was typed as 4,526 and corrected to 4,562 ("typing mistake"). The corrected count matches what was expected, so it is not a flag. Other correction reasons (damaged, theft or loss and so on) are stock changes and do not change how the count is judged.
6. **"Not counted today" at logistics is one alert listing every facility**, as in the design ("Tumfure OTP and Maikaho OTP have not sent today's count"), with one "Send a reminder" button.
7. **Too much (transfer) alert stays in "Needs attention".** The design's Planning group shows 2 alerts and puts the Otomed transfer only under "Suggested shipments". CLAUDE.md's alert order lists "10. Too much (transfer suggestions)", so it shows as a third Planning alert, and also as a suggested shipment.
8. **Otomed transfer is 8 bottles, not the design's 20.** Ashaka Gari uses about 5.9 bottles a month, so its 2-month target is about 12 bottles. A transfer tops the receiver up to its target like every other shipment, so 20 bottles would leave Ashaka Gari above target. The rule wins.
9. **GH Deba ITP shows IV Artesunate 30mg as Out of stock in "Needs attention".** The design's ITP log shows it running out today ("We ran out of this today"), so the seed records that, and the logistics list then has 4 stock-out risk alerts instead of the design's 3.
10. **GH Deba daily use.** The design's GH Deba log ("used since yesterday": F75 26, F100 62, Ceftriaxone 12) is seeded exactly. If those were average days, F75, F100 and Ceftriaxone would last under 10 days (Order now). The seed treats 30 Oct as a busy day (average use about 10, 22 and 2.5 a day), so they show Running low and go in the next monthly shipment.
11. **GH Dukku's Order now from step 1 is gone.** F75 and Ceftriaxone at GH Dukku now have about 15 days of stock (Running low), with shipment 1037 (600 and 100) on the way, as the design's 3 stock-out alerts imply. Shipment 1037 is an emergency shipment (GH Dukku's October monthly was 1033).
12. **Jigawan Iro emergency request is already sent (5:55 PM by Muhammad S.)**, as the logistics design shows ("Approve request"). On Muhammad's screens the request shows as sent, with its step tracker. The empty request form can still be seen at GH Deba ITP (IV Artesunate is out of stock there).
13. **Zaune's emergency shipment was planned by logistics (Nasiru Bello) at 5:10 PM** ("target locked 30 Oct 5:10 PM" in the design), so the alert button is "Send emergency shipment" and the suggested shipment waits for approval.
14. **Daily use lines come from the ODK upload.** The design's item history shows "Daily use: -101 sachets, from ODK usage upload by Nasiru Bello, 30 Oct 9:10 AM". The seed records each day's use at 9:10 AM, stamped Nasiru Bello. The ODK file only has monthly totals; the daily split is sample data.
15. **Jigawan Iro counts.** Full counts on 20, 26, 28, 29 and 30 Oct (no count on 27 Oct, so the history goes from the delivery straight to 28 Oct, as in the design). TB Bucket was counted on 29 Oct 5:20 PM (design: "Last counted 29 Oct 5:20 PM") and left blank today. The 29 Oct 5:20 PM count adds one line to the RUTF history that the design does not show.
16. **Management indicators.** The decisions log (C11) lists them as purely hypothetical. The app keeps a small table of 1 to 29 October values (`MONTH_BASELINE` in `js/seed.js`) and adds today's part live from the data, so the figures move when people submit counts or request stock. With the seed they come out at the design's figures.
17. **Central-store-only item: MUAC tape.** It is in the design's Settings items table and listed as a demo item in the decisions log (C11). It is held at the central store only, so it is not added to any bin card, and it gives "Non-consumables" an example.
18. **Lean-season multipliers.** Seeded as the design shows (May 1.2, June 1.3, July 1.5 after the logged change from 1.3 on 30 Oct 3:12 PM, August 1.5, September 1.3, other months 1.0). They do not change today's numbers: AMC uses October and shipments are for November, both 1.0.
19. **Daily count is compact rows on phones too.** CLAUDE.md sets compact rows for the daily count; the design's phone count (one item per screen with a number keypad) is not built. At 375px the rows reflow as in the comparison artboard.
20. **The ITP log also uses compact rows**, not the design's cards: an ITP holds 60 items, so cards would mean very long scrolling (the reason compact rows won for the daily count). The "used" read-back and "We ran out of this today" appear on a row once a number is typed.
21. **ITP items keep the ITP item list order and full names** ("Ceftriaxone 1g (Tandak/Syceph)", "IV Artesunate 30mg (Rekmal)"), one name per item, rather than the design's shortened names and F75-first order. There is no ITP bin card to follow.
22. **Only the latest count (and receipts) can be corrected.** A correction is a new ledger line dated now; correcting an older count would change today's stock even though later counts already replaced it.
23. **Pill and button text centering.** CLAUDE.md asks for the gap above the capitals to equal the gap below within 0.5px. Measured in Chromium with the bundled font, the large "Needs attention" and summary pills, the small pills and the large buttons were 0.7 to 1px off with the design's offsets, so `css/app.css` sets the offset (`--ty`) for those sizes (and the large button's padding now uses it). Now 0.00px at every size checked, with the icon still centered.
24. **An approved correction counts from when it was entered**, not from when it was approved, so a count made in between is not corrected twice.
25. **Headers.** Logistics has the navigation and no facility box (as the design). Supervisors show "Your facilities" and management "Network overview" in the box (CLAUDE.md). Every header has a "Sign out" button (the design shows none, but testers switch users). The phone header keeps the Taimaka logo (CLAUDE.md header rule), which the phone design left out.
26. **16px minimum on phones.** The design stylesheet's phone rules (`.phone ...` in tm.css) are applied to the real app on screens up to 640px wide, plus section labels and step numbers, which were 14px.
27. **Phone home** does not repeat the "Check" banners: the urgent-first list right below shows each Check.
28. **"Unexplained adjustments" shows as "Unexplained differences"**: count differences this month with no note and no correction. The design's definition (corrections marked "Other" with no note) cannot happen, because CLAUDE.md makes "Other" require text.
29. **Supervisor facility cards**: pills show the problems (or "All OK"), and the one detail line is "RUTF lasts until ... · N differences this month" on every card, so the cards share one structure.
30. **Reminders, "Remind approver" and "Ask logistics to recount"** are saved as notes with the person's name and time, and the message says a real app would send an SMS or notification (out of scope).
31. **Count difference wording.** "The bin card said 86" for the seeded Jigawan Iro count (it is the card's own count, as in the design); "we expected" for counts entered in the app.
32. **"Plan supplier order"** (the design's button on the central store alert) records a supplier order, which counts as stock on order. "Receive at central store" also asks for the supplier, which CLAUDE.md requires but the design form leaves out.
33. **"All stores" order**: central store first, then urgent-first by the chosen item's status, then stores that do not hold it; the first 9 show, with "Show more". The design's order looked hand-picked.
34. **Escalation wording** gives the real span ("3 differences in 11 days"), not the rule's 14 days.
35. **Network RUTF** on the management screen shows held, in transit and on order separately (661,461 + 1,800 + 40,000); the design's sentence left out the 1,800 in transit. Months are the same (3.7).
36. **Management period tabs** ("This month / Last 3 months / Year") are replaced by one "This month" label: only the month is built.
37. **"Sent" without a server.** When online, an entry shows "Sent. Last sync [time]" 1.5 seconds after it is saved; offline, it waits and the indicator turns amber. Count lines saved but not submitted show "Saved on this [device], will send when online", as in the design.
38. **Signing in survives a reload** (the test session is kept in browser storage with the demo data).
39. **A test hook** (`window.taimakaTest`) lets the browser checks switch users without the sign-in screen. It only touches this browser's demo data. Remove it if you prefer (one block in `js/ui/main.js`).
40. **The monthly round** leaves out facilities that have not counted today (Maikaho, Tumfure), as the design's card says ("2 waiting for today's count").
41. **New facilities** get a test user on the sign-in screen and appear on their supervisor's home.
42. **Lean season shading** on the chart is June to September, as the design's legend says, not worked out from the multipliers.

## Demo values (not from the task files)

All in `js/seed.js`. From the design files:
- Count and log times: Jigawan Iro 5:40 PM (lines from 5:33 PM), Kurjale 5:25 PM, Zaune 4:55 PM, Kalshingi 5:02 PM, Ashaka Gari 5:31 PM, Maikaho last counted 29 Oct 5:15 PM, Tumfure 29 Oct 5:20 PM, GH Bajoga 4:30 PM, GH Deba 4:20 PM (lines from 4:12 PM), GH Dukku 3:58 PM, central store opening 8:00 AM, ODK upload 9:10 AM by Nasiru Bello.
- Shipment 1042: requested 27 Oct 9:00 AM and approved 28 Oct 9:30 AM by Nasiru Bello, sent 29 Oct 10:15 AM by Abubakar Waziri; RUTF batches RU-2604 (31 Mar 2027, 1,200) and RU-2611 (30 Jun 2027, 600); Tom Brown batch TB-0925 (15 Jan 2027, 23 packs).
- Shipment 1029: RUTF 600 (RU-2604), sent by Nasiru Bello 26 Oct 2:00 PM, received by Muhammad S. 27 Oct 10:05 AM.
- Jigawan Iro RUTF history: daily use 98, 100 and 101 on 28 to 30 Oct; 28 Oct count typed 4,526 and corrected to 4,562 at 5:50 PM ("Typing mistake"); logistics recount 29 Oct 11:30 AM, 4,432 against 4,462 expected, reason Count correction.
- The -180 RUTF correction waiting for Hajara Nuhu (your decision).
- Central store RUTF batches RU-2604 (150,000, 31 Mar 2027) and RU-2611 (260,000, 30 Jun 2027).
- GH Deba log on 29 and 30 Oct (F75 240 to 214, F100 410 + 120 to 468, Ceftriaxone 48 to 36, IV Artesunate 6 to 0, Normal saline 75 to 68: the design leaves 68 blank, so 68 is mine).
- GH Bajoga F100 batch F1-2501 expiring 30 Nov, with about 210 x 1000 ml left unused at expiry.
- Settings: lean-season multipliers and change log (July change 30 Oct 3:12 PM; Kalshingi added 12 Aug 10:40 AM).

Mine (the design does not give them):
- Shipment 1029 request 26 Oct 8:30 AM by Muhammad S. and approval 9:00 AM; type emergency.
- Shipment 1037: requested 24 Oct 3:40 PM by the GH Dukku pharmacy technician, approved 25 Oct 9:00 AM by Nasiru Bello, sent by Abubakar Waziri; batches F7-2609 (28 Feb 2027) and CE-2610 (30 Sep 2027).
- Shipment 1039, emergency, GH Deba ITP, F100 120 x 1000 ml (the design's "received today 120"): requested 28 Oct 3:00 PM, approved 29 Oct 9:00 AM, sent 29 Oct 1:00 PM, received 30 Oct 10:30 AM, batch F1-2610 (30 Apr 2027).
- Shipment numbers 1043 (Zaune emergency) and 1044 (Jigawan Iro request).
- The note on today's Amoxicillin difference: "Counted twice: 80 bottles on the shelf."
- TB Bucket at Jigawan Iro on 29 Oct: 6 units.
- Supplier order of 40,000 sachets: "Supplier order (demo)", ordered 15 Oct, due 20 Nov.
- Management values for 1 to 29 October (`MONTH_BASELINE`).
- Everything step 1 already listed (opening balances, other OTP stock, ITP use rates, batch numbers).

## Cut or not built

- The phone count with one item per screen and a number keypad (CLAUDE.md chose compact rows).
- Management "Last 3 months" and "Year" views (only this month).
- Editing an existing facility in Settings (adding works; the design's "Edit" buttons are left out).
- Adding a batch that was not on the sent list when receiving (a different amount per sent batch, with a reason, works).
- Correcting counts other than the latest one (decision 22).
- Sending reminders or notifications for real (recorded only; out of scope).
- A network-wide audit log: "History" in the logistics menu opens one item's history at a time, with a store and item picker.
- Speed tuning: the app rebuilds the demo data on every load (about 0.3 seconds of work; about 3 seconds to the first screen on the local server with caching off).

## Open questions for Shahzeb

1. **Jigawan Iro's emergency request is already sent at 5:55 PM** (as the logistics design shows). So a tester signed in as Muhammad S. sees the request status, not the empty form (the form shows at GH Deba ITP). Would you rather leave it unsent, so the walkthrough starts with Muhammad sending it? It is one block in `js/seed.js` ("Jigawan Iro: emergency request").
2. **Otomed transfer**: keep 8 bottles (the top-up rule) or force the design's 20?
3. **GH Deba's IV Artesunate stock-out** (from the ITP log design) makes 4 stock-out alerts instead of the design's 3. Keep it?
4. **Logistics recounts and escalation**: I left recounts out of the facility's escalation count (decision 4). Agree?
5. **Management figures for 1 to 29 October** are fixed demo values plus live figures for today (decision 16). A line under the indicators says so. Enough?
6. **Facility staff do not see their own escalation** on the facility home (the design does not show it; they see each Check). Should they?
7. The task PDF's file name quoted in CLAUDE.md contains an en dash. It is the real file name, so I left it.
