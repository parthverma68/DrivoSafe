# Notifications — design note (not implemented)

Status: **future feature.** Nothing in this repository sends a message. This file records what
the events already being raised are *for*, so that whoever wires up delivery does not have to
re-derive the addressing, and so that reviewers can tell the difference between "not built" and
"forgotten".

What exists today is the half that has to be right first: the **event**, with its evidence, its
recipients, and the rules about who may act on it. `shared/src/lockouts.js` builds those records
and `lockoutNotice()` already renders the message body. The missing half is a transport.

---

## 1. The events

| Event | Raised by | Recipients | Urgency |
|---|---|---|---|
| **`lockout.raised`** | Third failed breath reading at the pre-drive gate | Vehicle's operator · platform admin | Immediate — a bus is immobilised and a service is about to be missed |
| `lockout.reset` | Operator or admin clearing a lock | The other recipient, for the audit trail | Informational |
| `fatigue.d3` | DMS reaching D3 (§8.5) | Depot supervisor | Immediate |
| `fatigue.d4` | Micro-sleep, P0 | Depot supervisor · operator | Immediate, and repeated until acknowledged |
| `attendance.absent` | Rostered driver with no check-in by start + 30 min | Operator | Batched |
| `corridor.published` | New corridor version (§14.2) | Operators on that corridor | Batched |

Only the first three are worth a person's phone at 04:00. The rest belong in a daily digest —
a system that pages everyone about everything is a system people mute.

## 2. Channels

- **Email** — the default, and the only one needed for v1. Operators already have a monitored
  address (`OPERATORS[].contact`); admins have one per account.
- **Push** — for the operator console once it is a PWA; the same payload.
- **SMS** — third, and only for `lockout.raised` and `fatigue.d4`. It costs money per message,
  which is a useful constraint on what qualifies as urgent.
- **Webhook** — for fleets with their own control room software. Same JSON as the event record.

## 3. The lockout notice

The record already carries everything the message needs:

```js
lockoutNotice(lockout, { bus, driver, operator })
// → { subject, lines[], to: ['operator', 'admin'] }
```

Subject and body name the vehicle, the driver, the highest reading, whether it was above the
statutory limit, and the lock code to quote. That is deliberately all of it. A notice that
paraphrases ("a driver failed a test") makes the recipient open a console to learn anything,
which defeats the point of sending it.

**The reading goes in the body.** It is health-adjacent data about a named person, and a case
could be made for withholding it — but the recipient is the one deciding whether to stand that
driver down and call a relief, and they cannot make that call from a euphemism. What must *not*
happen is wider distribution: no CC to a depot mailing list, no copy to other drivers.

## 4. Delivery rules

1. **At-least-once, de-duplicated by event id.** A lockout retried by the sync agent must not
   arrive four times.
2. **Offline-first.** The tablet raises the event; the *server* sends it. A cab with no signal
   must still lock the vehicle and still queue the event — the immobiliser does not depend on a
   network, and neither does the record.
3. **Quiet hours do not apply to `lockout.raised` or `fatigue.d4`.** They apply to everything
   else.
4. **Every send is logged against the event** (`notify[].state`: `pending → sent → resolved`),
   because "we emailed you" is a claim somebody will eventually dispute.
5. **Failures are visible in the console**, not just in a log. An operator who never got an
   email should be able to see that the send failed rather than assume nothing happened.

## 5. What to build first

1. A `notify` table and a worker draining `notify[].state === 'pending'`.
2. Email via whatever the deployment already has (SES/SendGrid); the body is `lockoutNotice()`.
3. The console badge — an unresolved lockout is already rendered on the fleet board, so a failed
   send only needs a state to show.

Everything above the transport is done. Adding email should not require touching
`shared/src/lockouts.js` at all; if it does, the split was drawn in the wrong place.
