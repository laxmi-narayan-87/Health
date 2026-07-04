export type UserRole = 'patient' | 'doctor' | 'admin';

export interface WorkingHours {
  start: string; // e.g. "09:00"
  end: string;   // e.g. "17:00"
}

export interface DoctorProfile {
  doctorId: string;
  name: string;
  specialization: string;
  workingHours: WorkingHours;
  slotDuration: number; // in minutes, e.g. 30
  leaveDays: string[];  // e.g. ["2026-07-10", "2026-07-11"]
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  doctorProfile?: DoctorProfile; // populated if role === 'doctor'
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  doctorId: string;
  doctorName: string;
  date: string;       // YYYY-MM-DD
  timeSlot: string;   // HH:MM
  symptoms: string;
  urgencyLevel?: 'Low' | 'Medium' | 'High';
  aiPreVisitSummary?: string;
  aiPreVisitQuestions?: string[];
  postVisitNotes?: string;
  prescription?: string;
  aiPostVisitSummary?: string;
  status: 'Scheduled' | 'Cancelled' | 'Completed';
  calendarEventId?: string;
  createdAt: string;
}

export interface SlotHold {
  id: string;
  doctorId: string;
  date: string;       // YYYY-MM-DD
  timeSlot: string;   // HH:MM
  patientId: string;
  expiresAt: number;  // timestamp (ms)
}

export interface EmailLog {
  id: string;
  toEmail: string;
  toName: string;
  subject: string;
  body: string;
  sentAt: string;
  type: 'booking' | 'reminder' | 'cancellation' | 'leave_conflict';
  status: 'sent' | 'pending' | 'failed';
  retryCount: number;
  error?: string;
}

export interface MedicationReminder {
  id: string;
  appointmentId: string;
  patientName: string;
  patientEmail: string;
  doctorName: string;
  medication: string;
  frequency: string; // e.g. "Every 8 hours", "Once daily"
  startDate: string;  // YYYY-MM-DD
  lastSentDate?: string; // YYYY-MM-DD
  active: boolean;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: string;
}
