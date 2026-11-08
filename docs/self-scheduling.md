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

## Parent Support role and self-managed availability

- **Admin -> Users -> role "Parent support"** makes someone Parent Support staff. They are set
  up automatically: a staff profile, taking bookings, and Parent Support in English and
  Amharic. They can only offer Parent Support, and they use the staff workspace
  (/specialist) to see their sessions.
- **My availability** (staff workspace sidebar) lets any staff member set their own time
  zone, weekly hours, meeting link, and pause or resume new bookings. Parent Support staff
  also choose their session languages there. Administrators can still edit anyone's hours
  in Admin -> Specialists.
- Run `pnpm db:push` for migrations `20261101000000_parent_support_role_enum` and
  `20261101000100_parent_support_role`. A role change signs the person out; they sign
  back in and land in the staff workspace.

## Parent Support: admin approval, then Calendly

Parent Support is no longer booked straight into a time (migrations
`20261103000000_parent_support_calendly` and
`20261107000000_parent_support_admin_approval`).

1. **Family:** on Services -> Parent Support (or the home-page spotlight) they
   choose the child and language and write a short note (10+ characters). The
   request appears in **Admin -> Service requests** as *Pending review* and
   administrators are notified. One request may wait for approval at a time.
2. **Administrator:** opens the request and clicks **Approve** (or declines it
   with a reason). Approving assigns the Parent Support provider who has a
   Calendly link and is taking bookings (preferring one who speaks the requested
   language) and notifies the family and the provider.
3. **Family:** their request page now shows the provider's Calendly page
   (email prefilled) to pick a time. Calendly sends the confirmation and
   reminders.
4. **Administrator:** after the session, **Mark completed** closes the request
   (or **Cancel request**).

**Provider setup:** in Calendly, create a free event type (for example
"Parent Support", 30 minutes, Zoom or Google Meet) and copy its link. Signed in
as the Parent Support provider, open **My availability**, paste it into
**Your Calendly link** and save. Without a link (or with bookings paused),
approval fails with a message telling the administrator to add one.

The Calendly link is never shown publicly; only a family whose request was
approved (and administrators) can see it. The time itself lives in Calendly,
not in the app.
