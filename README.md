# Laxmi Healthcare

Full-stack patient scheduling, symptom triage, and care coordination platform powered by Gemini 2.5 AI.

**Live Demo**: [https://health-production-d4d9.up.railway.app/](https://health-production-d4d9.up.railway.app/)

---

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **AI**: Gemini 2.5 Flash
- **Calendar**: Google Calendar OAuth 2.0
- **Database**: Local JSON file with atomic queued writes

---

## Quick Start

```bash
git clone <repo>
cd healthcare-appointment-manager
npm install
cp .env.example .env
npm run dev
```

Opens at `http://localhost:3000`.

### Production

```bash
npm run build && npm run start
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | No | — | Gemini AI key (falls back to heuristics engine) |
| `APP_URL` | Yes | `http://localhost:3000` | Host URL |
| `GOOGLE_CLIENT_ID` | No | — | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | No | — | Google Calendar OAuth |
| `SMTP_HOST` | No | — | SMTP server |
| `SMTP_PORT` | No | — | SMTP port |
| `SMTP_USER` | No | — | SMTP username |
| `SMTP_PASS` | No | — | SMTP password |
| `SMTP_FROM` | No | `noreply@clinicmanager.com` | Sender address |

Emails are simulated and logged in the Admin Sandbox if SMTP is unconfigured.

---

## Database Schema

Six entities stored in `db.json` with serialized write operations.

### Users
| Field | Type | Notes |
|---|---|---|
| `id` | string | e.g. `pat1`, `doc1` |
| `name` | string | |
| `email` | string | Unique |
| `role` | string | `patient` / `doctor` / `admin` |

### Doctor Profiles
| Field | Type | Notes |
|---|---|---|
| `doctorId` | string | PK, references User |
| `name` | string | |
| `specialization` | string | Cardiology / Pediatrics / General Medicine |
| `workingHours` | object | `{ start: "09:00", end: "17:00" }` |
| `slotDuration` | number | Minutes per slot |
| `leaveDays` | string[] | `YYYY-MM-DD` dates |

### Appointments
| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `patientId` / `patientName` / `patientEmail` | string | Patient info |
| `doctorId` / `doctorName` | string | Doctor info |
| `date` / `timeSlot` | string | `YYYY-MM-DD` / `HH:MM` |
| `symptoms` | string | Patient input |
| `urgencyLevel` | string | Low / Medium / High (AI) |
| `aiPreVisitSummary` / `aiPreVisitQuestions` | string / string[] | AI triage |
| `postVisitNotes` / `prescription` | string | Clinician input |
| `aiPostVisitSummary` | string | Patient-friendly AI summary |
| `status` | string | Scheduled / Cancelled / Completed |
| `calendarEventId` | string | Google Calendar ref |
| `createdAt` | string | ISO timestamp |

### Slot Holds
| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `doctorId` / `date` / `timeSlot` | string | Lock target |
| `patientId` | string | Who holds it |
| `expiresAt` | number | Unix ms (10 min) |

### Email Logs
| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `toEmail` / `toName` / `subject` / `body` | string | Message details |
| `sentAt` | string | ISO timestamp |
| `type` | string | booking / reminder / cancellation / leave_conflict |
| `status` | string | sent / pending / failed |
| `retryCount` | number | Attempts |
| `error` | string | Failure details |

### Medication Reminders
| Field | Type | Notes |
|---|---|---|
| `id` | string | PK |
| `appointmentId` | string | References Appointment |
| `patientName` / `patientEmail` | string | Patient |
| `doctorName` | string | Prescriber |
| `medication` / `frequency` | string | e.g. Amoxicillin / Twice daily |
| `startDate` | string | `YYYY-MM-DD` |
| `lastSentDate` | string | Dedup tracker |
| `active` | boolean | |

---

## API Endpoints

All responses are `application/json`. Authenticated routes use `Authorization: Bearer <userId>`.

### Auth
| Method | Endpoint |
|---|---|
| POST | `/api/auth/register` |
| POST | `/api/auth/login` |
| GET | `/api/auth/session` |

### Doctors
| Method | Endpoint |
|---|---|
| GET | `/api/doctors` |
| POST | `/api/admin/doctors` |
| POST | `/api/admin/leave` |

### Appointments
| Method | Endpoint |
|---|---|
| GET | `/api/appointments` |
| POST | `/api/appointments/hold` |
| POST | `/api/appointments/book` |
| POST | `/api/appointments/cancel` |
| POST | `/api/appointments/reschedule` |
| POST | `/api/appointments/post-visit` |

### Admin
| Method | Endpoint |
|---|---|
| GET | `/api/reminders` |
| POST | `/api/reminders/trigger` |
| GET | `/api/logs/system` |
| GET | `/api/logs/emails` |
| POST | `/api/emails/retry` |
| GET | `/api/logs/calendar` |

---

## AI Prompts

### Pre-Visit Triage
```
Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>

Return your response as a JSON object with EXACTLY the following keys:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "A concise single-sentence summary of the main symptom reported",
  "suggestedQuestions": ["Question 1", "Question 2", "Question 3"]
}

CRITICAL: Return ONLY valid, minified JSON. Do not include markdown codeblocks or backticks.
```

### Post-Visit Summary
```
Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>

Return your response as a JSON object with EXACTLY the following keys:
{
  "summary": "A warm, patient-friendly summary of what was found, written in second-person 'you'",
  "medicationSchedule": "Clear instructions for taking any prescribed medications, or 'No specific medication' if none",
  "followUp": "Actionable follow-up steps and when to follow up"
}

CRITICAL: Return ONLY valid, minified JSON. Do not include markdown codeblocks or backticks.
```

### Graceful Degradation
- Falls back to Clinical Heuristics Engine if `GEMINI_API_KEY` is missing
- Try-catch + schema guards log errors without breaking the booking flow

---

## Google Calendar Setup

1. Create a project in [Google Cloud Console](https://console.cloud.google.com)
2. Enable **Google Calendar API**
3. Configure **OAuth consent screen** (External, scopes: `.../auth/calendar`, `.../auth/calendar.events`)
4. Create **OAuth 2.0 credentials** (Web app) — redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

---

## Architecture Highlights

### Double-Booking Prevention
Write operations are serialized via a promise chain. Each booking verifies no existing `Scheduled` appointment for the same doctor/date/slot before committing. Conflicts return `409`.

### Slot Hold System
Patients get a 10-minute exclusive hold. Held slots are hidden from others. Concurrent hold requests return `409`. Expired holds are purged every 15 seconds.

### Leave Management
Registering leave for a doctor:
1. Blocks new bookings on that date
2. Auto-cancels existing appointments
3. Notifies affected patients via email
4. Removes corresponding Google Calendar events

### Email Reliability
- Emails start as `pending`; failures are logged with error details
- Admin can trigger retries via `POST /api/reminders/trigger` (up to 3 attempts)
- Dashboard shows send status with manual retry controls
