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
- Prefer a simple stack that deploys as static files to GitHub Pages. If a build tool is used, confirm Node is installed first.
- American spelling. No em dashes or en dashes anywhere in the UI, code comments or docs. Use a plain hyphen with spaces for ranges.
- No backend. A static web app. Data lives in the browser (localStorage), seeded from the CSV copies, with a "Reset demo data" button. Wrap storage access in try/catch.
- One responsive web app: laptop-first, and every screen must reflow to a single column on a phone (check at 375px, 768px, 1280px).

## UI rules (from the design brief)

- Usable on day one with no training. Each role sees only what it needs; facility staff get at most three actions.
- The system does the maths: facility staff see "Lasts until [date] ([N] days)"; logistics and management also see months of stock.
- Exceptions first. Every alert shows its next action as a button.
- Status is color + icon + word, never color alone.
- Every number carries its unit and thousands separators, and shows when it was last updated ("Counted today 5:40 PM").
- RUTF quantities of 150 sachets or more show the sachet total, then whole cartons and loose sachets: "23,870 sachets (159 cartons + 20 loose)". An exact number of cartons reads "1,800 sachets (12 cartons)". Under 150, sachets only ("131 sachets"). This applies everywhere RUTF appears (shipments, emergency requests, receiving, item cards, logistics table, item history). It is display only: all calculations stay in exact sachets.
- Product picture or icon on every item card; item order matches the paper bin card.
- WCAG AA contrast, body text at least 16px on phones, tap targets at least 48px, plain words.
- Design the empty, loading, saving, offline, success and error states.
- The signed-in user's name and role always show in the header.
- The sync indicator names the device type the app detects (phone, tablet or laptop): "Saved on this [device], will send when online" while entries are waiting to send, and "Sent. Last sync [time]" when everything has been sent. The sync indicator appears only on screens where staff enter data; view-only screens (management) show "Data as of [time]".
- Header: the Taimaka logo from `Assets/Taimaka_white.svg` (the navy logo on white, despite the file name; trim its empty margins, never redraw or recolor it), a thin divider, then "Stock Management". The facility sits in its own tinted box with the store icon, the facility name in bold and the site type below ("Outpatient site" or "Inpatient site"). Roles without one facility keep their label in the same box.
- Names and roles in the header user pill and on the sign-in cards display in capitals ("MUHAMMAD S.", "LEAD TRIAGE OFFICER") through CSS text-transform; the stored text stays in normal case. Entry stamps and history ("by Muhammad S.") stay in normal case.
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
- ODK values have decimals (compilation artifacts). Round them for display. Counts show exactly as recorded (Zinc sulphate 28.5 on the bin card shows as 28.5).
- Units come from `ITP item list.csv` or the ODK item name. Ciprotap ear drop is in bottles (same form as Otomed drops); Tom Brown is in packs (assumption). Items in neither source (Tabs ACT AL 2, ACT AA toddler, ACT AA infant, Cefixime, TB Bucket, BMS, Soap, Sponge) show "units" until Taimaka confirms.
- RUTF units are sachets; 1 carton = 150 sachets.
- `ITP item list.csv`: ITP therapeutic food and medication with units. There is no ITP usage data. As the task says, ITP usage comes only from the stock record, so calculate it from the daily log: used = previous count + received - today's count. Seed about 60 days of past ITP daily logs with plausible sample values (and say so), and derive ITP average monthly use from them.
- No opening balances, central store stock, shipment history or expiry dates are provided. Seed them with sample values (deterministic) so every status appears somewhere. Jigawan Iro OTP is seeded from the bin card (counted 30 Oct 2026).
- The prototype's "today" is 30 October 2026 (the bin card date). With Aug and Sep usage this gives, for Jigawan Iro: RUTF 1.43 months, lasts until 12 Dec (OK, but below the 2-month target); Tom Brown 20 days, lasts until 19 Nov (Running low); Amoxicillin 60ml lasts until 23 Dec (OK, flagged difference); Malaria RDT about 2 months (OK); Otomed about 21 months (Too much); Ciprotap, Multivite, ACT AL 2 and Sponge at 0 (Out of stock). Use these as a check that the logic is right. "Order now" examples come from seeded data at other facilities, including Zaune OTP with RUTF seeded at 3,630 sachets (24 sealed cartons + 30 loose). That value is worked out, not arbitrary: at Zaune's real August and September use (about 13,750 sachets a month, the busiest site), 3,630 sachets lasts exactly 8 days (until 7 Nov), the Order now case in the design brief. Its emergency top-up to the estimated 2-month target (27,500) is 23,870 sachets.

### Jigawan Iro bin card values (seed these)

20% Zinc oxide cream 56; ACT tablets AL 1 76; Amoxicillin susp 100ml 82; Amoxicillin susp 60ml 80 (bin card said 86: a flagged difference); Ciprotap ear drop 0; Loratadine 60; Malaria RDT 132; Multivite syrup 0; Nystatin suspension 26; ORS 96; Paracetamol syrup 58; RUTF 4,331 sachets (28 sealed cartons + 131 loose); Tabs ACT AL 2 0; Tabs Albendazole 400mg 69; Tetracycline ointment 19; Tom Brown 11; ACT AA toddler 13; Otomed 29; Zinc sulphate 28.5; Cefixime 25; ACT AA infant 14; TB Bucket (blank on the card: not counted); BMS 11; Benzyl benzoate 33; Soap 38; Sponge 0. That is 26 rows, in this order (the bin card order).

### Master item list (one name per item, with aliases)

Names differ across sources. Keep one master list with a base unit and aliases, e.g.:
- Zinc sulfate = "Zinc Sulphate" (bin card)
- ACT AA infant = "Z AA (Infant)"; ACT AA toddler = "Z AA (Todler)"
- ACT AL = "ACT tablets AL 1"
- Amoxicillin 60 ml bottles = "Amoxicillin susp 60ml"; Amoxicillin 100 ml bottles = "Amoxicillin susp 100ml"
- Malaria RDT kits = "Malaria RDT"; Otomed = "Z Otomed"; Cefixime = "Z Sups. Cefexime"
- Zinc oxide = "20% Zinc oxide cream"; Tetracycline = "Tetracycline ointment"; Albendazole = "Tabs Albendazole 400mg"
Items on the bin card with no ODK usage (Ciprotap, Multivite, ACT AL 2, Benzyl benzoate, Soap, Sponge, BMS, TB Bucket) are tracked on hand only. "Tom Brown container" is in ODK but not on the bin card, so at Jigawan Iro it shows "Not counted today".

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
- Review step has one checkbox: "Store is cool, dry and locked today".
- A row can be left blank (e.g. TB Bucket). The count can still be submitted; the review lists the blank rows, and those items show "Not counted today".
- A stock-out day is recorded whenever the RUTF count is zero.

## Screens (match the Claude Design artifact)

Same numbering as the Claude Design brief:
1. Test sign-in (with a small "Reset demo data" link).
2. Facility home (summary, item list, three actions).
3. Receive a shipment, and Request emergency stock.
4. Daily count (also used for logistics recounts, marked "Recount by logistics").
5. ITP pharmacy daily log ("We ran out of this today" toggle; the app calculates use). ITP home is the facility home with "Enter today's log".
6. Supervisor home (their facilities, corrections waiting for approval, escalations).
7. Logistics dashboard ("Needs attention today" first, including the central store below target; table of all 31 stores with an item selector, a stock-type filter and a click-through to every item at a store; suggested shipments; shipments in transit; record a recount; "Receive at central store"; "Upload ODK usage (CSV)").
8. Management overview (stock-out days, counts submitted on time, count accuracy vs a 95% goal, unexplained adjustments, emergency orders share, network RUTF with months of stock, RUTF use by month chart).
9. Item history (audit trail) with the "Correct this entry" dialog.
10. Settings (facilities and items lists with stock type, "Add a facility", lean-season multiplier, overrides with reason).
11. and 12. Phone layouts for facility home and daily count.

The CSV upload must parse the provided ODK file format and update usage. The app must also load the bundled copy on first run.

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
