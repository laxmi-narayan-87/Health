import React, { useState, useEffect } from 'react';
import { 
  Activity, Calendar, Clock, User as UserIcon, Shield, FileText, Send, 
  Plus, AlertCircle, CheckCircle2, LogIn, UserPlus, LogOut, Search, 
  Trash2, RefreshCw, RefreshCcw, Bell, AlertTriangle, Play, HelpCircle, Pill, Mail, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, DoctorProfile, Appointment, SlotHold, EmailLog, MedicationReminder, SystemLog, UserRole 
} from './types';

export default function App() {
  // Current logged in user (starts with John Doe as default patient for quick test-drive)
  const [currentUser, setCurrentUser] = useState<User | null>({
    id: 'pat1',
    name: 'John Doe',
    email: 'john.doe@gmail.com',
    role: 'patient'
  });

  // Auth form states
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('john.doe@gmail.com');
  const [password, setPassword] = useState('patient123');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState('');

  // Domain states
  const [doctors, setDoctors] = useState<DoctorProfile[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [reminders, setReminders] = useState<MedicationReminder[]>([]);
  const [systemLogs, setSystemLogs] = useState<SystemLog[]>([]);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);
  const [calendarLogs, setCalendarLogs] = useState<any[]>([]);

  // Selection states
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('2026-07-02');
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>('');
  const [symptoms, setSymptoms] = useState<string>('');
  const [activeHold, setActiveHold] = useState<SlotHold | null>(null);
  const [holdTimer, setHoldTimer] = useState<number>(0); // remaining seconds
  
  // UI filter states
  const [specializationFilter, setSpecializationFilter] = useState<string>('All');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Form states for Admin
  const [newDocId, setNewDocId] = useState('');
  const [newDocName, setNewDocName] = useState('');
  const [newDocSpec, setNewDocSpec] = useState('Cardiology');
  const [newDocStart, setNewDocStart] = useState('09:00');
  const [newDocEnd, setNewDocEnd] = useState('17:00');
  const [newDocSlot, setNewDocSlot] = useState<number>(30);
  const [leaveDate, setLeaveDate] = useState('2026-07-05');

  // Form states for Doctor
  const [postVisitNotes, setPostVisitNotes] = useState('');
  const [prescription, setPrescription] = useState('');
  const [medsList, setMedsList] = useState<{ name: string; frequency: string }[]>([
    { name: '', frequency: 'Once daily' }
  ]);

  // Toast / System Notification status
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Trigger Notification helper
  const triggerToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Fetch all basic data
  const fetchData = async () => {
    try {
      const headers: HeadersInit = currentUser ? { 'Authorization': `Bearer ${currentUser.id}` } : {};
      
      const [docsRes, aptsRes, remRes] = await Promise.all([
        fetch('/api/doctors'),
        fetch('/api/appointments', { headers }),
        fetch('/api/reminders', { headers })
      ]);

      if (docsRes.ok) setDoctors(await docsRes.json());
      if (aptsRes.ok) setAppointments(await aptsRes.json());
      if (remRes.ok) setReminders(await remRes.json());

      // If admin, fetch diagnostic logs
      if (currentUser?.role === 'admin') {
        const [sysLogsRes, emailLogsRes, calLogsRes] = await Promise.all([
          fetch('/api/logs/system', { headers }),
          fetch('/api/logs/emails', { headers }),
          fetch('/api/logs/calendar', { headers })
        ]);
        if (sysLogsRes.ok) setSystemLogs(await sysLogsRes.json());
        if (emailLogsRes.ok) setEmailLogs(await emailLogsRes.json());
        if (calLogsRes.ok) setCalendarLogs(await calLogsRes.json());
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh periodically
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Countdown timer for Slot Lock hold
  useEffect(() => {
    if (!activeHold) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((activeHold.expiresAt - Date.now()) / 1000));
      setHoldTimer(remaining);
      if (remaining === 0) {
        setActiveHold(null);
        triggerToast("Your slot reservation has expired.", "error");
        fetchData();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeHold]);

  // Quick switch preloaded user profiles to make testing flawless
  const quickSwitchUser = (role: UserRole) => {
    let targetUser: User;
    if (role === 'patient') {
      targetUser = { id: 'pat1', name: 'John Doe', email: 'john.doe@gmail.com', role: 'patient' };
      setEmail('john.doe@gmail.com');
      setPassword('patient123');
    } else if (role === 'doctor') {
      targetUser = { id: 'doc1', name: 'Dr. Alex Rivera', email: 'rivera@clinic.com', role: 'doctor' };
      setEmail('rivera@clinic.com');
      setPassword('doctor123');
    } else {
      targetUser = { id: 'admin1', name: 'Dr. Sarah Jenkins (Admin)', email: 'admin@clinic.com', role: 'admin' };
      setEmail('admin@clinic.com');
      setPassword('admin123');
    }
    setCurrentUser(targetUser);
    setActiveHold(null);
    setSelectedAppointment(null);
    triggerToast(`Switched workspace context to: ${targetUser.name}`, "info");
  };

  // Auth Actions
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        setAuthError('');
        triggerToast(`Welcome back, ${data.user.name}!`, 'success');
      } else {
        setAuthError(data.message || 'Invalid credentials');
      }
    } catch (err) {
      setAuthError('Connection error');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentUser(data.user);
        setAuthError('');
        triggerToast("Account registered successfully!", 'success');
      } else {
        setAuthError(data.message || 'Registration failed');
      }
    } catch (err) {
      setAuthError('Connection error');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setActiveHold(null);
    setSelectedAppointment(null);
    triggerToast("Logged out of session", "info");
  };

  // Pre-booking slot hold acquisition (prevent double booking)
  const handleHoldSlot = async (docId: string, date: string, time: string) => {
    if (!currentUser) {
      triggerToast("Please log in to hold an appointment slot.", "error");
      return;
    }
    try {
      const res = await fetch('/api/appointments/hold', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ doctorId: docId, date, timeSlot: time })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setActiveHold(data.hold);
        setSelectedDoctorId(docId);
        setSelectedDate(date);
        setSelectedTimeSlot(time);
        triggerToast("Slot secured! Complete symptoms form within 10 minutes to book.", "success");
      } else {
        triggerToast(data.message || "Collision avoided: This slot is already taken or locked.", "error");
      }
    } catch (error) {
      triggerToast("Error locking slot.", "error");
    }
  };

  // Complete Booking Flow (consumes slot hold)
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedDoctorId || !selectedDate || !selectedTimeSlot || !symptoms.trim()) {
      triggerToast("Please specify symptoms to help AI compile a pre-visit summary.", "error");
      return;
    }

    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          date: selectedDate,
          timeSlot: selectedTimeSlot,
          symptoms,
          holdId: activeHold?.id
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerToast("Appointment scheduled! Google Calendar updated and confirmation sent.", "success");
        setActiveHold(null);
        setSymptoms('');
        fetchData();
      } else {
        triggerToast(data.message || "Booking failed.", "error");
      }
    } catch (err) {
      triggerToast("Network error during booking confirmation", "error");
    }
  };

  // Cancel Appointment
  const handleCancelAppointment = async (aptId: string) => {
    if (!currentUser) return;
    if (!confirm("Are you sure you want to cancel this appointment? This will notify both patient and doctor, delete Google Calendar event, and log the action.")) return;

    try {
      const res = await fetch('/api/appointments/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ id: aptId })
      });
      if (res.ok) {
        triggerToast("Appointment successfully cancelled. Notifications dispatched.", "success");
        if (selectedAppointment?.id === aptId) {
          setSelectedAppointment(null);
        }
        fetchData();
      } else {
        triggerToast("Could not cancel appointment.", "error");
      }
    } catch (err) {
      triggerToast("Connection failed", "error");
    }
  };

  // Reschedule Appointment
  const handleReschedule = async (aptId: string, newDate: string, newTime: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/appointments/reschedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ id: aptId, date: newDate, timeSlot: newTime })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerToast("Appointment rescheduled! Google Calendar synchronized.", "success");
        setSelectedAppointment(null);
        fetchData();
      } else {
        triggerToast(data.message || "Failed to reschedule due to booking collision.", "error");
      }
    } catch (err) {
      triggerToast("Network error", "error");
    }
  };

  // Doctor: Submit Post-visit Notes and trigger Medication reminders / summaries
  const handlePostVisitSubmit = async (e: React.FormEvent, aptId: string) => {
    e.preventDefault();
    if (!currentUser || !postVisitNotes.trim()) {
      triggerToast("Please provide clinical evaluation notes", "error");
      return;
    }

    const filteredMeds = medsList.filter(m => m.name.trim() !== '');

    try {
      const res = await fetch('/api/appointments/post-visit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({
          id: aptId,
          notes: postVisitNotes,
          prescription,
          medications: filteredMeds
        })
      });
      if (res.ok) {
        triggerToast("Prescription and care notes finalized. Patient summary generating in background.", "success");
        setPostVisitNotes('');
        setPrescription('');
        setMedsList([{ name: '', frequency: 'Once daily' }]);
        setSelectedAppointment(null);
        fetchData();
      } else {
        triggerToast("Error saving notes.", "error");
      }
    } catch (err) {
      triggerToast("Network error submitting notes", "error");
    }
  };

  // Admin: Create/Update Doctor Profile
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newDocName.trim()) {
      triggerToast("Doctor Name is required", "error");
      return;
    }

    try {
      const res = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({
          doctorId: newDocId || undefined,
          name: newDocName,
          specialization: newDocSpec,
          workingHours: { start: newDocStart, end: newDocEnd },
          slotDuration: Number(newDocSlot),
          leaveDays: []
        })
      });
      if (res.ok) {
        triggerToast(`Doctor profile for ${newDocName} successfully established!`, "success");
        setNewDocId('');
        setNewDocName('');
        fetchData();
      } else {
        triggerToast("Error saving doctor profile", "error");
      }
    } catch (err) {
      triggerToast("Connection failed", "error");
    }
  };

  // Admin: Mark Doctor on Leave (Triggers leaves cancellation sequence)
  const handleMarkLeave = async (docId: string, date: string) => {
    if (!currentUser || !date) return;
    if (!confirm(`Mark this doctor on leave on ${date}? This will cancellation-refund all active patient appointments on this date, send email warnings, and wipe corresponding calendar events!`)) return;

    try {
      const res = await fetch('/api/admin/leave', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ doctorId: docId, date })
      });
      if (res.ok) {
        triggerToast("Doctor registered on leave. Patient warnings dispatched successfully.", "success");
        fetchData();
      } else {
        triggerToast("Failed to schedule leave", "error");
      }
    } catch (err) {
      triggerToast("Connection error", "error");
    }
  };

  // Admin: Run manual Background job simulation (Medication notifications + Email retry)
  const handleRunBackgroundJob = async () => {
    if (!currentUser) return;
    triggerToast("Executing Scheduled Medication Reminders & Retry Queue...", "info");
    try {
      const res = await fetch('/api/reminders/trigger', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${currentUser.id}` }
      });
      const data = await res.json();
      if (res.ok) {
        triggerToast(data.message, "success");
        fetchData();
      } else {
        triggerToast("Background job failed", "error");
      }
    } catch (err) {
      triggerToast("Failed to contact task server", "error");
    }
  };

  // Admin: Force individual Email retry
  const handleRetryEmail = async (emailId: string) => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/emails/retry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.id}`
        },
        body: JSON.stringify({ id: emailId })
      });
      const data = await res.json();
      if (data.success) {
        triggerToast("Email retried and transmitted successfully!", "success");
        fetchData();
      } else {
        triggerToast("Retry failed. Check SMTP configuration.", "error");
      }
    } catch (err) {
      triggerToast("Failed to retry email", "error");
    }
  };

  // Get list of time slots based on working hours and duration
  const generateTimeSlots = (doc: DoctorProfile) => {
    const slots: string[] = [];
    try {
      const [startH, startM] = doc.workingHours.start.split(':').map(Number);
      const [endH, endM] = doc.workingHours.end.split(':').map(Number);
      
      let currentMinutes = startH * 60 + startM;
      const endMinutes = endH * 60 + endM;

      while (currentMinutes < endMinutes) {
        const h = Math.floor(currentMinutes / 60);
        const m = currentMinutes % 60;
        slots.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);
        currentMinutes += doc.slotDuration;
      }
    } catch {
      // fallback basic slots
      return ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];
    }
    return slots;
  };

  // Helper to add medication input row
  const addMedRow = () => {
    setMedsList([...medsList, { name: '', frequency: 'Once daily' }]);
  };

  return (
    <div id="app-root" className="min-h-screen bg-[#0c0e14] text-slate-200 font-sans relative overflow-x-hidden selection:bg-cyan-500/30 selection:text-white">
      {/* Background Mesh Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-900/15 blur-[130px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-cyan-900/15 blur-[130px]"></div>
      </div>

      {/* Floating System Status Toast Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-full px-4"
          >
            <div className={`p-4 rounded-xl border backdrop-blur-xl shadow-2xl flex items-start gap-3 ${
              notification.type === 'success' 
                ? 'bg-green-950/85 border-green-500/40 text-green-200 shadow-green-500/5' 
                : notification.type === 'error'
                ? 'bg-red-950/85 border-red-500/40 text-red-200 shadow-red-500/5'
                : 'bg-indigo-950/85 border-indigo-500/40 text-indigo-200 shadow-indigo-500/5'
            }`}>
              {notification.type === 'success' && <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />}
              {notification.type === 'error' && <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />}
              {notification.type === 'info' && <Bell className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />}
              <div className="flex-1 text-sm font-medium">{notification.message}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 h-16 border-b border-white/10 backdrop-blur-md bg-[#0c0e14]/75 flex items-center justify-between px-6 md:px-12 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-cyan-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/15">
            <Activity className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-tight text-white font-display">LaxmiClinic <span className="text-cyan-400 font-mono text-[10px] tracking-widest px-2 py-0.5 bg-cyan-950/60 rounded-full border border-cyan-500/30">V2.1 PRO</span></h1>
            <p className="text-[10px] text-white/40 font-mono hidden sm:block">Healthcare Sync & Symptom Intelligence Platform</p>
          </div>
        </div>

        {/* Workspace Quick Switcher bar */}
        <div className="flex items-center gap-2 bg-black/40 p-1 rounded-full border border-white/5">
          <span className="text-[9px] text-white/40 font-bold uppercase tracking-wider px-2.5">Portal:</span>
          <button 
            onClick={() => quickSwitchUser('patient')} 
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${currentUser?.role === 'patient' ? 'bg-cyan-500 text-slate-900 font-bold shadow-md shadow-cyan-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Patient
          </button>
          <button 
            onClick={() => quickSwitchUser('doctor')} 
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${currentUser?.role === 'doctor' ? 'bg-indigo-500 text-white font-bold shadow-md shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Doctor
          </button>
          <button 
            onClick={() => quickSwitchUser('admin')} 
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${currentUser?.role === 'admin' ? 'bg-purple-500 text-white font-bold shadow-md shadow-purple-500/20' : 'text-slate-400 hover:text-white'}`}
          >
            Admin
          </button>
        </div>

        {/* User profile / Logout */}
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden md:block">
                <div className="text-xs font-medium text-white">{currentUser.name}</div>
                <div className="text-[10px] text-white/40 font-mono">{currentUser.email}</div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 transition-colors"
                title="Logout Session"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Demo mode</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Body */}
      <main className="max-w-7xl mx-auto p-4 md:p-8 relative z-10 grid grid-cols-12 gap-6">
        
        {/* Active Slot Hold Timer Indicator Banner */}
        {activeHold && (
          <div className="col-span-12 bg-gradient-to-r from-cyan-950/80 to-indigo-950/80 border border-cyan-500/40 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 backdrop-blur-md shadow-lg shadow-cyan-500/5">
            <div className="flex items-center gap-3 text-center md:text-left">
              <div className="w-10 h-10 rounded-full bg-cyan-950 flex items-center justify-center text-cyan-400 border border-cyan-400/40">
                <Clock className="w-5 h-5 animate-spin" style={{ animationDuration: '60s' }} />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-white">Temporary Booking Slot Locked (Double-Booking Prevention Active)</h4>
                <p className="text-xs text-slate-300">
                  You reserved <span className="text-cyan-400 font-mono font-bold">Dr. {doctors.find(d => d.doctorId === activeHold.doctorId)?.name || 'Specialist'}</span> for <span className="font-semibold text-white">{activeHold.date}</span> at <span className="font-semibold text-white">{activeHold.timeSlot}</span>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center bg-black/40 px-4 py-2 rounded-lg border border-white/10">
                <div className="text-[10px] text-white/40 uppercase tracking-wider font-mono">Expires In</div>
                <div className="text-lg font-bold font-mono text-cyan-400">
                  {Math.floor(holdTimer / 60)}:{(holdTimer % 60).toString().padStart(2, '0')}
                </div>
              </div>
              <a href="#booking-form" className="px-5 py-2 rounded-lg bg-cyan-500 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 hover:bg-cyan-400 transition-colors">
                Finalize Now
              </a>
            </div>
          </div>
        )}

        {/* PORTAL VIEWS */}
        <div className="col-span-12">
          
          {/* 1. PATIENT PORTAL */}
          {currentUser?.role === 'patient' && (
            <div className="space-y-6">
              
              {/* Patient Banner & Actions */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl"></div>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 font-mono">PATIENT PORTAL DASHBOARD</span>
                    <h2 className="text-2xl font-bold tracking-tight text-white font-display mt-1">Hello, {currentUser.name}</h2>
                    <p className="text-xs text-slate-300 mt-1 max-w-xl">
                      Book appointments, describe symptoms securely for real-time clinician summary logs, and monitor medication prescription alerts.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <a href="#book-section" className="px-4 py-2 bg-gradient-to-r from-cyan-400 to-indigo-500 text-slate-950 font-bold rounded-xl text-xs hover:shadow-cyan-500/10 hover:shadow-lg transition-all">
                      + Schedule Consultation
                    </a>
                    <a href="#reminders-section" className="px-4 py-2 bg-white/10 border border-white/10 text-white rounded-xl text-xs hover:bg-white/20 transition-all">
                      View Active Meds
                    </a>
                  </div>
                </div>
              </div>

              {/* Booking Scheduler Wizard */}
              <div id="book-section" className="grid grid-cols-12 gap-6">
                
                {/* Search & Slot Grid selector */}
                <div className="col-span-12 lg:col-span-8 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-white/5">
                    <div>
                      <h3 className="text-base font-semibold text-white">1. Select Specialist & Find Free Slots</h3>
                      <p className="text-xs text-white/40">Guarded with atomic 10-min slot holds to prevent dual bookings</p>
                    </div>
                    
                    {/* Specialization filter */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-white/40 font-mono">Specialization:</span>
                      <select 
                        value={specializationFilter}
                        onChange={(e) => setSpecializationFilter(e.target.value)}
                        className="bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-400"
                      >
                        <option value="All">All Specialities</option>
                        <option value="Cardiology">Cardiology</option>
                        <option value="Pediatrics">Pediatrics</option>
                        <option value="General Medicine">General Medicine</option>
                      </select>
                    </div>
                  </div>

                  {/* Doctor List Cards */}
                  <div className="space-y-4">
                    {doctors
                      .filter(doc => specializationFilter === 'All' || doc.specialization === specializationFilter)
                      .map(doc => {
                        const slots = generateTimeSlots(doc);
                        return (
                          <div key={doc.doctorId} className="p-4 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-all">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 mb-3 border-b border-white/5">
                              <div>
                                <h4 className="text-sm font-semibold text-white">{doc.name}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-[10px] font-mono text-cyan-400 px-2 py-0.5 bg-cyan-950/60 border border-cyan-500/20 rounded-md">{doc.specialization}</span>
                                  <span className="text-[10px] text-white/40 font-mono">Slot Duration: {doc.slotDuration} min</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-xs font-mono text-slate-300">Hours: {doc.workingHours.start} - {doc.workingHours.end}</div>
                                {doc.leaveDays.length > 0 && (
                                  <div className="text-[10px] text-red-400 font-mono mt-0.5">
                                    Leaves Scheduled: {doc.leaveDays.join(', ')}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Live Time Slots Grid */}
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-white/40 tracking-wider uppercase font-mono">Pick Target Date</span>
                                <input 
                                  type="date" 
                                  value={selectedDate}
                                  onChange={(e) => setSelectedDate(e.target.value)}
                                  min="2026-07-01"
                                  className="bg-black/60 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-white text-right focus:outline-none focus:border-cyan-400"
                                />
                              </div>

                              {doc.leaveDays.includes(selectedDate) ? (
                                <div className="p-3 rounded-lg bg-red-950/20 border border-red-500/20 text-center text-xs text-red-300">
                                  ⚠️ Dr. {doc.name} is marked as ON LEAVE on {selectedDate}. No appointments can be reserved.
                                </div>
                              ) : (
                                <div>
                                  <div className="text-[9px] text-slate-400 font-mono mb-1.5">Available Consultations on {selectedDate}:</div>
                                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                                    {slots.map(slot => {
                                      // Check if already booked
                                      const isBooked = appointments.some(
                                        a => a.doctorId === doc.doctorId && a.date === selectedDate && a.timeSlot === slot && a.status === 'Scheduled'
                                      );
                                      // Check if held by another patient
                                      const isHeld = false; // logic resolved on server, mock state handles gracefully
                                      
                                      const isCurrentSelection = selectedDoctorId === doc.doctorId && selectedDate === selectedDate && selectedTimeSlot === slot;

                                      return (
                                        <button
                                          key={slot}
                                          disabled={isBooked}
                                          onClick={() => handleHoldSlot(doc.doctorId, selectedDate, slot)}
                                          className={`py-2 rounded-lg text-xs font-mono transition-all ${
                                            isBooked 
                                              ? 'bg-red-950/20 text-red-400/40 line-through border border-red-950/40 cursor-not-allowed'
                                              : isCurrentSelection
                                              ? 'bg-cyan-500 text-slate-950 font-bold border border-cyan-400 shadow-md shadow-cyan-500/10'
                                              : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
                                          }`}
                                        >
                                          {slot}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Confirm Form Column */}
                <div id="booking-form" className="col-span-12 lg:col-span-4 space-y-6">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md shadow-lg relative">
                    <h3 className="text-base font-semibold text-white mb-4">2. Complete Clinical Symptom Intake</h3>
                    
                    {selectedTimeSlot ? (
                      <form onSubmit={handleConfirmBooking} className="space-y-4">
                        <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200">
                          <div className="font-mono text-[9px] text-cyan-400/60 uppercase tracking-widest font-bold">RESERVATION SUMMARY</div>
                          <div className="mt-1 font-semibold text-white">Dr. {doctors.find(d => d.doctorId === selectedDoctorId)?.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-300">{selectedDate} @ {selectedTimeSlot}</div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1.5">
                            Describe Your Symptoms (Required)
                          </label>
                          <textarea
                            required
                            rows={4}
                            value={symptoms}
                            onChange={(e) => setSymptoms(e.target.value)}
                            placeholder="Describe what you are feeling in detail (e.g., 'Mild chest pain after exercise', 'Heavy coughing for 3 days with minor fever')."
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 placeholder:text-slate-500"
                          ></textarea>
                          <span className="text-[9px] text-slate-400 mt-1 block">
                            🤖 Laxmi AI will process your notes in real-time to generate a pre-visit clinical summary for the doctor.
                          </span>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-cyan-500 text-slate-900 font-bold text-xs shadow-md shadow-cyan-500/20 hover:bg-cyan-400 transition-colors"
                        >
                          Confirm & Book Appointment
                        </button>
                      </form>
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        <HelpCircle className="w-10 h-10 text-white/10 mx-auto mb-2" />
                        <p className="text-xs">No slot selected</p>
                        <p className="text-[10px] text-white/30 mt-1">Please select an available time slot from a specialist on the left grid to begin.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* Active Bookings List */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-base font-semibold text-white">My Active Consultation History</h3>
                    <p className="text-xs text-white/40">Includes live statuses, Google Calendar synced events, and doctor evaluation summaries</p>
                  </div>
                  <button onClick={fetchData} className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white transition-colors">
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>

                {appointments.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 border border-dashed border-white/10 rounded-xl bg-black/20">
                    You have no active appointments scheduled. Let's schedule your first one!
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {appointments.map(apt => (
                      <div 
                        key={apt.id} 
                        className={`p-5 rounded-xl border backdrop-blur-sm transition-all ${
                          apt.status === 'Cancelled' 
                            ? 'bg-red-950/5 border-red-500/10 opacity-75' 
                            : apt.status === 'Completed'
                            ? 'bg-green-950/5 border-green-500/20'
                            : 'bg-black/30 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <span className={`text-[9px] font-mono font-bold tracking-wider uppercase px-2 py-0.5 rounded-full ${
                              apt.status === 'Cancelled' ? 'bg-red-900/30 text-red-300' :
                              apt.status === 'Completed' ? 'bg-green-900/30 text-green-300' :
                              'bg-cyan-950 text-cyan-300 border border-cyan-500/20'
                            }`}>
                              {apt.status}
                            </span>
                            <h4 className="text-sm font-bold text-white mt-2">{apt.doctorName}</h4>
                            <p className="text-xs text-slate-300 font-mono">{apt.date} @ {apt.timeSlot}</p>
                          </div>
                          
                          {/* Sync details */}
                          {apt.calendarEventId && apt.status !== 'Cancelled' && (
                            <div className="flex items-center gap-1.5 text-[9px] font-mono text-green-400 bg-green-950/40 border border-green-500/20 px-2 py-0.5 rounded-md">
                              <Calendar className="w-3 h-3 text-green-400" />
                              <span>Google Cal Sync Active</span>
                            </div>
                          )}
                        </div>

                        {/* Symptoms Summary */}
                        <div className="mt-3.5 bg-black/40 p-3 rounded-lg border border-white/5">
                          <div className="text-[9px] font-mono text-white/40 uppercase tracking-widest font-bold">Your Reported Symptoms:</div>
                          <p className="text-xs text-slate-300 italic mt-1 font-sans">"{apt.symptoms}"</p>
                        </div>

                        {/* Pre-visit AI triage report */}
                        {apt.urgencyLevel && (
                          <div className="mt-3 bg-cyan-950/20 border border-cyan-500/20 p-3 rounded-lg">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-bold text-cyan-400 font-mono uppercase tracking-wider flex items-center gap-1">
                                <Activity className="w-3.5 h-3.5" /> Laxmi AI Symptom Triage:
                              </span>
                              <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                apt.urgencyLevel === 'High' ? 'bg-red-500/25 text-red-300 border border-red-500/40' :
                                apt.urgencyLevel === 'Medium' ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/40' :
                                'bg-green-500/25 text-green-300 border border-green-500/40'
                              }`}>
                                Urgency: {apt.urgencyLevel}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">{apt.aiPreVisitSummary}</p>
                            {apt.aiPreVisitQuestions && apt.aiPreVisitQuestions.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-cyan-500/10">
                                <div className="text-[9px] text-white/40 font-mono">Suggested prep questions for the clinician:</div>
                                <ul className="list-disc pl-4 mt-1 space-y-0.5 text-xs text-slate-300">
                                  {apt.aiPreVisitQuestions.map((q, idx) => <li key={idx}>{q}</li>)}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Post-visit doctor logs summary */}
                        {apt.postVisitNotes && (
                          <div className="mt-3 bg-indigo-950/20 border border-indigo-500/20 p-3 rounded-lg">
                            <h5 className="text-[10px] font-bold text-indigo-400 font-mono uppercase tracking-wider flex items-center gap-1">
                              <FileText className="w-3.5 h-3.5" /> Doctor's Care Plan & Prescription:
                            </h5>
                            <div className="text-xs text-slate-300 mt-1.5 whitespace-pre-line">
                              {apt.aiPostVisitSummary || `Prescribed: ${apt.prescription}\nNotes: ${apt.postVisitNotes}`}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        {apt.status === 'Scheduled' && (
                          <div className="mt-4 pt-3 border-t border-white/5 flex gap-2">
                            <button 
                              onClick={() => handleCancelAppointment(apt.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs font-semibold hover:bg-red-900/20 transition-all flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Cancel Consultation
                            </button>
                            
                            {/* Reschedule micro-form inline */}
                            <button 
                              onClick={() => {
                                const newD = prompt("Enter new Date (YYYY-MM-DD):", apt.date);
                                const newT = prompt("Enter new Time Slot (HH:MM):", apt.timeSlot);
                                if (newD && newT) handleReschedule(apt.id, newD, newT);
                              }}
                              className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/10 transition-all flex items-center gap-1.5"
                            >
                              <RefreshCcw className="w-3.5 h-3.5" /> Reschedule
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Patient Reminders */}
              <div id="reminders-section" className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                <h3 className="text-base font-semibold text-white mb-1.5">My Active Medication Reminder Alerts</h3>
                <p className="text-xs text-white/40 mb-4">Triggered automatically by clinical background cycles</p>
                
                {reminders.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 border border-dashed border-white/10 rounded-xl bg-black/20 text-xs">
                    No active prescriptions requiring daily medication alerts.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {reminders.map(rem => (
                      <div key={rem.id} className="p-4 rounded-xl bg-black/40 border border-white/10 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-cyan-950/80 border border-cyan-500/30 flex items-center justify-center shrink-0">
                          <Pill className="w-4 h-4 text-cyan-400" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">{rem.medication}</h4>
                          <p className="text-[10px] text-cyan-400 font-mono mt-0.5">{rem.frequency}</p>
                          <p className="text-[9px] text-white/40 font-mono mt-1">Prescribed by {rem.doctorName}</p>
                          {rem.lastSentDate && (
                            <span className="text-[9px] text-green-400 font-mono block mt-1.5">
                              ✓ Last Alert Sent: {rem.lastSentDate}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* 2. DOCTOR PORTAL */}
          {currentUser?.role === 'doctor' && (
            <div className="space-y-6">
              
              {/* Doctor Banner */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl"></div>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 font-mono">DOCTOR SPECIALIST WORKSPACE</span>
                    <h2 className="text-2xl font-bold tracking-tight text-white font-display mt-1">Hello, {currentUser.name}</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Evaluate pre-visit symptom triage details compiled by Laxmi AI, input post-visit diagnoses, and establish structured medication frequency alerts.
                    </p>
                  </div>
                </div>
              </div>

              {/* Consultation List & Intake Engine */}
              <div className="grid grid-cols-12 gap-6">
                
                {/* Appointment lists */}
                <div className="col-span-12 lg:col-span-7 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white mb-4">Active Consultations & Scheduled Visits</h3>

                  {appointments.filter(a => a.status === 'Scheduled').length === 0 ? (
                    <div className="p-12 text-center text-slate-400 border border-dashed border-white/10 rounded-xl bg-black/20 text-xs">
                      No consultations scheduled for today.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {appointments
                        .filter(a => a.status === 'Scheduled')
                        .map(apt => (
                          <div 
                            key={apt.id} 
                            onClick={() => setSelectedAppointment(apt)}
                            className={`p-4 rounded-xl border transition-all cursor-pointer ${
                              selectedAppointment?.id === apt.id 
                                ? 'bg-indigo-950/30 border-indigo-500/60 shadow-lg shadow-indigo-500/5' 
                                : 'bg-black/40 border-white/5 hover:border-white/10'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h4 className="text-sm font-semibold text-white">{apt.patientName}</h4>
                                <p className="text-xs text-slate-300 font-mono">{apt.date} @ {apt.timeSlot}</p>
                              </div>
                              {apt.urgencyLevel && (
                                <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                                  apt.urgencyLevel === 'High' ? 'bg-red-500/25 text-red-300 border border-red-500/40' :
                                  apt.urgencyLevel === 'Medium' ? 'bg-yellow-500/25 text-yellow-300 border border-yellow-500/40' :
                                  'bg-green-500/25 text-green-300 border border-green-500/40'
                                }`}>
                                  Urgency: {apt.urgencyLevel}
                                </span>
                              )}
                            </div>
                            
                            <div className="mt-3 text-xs text-slate-400 bg-black/30 p-2.5 rounded border border-white/5">
                              <span className="font-semibold text-white/50">Reported Symptoms:</span> {apt.symptoms}
                            </div>
                            
                            <div className="mt-2.5 text-[10px] text-indigo-400 font-mono text-right hover:underline">
                              Click to perform Evaluation & Post-Visit Summary →
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  <h3 className="text-sm font-semibold text-white mt-8 mb-4">Completed Consultations Log</h3>
                  <div className="space-y-2">
                    {appointments
                      .filter(a => a.status === 'Completed')
                      .map(apt => (
                        <div key={apt.id} className="p-3.5 rounded-xl bg-black/20 border border-white/5 text-xs">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-300">{apt.patientName}</span>
                            <span className="text-[10px] text-green-400 font-mono">Completed ✓</span>
                          </div>
                          <p className="text-[10px] text-white/40 mt-0.5 font-mono">{apt.date}</p>
                          <p className="text-slate-400 text-[11px] mt-2 italic bg-black/40 p-2 rounded border border-white/5">
                            "{apt.postVisitNotes}"
                          </p>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Right evaluation sidebar */}
                <div className="col-span-12 lg:col-span-5">
                  <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md sticky top-24">
                    <h3 className="text-base font-semibold text-white mb-4">Clinician Care Intake Panel</h3>

                    {selectedAppointment ? (
                      <form onSubmit={(e) => handlePostVisitSubmit(e, selectedAppointment.id)} className="space-y-4">
                        <div className="p-4 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs">
                          <div className="font-mono text-[9px] text-indigo-400/80 uppercase tracking-widest font-bold">Active Patient File</div>
                          <div className="mt-1 font-semibold text-white text-sm">{selectedAppointment.patientName}</div>
                          <div className="text-[10px] text-white/40 mt-0.5">{selectedAppointment.patientEmail}</div>
                          
                          <div className="mt-3 pt-3 border-t border-indigo-500/10">
                            <span className="font-semibold text-slate-300 block mb-1">Pre-visit AI Triage Summary:</span>
                            <p className="text-slate-400">{selectedAppointment.aiPreVisitSummary || 'Laxmi AI preparing summaries...'}</p>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1.5">
                            Clinical Notes & Diagnoses (Required)
                          </label>
                          <textarea
                            required
                            rows={4}
                            value={postVisitNotes}
                            onChange={(e) => setPostVisitNotes(e.target.value)}
                            placeholder="Type details of your clinical examination. (e.g., 'Advised hydration, blood labs, avoid heavy cardio for 1 week. Prescribed Amoxicillin to clear bronchial infection.')"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-500"
                          ></textarea>
                        </div>

                        <div>
                          <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1.5">
                            Prescription Details (Text Representation)
                          </label>
                          <input
                            type="text"
                            value={prescription}
                            onChange={(e) => setPrescription(e.target.value)}
                            placeholder="Amoxicillin 500mg tablets, take 3 times daily for 7 days"
                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-400 placeholder:text-slate-500"
                          />
                        </div>

                        {/* Structured reminders trigger generator */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider">
                              Configure Active Medication Reminders
                            </label>
                            <button 
                              type="button" 
                              onClick={addMedRow}
                              className="text-[9px] font-bold text-indigo-400 hover:underline flex items-center gap-0.5"
                            >
                              + Add Medication Row
                            </button>
                          </div>

                          <div className="space-y-2">
                            {medsList.map((med, index) => (
                              <div key={index} className="flex gap-2">
                                <input
                                  type="text"
                                  value={med.name}
                                  placeholder="e.g. Amoxicillin"
                                  onChange={(e) => {
                                    const list = [...medsList];
                                    list[index].name = e.target.value;
                                    setMedsList(list);
                                  }}
                                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-500"
                                />
                                <select
                                  value={med.frequency}
                                  onChange={(e) => {
                                    const list = [...medsList];
                                    list[index].frequency = e.target.value;
                                    setMedsList(list);
                                  }}
                                  className="bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white"
                                >
                                  <option value="Once daily">Once daily</option>
                                  <option value="Twice daily">Twice daily</option>
                                  <option value="Three times daily">Three times daily</option>
                                  <option value="Every 8 hours">Every 8 hours</option>
                                </select>
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          type="submit"
                          className="w-full py-2.5 rounded-xl bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-500/20 hover:bg-indigo-400 transition-colors"
                        >
                          Submit Care Plan & Finalize Visit
                        </button>
                      </form>
                    ) : (
                      <div className="py-16 text-center text-slate-400 border border-dashed border-white/10 rounded-xl bg-black/10">
                        <UserIcon className="w-10 h-10 text-white/10 mx-auto mb-2" />
                        <p className="text-xs">No active consultation file loaded</p>
                        <p className="text-[10px] text-white/30 mt-1">Please select an active scheduled consultation on the left to review metrics and submit prescriptions.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>
          )}

          {/* 3. ADMIN PORTAL */}
          {currentUser?.role === 'admin' && (
            <div className="space-y-6">
              
              {/* Admin Hero */}
              <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-2xl p-6 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl"></div>
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-400 font-mono">CLINICAL CONTROL CENTER</span>
                    <h2 className="text-2xl font-bold tracking-tight text-white font-display mt-1">System Administration Panel</h2>
                    <p className="text-xs text-slate-300 mt-1">
                      Manage medical personnel profiles, initiate leave conflict cancellations, run simulated cron-triggers, and view real-time log sandboxes.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleRunBackgroundJob}
                      className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold shadow-lg shadow-purple-600/20 hover:bg-purple-500 flex items-center gap-1.5 transition-all"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> Trigger Simulation Background Job
                    </button>
                    <button 
                      onClick={fetchData} 
                      className="p-2 bg-white/5 border border-white/10 text-white rounded-xl hover:bg-white/10"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Manage Clinicians */}
              <div className="grid grid-cols-12 gap-6">
                
                {/* Create/Update Doctor Form */}
                <div className="col-span-12 lg:col-span-5 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white mb-1">Create or Edit Medical Specialist Profile</h3>
                  <p className="text-xs text-white/40 mb-4">Adds profile, generates account credential access, maps working parameters</p>

                  <form onSubmit={handleCreateDoctor} className="space-y-4">
                    <div>
                      <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">Doctor ID (Leave empty for new)</label>
                      <input
                        type="text"
                        value={newDocId}
                        onChange={(e) => setNewDocId(e.target.value)}
                        placeholder="e.g. doc1, doc2, doc_cardio"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">Doctor Name (Required)</label>
                      <input
                        type="text"
                        required
                        value={newDocName}
                        onChange={(e) => setNewDocName(e.target.value)}
                        placeholder="e.g. Dr. Alex Rivera"
                        className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">Specialization</label>
                        <select
                          value={newDocSpec}
                          onChange={(e) => setNewDocSpec(e.target.value)}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                        >
                          <option value="Cardiology">Cardiology</option>
                          <option value="Pediatrics">Pediatrics</option>
                          <option value="General Medicine">General Medicine</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">Slot duration (min)</label>
                        <select
                          value={newDocSlot}
                          onChange={(e) => setNewDocSlot(Number(e.target.value))}
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white"
                        >
                          <option value={15}>15 minutes</option>
                          <option value={20}>20 minutes</option>
                          <option value={30}>30 minutes</option>
                          <option value={45}>45 minutes</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">Start Hours</label>
                        <input
                          type="text"
                          required
                          value={newDocStart}
                          onChange={(e) => setNewDocStart(e.target.value)}
                          placeholder="e.g. 09:00"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono text-white/50 uppercase tracking-wider mb-1">End Hours</label>
                        <input
                          type="text"
                          required
                          value={newDocEnd}
                          onChange={(e) => setNewDocEnd(e.target.value)}
                          placeholder="e.g. 17:00"
                          className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-400"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-500 transition-colors"
                    >
                      Create or Save Specialist Profile
                    </button>
                  </form>
                </div>

                {/* List Doctors and Manage Leaves */}
                <div className="col-span-12 lg:col-span-7 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white mb-1">Medical Specialist Profiles & Leaves Management</h3>
                  <p className="text-xs text-white/40 mb-4">Mark leave dates to test conflict warnings and real-time patient-refund cancellations</p>

                  <div className="space-y-4">
                    {doctors.map(doc => (
                      <div key={doc.doctorId} className="p-4 rounded-xl bg-black/30 border border-white/5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-3 border-b border-white/5">
                          <div>
                            <span className="text-[10px] text-white/40 font-mono">ID: {doc.doctorId}</span>
                            <h4 className="text-sm font-semibold text-white">{doc.name}</h4>
                            <p className="text-xs text-purple-400 font-mono">{doc.specialization} • Working hours: {doc.workingHours.start} - {doc.workingHours.end}</p>
                          </div>
                          
                          {/* Leave Days Pill List */}
                          <div className="text-right">
                            <span className="text-[10px] text-white/40 block">Leave days scheduled:</span>
                            <div className="flex flex-wrap gap-1 mt-1 justify-end">
                              {doc.leaveDays.length === 0 ? (
                                <span className="text-[10px] italic text-green-400">No leaves planned</span>
                              ) : (
                                doc.leaveDays.map(ld => (
                                  <span key={ld} className="text-[9px] font-mono font-bold bg-purple-950/80 text-purple-300 px-2 py-0.5 border border-purple-500/20 rounded-full">{ld}</span>
                                ))
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Leave Conflict Form Action */}
                        <div className="flex flex-col sm:flex-row items-center gap-3 bg-black/40 p-3 rounded-lg border border-white/5">
                          <span className="text-[10px] font-mono text-slate-300 shrink-0">Schedule New Leave for Dr. {doc.name.split(' ').slice(-1)[0]}:</span>
                          <div className="flex gap-2 w-full">
                            <input 
                              type="date" 
                              value={leaveDate}
                              onChange={(e) => setLeaveDate(e.target.value)}
                              className="flex-1 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:border-purple-400"
                            />
                            <button 
                              type="button"
                              onClick={() => handleMarkLeave(doc.doctorId, leaveDate)}
                              className="px-3 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-500 transition-colors"
                            >
                              Confirm Leave
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>

              {/* Admin Sandbox System logs */}
              <div className="grid grid-cols-12 gap-6">
                
                {/* Email Logs Sandbox */}
                <div className="col-span-12 lg:col-span-6 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <div className="flex justify-between items-center mb-3">
                    <div>
                      <h3 className="text-base font-semibold text-white">Email Communications log Sandbox</h3>
                      <p className="text-xs text-white/40">Real-time captured SMTP transactions and retry indicators</p>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-3 p-1">
                    {emailLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-white/10 rounded-xl text-xs bg-black/20">
                        No emails sent during this session.
                      </div>
                    ) : (
                      emailLogs.map(log => (
                        <div key={log.id} className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <span className={`text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                log.type === 'booking' ? 'bg-cyan-900/40 text-cyan-300' :
                                log.type === 'leave_conflict' ? 'bg-red-900/40 text-red-300' :
                                'bg-purple-900/40 text-purple-300'
                              }`}>
                                {log.type}
                              </span>
                              <h4 className="text-xs font-bold text-white mt-1.5">To: {log.toName} ({log.toEmail})</h4>
                            </div>
                            <span className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                              log.status === 'sent' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                              log.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            }`}>
                              {log.status}
                            </span>
                          </div>

                          <div className="bg-black/60 p-2 rounded text-[10px] font-mono text-slate-300 leading-relaxed max-h-24 overflow-y-auto">
                            <span className="font-bold text-white block mb-0.5">Subject: {log.subject}</span>
                            {log.body}
                          </div>

                          <div className="flex justify-between items-center text-[9px] font-mono text-slate-400">
                            <span>Sent: {new Date(log.sentAt).toLocaleTimeString()}</span>
                            {log.status === 'failed' && (
                              <button 
                                onClick={() => handleRetryEmail(log.id)}
                                className="px-2 py-0.5 rounded bg-red-600/30 border border-red-500/30 text-red-200 hover:bg-red-500/30"
                              >
                                Retry Sync now (Attempts: {log.retryCount})
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Google Calendar Logs Sandbox */}
                <div className="col-span-12 lg:col-span-6 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white">Google Calendar API Synchronization transactions</h3>
                  <p className="text-xs text-white/40 mb-3">Sync events triggers for bookings, rescheduling, and doctor leaves</p>

                  <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-3 p-1">
                    {calendarLogs.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 border border-dashed border-white/10 rounded-xl text-xs bg-black/20">
                        No calendar synchronized transactions captured yet.
                      </div>
                    ) : (
                      calendarLogs.map(log => (
                        <div key={log.id} className="p-3 rounded-xl bg-black/40 border border-white/5 font-mono text-[10px] leading-relaxed space-y-1.5">
                          <div className="flex justify-between">
                            <span className="font-bold text-white">[{log.method}] {log.action} EVENT</span>
                            <span className={`font-bold px-1.5 py-0.5 rounded text-[9px] ${
                              log.status === 'SUCCESS' || log.status === 'MOCK_SUCCESS' ? 'text-green-400 bg-green-950/60' : 'text-red-400 bg-red-950/60'
                            }`}>{log.status}</span>
                          </div>
                          <div className="text-slate-400">URL: <span className="text-white/60 text-[9px]">{log.endpoint}</span></div>
                          <div className="bg-black/60 p-2 rounded text-slate-300 max-h-24 overflow-y-auto leading-normal">
                            <span className="text-cyan-400 block mb-1">Payload:</span>
                            {log.payload ? JSON.stringify(log.payload, null, 2) : 'No payload (Event deleted)'}
                          </div>
                          <div className="text-green-400/80 bg-green-950/20 border border-green-500/10 p-1.5 rounded text-[9px]">{log.responseDetails}</div>
                          <div className="text-right text-[8px] text-white/30">Synced: {new Date(log.timestamp).toLocaleTimeString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* System Diagnostics Logs */}
                <div className="col-span-12 bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md">
                  <h3 className="text-base font-semibold text-white">Laxmi System Diagnostics & Clinician Logs</h3>
                  <p className="text-xs text-white/40 mb-3">Logs tracking appointments locks, dual booking protection logic, LLM triggers, and background jobs</p>

                  <div className="max-h-60 overflow-y-auto custom-scrollbar space-y-1.5 bg-black/50 p-4 rounded-xl border border-white/5 font-mono text-xs">
                    {systemLogs.map(log => (
                      <div key={log.id} className="flex gap-2 py-0.5 border-b border-white/5 last:border-0 hover:bg-white/5">
                        <span className="text-white/30 shrink-0">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        <span className={`font-bold shrink-0 uppercase text-[10px] ${
                          log.level === 'error' ? 'text-red-400' :
                          log.level === 'warn' ? 'text-yellow-400' :
                          'text-cyan-400'
                        }`}>
                          [{log.level}]
                        </span>
                        <span className="text-slate-300">{log.message}</span>
                        {log.details && <span className="text-white/40 text-[10px] italic">({log.details})</span>}
                      </div>
                    ))}
                  </div>
                </div>

              </div>

            </div>
          )}

        </div>

      </main>

      {/* Footer / Dev panel bar */}
      <footer className="mt-20 border-t border-white/10 py-8 bg-black/40 text-[11px] text-white/30 font-mono text-center relative z-10 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-left">
            <div>CLINICAL ENVIRONMENT STATUS: <span className="text-green-500 font-bold">READY</span></div>
            <div className="text-white/20 text-[10px] mt-0.5">Dual Sandbox Engine (Google Calendar Sync + Real-time Triage Prompt Analyzer)</div>
          </div>
          <div>
            Built with pure React 19, Express Backend Proxy, and custom Frosted Glass themes.
          </div>
        </div>
      </footer>

    </div>
  );
}
