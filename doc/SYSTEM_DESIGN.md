# Healthcare Appointment Manager — System Design

## 1. Double-Booking Prevention (Four Layers)

The system prevents double-booking through four layered defenses.

**Layer 1 — Slot Hold (Temporal Lock):** When a patient selects a time slot, `POST /api/appointments/hold` creates a `SlotHold` with a 10-minute TTL (`server/index.ts:273`). Another patient attempting to hold the same slot is rejected with `"Slot is temporarily held by another patient"` (`server/index.ts:256`). If the same patient re-requests, their hold timer is refreshed. Expired holds are cleaned every 15 seconds by `cleanExpiredSlotHolds()` in the DB layer (`server/db.ts:172-180`).

**Layer 2 — Booking-time Conflict Check:** At booking (`POST /api/appointments/book`), the server re-verifies no `Scheduled` appointment exists for the same `doctorId + date + timeSlot` combination (`server/index.ts:300-306`). This catches edge cases where a hold expired or was cleaned while the user was on the booking screen. Returns `409 Conflict` if the slot was taken.

**Layer 3 — Write Serialization:** The JSON-file database uses a promise chain (`writeQueue` at `server/db.ts:33`) to serialize all disk writes. Every read-modify-write operation chains onto this queue, preventing race conditions from concurrent requests.

**Layer 4 — Hold Consumption:** When a booking succeeds, the hold is atomically removed from the `slotHolds` array (`server/index.ts:309-311`), preventing the same hold from being reused.

**Rescheduling** also performs an independent conflict check against the target slot (`server/index.ts:416-422`).

## 2. Doctor Leave Conflict Handling

**Data model:** Each `DoctorProfile` carries a `leaveDays: string[]` field — an array of `YYYY-MM-DD` dates (`src/types.ts:14`).

**Proactive prevention:** During the slot hold phase, `doctor.leaveDays.includes(date)` is checked (`server/index.ts:232`). If the doctor is on leave, the request is rejected immediately. The frontend also blocks UI interaction for leave dates by not rendering time-slot buttons (`src/App.tsx:710-713`).

**Administrative leave registration:** The admin endpoint `POST /api/admin/leave` (`server/index.ts:153-196`) allows marking a doctor as unavailable for a date. This triggers an **auto-cancellation cascade**:
1. All `Scheduled` appointments for that doctor on that date are located (`server/index.ts:172-174`)
2. Each is set to `Cancelled` status (`server/index.ts:179`)
3. A `leave_conflict` email is sent to every affected patient with subject `"Urgently Cancelled: Your appointment with <doctor> on <date>"` (`server/index.ts:182-185`)
4. Corresponding Google Calendar events are deleted if `calendarEventId` exists (`server/index.ts:188-190`)

This ensures that even after a leave is registered, no dangling bookings remain in the system.

## 3. Slot Hold Mechanism

The hold system implements a **time-bounded, ownership-aware, exclusive lock** pattern.

**Lifecycle:**
1. **Create:** `POST /api/appointments/hold` sets `expiresAt = Date.now() + 600000` (10 minutes). The hold object stores `doctorId`, `date`, `timeSlot`, and `patientId` (`server/index.ts:266-274`).
2. **Ownership check:** If another patient's active hold exists for the same slot, the API returns `400` (`server/index.ts:248-263`). If the requesting patient already owns the hold, the timer refreshes — useful if the user is still filling in the booking form.
3. **Consume:** On successful booking, the hold is spliced out of the array (`server/index.ts:309-311`).
4. **Expire:** The 15-second periodic cleanup filter `hold.expiresAt > now` removes stale holds, freeing the slot for other patients (`server/db.ts:174-175`).
5. **Frontend countdown:** The UI displays a live MM:SS timer (`src/App.tsx:112-124`). When it hits zero, the hold is cleared client-side and the user sees `"Your slot reservation has expired."`

**Design rationale:** The 10-minute window balances user experience (enough time to fill details) against slot availability (minimizing time a slot appears locked to others). Since the system is single-process, no distributed lock (Redis, etc.) is needed; the in-memory `slotHolds` array plus the serialized write queue provides sufficient atomicity.

## 4. Notification Failure Handling

**Email architecture:** `server/email.ts` uses Nodemailer with lazy transporter initialization. If SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`) are not configured in environment variables, the system operates in **simulated mode** — emails are logged as `sent` without actual delivery.

**Email log persistence:** Every notification attempt creates an `EmailLog` entry (`src/types.ts:55-66`) with fields `status`, `retryCount`, and `error`. Four log types exist: `booking`, `reminder`, `cancellation`, and `leave_conflict`. The log is capped at 300 entries.

**Retry mechanism:** `retryEmailLog()` (`server/email.ts:86-122`) increments `retryCount`, resets status to `pending`, and attempts delivery. Returns boolean success.

**Background retry job:** `POST /api/reminders/trigger` (`server/index.ts:531-573`) processes two things:
  1. Medication reminders due for sending
  2. Failed email retries — any `EmailLog` with `status === 'failed'` and `retryCount < 3` is retried (`server/index.ts:560`)

The `retryCount < 3` guard prevents infinite retry loops. Admin can also manually retry any specific failed email via `POST /api/emails/retry` (`server/index.ts:595-603`).

**Fallback behavior:** Because the email system degrades gracefully to simulated mode when SMTP is unconfigured, notification failure does not block the critical booking path. The appointment is created regardless of email delivery status — the email notification is fire-and-forget from the booking endpoint's perspective. This async decoupling means transient SMTP failures don't impact the patient's ability to book.

**Notification events across the lifecycle:**
| Event | Type | Location |
|-------|------|----------|
| Booking confirmed | `booking` | `server/index.ts:356-358` |
| Cancellation | `cancellation` | `server/index.ts:388-390` |
| Reschedule confirmation | `booking` | `server/index.ts:439-441` |
| Doctor leave conflict | `leave_conflict` | `server/index.ts:182-185` |
| Post-visit summary | `reminder` | `server/index.ts:507-509` |
| Medication reminder | `reminder` | `server/index.ts:549-552` |
