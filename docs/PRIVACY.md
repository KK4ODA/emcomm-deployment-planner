# Privacy policy

*Effective 2026-09-12. Applies to the EmComm Planner web app at emcommplanner.org and the EmComm Planner desktop app.*

EmComm Planner is a volunteer-run tool for amateur radio emergency communications groups (ARES and similar) to plan deployments, staff positions and run the desk on event day. It is operated by its author, KK4ODA, not by a company. This page says in plain words what the app stores, who can see it, which outside services touch it, and what you can do about it.

## 1. What the app stores about you

- **Account**: the e-mail address you sign in with and a hashed password (or a sign-in link), managed by our database provider.
- **Profile**: name, call sign, phone number, and, if you fill them in, APRS call sign, licence class, capabilities, station types, equipment notes and locality. The call sign and phone number exist so a planner can reach you and put you on a roster.
- **Membership**: which ARES groups you belong to and your role in each (operator, planner, administrator).
- **Deployment data**: positions you are assigned to, offers you accept or decline, check-in and check-out times, hours worked, tasks dispatched to you and each step you report, notes and log entries written about the deployment, coverage checks you report, and post-event feedback (which you may submit anonymously).
- **Notifications**: which channels you enabled, your web-push subscription if you allowed push, and the notifications sent to you.
- **APRS**: if your group runs an APRS bridge, positions and messages heard by that station are stored for 14 days and matched to members by call sign. APRS is public radio traffic; the app only records what was already transmitted in the clear.
- **Technical**: the time and result of actions such as check-ins and APRS commands, kept as an audit trail for the deployment's ICS 214 log.

The app has no advertising, no analytics trackers and no data brokers. It does not sell or rent personal information.

## 2. Who can see it

Access follows your group and your role, enforced in the database:

- Members of the same ARES group can see each other's profile: name, call sign, phone number and capability details, the same information a group roster carries. Planners use it to staff; operators use it to reach each other.
- Operators assigned to a deployment receive a packet that lists who is staffing which position, with call signs and phone numbers of the other operators on that deployment, so they can reach each other during the event.
- Members of other groups see nothing of yours. Application administrators (the operator) can see all groups in order to run the service.
- Planners can print or export packets, rosters and forms (PDF, CSV, a Google Sheet). Once exported, those files are outside the app's control; groups should treat them as they treat any roster.

## 3. Where it lives and who processes it

- **Database, sign-in and server functions**: Supabase (PostgreSQL hosted in the United States, AWS us-east-2). All traffic is encrypted in transit.
- **Web hosting**: the static web app is served from IONOS.
- **E-mail notifications**: Resend, sent from notifications@emcommplanner.org, only if you turned e-mail notifications on.
- **Web push**: your browser vendor's push service (Apple, Google or Mozilla) carries push notifications you opted into.
- **Text messages**: Twilio, only if the operator has configured it and you turned SMS on.
- **APRS**: your group's own Graywolf station and, where the station gates traffic, the public APRS-IS network.
- **Maps**: map tiles come from OpenStreetMap tile servers, which see your IP address when a map loads; *Directions* opens Apple or Google Maps in a separate app or tab, under their own terms.
- **Google Drive** (planners only): see section 4.
- **Updates** (desktop app): the installer checks GitHub Releases for new versions; GitHub sees the request.

These providers process data only to deliver the service. None of them receive your information for their own marketing.

## 4. Google user data

A planner can post a deployment's staffing roster to Google Drive as a Google Sheet with the **Google Sheet** button on the Staffing page. This is the only feature that touches your Google account, and it does so only when clicked.

- The app asks Google for the `drive.file` permission, which lets it see and edit **only the files it created itself**. It cannot read anything else in your Drive.
- It creates one spreadsheet named after the deployment, or updates the same spreadsheet on later clicks, and sets the sheet to **read-only for anyone with the link**, so operators without Google accounts can open it. The link is placed on the deployment's packets.
- The access token Google returns stays in your browser tab for up to one hour and is never sent to our servers. The only things stored are the sheet's file id and its link, on the deployment.
- The roster in the sheet holds the deployment's positions, shifts, call signs, names and phone numbers of assigned operators. Posting it is a planner's decision, the same as printing it.

EmComm Planner's use of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. Google user data is not used for advertising, is not sold, and is not transferred to anyone except as needed to provide this feature or as required by law. You can revoke the app's access at any time at [myaccount.google.com/permissions](https://myaccount.google.com/permissions).

## 5. Cookies and data on your device

The app stores in your browser or in the desktop app: your sign-in session, your theme and text-size preferences, a cached copy of your packet and of deployments you opened, map tiles you have viewed, and a queue of actions you took while offline (check-ins, task steps) until they sync. Signing out clears the session; clearing site data removes the rest. There are no third-party cookies.

## 6. How long it is kept

- Profile and membership data: until you ask to be removed or an administrator removes you from the group.
- Deployments, assignments, logs, hours and feedback: kept as the group's operating history until a planner deletes the deployment. Groups often need this for after-action reports and volunteer hour records.
- APRS positions: 14 days. APRS command audit entries and the activity log: with the deployment.
- Push subscriptions: until you turn push off or the browser reports the subscription dead.

## 7. Your choices

- Edit or remove profile details under **Profile & settings**. Notification channels, including APRS messages, are opt-in switches there.
- Decline any offer. A planner can also assign you directly after arranging it with you; ask to be released at any time and the assignment is closed.
- To delete your account and personal data, ask your group administrator or contact the operator (section 9). Records needed for the group's history (for example that a position was staffed on a date, or hours already credited) may be kept with your name removed.
- Revoke Google access at myaccount.google.com/permissions.

## 8. Security

Access rules are enforced in the database per row, server functions authenticate every request, bridge tokens are stored only as hashes, and all connections use TLS. No system is perfect; if you believe data has been exposed, contact the operator and we will investigate and tell affected people.

The app is not directed at children under 13, and groups should not enrol them.

## 9. Contact and changes

Questions, corrections or deletion requests: open an issue at [github.com/KK4ODA/emcomm-deployment-planner/issues](https://github.com/KK4ODA/emcomm-deployment-planner/issues) or write to the support address shown on the Google consent screen. Changes to this policy are listed in the project's change log with the version they shipped in; the effective date above is updated when the policy changes.
