# EmComm Planner User Guide

EmComm Planner runs an ARES or emergency-communications deployment from the first request to the after-action review: who goes where, on which frequency, with what, and what happened. This guide is short on purpose. Each section is one task. Do the task, come back when you need the next one.

It lives at **emcommplanner.org/guide** and is updated with every release, so what you read here matches the app you are using.

---

## 1. Getting started

### Get an account
Either your coordinator invites you (an email with a link to choose a password), or you create an account at emcommplanner.org and **Request to join** your ARES group. A coordinator approves you and sets your role.

- **Operator**: sees the deployments of their groups, takes shifts, uses the packet, checks in, gives feedback.
- **Planner**: an operator who also builds deployments, staffs them, writes comms plans and publishes.
- **Admin**: everything, plus members, roles and groups.
- **Viewer**: read only. **Pending**: waiting for approval.

### Put it on your phone
Open **emcommplanner.org** in the phone's browser and add it to the Home Screen.

- **iPhone**: Safari › Share › *Add to Home Screen*. Open it from that icon from then on; it is the only way iPhone allows push notifications.
- **Android**: Chrome offers *Install app*, or Menu › *Add to Home screen*.

Once you have opened your packet, it stays on the phone: assignment, frequencies, site notes and map. Check-ins made without signal are queued and sent later.

### Fill in your profile (five minutes, once)
Open the user menu (top right) › **Profile & settings**.

- **My profile**: call sign, phone, APRS call sign with SSID if you run APRS.
- **What I can do** (same tab): licence class, capabilities (VHF voice, Winlink, APRS, net control, digital…), station types (HT, mobile, portable, base), hours of independent power, locality. Coordinators match positions against this. An empty field reads as "unknown", never as "no".
- **Notifications**: push (this device), email, text message, APRS. Only things that matter on the day are ever sent: an offer to you, a change to your packet, an open shift you qualify for, replies to the coordinator. Never announcements.

---

## 2. Operators

### Answer an offer
**My Assignments** lists offers at the top: *I will be there* or *I cannot* (with a reason). The coordinator is told either way. You can withdraw later from the same place.

### Take an open shift
Below your positions, **Open shifts** lists every shift still needing someone. Shifts you do not qualify for, or that overlap a shift you already hold, say why. *Take this shift* › confirm. It is yours and the coordinator is told.

### Your packet
**My packet** is everything for one assignment on one page: where and when to report, your tactical call, the primary frequency above the fold, then directions, parking and arrival notes, a map, all frequencies by condition (normal, degraded, repeaters down), what to bring, who you report to, net control's phone number. Print it if you like paper.

If the plan changes after you have seen it, a banner says what changed for your position. Tap *Got it* once read.

### On the day
On the packet: **Check in** when you arrive, **On position** when you are set up, **Check out** when released. This works without signal; the buttons say "saved on this device" until it syncs. Net control sees your status live.

- **Report a coverage check** (below the frequencies): which channel, whether it reached net control (direct, via relay, no contact), power and antenna if you like. Ten seconds. These build the group's real coverage map.
- **Over APRS**, if your group runs a Graywolf station: send an APRS message to the station's call with `@@#checkin`, `@@#onpos`, `@@#checkout` or `@@#status`. You get a reply on the air.

### Objectives
When the deployment has objectives (exercises, Field Day), **Objectives** shows them. *I will take this* › do it › *Done*. Points and completion feed the after-action review.

### Feedback and your hours
- **After action**: a two-minute form. How it went, did comms work, what to change. Optionally anonymous.
- **Profile & settings › My hours**: hours are recorded automatically from check-in to check-out. Add admin, training or maintenance time yourself. Monthly report figures come from here.

---

## 3. Coordinators: building a deployment

Work down the left menu. **Readiness** tells you what is still missing at any point.

### Create the deployment
**Deployments › New deployment**: name, kind (public service, activation, exercise, Field Day, net, training), start and end, served agency and requesting official, tasking reference. Pick it in the deployment switcher at the top; every scoped page then refers to it.

For an annual event, **Duplicate** last year's instead. Positions, shifts, comms plan, map layers, objectives and open lessons come along, with every date shifted to the new start. **Templates** hold reusable site, equipment and task structures; save one from any deployment's menu.

### Sites
- **Sites › Add site**: name, coordinates (type "lat, lon" or click the map), parking, arrival and access notes, site contact. These notes are the most-read lines on every packet.
- **Map layers** (Sites › Map): import the course KML, GPX or GeoJSON from the served agency, and turn a layer's waypoints into sites in one click.
- **Dashboard** holds each site's equipment list and setup tasks. Both work offline.

### Positions and shifts
- **Staffing › Position**: name, tactical call, type, site (or mobile), net, who it reports to, headcount, requirements (capability, station type, licence, hours of power), shifts with muster times, briefing notes.
- **Create several** for numbered positions: "AID MILE {n}" with tactical call "AID {n}" for 1 to 14. Save the pattern as a naming scheme; the position form then fills tactical call, type, net and requirements as you type.
- **Periods** defines operational periods when the event spans days or the ICS forms need them.

### Staff it
Each shift chip opens the assign dialog: candidates ranked by requirement match and availability, with reasons such as "Missing Winlink" or "Already on another shift". *Offer* asks the operator. *Assign as confirmed* records a yes you already have. *Notify qualified* tells every qualified, free operator that the shift is open. Positions accept self sign-up unless you switch it off on the position.

### Channels and the comms plan
- **Channels** is the group's library (ICS-217A shape). Enter each repeater, simplex channel, digital gateway and phone number once. **Export** it as a file for another group, or **Import** theirs.
- **Comms plan** picks from the library per deployment. For each condition (1 normal, 2 degraded, 3 repeaters down) mark primary, alternate, contingency and emergency paths and the net each serves. **Plan check** lists gaps. **CHIRP** exports a CSV to program radios. **ICS 205** is generated from the plan.

### Publish
**Publish plan** compares every packet with the last publication and lists what changed, position by position. Only affected operators are notified, with their changes in the message. Tick *Notify everyone assigned* for whole-event notes such as weather. Operators whose packet did not change see no banner.

### Readiness
**Readiness** is the worklist: open slots, unanswered offers, requirement gaps, double-booked operators, positions without a tactical call, no net control, nets without a primary channel, channels changed in the library since publishing, unpublished changes, unacknowledged packets, sites without pins or arrival notes, essential items nobody brings, overdue tasks, safety checklist unsigned. Each line links to where it is fixed.

### Assets, objectives, safety
- **Assets**: the group's shared gear with custody. *I have it*, *On site at…*, *Returned*. A teardown list shows what is still out.
- **Objectives**: post what the event should achieve; people take and complete them.
- **Safety**: *Start checklist* from the standard list, edit the lines to fit the site, answer every line on the day, then *Sign and lock*. Signing locks it. PDF for the record.

---

## 4. Event day: net control

**Net control** lists every live shift, worst first: nobody assigned, not heard from, arriving, on station, released. Record check-ins on someone's behalf, add log notes and incidents. When the group runs the Graywolf bridge, each operator's last APRS fix and distance to the site appear on their line.

Exports from the board: **ICS 204** (assignment list per site), **ICS 205A** (communications list), **ICS 214** (activity log). The board keeps working from cached data when the connection drops and shows "as of" the last refresh.

---

## 5. After the event

- **After action** (planner view): participation, person-hours, no-shows, unstaffed shifts, incidents, coverage checks, safety, objectives, every feedback response. *Copy draft* or *Download draft* gives a Markdown AAR to finish in your own words.
- **Lessons**: turn findings into lessons with a category, a position and a status. Open lessons follow the deployment when you duplicate it and appear as "From last time".
- **Hours** (planners): the whole group per operator and month, in report buckets, with CSV.

---

## 6. Administration

- **Members**: roles, group join requests, invitations, and **Import roster** from a CSV (email, call sign, name, phone, licence class) with a preview before anything is created.
- **ARES Groups**: the organisations. Every deployment, channel, asset and scheme belongs to one, and members only see their own groups' data.
- **APRS** (planners): create a bridge token per Graywolf station, follow the setup steps for Emcomm Objects and Graywolf Actions, then watch stations heard, APRS check-ins and outbound messages.
- **Notification delivery**: push works out of the box. Email and text message switch on when the administrator adds the provider keys on the server. The switches on each profile say when a channel is unavailable.

---

## 7. Offline and troubleshooting

- The connectivity badge (top right) shows online or offline and the number of queued changes; tap it to sync now. A red count means the server refused a change; open it to retry or discard.
- A page that is still loading after ten seconds offers *Try again* and *Reload*.
- **Text size**: user menu › Compact, Default, Large or Larger.
- Push not arriving on iPhone: the app must be opened from the Home Screen icon that Safari added, and notifications allowed for it in iOS Settings.
- No map offline: open the packet once while online. Map tiles you have seen are kept.

---

## 8. Glossary

- **Deployment**: one event, activation, exercise or net, with its own sites, positions and plan.
- **Position**: a job to staff (AID MILE 12, SAG 3, Net Control). **Shift**: when. **Assignment**: who.
- **Tactical call**: the name used on the air for a position ("AID 12"), whoever holds it.
- **Condition 1 / 2 / 3**: normal operations; internet and phones down; repeaters down (simplex).
- **PACE**: primary, alternate, contingency, emergency paths.
- **Packet**: the one-page brief for one assignment.
- **Operational period**: the ICS time window that forms are scoped to.
- **Bridge**: the small link between a Graywolf APRS station and the planner, part of Emcomm Objects.
