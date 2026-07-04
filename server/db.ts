import fs from 'fs';
import path from 'path';
import { 
  User, DoctorProfile, Appointment, SlotHold, EmailLog, MedicationReminder, SystemLog, UserRole 
} from '../src/types.js';

const DB_FILE = path.resolve('./db.json');

// Memory cache of DB
interface DatabaseSchema {
  users: User[];
  passwords: Record<string, string>; // userId -> password (stored securely as-is or simulated)
  doctors: DoctorProfile[];
  appointments: Appointment[];
  slotHolds: SlotHold[];
  emailLogs: EmailLog[];
  reminders: MedicationReminder[];
  systemLogs: SystemLog[];
}

let dbCache: DatabaseSchema = {
  users: [],
  passwords: {},
  doctors: [],
  appointments: [],
  slotHolds: [],
  emailLogs: [],
  reminders: [],
  systemLogs: []
};

// Queue to serialize disk writes and avoid race conditions or double-bookings
let writeQueue: Promise<void> = Promise.resolve();

function logSystem(level: 'info' | 'warn' | 'error', message: string, details?: string) {
  const log: SystemLog = {
    id: 'log_' + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    level,
    message,
    details
  };
  dbCache.systemLogs.unshift(log);
  if (dbCache.systemLogs.length > 500) {
    dbCache.systemLogs = dbCache.systemLogs.slice(0, 500);
  }
}

// Read database from disk
export function readDb(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = JSON.parse(data);
    } else {
      initializeDefaultDb();
      saveDbSync();
    }
  } catch (err: any) {
    console.error('Error reading DB, using cache:', err);
    logSystem('error', 'Failed to read database from disk', err?.message || String(err));
  }
  return dbCache;
}

// Queue a write operation
export function writeDb(): Promise<void> {
  const op = () => new Promise<void>((resolve) => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
      resolve();
    } catch (err: any) {
      console.error('Error writing DB:', err);
      logSystem('error', 'Failed to write database to disk', err?.message || String(err));
      resolve();
    }
  });

  writeQueue = writeQueue.then(op);
  return writeQueue;
}

function saveDbSync() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(dbCache, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB sync:', err);
  }
}

function initializeDefaultDb() {
  dbCache = {
    users: [
      { id: 'admin1', name: 'Dr. Sarah Jenkins (Admin)', email: 'admin@clinic.com', role: 'admin' },
      { id: 'doc1', name: 'Dr. Alex Rivera', email: 'rivera@clinic.com', role: 'doctor' },
      { id: 'doc2', name: 'Dr. Emily Chen', email: 'chen@clinic.com', role: 'doctor' },
      { id: 'pat1', name: 'John Doe', email: 'john.doe@gmail.com', role: 'patient' }
    ],
    passwords: {
      'admin1': 'admin123',
      'doc1': 'doctor123',
      'doc2': 'doctor123',
      'pat1': 'patient123'
    },
    doctors: [
      {
        doctorId: 'doc1',
        name: 'Dr. Alex Rivera',
        specialization: 'Cardiology',
        workingHours: { start: '09:00', end: '17:00' },
        slotDuration: 30,
        leaveDays: ['2026-07-05']
      },
      {
        doctorId: 'doc2',
        name: 'Dr. Emily Chen',
        specialization: 'Pediatrics',
        workingHours: { start: '08:00', end: '16:00' },
        slotDuration: 30,
        leaveDays: []
      }
    ],
    appointments: [
      {
        id: 'apt1',
        patientId: 'pat1',
        patientName: 'John Doe',
        patientEmail: 'john.doe@gmail.com',
        doctorId: 'doc1',
        doctorName: 'Dr. Alex Rivera',
        date: '2026-07-02',
        timeSlot: '10:00',
        symptoms: 'Mild chest pain after exercise and some fatigue',
        urgencyLevel: 'Medium',
        aiPreVisitSummary: 'Patient reports mild chest tightness/pain specifically following physical exertion, along with associated fatigue. No chest pain at rest mentioned.',
        aiPreVisitQuestions: [
          'Does the chest pain radiate to your left arm, neck, or jaw?',
          'How long does the tightness last after you stop exercising?',
          'Do you have any personal or family history of cardiac conditions?'
        ],
        status: 'Scheduled',
        createdAt: new Date().toISOString()
      }
    ],
    slotHolds: [],
    emailLogs: [
      {
        id: 'email_init',
        toEmail: 'john.doe@gmail.com',
        toName: 'John Doe',
        subject: 'Appointment Scheduled Successfully',
        body: 'Dear John Doe,\n\nYour appointment with Dr. Alex Rivera on 2026-07-02 at 10:00 has been scheduled.\n\nAI Pre-visit Analysis is ready for the doctor.',
        sentAt: new Date().toISOString(),
        type: 'booking',
        status: 'sent',
        retryCount: 0
      }
    ],
    reminders: [],
    systemLogs: [
      {
        id: 'log_init',
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Database initialized with default profiles and admin configurations'
      }
    ]
  };
}

// Clean up expired slot holds (e.g. longer than 5 minutes / 300000ms)
export async function cleanExpiredSlotHolds() {
  const now = Date.now();
  const initialCount = dbCache.slotHolds.length;
  dbCache.slotHolds = dbCache.slotHolds.filter(hold => hold.expiresAt > now);
  if (dbCache.slotHolds.length !== initialCount) {
    logSystem('info', `Cleaned up ${initialCount - dbCache.slotHolds.length} expired slot holds`);
    await writeDb();
  }
}

// Log utility exported
export function addSystemLog(level: 'info' | 'warn' | 'error', message: string, details?: string) {
  readDb();
  logSystem(level, message, details);
  writeDb();
}
