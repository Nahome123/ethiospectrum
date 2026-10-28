# Self-scheduled bookings: Consultation and Parent Support

Families book **Consultation** ($49.99) and **Parent Support** (free) by picking an
open time themselves. IEP Language Assistance is unchanged: administrator review,
specialist match, then proposed times.

## How it works

- **Open times** come from each specialist's weekly hours (Admin → Specialists →
  "Weekly hours for online booking"), in 30-minute steps, at least 2 hours ahead and
  up to 3 weeks out, minus confirmed appointments and times held during checkout.
  Families see them in their own time zone.
- **Who appears:** every specialist who is _Available_ and has the service's capability
  (remote, in that language). No names are hard-coded.
- **Consultation:** the family picks a specialist (or "Either — first available"), a
  language and a time, then pays. The time is held for 35 minutes; Stripe Checkout
  expires after 31. Payment confirms the booking and assigns that specialist. An
  expired Checkout cancels the booking and frees the time. If a payment arrives after
  the hold lapsed and someone else took the time, the request becomes "Reschedule
  requested" for staff to resolve.
- **Parent Support:** free, 30 minutes, remote. It is confirmed immediately (no payment
  stage) and hidden everywhere while no specialist offers it. A household may have one
  upcoming session at a time (Admin → Services → Parent Support → "Upcoming sessions
  allowed per household"; blank = no limit).
- **Meeting link:** each specialist's default meeting link (set with their weekly hours)
  is added to every session booked with them.
- Confirmation and reminder notifications/emails use the existing outbox.
- Administrators still see every booking in Admin → Service requests and can cancel
  (paid cancellations go to refund review, as before). To move a confirmed booking to
  another specialist, cancel the appointment, reassign, then schedule.

## Setup after deploying

1. Run `pnpm db:push` (migrations `20261027000000_service_prices` and
   `20261027010000_self_scheduling`).
2. **Yoftahe (Parent Support):** Admin → Users → make him a _Specialist_ if he is not
   one. Then Admin → Specialists → his card:
   - Capabilities: tick **Parent Support** for the languages he offers (English,
     Amharic). Leave Consultation and IEP unticked if he should not take them.
   - Availability: _Available_. Bio: one or two sentences families will see.
   - Weekly hours: set his time zone, the hours he takes sessions, and his meeting link.
     Save.
3. **Yamrot and Milka (Consultation):** on each card tick **Consultation** for their
   languages, keep them _Available_, add a short bio, and set weekly hours and a
   meeting link.
4. Check: sign in as a test household → Services. Parent Support shows "Free" and
   Consultation offers Yamrot, Milka and "Either"; open times appear.

A specialist with no weekly hours has no online times; turning a specialist
_Unavailable_ hides them from booking immediately.
