# Taimaka stock management prototype: build rules

This file is read by Claude Code at the start of every session. It carries the decisions made during planning. Follow it unless Shahzeb (the user) says otherwise in the session.

## What this is

A prototype for Taimaka's Operations Associate test task (Task 1). Taimaka treats children with severe acute malnutrition in Gombe State, Nigeria. The task brief is `../Operations Associate – Test Task FINAL.pdf`. Sample data is in `../Test Task Files/`.

- Time box: the whole test is 4 hours maximum, including design. Build the most important things first and keep a list of what was cut.
- The visual design comes from a Claude Design artifact (Shahzeb will paste its link). Copy its style guide values (colors, fonts, sizes, spacing, radius) exactly. Never retype or approximate them.
- Deliverable: a public link. Host on GitHub Pages from a public GitHub repository (Shahzeb has a GitHub account). The link is shared only with Taimaka's hiring team.

## Hard rules

- Never modify or delete anything in `../Test Task Files/` or the PDF. Copies of all four sample files are already in `data/` inside this folder; work from those copies.
- `data/Bin_card_example.jpeg` stays in the repository as the source of the Jigawan Iro seed values; reference it in the README so anyone can trace where those numbers came from. Shahzeb has confirmed the sample files can be in the public repository.
- Before building, check that git and GitHub access work on this computer (e.g. `git --version`, `gh auth status`). If not, tell Shahzeb what to set up before going further.
- Prefer a simple stack that deploys as plain files to GitHub Pages. If a build tool is used, confirm Node is installed first.
- American spelling. No em dashes or en dashes anywhere in the UI, code comments or docs. Use a plain hyphen with spaces for ranges.
- No AI attribution anywhere: no "Co-Authored-By" lines or any other Claude or AI attribution in commit messages, files, code comments or docs.
- The files in `design/` stay byte-identical to the canvas. Git must never change their line endings (`design/** -text` in `.gitattributes`).
- No backend. The app runs entirely in the browser. Data lives in the browser (localStorage), seeded from the CSV copies, with a "Reset demo data" button. Wrap storage access in try/catch.
- One responsive web app: laptop-first, and every screen must reflow to a single column on a phone (check at 375px, 768px, 1280px).

## UI rules (from the design brief)

- Usable on day one with no training. Each role sees only what it needs; facility staff get at most three actions.
- The system does the maths: facility staff see "Lasts until [date] ([N] days)"; logistics and management also see months of stock.
- Exceptions first. Every alert shows its next action as a button. Alert order is set in "Alert order" below.
- Where the Claude Design files and this file differ, this file wins. The final design files are in `design/` (see `design/README.md`).
- Status is color + icon + word, never color alone.
- Every number carries its unit and thousands separators, and shows when it was last updated ("Counted today 5:40 PM").
- RUTF quantities of 150 sachets or more show the sachet total, then whole cartons and loose sachets: "23,870 sachets (159 cartons + 20 loose)". An exact number of cartons reads "1,800 sachets (12 cartons)". Under 150, sachets only ("131 sachets"). This applies everywhere RUTF appears (shipments, emergency requests, receiving, item cards, logistics table, item history). It is display only: all calculations stay in exact sachets.
- Product picture or icon on every item card; item order matches the paper bin card.
- WCAG AA contrast, body text at least 16px on phones, tap targets at least 48px, plain words.
- Design the empty, loading, saving, offline, success and error states.
- The signed-in user's name and role always show in the header.
- The sync indicator names the device type the app detects (phone, tablet or laptop): "Saved on this [device], will send when online" while entries are waiting to send, and "Sent. Last sync [time]" when everything has been sent. The sync indicator appears only on screens where staff enter data; view-only screens (management) show "Data as of [time]".
- Header: the Taimaka logo from `Assets/Taimaka_white.svg` (the navy logo on white, despite the file name; trim its empty margins, never redraw or recolor it), a thin divider, then "Stock Management". The facility sits in its own tinted box with the store icon, the facility name in bold and the site type below ("Outpatient site" or "Inpatient site"). Roles without one facility keep their label in the same box.
- Names and roles display in capitals wherever they identify the signed-in user or a person to pick (laptop and phone headers, sign-in cards) ("MUHAMMAD S.", "LEAD TRIAGE OFFICER") through CSS text-transform; the stored text stays in normal case. Entry stamps and history ("by Muhammad S.") stay in normal case.
- Font: Atkinson Hyperlegible (designed by the Braille Institute for readers with low vision; every digit is unmistakable). Bundle the font files with the app; do not load them from Google Fonts at runtime. Every number uses tabular figures (font-variant-numeric: tabular-nums) so columns line up.
- Icons: every icon must render. SVG data URIs in CSS use single quotes outside, url('data:image/svg+xml,...'), because the SVG markup contains double quotes. Check that every icon shows on every screen.
- Pills and buttons: with the real font loaded, the icon and word are centered left to right, and the gap above the capital letters equals the gap below within 0.5px, at every size. Check this in a browser.

## Users and roles (test sign-in)

There is a test sign-in screen: pick a user, enter the test PIN shown on screen (e.g. 1234). Each role sees only its own screens. Every entry is stamped with the user's name, role and time. Show the user's name in the header (this is a deliberate verification feature).

- Lead Triage Officer, per OTP (e.g. "Muhammad S., Lead Triage Officer, Jigawan Iro"; the name is from the bin card's staff name field, shortened because the surname is hard to read; other OTPs use the role and facility only): own facility only. Three actions: Enter today's count, Receive a shipment, Request emergency stock.
- Pharmacy Technician, per ITP (GH Bajoga, GH Deba, GH Dukku): own ITP only. Same home as a facility, with three actions: Enter today's log (stock and stock-outs), Receive a shipment, Request emergency stock.
- Supervisors, by real name from `Facility list.csv` (Usman Abubakar, Hilary Chukusa, Emmanuel Garba, Safiyanu Habibu, Shuaibu Abubakar, Ambi Mamman Jacob, Hajara Nuhu; Timothy Meller for the 3 ITPs): view their facilities, approve corrections, receive escalations.
- Logistics: Nasiru Bello (Logistics Program Officer) and Abubakar Waziri (Logistics Assistant), names from Taimaka's public team page. See everything, plan and send shipments, record recounts, settings.
- Management: read-only overview and reports.
- The central store has no supervisor in `Facility list.csv`; show "n/a, run by logistics".

In production, logins are individual from day one (no shared accounts). The prototype's test sign-in demonstrates the role model.

## Data facts (verified from the files)

- 31 stores: 1 central store (Gombe), 27 OTPs, 3 ITPs. Each OTP is linked to an ITP and has a named supervisor.
- `ODK OTP usage Jan-Oct 2026.csv`: monthly totals per OTP site per item (19 items), Jan to Oct 2026. Site ids are snake_case (`jigawan_iro`); map them to facility labels.
- October is a partial month: every site and item has October = 62.3% of September (about 19 days). Rule: compute usage from the most recent complete months only. For this data, average August and September.
- 14 of 27 OTPs started during 2026 (6 in August: Barambu, Daban Fulani, Dukul, Jamari, Kalshingi, Zaune). Rule: a site with fewer than 3 complete months of data shows an "Estimated target" badge.
- ODK values have decimals (compilation artifacts). Round them for display. Counts show exactly as recorded (Zinc sulfate 28.5 on the bin card shows as 28.5).
- Units come from `ITP item list.csv` or the ODK item name. Ciprotap ear drop is in bottles (same form as Otomed drops); Tom Brown is in packs (assumption). Items whose unit is in neither source (Tabs ACT AL 2, Z AA (Toddler), Z AA (Infant), Z Sups. Cefixime, TB Bucket, BMS, Soap, Sponge) show "units" until Taimaka confirms.
- RUTF units are sachets; 1 carton = 150 sachets.
- `ITP item list.csv`: ITP therapeutic food and medication with units. There is no ITP usage data. As the task says, ITP usage comes only from the stock record, so calculate it from the daily log: used = previous count + received - today's count. Seed past ITP daily logs from 1 July 2026 to 30 October 2026 with plausible sample values (and say so). That gives three complete months, so ITP average monthly use comes from August and September, the same as OTPs.
- No opening balances, central store stock, shipment history or expiry dates are provided. Seed them with sample values (deterministic) so every status appears somewhere. Jigawan Iro OTP is seeded from the bin card (counted 30 Oct 2026).
- The prototype's "today" is 30 October 2026 (the bin card date). With Aug and Sep usage this gives, for Jigawan Iro: RUTF 1.43 months, lasts until 12 Dec (OK, but below the 2-month target); Tom Brown 20 days, lasts until 19 Nov (Running low); Amoxicillin 60ml lasts until 23 Dec (OK, flagged difference); Malaria RDT about 2 months (OK); Otomed about 21 months (Too much); Ciprotap, Multivite, ACT AL 2 and Sponge at 0 (Out of stock). Use these as a check that the logic is right. "Order now" examples come from seeded data at other facilities, including Zaune OTP with RUTF seeded at 3,630 sachets (24 sealed cartons + 30 loose). That value is worked out, not arbitrary: at Zaune's real August and September use (about 13,750 sachets a month, the busiest site), 3,630 sachets lasts exactly 8 days (until 7 Nov), the Order now case in the design brief. Its emergency top-up to the estimated 2-month target (27,500) is 23,870 sachets.

### Jigawan Iro bin card values (seed these)

20% Zinc oxide cream 56; ACT tablets AL 1 76; Amoxicillin susp 100ml 82; Amoxicillin susp 60ml 80 (bin card said 86: a flagged difference); Ciprotap ear drop 0; Loratadine 60; Malaria RDT 132; Multivite syrup (Fe/FA) 0; Nystatin suspension 26; ORS 96; Paracetamol syrup 58; RUTF 4,331 sachets (28 sealed cartons + 131 loose); Tabs ACT AL 2 0; Tabs Albendazole 400mg 69; Tetracycline ointment 19; Tom Brown 11; Z AA (Toddler) 13; Z Otomed 29; Zinc sulfate 28.5; Z Sups. Cefixime 25; Z AA (Infant) 14; TB Bucket (blank on the card: not counted); BMS 11; Benzyl benzoate 33; Soap 38; Sponge 0. That is 26 rows, in this order (the bin card order).

### Master item list (one name per item, with aliases)

Display names are the names written on the Jigawan Iro bin card, so staff see the same words as on their paper card (and a future bin card photo reader matches them). Spelling is corrected in two cases, and the card's spelling is kept as an alias: three clear misspellings (Todler, Cefexime, Spong), and Zinc Sulphate, which becomes Zinc sulfate, the spelling Taimaka's own ODK file and ITP item list use (and American spelling). No display name has a spelling mistake, and each item has one spelling everywhere. Every other spelling (ODK file, ITP item list) is an alias. Display names, in bin card order (aliases in brackets):
1. 20% Zinc oxide cream (ODK: Zinc oxide)
2. ACT tablets AL 1 (ODK: ACT AL)
3. Amoxicillin susp 100ml (ODK: Amoxicillin 100 ml bottles)
4. Amoxicillin susp 60ml (ODK: Amoxicillin 60 ml bottles)
5. Ciprotap ear drop
6. Loratadine (ODK: Loratadine)
7. Malaria RDT (ODK: Malaria RDT kits)
8. Multivite syrup (Fe/FA)
9. Nystatin suspension (ODK: Nystatin)
10. ORS (ODK: ORS)
11. Paracetamol syrup (ODK: Paracetamol)
12. RUTF (ODK: RUTF)
13. Tabs ACT AL 2
14. Tabs Albendazole 400mg (ODK: Albendazole)
15. Tetracycline ointment (ODK: Tetracycline)
16. Tom Brown (card: TOM BROWN; ODK: Tom Brown)
17. Z AA (Toddler) (card: Z AA (Todler); ODK: ACT AA toddler)
18. Z Otomed (ODK: Otomed)
19. Zinc sulfate (card: Zinc Sulphate; ITP list: Zinc sulfate 20mg tablets)
20. Z Sups. Cefixime (card: Z Sups. Cefexime; ODK: Cefixime)
21. Z AA (Infant) (ODK: ACT AA infant)
22. TB Bucket (ODK: Tom Brown container; assumed to be the same item, to confirm with Taimaka)
23. BMS
24. Benzyl benzoate
25. Soap
26. Sponge (card: Spong)
Items on the bin card with no ODK usage (Ciprotap ear drop, Multivite syrup (Fe/FA), Tabs ACT AL 2, Benzyl benzoate, Soap, Sponge, BMS) are tracked on hand only. TB Bucket is tracked through its ODK alias; it is blank on the card, so at Jigawan Iro it shows "Not counted today".

Every item has one of the task's four stock types: therapeutic food, medication, medical and non-medical consumables, non-consumables. Logistics can change an item's type in Settings. Types for unclear items (e.g. BMS, TB Bucket) are assumptions; list them in the README.

## Stock logic (rules, not today's values)

- Ledger, append-only: expected stock = opening + received - used +/- approved adjustments. Counts are observations compared to expected. Nothing is ever overwritten.
- Average monthly consumption (AMC) = average of the most recent complete months (Aug and Sep for this data), multiplied by an editable lean-season multiplier for the month being shipped for (Settings; default 1.0).
- Days of stock = stock on hand / (AMC / 30.4), rounded down to whole days. Show facility staff "Lasts until [date] ([N] days)". Show logistics and management months of stock too.
- Model: forced-ordering max-min. Facility target (max) = 2 months of AMC. Central store target = 3 months of network AMC (and show months of stock including stock on order).
- Monthly shipment quantity = target - stock on hand - stock in transit (never negative). Freeze each monthly shipment's target once proposed.
- Emergency shipments also top up to target.
- Shipment quantities are exact (RUTF in sachets) and are not rounded to whole cartons.
- An item with no ODK usage data has no AMC, so the app cannot work out a top-up. Its emergency request says "No usage data for this item. Logistics will set the amount." and logistics enters the quantity.
- The central store receives stock from suppliers through "Receive at central store" (quantity, batch, expiry, supplier). When the central store falls below its 3-month target (counting stock on order), it appears in "Needs attention today".
- Logistics can override a target or the lean-season multiplier. Every override is logged with who, when and why, and the item shows a plain explanation (e.g. "Target raised: lean-season multiplier 1.5 for July").

### Statuses (color + icon + word, never color alone)

- OK: 1 month or more left
- Running low: less than 1 month (goes in the next monthly shipment)
- Order now: runs out within 10 days (emergency)
- Out of stock: zero
- Too much: more than 4 months (redistribute or skip next shipment)
- Not counted today: grey; never show yesterday's status as current
- Logistics view only: "Above target" (2 to 4 months, no action) and "Estimated target" badge
- Precedence when more than one applies: Out of stock, then Order now, then Running low, then Too much, then OK.
- Urgent-first order (phone home and any list sorted by urgency): Out of stock, Order now, Check (count difference), Running low, Not counted today, Too much, OK, Usage not tracked.
- An item tracked in ODK with zero recent use and stock on hand counts as Too much. An item not tracked in ODK at all shows "Usage not tracked" (on hand only, no status).

### Layout fixes on top of the design (agreed after the final design round)

- Out of stock alerts: when one facility has more than one item out of stock, show one alert listing all of them with one "Request emergency stock" button, on laptop as on phone (the phone home already does this).
- Button labels never wrap past two lines. On phones, if the bottom actions would wrap further, stack them full width, one per row.
- Pill sizes on laptop: every pill inside an alert, on every screen (logistics "Needs attention", facility home alerts, the supervisor's escalations and approvals), uses one size, the large "Needs attention" size. The facility home summary pills stay large too. Status pills that are not alerts (the "All stores" table, item cards, facility cards, history) keep the normal size, so tables and cards stay compact. Phone screens keep their current pill sizes.
- Supervisor home, "Your facilities": every card has the same structure (name and last count, status pills, one detail line, then the button). Cards in a row are the same height, and each card's button is full width and pinned to the bottom, so the buttons line up across the row whatever the content above them.
- When text refers to the person who is signed in, it says "you" with their name in brackets. Example, on Hajara Nuhu's supervisor home: "sent to you (Hajara Nuhu) on 30 Oct", not "sent to supervisor Hajara Nuhu". Other people's screens keep the name as it is.

### Alert order (all screens)

Alerts are ranked by how soon a child could go without treatment, then by how much they affect trust in the numbers, then planning:
- Stock-out risk: 1. Out of stock. 2. Order now. 3. Shipment overdue (in Sent for over 72 hours).
- Data checks: 4. Escalation. 5. Count difference. 6. Store problem (the daily storage check was not confirmed). 7. Not counted today (including counts submitted with blank rows). 8. Approval waiting.
- Planning: 9. Central store below target. 10. Will expire before use. 11. Too much (transfer suggestions).
- Within one type: therapeutic food first, then medication, then consumables, then non-consumables (the task's order of stock types); then the most urgent (fewest days left, or the oldest alert); then bin card order.
- Logistics dashboard: "Needs attention today" groups alerts under the three headings, each with its count ("Stock-out risk (3)"). Groups with no alerts are hidden. Other screens (facility home, supervisor home) use the same order without headings.
- Pills in "Needs attention" use the summary pill size. In alert text, bold only the item name, the key number, the date and the person responsible.
- Every button has an icon.
- Items with the same status follow bin card order.

### Count differences

- Define a count cut-off: expected stock uses only transactions timestamped before the count.
- RUTF: any difference shows "Check". A difference of at least 1 carton (150 sachets) or 3 days of that site's own use, whichever is smaller, alerts logistics the same day.
- Other items: flag when the difference is more than 5% or 2 days of use, whichever is larger.
- Surpluses (more counted than expected) are flagged too.
- Escalation with a grace period: first to the facility; 3 flags in 14 days goes to the named supervisor; still happening 30 days after the first flag goes to management.
- Every alert has its next action as a button.

### Corrections

- "Correct this entry" with a reason from a fixed list: damaged, expired, theft or loss, count correction, transfer, returned by caregiver, other (with text). The original stays visible.
- A negative RUTF correction at or above the alert level needs approval by a second named person (supervisor or logistics) before it applies.

### Shipments

- Shipments can go from the central store to a facility, or between facilities (for example moving "Too much" stock to a site that needs it). Both ends update: stock leaves the sender when Sent and arrives at the receiver when Received; in between it shows as in transit.
- Step tracker: Requested, Approved, Sent, Received.
- The Sent quantity locks once dispatched. Only the receiving facility marks Received, entering quantity, batch and expiry per batch, with a reason for any short, damaged or extra items.
- A shipment in Sent for more than 72 hours raises an alert.
- Suggest the soonest-expiring batch first when issuing.
- Expiry flag: if a batch's expiry date falls before the date the stock would be used up ("Lasts until"), show "Will expire before use" with the action "Move to another facility".

### Daily count

- Save as you go (each line timestamped), then review and "Submit today's count".
- RUTF counted as "Sealed cartons" (150 each) and "Loose sachets" (opened cartons count as loose), with read-back: "12 sealed cartons + 37 loose = 1,837 sachets".
- Review step has one checkbox: "Store is cool, dry and locked today". It starts unticked, so staff confirm it each day rather than passing a box that is already ticked. If it is still unticked when they submit, the review asks what is wrong: "Not cool", "Not dry", "Not locked" (tick at least one), with an optional note. The count still submits, because the stock numbers are still needed. This raises a "Store problem" alert (Data checks, after Count difference) on the facility home, on its supervisor's home and in logistics "Needs attention today", naming what was wrong, who reported it and when. It clears at the next submitted count where the box is ticked. Its button uses an action the role already has (for example "Add a note"). Reason: RUTF must be stored below 30°C (UNICEF specification), and an unlocked store is a theft risk; this checkbox is the low-tech stand-in for temperature loggers, which are out of scope. The same applies to the ITP daily log.
- A row can be left blank (e.g. TB Bucket), because staff fill the count in through the day and some items cannot always be counted. The count can still be submitted. If any rows are blank when staff press Submit, the review asks once: "[N] items are blank: [names, or the number if more than 3]. They will show "Not counted today". Keep counting, or submit anyway?" (shown in the page, never a browser pop-up). Blank items show "Not counted today" on the facility's own screens, and they also reach the supervisor and logistics: the "Not counted today" alert names facilities whose submitted count left items blank (for example "Jigawan Iro left 1 item blank: TB Bucket"), and the supervisor's facility card says how many items were not counted. Reason: a count of 1 item out of 26 must not look complete to the people who check (the "Complete" principle of ALCOA, decisions log E3). Blank rows look different until a number is entered: the row uses the stylesheet's "no data" grey (`--nc-bg` fill, `--nc-bd` border, `--nc-fg` text, the same grey as "Not counted today") with a small "Not counted yet" label; once a number is saved the row returns to normal with its saved stamp. Grey, not red or amber, because a blank row is not an error, only still to do, so the list reads as a to-do list that clears as staff count. The review never lists more than 3 blank items by name: it shows the number ("58 left blank") and a "Show blank items" button that filters the rows to just the blank ones, with "Show all items" to go back. The blank-rows question at submit works the same way. Differences in the review work the same way too: the number ("3 differences"), names only when there are 3 or fewer, and a "Show differences" button that filters the rows to the flagged ones, with "Show all items" to go back. This applies to the daily count, the ITP daily log and the logistics recount.
- A stock-out day is recorded whenever the RUTF count is zero.

## Screens (match the Claude Design artifact)

Same numbering as the Claude Design brief:
1. Test sign-in (with a small "Reset demo data" link).
2. Facility home (summary, item list, three actions).
3. Receive a shipment, and Request emergency stock.
4. Daily count (also used for logistics recounts, marked "Recount by logistics"). Layout: compact single rows, one line per item in bin card order (the right side of the "Daily count: cards vs compact rows" artboard), chosen over cards because it needs about a third of the scrolling.
5. ITP pharmacy daily log ("We ran out of this today" toggle; the app calculates use). ITP home is the facility home with "Enter today's log".
6. Supervisor home (their facilities, corrections waiting for approval, escalations).
7. Logistics dashboard ("Needs attention today" first, including the central store below target; table of all 31 stores with an item selector, a stock-type filter and a click-through to every item at a store; suggested shipments; shipments in transit; record a recount; "Receive at central store"; "Upload ODK usage (CSV)").
8. Management overview (stock-out days, counts submitted on time, count accuracy vs a 95% goal, unexplained differences, emergency orders share, network RUTF with months of stock, RUTF use by month chart).
9. Item history (audit trail) with the "Correct this entry" dialog.
10. Settings (facilities and items lists with stock type, "Add a facility", lean-season multiplier, overrides with reason).
11. and 12. Phone layouts for facility home and daily count.

The CSV upload must parse the provided ODK file format and update usage. The app must also load the bundled copy on first run.

## Decisions after the build (22 Nov)

- Transfers between facilities top the receiving facility up to its target, like every other shipment. Never a fixed amount or an amount copied from the design.
- A stock-out recorded in the ITP daily log ("We ran out of this today") raises an Out of stock alert like any other, even where the design shows fewer alerts.
- Only a facility's own counts count towards its escalation. A logistics recount is the follow-up to a difference, not a new flag.
- Facility staff do not see their own escalation; they see each Check. (A possible addition, listed in the note.)
- Management indicators: values before today are fixed demo values, today's part is worked out live from the data, and a line on screen says so.
- "Unexplained differences" (management indicator): count differences in the month with no note and no correction.
- The ITP daily log uses compact rows, and ITP items keep the names and order of the ITP item list.
- Demo seed: Jigawan Iro's emergency request starts unsent, so the walkthrough begins with the Lead Triage Officer sending it.
- The `.claude/` folder stays out of the repository.
- Docs never call the app "static". Say it runs entirely in the browser, with no server.

## Fixes after the live review (22 Nov)

- Navigation: every screen other than the signed-in user's home has a "Back" link at the top that returns to the previous screen in the app, or to the user's home if the screen was opened directly. The Taimaka logo and "Stock Management" in the header link to the signed-in user's home, for every role.
- An alert's button or link lands on a screen that shows the problem the alert describes.
- The central store is judged by the central store rules wherever it appears (its own page, item history, tables, cards, alerts): a target of 3 months of network use, months of stock counting stock on order, and "Below 3-month target" when under it. The same store and item show the same status on every screen.
- The central store has no daily count, so it never shows "Not counted today", "Not counted yet" or "No count yet". It shows when its stock was last updated, as in the logistics table.
- In item history, the opening balance is the earliest line, so every line shows the balance after it.
- Header tabs for every role, like the logistics header: the logo and "Stock Management", then tabs for the screens that role can already open, in the same place and style as the logistics tabs. The first tab is the role's home. Facility staff (OTP and ITP): their home and History only, because their three actions are already the buttons on their home and repeating them as tabs would double the choices on every screen (decisions log D1). Supervisors, who are senior staff looking after several facilities: their home, Stores (the logistics "All stores" table limited to their facilities), Shipments (shipments to and from their facilities) and History, all view only apart from what a supervisor can already do. Management: its overview plus any other screen management can already open. Logistics keeps its tabs. Tabs never add screens or permissions a role does not already have, and "Settings" stays logistics only. History opened from a tab offers only the stores that role can see. On phones the tabs fit without sideways scrolling and keep 48px tap targets (a second row under the header if needed).
- Daily count review (blank rows and the storage check): see "Daily count" above.
- Summary pills are filters: on the facility and ITP home (and anywhere else the summary pills sit above an item list), tapping a pill such as "4 running low" shows only the items with that status, still in bin card or item list order, with a clear "Show all items" to go back. The active pill looks selected. On phones the same, with 48px tap targets. Reason: staff should not have to scroll through 60 items to find the 4 that are running low. "Running low" still does not go in "Needs attention": it needs no action from staff because the next monthly shipment covers it, and alerts are only for exceptions that need an action today (decisions log A4, D3), so the alert list stays short and always means act.
- Running low items tell staff what happens next, because staff have nothing to do: logistics tops every facility up to its target in the monthly shipment (forced-ordering max-min, "informed push"). Each Running low item card says "In the next monthly shipment", and once logistics has proposed or sent the monthly shipment it shows that shipment's quantity and status for the item (for example "Next monthly shipment: 240 x 1000 ml, approved"), using the real shipment data, never an invented number. When the list is filtered to Running low, one line above it says: "Logistics tops these up in the next monthly shipment. If one will run out sooner, use Request emergency stock." No new button or action for staff.
- Running low is an action for logistics, through the monthly round, not an alert: in "Suggested shipments" and the monthly round, every item shows its status pill, Running low items come first within each facility, and the monthly round card says how many items are running low across how many facilities ("9 items running low at 5 facilities"). Approving and sending the monthly round is the action. A Running low item that gets within 10 days before the round becomes Order now and raises its own alert, so nothing falls through.
- The sync indicator fills green when everything has been sent ("Sent. Last sync [time]"), using the OK colors from the design stylesheet (`--ok-bg` fill, `--ok-fg` text and icon, `--ok-bd` border), so staff can see at a glance that their entries are safe. Its other states keep their current look.

## Round 4 (22 Nov evening, from Shahzeb's review of round 3)

- Filter pills tell people they are filters and show the result. A short line beside or under the summary pills says "Tap a pill to see only those items". Tapping a pill scrolls smoothly to the item list (no scrolling when the user prefers reduced motion), and the list heading says what is shown with "Show all items" beside it ("4 running low · Show all items"). The selected pill looks clearly selected (filled, not just a border), using colors already in tm.css. Reason: with many alerts, tapping a pill changed nothing visible until the user scrolled down.
- Sign-in page: the quick-pick user cards are all the same height, whatever the length of the role or facility. "Show all 41 test users" becomes a search box ("Find a test user: name, role or facility") with results grouped by role, not one long list. The page remembers who signed in on this browser: next time it opens with "Welcome back, [name]" and the PIN boxes, plus "Use another test user". One line on the page explains that this is a prototype: "Prototype: test users with a test PIN. In the real app, each person signs in with their own username and PIN, and a device only remembers the people who have signed in on it." Reason: a public list of every user with one PIN would not be safe in real use; real sign-in is out of scope (individual logins from day one, decisions log E2).
- Management cards open a detail view. Each indicator card (stock-out days, counts on time, count accuracy, unexplained differences, emergency orders) is a button that opens the records behind its number, worst first, each with the facility, its supervisor (from the facility list), the item, the date and the numbers, and a link to the facility or item history. View only. The October demo totals (1 to 29 Oct) are broken down into deterministic demo records that add up exactly to the totals shown, labeled as demo values like the totals; today's part comes from the live data. Reason: management should see where a number comes from and who to talk to, not just the number.
- RUTF across the network is a full-width section, because RUTF is Taimaka's biggest cost and the core of treatment. It shows the months of stock and the date it lasts until at current use; where the stock is (at facilities, at the central store, in transit, on order) as one bar plus a small table with sachets (cartons + loose) and months for each part; the central store against its 3-month target and the supplier order due date; and how many facilities are Order now, Running low or Out of stock for RUTF. No sentence of numbers joined with "+". The RUTF-by-month chart shows a tooltip on hover or tap for each month: sachets used (with cartons), the change from the previous month, how many OTPs reported, and whether it is lean season (October marked partial). Only real or already-seeded data; no money values (no prices were given).
- Phones (the app is used as a web app): one compact header row (logo, facility, initials button that opens the name, role, sync status and Sign out). The role's tabs and the facility staff's three actions share one bottom bar, so nothing is repeated and the screen above is free for the list: for facility staff "Today", "Count" (or "Log" at an ITP), "Receive", "Emergency", "History", each with its icon, at least 48px tall. Other roles get their tabs in the bottom bar. Items that are OK are collapsed on the phone home behind "Show [N] OK items", so the list starts with what needs attention. Laptop and tablet layouts stay as they are.
- Form fields line up. Every text, number and date field in the app has one height, the standard field height from tm.css, and fields in the same row line up at the top and bottom with their labels on one line. A field may use larger digits (for example a count) but not a different height. Reason: on "Receive a shipment", the empty count fields were taller than the batch and expiry fields beside them, so labels and boxes were out of line. Shared styles change in one place for one purpose: when a size is changed for one screen, it is scoped so other screens do not change by accident (the pill size change once spread further than intended).
- ODK usage upload explains its format and shows what will change before it changes anything. The upload window shows the expected columns as a small example table, copied from the real file's header (site, item, Jan to Oct, total_jan_oct: one row per site and item, sites as ids such as ashaka_gari, use as monthly totals), says which months the average will use, and offers "Download the current file" as a template. After a file is chosen, a preview says what was found (sites, items, months, any rows it cannot read with their row numbers and the reason in plain words) and which sites' average use would change most, before "Apply". After applying, a summary and the "Last ODK upload" line (time and name) update. Reason: the task names the CSV upload explicitly, and a logistics officer should not have to guess the format or wonder what changed.
- Wrong PIN: 3 tries. Every wrong PIN says how many tries are left ("Wrong PIN. 2 tries left."). After the third, the account locks for a short time and then unlocks by itself, so a field officer is never stuck waiting for an admin; the person who manages accounts can unlock it sooner. The lock screen has "Ask logistics to unlock" for emergencies: it sends an unlock request that logistics sees under Approval waiting (rank 8, a named person is waiting) with "Unlock now", and the locked user sees that the request was sent. In the prototype the lock lasts 1 minute and the message says that the real app would use a longer time (15 minutes, to set with Taimaka); "Reset demo data" clears it. Reason: Shahzeb did not want one wrong PIN to lock anyone out, or admins swamped with resets.
- Removing access: the system cannot know by itself that someone has left, so leaving is a step someone takes. Logistics (who manages accounts in the prototype, in Settings) sees a Users list and can "Remove access" immediately; a removed user cannot sign in and sees "This account no longer has access. Ask your supervisor." In real use, HR's leaver step (or the supervisor) triggers the removal within 24 hours at the latest, and accounts unused for 30 days are flagged for review. Every removal is logged with who, when and why.
- The ODK upload window opens with the last upload at the top: date and time, how long ago, who uploaded it, the file name, and the sites and months it covered, so logistics can spot at once if the last upload is not the one they remember.
- Receive a shipment: a field that matches what was sent shows a larger tick with "Matches what was sent", vertically centered with the fields in its row; a field that does not match shows a cross with what was sent ("Sent 600 sachets"), in the same place and size. Batch number and expiry date were entered by logistics when they sent the shipment, so they show as read-only values with a small "Edit" button; staff only check them. If staff edit either, the field shows what logistics entered and what was confirmed, a reason is required, and the receipt counts as a difference. Any receipt difference (short, damaged, extra, or a changed batch or expiry) reaches logistics as a Difference alert at the same rank as Count difference (5), naming the shipment, item and both values. The confirmed batch and expiry are what the stock uses from then on (soonest expiry first, Will expire before use), and both values stay in the history.
- Add to home screen: a web app manifest (name "Taimaka Stock", the Taimaka logo as the icon, navy from tm.css as the theme color, opens full screen). A service worker caches the app's own files network-first, so the app opens without signal and always shows the newest version when online.

## Build order (if time runs short, stop in this order and record what was cut)

1. Data load, master item list, ledger and status logic.
2. Test sign-in and role views.
3. Facility home and daily count with difference flags.
4. Logistics dashboard with suggested shipments and the shipment tracker.
5. ITP home and daily log.
6. Item history, corrections with approval, and the supervisor home.
7. Management overview.
8. Settings.
9. Deploy to GitHub Pages and test the Jigawan Iro walkthrough.

## Out of scope (mention in the note, do not build)

Real authentication, ODK API connection, reading bin card photos, background sync to a server (the prototype saves in the browser and only shows an online or offline indicator), voice entry, Hausa translation, practice mode, temperature loggers, push notifications for urgent alerts (with an SMS fallback for phones on weak internet).
