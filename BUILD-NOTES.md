# Build notes

Working notes for the Taimaka stock management prototype. If a session stops part way, start here.

## Where things stand

- Build step 1 (data, master item list, ledger, status logic): done (commits 48d019f, 22c2a37).
- Step 1 decisions applied (this session): seed rebuilt with the design's demo values; check passes (`node tools/check.mjs`, output in `tools/check-output.md`).
- Next: the screens, in CLAUDE.md build order steps 2 to 8.

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

(Filled in as the build goes.)

## Open questions for Shahzeb

(Filled in as the build goes.)
