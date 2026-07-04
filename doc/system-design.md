# System Design Write-Up

## Double-Booking Prevention

Slot contention is handled through serialized write operations. All booking requests pass through a single backend promise chain (`server/db.ts` write queue), ensuring sequential processing. Before committing any booking, the system checks for an existing `Scheduled` appointment with the same `doctorId`, `date`, and `timeSlot`. If a conflict is detected, the request is rejected with a `409 Conflict` status.

The write queue uses a promise-based lock pattern. Each write operation is chained to the previous one via `.then()`, guaranteeing atomicity without external locking infrastructure. This offline-first approach works with the local `db.json` file and does not require a database server.

## Slot Hold Mechanism

To prevent booking conflicts during the patient decision window, a temporary 10-minute hold is placed on selected slots. When a patient opens a time slot for booking, the backend creates a `SlotHold` record in `db.json` containing `patientId`, `doctorId`, `date`, `timeSlot`, and an `expiresAt` timestamp set to `Date.now() + 600,000ms`.

While a hold is active:
- The slot is hidden from other patients in the UI
- Concurrent hold requests for the same slot are rejected with `409 Slot held`
- A background cleanup task runs every 15 seconds, removing expired holds and releasing slots back to the available pool

The hold system prevents the last-mile race condition where two patients see the same available slot and attempt to book simultaneously. By requiring a hold before booking, the system adds a locking layer that reduces contention windows.

## Doctor Leave Conflict Resolution

When an administrator registers leave for a doctor, the system executes a multi-step resolution protocol:

1. The leave date is added to the doctor's `leaveDays` array, immediately blocking any new holds or bookings for that date
2. The system queries all `Scheduled` appointments matching the doctor and leave date
3. Each affected appointment is atomically updated to `Cancelled`
4. A cancellation log entry is created for each affected appointment
5. An automated email notification is dispatched to each affected patient explaining the cancellation and prompting rescheduling
6. Corresponding Google Calendar events for cancelled appointments are removed via the Calendar API

This approach ensures no patient is left with an invalid booking. The email notification step uses the same queued delivery system, so even if SMTP is temporarily unavailable, notifications are queued and retried.

## Notification Failure Handling

Email notifications depend on third-party SMTP services that can suffer transient failures. The platform implements a transaction-safe retry framework:

**State Tracking**: Every email is created with a `pending` status. On successful SMTP delivery, it transitions to `sent`. On failure, it is saved as `failed` with the exact error message stored in the log.

**Retry Logic**: An admin-triggered background job (`POST /api/reminders/trigger`) scans for failed email records with fewer than 3 retry attempts. Each eligible email is retried, and the retry count is incremented regardless of outcome. This gives each email up to 3 delivery attempts.

**Admin Dashboard**: The admin panel provides visual indicators for email status. Failed emails are highlighted, and each entry has a manual retry button for one-click redelivery. The system logs capture timestamps, error details, and retry history for auditing.

**Graceful Degradation**: If SMTP is completely unconfigured, the system never fails — it simulates email delivery and logs everything in the sandbox. The entire application remains functional without email, making it suitable for demo and development environments.
