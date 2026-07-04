import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { 
  readDb, writeDb, cleanExpiredSlotHolds, addSystemLog 
} from './db.js';
import { generatePreVisitSummary, generatePostVisitSummary } from './gemini.js';
import { sendNotificationEmail, retryEmailLog } from './email.js';
import { syncGoogleCalendarEvent, calendarSyncLogs } from './calendar.js';
import { Appointment, SlotHold, DoctorProfile, MedicationReminder, User } from '../src/types.js';

// Setup file paths for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Simple Auth Middleware
// Reads 'Authorization: Bearer <userId>'
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const userId = authHeader.substring(7);
    const db = readDb();
    const user = db.users.find(u => u.id === userId);
    if (user) {
      (req as any).user = user;
    }
  }
  next();
});

// Periodic Cleanup of Slot Holds
setInterval(() => {
  cleanExpiredSlotHolds().catch(err => console.error('Cleanup error:', err));
}, 15000);

// --- Auth Endpoints ---

app.get('/api/auth/session', (req, res) => {
  const user = (req as any).user;
  if (user) {
    res.json({ success: true, user });
  } else {
    res.json({ success: false, user: null });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (user) {
    const savedPassword = db.passwords[user.id];
    if (savedPassword === password) {
      addSystemLog('info', `User logged in successfully: ${user.email} (${user.role})`);
      return res.json({ success: true, user });
    }
  }
  
  addSystemLog('warn', `Failed login attempt for email: ${email}`);
  res.status(401).json({ success: false, message: 'Invalid email or password' });
});

app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body;
  const db = readDb();
  
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ success: false, message: 'Email already registered' });
  }

  const userId = 'user_' + Math.random().toString(36).substr(2, 9);
  const newUser: User = {
    id: userId,
    name,
    email,
    role: 'patient'
  };

  db.users.push(newUser);
  db.passwords[userId] = password;
  
  addSystemLog('info', `New patient registered: ${email}`);
  await writeDb();

  res.json({ success: true, user: newUser });
});

// --- Doctors Endpoints ---

app.get('/api/doctors', (req, res) => {
  const db = readDb();
  res.json(db.doctors);
});

// Admin Only: Add/Update Doctor Profile
app.post('/api/admin/doctors', async (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin role required' });
  }

  const { doctorId, name, specialization, workingHours, slotDuration, leaveDays } = req.body;
  const db = readDb();

  let doctor = db.doctors.find(d => d.doctorId === doctorId);
  
  if (doctor) {
    // Update
    doctor.name = name;
    doctor.specialization = specialization;
    doctor.workingHours = workingHours;
    doctor.slotDuration = slotDuration;
    doctor.leaveDays = leaveDays || [];
    addSystemLog('info', `Admin updated doctor profile: ${name}`);
  } else {
    // Create new doctor user and profile
    const newDocId = doctorId || 'doc_' + Math.random().toString(36).substr(2, 9);
    
    // Create corresponding user if not exists
    if (!db.users.some(u => u.id === newDocId)) {
      db.users.push({
        id: newDocId,
        name,
        email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@clinic.com`,
        role: 'doctor'
      });
      db.passwords[newDocId] = 'doctor123'; // default password
    }

    doctor = {
      doctorId: newDocId,
      name,
      specialization,
      workingHours,
      slotDuration,
      leaveDays: leaveDays || []
    };
    db.doctors.push(doctor);
    addSystemLog('info', `Admin created new doctor profile: ${name}`);
  }

  await writeDb();
  res.json({ success: true, doctor });
});

// Admin Only: Mark Doctor on Leave and Notify Affected Patients
app.post('/api/admin/leave', async (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin role required' });
  }

  const { doctorId, date } = req.body;
  const db = readDb();

  const doctor = db.doctors.find(d => d.doctorId === doctorId);
  if (!doctor) {
    return res.status(404).json({ success: false, message: 'Doctor profile not found' });
  }

  if (!doctor.leaveDays.includes(date)) {
    doctor.leaveDays.push(date);
    addSystemLog('info', `Doctor ${doctor.name} marked on leave for ${date}`);
    
    // Find affected appointments
    const affectedApts = db.appointments.filter(
      a => a.doctorId === doctorId && a.date === date && a.status === 'Scheduled'
    );

    addSystemLog('warn', `Found ${affectedApts.length} active appointments affected by leave of ${doctor.name} on ${date}`);

    for (const apt of affectedApts) {
      apt.status = 'Cancelled';
      
      // Trigger leave conflict cancellation email to patient
      const mailSubject = `Urgently Cancelled: Your appointment with ${doctor.name} on ${date}`;
      const mailBody = `Dear ${apt.patientName},\n\nWe regret to inform you that Dr. ${doctor.name} is on leave on ${date}. Consequently, your appointment at ${apt.timeSlot} has been cancelled.\n\nPlease log in to the Clinic portal to schedule a new time slot with another specialist.\n\nWe apologize for any inconvenience caused.`;
      
      await sendNotificationEmail(apt.patientEmail, apt.patientName, mailSubject, mailBody, 'leave_conflict');
      
      // Cancel Google Calendar Event
      if (apt.calendarEventId) {
        await syncGoogleCalendarEvent(apt.id, 'DELETE');
      }
    }
  }

  await writeDb();
  res.json({ success: true, doctor });
});

// --- Appointment Endpoints & Double-Booking Prevention ---

app.get('/api/appointments', (req, res) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const db = readDb();
  let appointments: Appointment[] = [];

  if (user.role === 'admin') {
    appointments = db.appointments;
  } else if (user.role === 'doctor') {
    appointments = db.appointments.filter(a => a.doctorId === user.id);
  } else {
    appointments = db.appointments.filter(a => a.patientId === user.id);
  }

  res.json(appointments);
});

// Slot Hold mechanism to prevent concurrent double-booking
app.post('/api/appointments/hold', async (req, res) => {
  const patient = (req as any).user;
  if (!patient || patient.role !== 'patient') {
    return res.status(403).json({ success: false, message: 'Patient login required to hold a slot' });
  }

  const { doctorId, date, timeSlot } = req.body;
  const db = readDb();

  // First, check if the doctor is on leave
  const doctor = db.doctors.find(d => d.doctorId === doctorId);
  if (doctor?.leaveDays.includes(date)) {
    return res.status(400).json({ success: false, message: 'Doctor is on leave on this date' });
  }

  // Check if slot is already booked
  const alreadyBooked = db.appointments.some(
    a => a.doctorId === doctorId && a.date === date && a.timeSlot === timeSlot && a.status === 'Scheduled'
  );

  if (alreadyBooked) {
    addSystemLog('warn', `Booking collision avoided: Slot ${timeSlot} on ${date} already confirmed for doctor ${doctorId}`);
    return res.status(409).json({ success: false, message: 'Slot already booked' });
  }

  // Check if slot has an active hold by another patient
  const now = Date.now();
  const activeHoldIndex = db.slotHolds.findIndex(
    h => h.doctorId === doctorId && h.date === date && h.timeSlot === timeSlot && h.expiresAt > now
  );

  if (activeHoldIndex !== -1) {
    const activeHold = db.slotHolds[activeHoldIndex];
    if (activeHold.patientId !== patient.id) {
      addSystemLog('warn', `Hold conflict prevented: Slot ${timeSlot} on ${date} currently locked by another patient`);
      return res.status(409).json({ success: false, message: 'Slot is temporarily held by another patient' });
    } else {
      // Refresh current user's hold
      activeHold.expiresAt = Date.now() + 600000; // 10 minutes from now
      await writeDb();
      return res.json({ success: true, hold: activeHold, message: 'Refreshed your slot hold' });
    }
  }

  // Create new hold
  const holdId = 'hold_' + Math.random().toString(36).substr(2, 9);
  const newHold: SlotHold = {
    id: holdId,
    doctorId,
    date,
    timeSlot,
    patientId: patient.id,
    expiresAt: Date.now() + 600000 // 10 minutes lock
  };

  db.slotHolds.push(newHold);
  addSystemLog('info', `Created 10-minute hold for ${patient.name} on doctor ${doctorId} at ${date} ${timeSlot}`);
  await writeDb();

  res.json({ success: true, hold: newHold });
});

// Finalize Booking (consumes hold, checks conflicts, triggers LLM and Syncs)
app.post('/api/appointments/book', async (req, res) => {
  const patient = (req as any).user;
  if (!patient || patient.role !== 'patient') {
    return res.status(403).json({ success: false, message: 'Patient login required to book appointment' });
  }

  const { doctorId, date, timeSlot, symptoms, holdId } = req.body;
  const db = readDb();

  // Validate doctor exists
  const doctor = db.doctors.find(d => d.doctorId === doctorId);
  if (!doctor) {
    return res.status(404).json({ success: false, message: 'Doctor not found' });
  }

  // Double Check booking conflict
  const isBooked = db.appointments.some(
    a => a.doctorId === doctorId && a.date === date && a.timeSlot === timeSlot && a.status === 'Scheduled'
  );

  if (isBooked) {
    return res.status(409).json({ success: false, message: 'Slot already booked' });
  }

  // Consume/remove hold if provided
  if (holdId) {
    db.slotHolds = db.slotHolds.filter(h => h.id !== holdId);
  }

  // Create appointment
  const aptId = 'apt_' + Math.random().toString(36).substr(2, 9);
  const appointment: Appointment = {
    id: aptId,
    patientId: patient.id,
    patientName: patient.name,
    patientEmail: patient.email,
    doctorId,
    doctorName: doctor.name,
    date,
    timeSlot,
    symptoms,
    status: 'Scheduled',
    createdAt: new Date().toISOString()
  };

  db.appointments.unshift(appointment);
  addSystemLog('info', `Appointment ${aptId} booked successfully for ${patient.name} with ${doctor.name} on ${date} ${timeSlot}`);
  await writeDb();

  // Async process: LLM Pre-visit symptom summary & Urgency prediction
  // We do this server-side and log completion
  generatePreVisitSummary(symptoms)
    .then(async (aiResult) => {
      // Re-read db to avoid overwrite races
      const freshDb = readDb();
      const apt = freshDb.appointments.find(a => a.id === aptId);
      if (apt) {
        apt.urgencyLevel = aiResult.urgencyLevel;
        apt.aiPreVisitSummary = aiResult.chiefComplaint; // standard display mapping
        apt.aiPreVisitQuestions = aiResult.suggestedQuestions;
        await writeDb();
        addSystemLog('info', `AI Pre-visit summary fully attached to appointment ${aptId}. Urgency: ${aiResult.urgencyLevel}`);
      }
    })
    .catch(err => {
      addSystemLog('error', `Failed to generate LLM Pre-visit summary for appointment ${aptId}`, err?.message || String(err));
    });

  // Google Calendar Sync
  await syncGoogleCalendarEvent(aptId, 'CREATE');

  // Booking Confirmation Email
  const emailSubject = `Appointment Confirmed: ${doctor.name} - ${date} at ${timeSlot}`;
  const emailBody = `Dear ${patient.name},\n\nWe are pleased to confirm your appointment with Dr. ${doctor.name} on ${date} at ${timeSlot}.\n\nPlease arrive 10 minutes early. You can review and track your symptoms and updates in the patient portal.`;
  await sendNotificationEmail(patient.email, patient.name, emailSubject, emailBody, 'booking');

  res.json({ success: true, appointment });
});

// Cancel Appointment
app.post('/api/appointments/cancel', async (req, res) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const { id } = req.body;
  const db = readDb();
  const appointment = db.appointments.find(a => a.id === id);

  if (!appointment) {
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  }

  // Guard access: patient can cancel their own, doctor/admin can cancel scheduled ones
  if (user.role === 'patient' && appointment.patientId !== user.id) {
    return res.status(403).json({ success: false, message: 'Cannot cancel other patient\'s appointment' });
  }

  appointment.status = 'Cancelled';
  addSystemLog('info', `Appointment ${id} has been cancelled by ${user.name}`);
  await writeDb();

  // Send Cancellation Email
  const mailSubject = `Appointment Cancelled: Dr. ${appointment.doctorName} on ${appointment.date}`;
  const mailBody = `Dear ${appointment.patientName},\n\nThis is to confirm that your appointment with Dr. ${appointment.doctorName} scheduled for ${appointment.date} at ${appointment.timeSlot} has been cancelled.\n\nIf you did not request this, please contact the clinic.`;
  await sendNotificationEmail(appointment.patientEmail, appointment.patientName, mailSubject, mailBody, 'cancellation');

  // Calendar event deletion
  if (appointment.calendarEventId) {
    await syncGoogleCalendarEvent(id, 'DELETE');
  }

  res.json({ success: true, appointment });
});

// Reschedule Appointment (atomic Cancel + Rebook)
app.post('/api/appointments/reschedule', async (req, res) => {
  const patient = (req as any).user;
  if (!patient || patient.role !== 'patient') {
    return res.status(403).json({ success: false, message: 'Patient required to reschedule' });
  }

  const { id, date, timeSlot } = req.body;
  const db = readDb();

  const originalApt = db.appointments.find(a => a.id === id && a.patientId === patient.id);
  if (!originalApt) {
    return res.status(404).json({ success: false, message: 'Original appointment not found' });
  }

  // Check double-booking for the new slot
  const conflict = db.appointments.some(
    a => a.doctorId === originalApt.doctorId && a.date === date && a.timeSlot === timeSlot && a.status === 'Scheduled'
  );

  if (conflict) {
    return res.status(409).json({ success: false, message: 'Target time slot is already booked' });
  }

  // Update details
  const oldDate = originalApt.date;
  const oldTime = originalApt.timeSlot;
  
  originalApt.date = date;
  originalApt.timeSlot = timeSlot;
  originalApt.status = 'Scheduled'; // reset status if cancelled
  
  addSystemLog('info', `Appointment ${id} rescheduled from ${oldDate} ${oldTime} to ${date} ${timeSlot}`);
  await writeDb();

  // Resync Calendar
  await syncGoogleCalendarEvent(id, 'UPDATE');

  // Reschedule Confirmation Email
  const mailSubject = `Appointment Rescheduled: Dr. ${originalApt.doctorName}`;
  const mailBody = `Dear ${originalApt.patientName},\n\nYour appointment with Dr. ${originalApt.doctorName} has been rescheduled to ${date} at ${timeSlot}.\n\nOriginal appointment was scheduled on ${oldDate} at ${oldTime}.`;
  await sendNotificationEmail(originalApt.patientEmail, originalApt.patientName, mailSubject, mailBody, 'booking');

  res.json({ success: true, appointment: originalApt });
});

// Doctor Submits Post-visit Notes & Prescriptions (triggers LLM patient-friendly summarization)
app.post('/api/appointments/post-visit', async (req, res) => {
  const doctor = (req as any).user;
  if (!doctor || doctor.role !== 'doctor') {
    return res.status(403).json({ success: false, message: 'Doctor authorization required' });
  }

  const { id, notes, prescription, medications } = req.body;
  const db = readDb();

  const appointment = db.appointments.find(a => a.id === id && a.doctorId === doctor.id);
  if (!appointment) {
    return res.status(404).json({ success: false, message: 'Appointment not found' });
  }

  appointment.postVisitNotes = notes;
  appointment.prescription = prescription;
  appointment.status = 'Completed';

  addSystemLog('info', `Doctor ${doctor.name} submitted post-visit notes for appointment ${id}`);
  await writeDb();

  // Async process: LLM patient-friendly summary translation
  generatePostVisitSummary(notes + ' ' + (prescription || ''))
    .then(async (aiResult) => {
      const freshDb = readDb();
      const apt = freshDb.appointments.find(a => a.id === id);
      if (apt) {
        apt.aiPostVisitSummary = `${aiResult.summary}\n\n**Medication Instructions:**\n${aiResult.medicationSchedule}\n\n**Follow-up Plan:**\n${aiResult.followUp}`;
        await writeDb();
        addSystemLog('info', `AI Patient-Friendly post-visit summary completed for appointment ${id}`);
      }
    })
    .catch(err => {
      addSystemLog('error', `Failed to generate LLM Post-visit summary for appointment ${id}`, err?.message || String(err));
    });

  // Create medication reminders based on prescription
  if (medications && Array.isArray(medications)) {
    for (const med of medications) {
      if (med.name && med.frequency) {
        const reminderId = 'rem_' + Math.random().toString(36).substr(2, 9);
        const newReminder: MedicationReminder = {
          id: reminderId,
          appointmentId: id,
          patientName: appointment.patientName,
          patientEmail: appointment.patientEmail,
          doctorName: appointment.doctorName,
          medication: med.name,
          frequency: med.frequency,
          startDate: new Date().toISOString().split('T')[0],
          active: true
        };
        db.reminders.push(newReminder);
        addSystemLog('info', `Configured active medication reminder for ${appointment.patientName}: ${med.name} (${med.frequency})`);
      }
    }
    await writeDb();
  }

  // Send completed summary notification email
  const mailSubject = `Doctor's Visit Summary & Care Plan: Dr. ${doctor.name}`;
  const mailBody = `Dear ${appointment.patientName},\n\nYour post-visit care plan has been updated by Dr. ${doctor.name}.\n\nPrescription details:\n${prescription || 'None'}\n\nPlease check the patient portal to view the easy-to-understand summary and medication reminders.\n\nBe well,\nClinic Support`;
  await sendNotificationEmail(appointment.patientEmail, appointment.patientName, mailSubject, mailBody, 'reminder');

  res.json({ success: true, appointment });
});

// --- Medication Reminders Endpoints ---

app.get('/api/reminders', (req, res) => {
  const user = (req as any).user;
  if (!user) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  const db = readDb();
  if (user.role === 'admin') {
    res.json(db.reminders);
  } else {
    res.json(db.reminders.filter(r => r.patientEmail.toLowerCase() === user.email.toLowerCase()));
  }
});

// Admin-triggered Medication Reminders & Email Queue Background Job simulation
app.post('/api/reminders/trigger', async (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin permissions required' });
  }

  addSystemLog('info', 'Manual trigger for Scheduled Medication Reminders and Email Sync Retries initiated.');
  const db = readDb();
  
  let remindersSentCount = 0;
  const today = new Date().toISOString().split('T')[0];

  // 1. Process medication reminders
  for (const reminder of db.reminders) {
    if (reminder.active && reminder.lastSentDate !== today) {
      reminder.lastSentDate = today;
      remindersSentCount++;

      const mailSubject = `Medication Reminder: ${reminder.medication}`;
      const mailBody = `Dear ${reminder.patientName},\n\nThis is your scheduled daily reminder to take your medication prescribed by Dr. ${reminder.doctorName}:\n\nMedication: ${reminder.medication}\nFrequency: ${reminder.frequency}\n\nDo not skip doses. If you experience adverse side effects, contact the clinic immediately.`;
      
      await sendNotificationEmail(reminder.patientEmail, reminder.patientName, mailSubject, mailBody, 'reminder');
    }
  }

  // 2. Process and retry failed emails
  let retriedCount = 0;
  let successfulRetries = 0;
  for (const email of db.emailLogs) {
    if (email.status === 'failed' && email.retryCount < 3) {
      retriedCount++;
      const success = await retryEmailLog(email.id);
      if (success) successfulRetries++;
    }
  }

  await writeDb();

  res.json({
    success: true,
    message: `Scheduled background job completed. Reminders triggered: ${remindersSentCount}. Failed emails retried: ${retriedCount} (Success: ${successfulRetries}).`
  });
});

// --- System Logs & Diagnostics Endpoints ---

app.get('/api/logs/system', (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  const db = readDb();
  res.json(db.systemLogs);
});

app.get('/api/logs/emails', (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  const db = readDb();
  res.json(db.emailLogs);
});

app.post('/api/emails/retry', async (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  const { id } = req.body;
  const success = await retryEmailLog(id);
  res.json({ success, message: success ? 'Email sent successfully' : 'Retry failed' });
});

app.get('/api/logs/calendar', (req, res) => {
  const admin = (req as any).user;
  if (!admin || admin.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  res.json(calendarSyncLogs);
});

// --- Vite Production / Development Integrations ---

// Load default DB in memory initially
readDb();

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';
  
  if (!isProd) {
    // Development middleware mode for Vite
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    
    app.use(vite.middlewares);
    
    // Fallback page router for SPA in Dev Mode
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve('./index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Production static mode
    app.use(express.static(path.resolve('./dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('./dist/index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Full-Stack Express App listening on port ${PORT}`);
    addSystemLog('info', `Server boot successful. Running full-stack on port ${PORT}.`);
  });
}

startServer();
