# APRS setup: Graywolf, Emcomm Objects and EmComm Planner

What you get when the three are linked:

- **Stations up.** Every APRS station Graywolf hears appears in EmComm Planner: next to the operator on the net control board (last fix, distance to their site) and on the Sites map, coloured by age.
- **Check-ins over the air.** An operator sends Graywolf's station an APRS message such as `@@#checkin` from any radio or app; the planner records the check-in on their assignment and Graywolf sends the reply back.
- **Messages down.** Operators who choose APRS under Profile › Notifications get offers and packet changes as APRS messages, sent through Graywolf.
- **Sites out.** The active deployment's sites can be imported into Emcomm Objects as APRS objects, ready to beacon.

Three pieces, three roles:

| Piece | Where it runs | Role |
|---|---|---|
| **Graywolf** | The station computer, with the radio | Hears and sends APRS. Its Actions turn `@@#` messages into webhook calls. |
| **Emcomm Objects** (0.3.0 or later) | Same computer as Graywolf | The bridge: copies heard stations to the planner every 30 s, sends the planner's queued messages through Graywolf, imports sites as objects. |
| **EmComm Planner** | emcommplanner.org | Holds the bridge token, the operators, the assignments and the record. |

Do the steps in order. Each one produces something the next one needs.

---

## Step 1. Graywolf is running and talking to the radio

Nothing in this guide works without a Graywolf station that already hears packets.

1. Start Graywolf on the station computer and open its web UI (by default `http://127.0.0.1:8080`).
2. Confirm the radio channel is up and stations are appearing on Graywolf's map or station list.
3. Note the station's call sign with SSID (for example `KK4ODA-2`). Operators will address their `@@#` messages to this call.

**You leave this step with:** Graywolf's URL, its login, and the station call sign.

---

## Step 2. Emcomm Objects is installed and connected to Graywolf

1. Install Emcomm Objects on the same computer (the Windows installer from the releases page, or the portable zip). It opens at `http://127.0.0.1:8765`.
2. Open **Settings**. Under the transport section choose **Graywolf API**, enter Graywolf's URL and login, click **Test connection** and pick the channel. Save.
3. The status bar shows the transport as connected, with the Graywolf version.

**You leave this step with:** Emcomm Objects showing *connected* to Graywolf.

---

## Step 3. Create the bridge token in EmComm Planner

The token is what lets the bridge and Graywolf write into your group. It is shown once.

1. Sign in to emcommplanner.org as a **Planner** or **Admin** and open **APRS** in the left menu.
2. Under *Bridges*, type a name for this station (for example `EOC Graywolf`) and click **Create bridge**.
3. A dialog shows three strings. Copy all three somewhere safe before closing it; each goes to a different place:

   | String | Looks like | Goes to |
   |---|---|---|
   | **Bridge token** | `ebt_…` (long random string) | Emcomm Objects › Settings › EmComm Planner › *Bridge token* |
   | **Planner URL** | `https://<ref>.supabase.co/functions/v1` | Emcomm Objects › Settings › EmComm Planner › *Planner URL* |
   | **Webhook URL** | `…/functions/v1/aprs-ingest/action?token=ebt_…` | Graywolf › Actions › handler URL (Step 5). Never into Emcomm Objects. |

   The planner URL is the address only: no `/aprs-ingest`, no `?token=`. If you paste the webhook URL into the Planner URL field, *Test link* fails with `decode /aprs-ingest/ping: invalid character 'o'`.

If you lose the token, revoke the bridge on this page and create a new one; the old token stops working immediately. One bridge per Graywolf station.

**You leave this step with:** the planner URL, the token, and the webhook URL.

---

## Step 4. Paste the token into Emcomm Objects

1. In Emcomm Objects, open **Settings › EmComm Planner**.
2. Fill in:
   - **Planner URL**: the URL from Step 3 (it is prefilled for emcommplanner.org; leave it unless you run your own instance).
   - **Token**: the bridge token from Step 3.
   - Tick **Forward heard stations** and **Send messages**. Leave the interval at 30 seconds.
3. Click **Test link**. Emcomm Objects calls the planner with the token and reports the group and bridge name it belongs to.
4. Click **Save**. The token is written to `config.yaml` in the Emcomm Objects data folder on this computer and is not shown again.
5. Watch the **EmComm Planner** pill in the top bar turn green. Back on the planner's APRS page, the bridge now shows a recent report and *Stations heard* fills within a minute if Graywolf is hearing anyone.

**You leave this step with:** stations flowing from Graywolf to the planner, and the planner's outbound messages flowing back through Graywolf.

---

## Step 5. Configure Graywolf Actions for check-ins

Check-ins do not go through Emcomm Objects. Graywolf calls the planner directly when an operator sends a `@@#` message to the station's call sign.

1. In Graywolf's web UI, open **Actions** and add a new action.
2. Name it `checkin`. This is what operators will type after `@@#`.
3. Set the handler to **webhook**, method **POST**, URL = the webhook URL from Step 3 (the one ending in `?token=YOUR-TOKEN`). Leave the request body as Graywolf's default form fields; the planner reads `action`, `sender-callsign` and any `arg.*` fields.
4. Make sure the action sends the handler's response back to the sender. The planner replies with short text such as `AID 20: checked in` or `no live assignment`, and Graywolf transmits it as an APRS message.
5. Repeat for three more actions with the same URL and names `onpos`, `checkout` and `status`.

Reply texts you will see on the air:

| Message from the operator | Planner reply |
|---|---|
| `@@#checkin` | `<TACTICAL>: checked in` |
| `@@#onpos` | `<TACTICAL>: on position` |
| `@@#checkout` | `<TACTICAL>: released` |
| `@@#status` | `<TACTICAL>: <current status>` or `no live assignment` |
| from a call sign the planner does not know | `<CALL> not a member; set APRS call on your profile` |
| wrong token in the URL | `denied: bad token` |

**You leave this step with:** four actions in Graywolf, all pointing at the same webhook URL.

---

## Step 6. Operators: one profile field

The planner matches the sender of an APRS message to a member in two ways: the **APRS call sign** on their profile (for example `KK4ODA-9`), or failing that any SSID of their base call sign. An operator who beacons as `KK4ODA-7` and has `KK4ODA` on their profile is matched without doing anything.

Ask each operator to:

1. Open **Profile & settings › My profile** and set **APRS call sign** to the call and SSID their radio or app transmits.
2. If they want offers and packet changes over the air, turn on **APRS** under **Profile & settings › Notifications**.
3. On the day, address messages to the station call from Step 1: `@@#checkin` on arrival, `@@#onpos` when on the air, `@@#checkout` when released, `@@#status` to ask.

Only members of the bridge's ARES group are accepted, and a check-in applies to the operator's live assignment in the deployment that is active at that time. Someone without an assignment gets `no live assignment` rather than a phantom check-in.

---

## Step 7. Test the whole chain

1. From a radio or an APRS app on a phone, send `@@#status` to the station call. Expect `no live assignment` or your tactical call and status within a few seconds.
2. On the planner's APRS page, the message appears under *APRS check-ins* with the result.
3. Open **Net control** on the planner. With a live shift, your line shows the last APRS fix and the distance to your site.
4. Turn on APRS notifications on your profile, have a planner offer you a shift, and watch the offer arrive as an APRS message. It shows under *Outbound messages* on the APRS page as pending, then sent.
5. Optional: in Emcomm Objects, click **Import deployment sites as objects**. The active deployment's sites arrive as disabled objects; enable the ones you want Graywolf to beacon.

---

## When something does not work

| Symptom | Check |
|---|---|
| Emcomm Objects pill stays red, *Test link* fails | Token pasted with a trailing space or from the wrong bridge; planner URL missing `/functions/v1`; the computer has no internet. |
| *Test link*: `decode /aprs-ingest/ping: invalid character 'o'` or `no sender` | The Planner URL field holds the webhook URL. Replace it with the planner URL alone (`https://<ref>.supabase.co/functions/v1`). Emcomm Objects 0.3.1 and later trims this automatically. |
| Stations heard is empty on the planner | Graywolf is not hearing anyone (check Graywolf first); *Forward heard stations* unticked; the bridge's last report on the APRS page is old. |
| `denied: bad token` on the air | The webhook URL in Graywolf has a typo or belongs to a revoked bridge. Copy it again from the planner (revoke and create a new bridge if needed). |
| `<CALL> not a member` | The sender's call sign is not on any member's profile and does not match a member's base call, or the member is not in this group. |
| `no live assignment` | The operator has no accepted assignment whose shift is live now in the active deployment. Check Staffing. |
| Offers do not arrive over APRS | The operator has not enabled APRS notifications; *Send messages* is unticked in Emcomm Objects; the message is longer than 67 characters and was truncated (that is expected). |
| Positions look stale | The bridge forwards every 30 s and Graywolf only reports what it heard in the last hour by default (`lookback_seconds`). Downtown Atlanta has poor RF APRS coverage; phone-based APRS-IS positions do not reach Graywolf. |

Where things live: the planner's APRS page (bridges, stations, check-ins, outbox), Emcomm Objects `config.yaml` (`planner:` section, token), Graywolf Actions (four webhook actions).
