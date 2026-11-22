# Taimaka stock management prototype

**Live app:** https://sharxx47.github.io/taimaka-stock-management_prototype/

Open the link on a phone or tablet to see the phone layout: one compact header and a bottom bar with each role's actions. The app can also be added to the home screen and opens without signal once loaded.

This is a working prototype I built for Taimaka's Operations Associate test task (Task 1), shared for the evaluation of my job application. It tracks stock at the central store, 27 outpatient sites (OTPs) and 3 inpatient sites (ITPs) in Gombe State, learns each site's own use, recommends how much each site should hold and receive, and raises alerts only when someone needs to act. It runs entirely in the browser, with no server.

## How to try it

Sign in as any test user with the test PIN **1234**: pick one of the five quick picks, or search by name, role or facility. A short walkthrough:

1. **Muhammad S., Lead Triage Officer, Jigawan Iro OTP.** Tap a summary pill to see only those items, enter today's count, request emergency stock for the items that are out, and receive shipment 1042.
2. **Hajara Nuhu, supervisor.** See the Amoxicillin escalation and approve or reject the RUTF correction waiting for her.
3. **Nasiru Bello, logistics.** Work through "Needs attention today", approve and send Muhammad's request, and look at all 31 stores, suggested shipments and the ODK usage upload.
4. **Muhammad S. again.** Receive the emergency shipment.
5. **Management.** Open each indicator to see the records behind it, then RUTF across the network.
6. **Pharmacy Technician, GH Deba ITP.** The daily log, from which the app works out use.

"Reset demo data" on the sign-in page starts again from the beginning.

## Where the numbers come from

- `data/ODK OTP usage Jan-Oct 2026.csv`: each site's monthly use. Targets use the average of August and September, because October is a partial month.
- `data/Facility list.csv`: the 31 stores and their supervisors.
- `data/ITP item list.csv`: ITP items and units.
- `data/Bin_card_example.jpeg`: the Jigawan Iro bin card of 30 October 2026, the source of every Jigawan Iro count.
- Everything else is demo data, labeled as such in the app.

## More detail

`CLAUDE.md` holds the rules the app was built to, and `BUILD-NOTES.md` every decision with its reason, the demo values and the test results.

---

© 2026 Shahzeb Farrukh. Shared for Taimaka's evaluation of my job application only. All rights reserved.
