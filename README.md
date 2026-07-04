# Laxmi Healthcare Appointment & Triage Manager

A full-stack patient scheduling, symptom triage, and care coordination platform with Gemini 2.5 AI integration, Google Calendar OAuth 2.0 sync, role-based portals (Patient, Doctor, Admin), slot holding, doctor leave management, and email queuing with retry.

---

## 1. Setup & Installation

Built with **React 19 (Vite)** frontend and **Express.js** backend on Node.js with TypeScript.

### Prerequisites
- Node.js v18+
- npm v9+

### Installation

```bash
cd healthcare-appointment-manager
npm install
cp .env.example .env
```

Configure your `.env` with API credentials (see Section 2).

### Run

- **Development**: `npm run dev` — starts on http://localhost:3000
- **Production**: `npm run build && npm run start`

---

## 2. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GEMINI_API_KEY` | No | Gemini AI key. Falls back to heuristics engine if omitted. |
| `APP_URL` | Yes | Host URL (e.g., `http://localhost:3000`) |
| `GOOGLE_CLIENT_ID` | No | For Google Calendar OAuth 2.0 |
| `GOOGLE_CLIENT_SECRET` | No | For Google Calendar OAuth 2.0 |
| `SMTP_HOST` | No | SMTP server for email notifications |
| `SMTP_PORT` | No | SMTP port |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `SMTP_FROM` | No | Default: `noreply@clinicmanager.com` |

If SMTP is unconfigured, emails are simulated and logged in the Admin Email Sandbox.

---

## 3. Database Schema

Uses an offline-first local `db.json` with atomic queued writes to prevent race conditions.

### Users
| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key (e.g., `pat1`, `doc1`) |
| `name` | string | Full name |
| `email` | string | Unique email |
| `role` | string | `patient`, `doctor`, or `admin` |

### Doctor Profiles
| Field | Type | Description |
|---|---|---|
| `doctorId` | string | Primary key, references User |
| `name` | string | Professional name |
| `specialization` | string | `Cardiology`, `Pediatrics`, or `General Medicine` |
| `workingHours` | object | `{ start: "09:00", end: "17:00" }` |
| `slotDuration` | number | Minutes per consultation (e.g., 30) |
| `leaveDays` | string[] | Leave dates in `YYYY-MM-DD` format |

### Appointments
| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `patientId` | string | References User |
| `patientName` | string | For quick lookup |
| `patientEmail` | string | For communications |
| `doctorId` | string | References DoctorProfile |
| `doctorName` | string | For quick lookup |
| `date` | string | `YYYY-MM-DD` |
| `timeSlot` | string | `HH:MM` |
| `symptoms` | string | Patient's reported symptoms |
| `urgencyLevel` | string | `Low`, `Medium`, or `High` (AI-predicted) |
| `aiPreVisitSummary` | string | AI triage summary |
| `aiPreVisitQuestions` | string[] | Suggested doctor questions |
| `postVisitNotes` | string | Clinician notes |
| `prescription` | string | Recommended medications |
| `aiPostVisitSummary` | string | Patient-friendly AI summary |
| `status` | string | `Scheduled`, `Cancelled`, or `Completed` |
| `calendarEventId` | string | Google Calendar event ID |
| `createdAt` | string | ISO timestamp |

### Slot Holds
| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `doctorId` | string | References DoctorProfile |
| `date` | string | Hold date |
| `timeSlot` | string | Hold time |
| `patientId` | string | References User |
| `expiresAt` | number | Unix epoch (10-minute validity) |

### Email Logs
| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `toEmail` | string | Recipient email |
| `toName` | string | Recipient name |
| `subject` | string | Subject line |
| `body` | string | Plain text body |
| `sentAt` | string | ISO timestamp |
| `type` | string | `booking`, `reminder`, `cancellation`, or `leave_conflict` |
| `status` | string | `sent`, `pending`, or `failed` |
| `retryCount` | number | Retry attempts |
| `error` | string | Error message on failure |

### Medication Reminders
| Field | Type | Description |
|---|---|---|
| `id` | string | Primary key |
| `appointmentId` | string | References Appointment |
| `patientName` | string | Patient name |
| `patientEmail` | string | Target email |
| `doctorName` | string | Prescribing clinician |
| `medication` | string | Medicine name |
| `frequency` | string | e.g., `Once daily`, `Twice daily` |
| `startDate` | string | `YYYY-MM-DD` |
| `lastSentDate` | string | Tracks last alert to avoid duplicates |
| `active` | boolean | Active status |

---

## 4. API Reference

All payloads and responses use `application/json`. Authenticated routes require `Authorization: Bearer <userId>`.

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new patient |
| POST | `/api/auth/login` | Authenticate user |
| GET | `/api/auth/session` | Validate current session |

### Doctors & Leave
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/doctors` | List all doctors |
| POST | `/api/admin/doctors` | Create/update doctor profile (Admin) |
| POST | `/api/admin/leave` | Mark doctor leave (Admin) |

### Appointments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/appointments` | Get filtered appointments |
| POST | `/api/appointments/hold` | Request 10-min slot hold (Patient) |
| POST | `/api/appointments/book` | Confirm booking (Patient) |
| POST | `/api/appointments/cancel` | Cancel appointment |
| POST | `/api/appointments/reschedule` | Reschedule appointment |
| POST | `/api/appointments/post-visit` | Submit post-visit notes (Doctor) |

### Reminders & Logs
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/reminders` | Get active reminders |
| POST | `/api/reminders/trigger` | Trigger reminders manually (Admin) |
| GET | `/api/logs/system` | System logs (Admin) |
| GET | `/api/logs/emails` | Email transaction logs (Admin) |
| POST | `/api/emails/retry` | Retry failed email (Admin) |
| GET | `/api/logs/calendar` | Calendar sync logs (Admin) |

---

## 5. LLM Prompts & Error Handling

Uses Gemini 2.5 Flash (`gemini-2.5-flash`) via `@google/genai` SDK with structured JSON schema enforcement.

### Pre-Visit Symptom Analysis
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

### Post-Visit Clinical Summary
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
- If `GEMINI_API_KEY` is missing, falls back to the Clinical Heuristics Engine
- Try-catch blocks with schema guards catch API failures and log diagnostics
- Appointments remain bookable and post-visit records are saved regardless of AI availability

---

## 6. Google Calendar Integration

1. Create a Google Cloud Console project and name it (e.g., `Laxmi Clinic Manager`)
2. Enable **Google Calendar API**
3. Configure OAuth consent screen (External, scopes: `.../auth/calendar`, `.../auth/calendar.events`)
4. Create OAuth 2.0 credentials (Web application) with redirect URI: `http://localhost:3000/api/auth/google/callback`
5. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`

---

## 7. System Design

### Double-Booking Prevention
Slot writes are serialized through a backend promise chain. Before confirming a booking, the system verifies no `Scheduled` appointment exists for the same `doctorId`, `date`, and `timeSlot`. Conflicts return `409 Conflict`.

### Slot Hold Mechanism
When a patient opens a slot, a 10-minute hold is registered in `slotHolds`. During the hold:
- The slot is hidden from others
- Concurrent hold requests on the same slot return `409`
- A background cleaner runs every 15 seconds to flush expired holds

### Doctor Leave Resolution
When leave is registered for a doctor:
1. The date is added to `leaveDays`, blocking new bookings
2. Existing `Scheduled` appointments on that date are cancelled
3. Affected patients are notified via SMTP
4. Google Calendar events are removed

### Notification Reliability
- Emails are initialized as `pending`; failures are logged with error details
- A cron trigger (`POST /api/reminders/trigger`) retries failed emails (up to 3 attempts)
- Admin dashboard provides visual indicators and manual retry controls
