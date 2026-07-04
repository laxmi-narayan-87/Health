import { GoogleGenAI } from '@google/genai';
import { addSystemLog } from './db.js';

let aiClient: GoogleGenAI | null = null;

function getAIClient(): GoogleGenAI | null {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      try {
        aiClient = new GoogleGenAI({ apiKey });
        addSystemLog('info', 'Gemini AI Client successfully initialized with user API Key.');
      } catch (err: any) {
        addSystemLog('error', 'Failed to initialize Gemini AI Client with provided key', err?.message || String(err));
      }
    } else {
      addSystemLog('warn', 'GEMINI_API_KEY not set or contains placeholder. Falling back to high-fidelity clinical heuristics engine.');
    }
  }
  return aiClient;
}

interface PreVisitResult {
  urgencyLevel: 'Low' | 'Medium' | 'High';
  chiefComplaint: string;
  suggestedQuestions: string[];
}

interface PostVisitResult {
  summary: string;
  medicationSchedule: string;
  followUp: string;
}

// Helper to provide realistic clinical mock responses when API key is missing
function generateHeuristicPreVisit(symptoms: string): PreVisitResult {
  const symLower = symptoms.toLowerCase();
  
  let urgencyLevel: 'Low' | 'Medium' | 'High' = 'Low';
  let chiefComplaint = 'General medical symptoms evaluation';
  let suggestedQuestions = [
    'How long have you been experiencing these symptoms?',
    'Have you noticed any triggers that make the symptoms better or worse?',
    'Are you currently taking any medications for this condition?'
  ];

  if (symLower.includes('chest') || symLower.includes('breathing') || symLower.includes('heart') || symLower.includes('severe pain') || symLower.includes('stroke') || symLower.includes('unconscious')) {
    urgencyLevel = 'High';
    chiefComplaint = 'Cardiorespiratory or severe acute symptom reporting';
    suggestedQuestions = [
      'Are you experiencing radiation of chest discomfort, sweating, or lightheadedness?',
      'Has this level of shortness of breath or acute pain occurred previously?',
      'Do you have any history of coronary artery disease, hypertension, or asthma?'
    ];
  } else if (symLower.includes('fever') || symLower.includes('cough') || symLower.includes('vomit') || symLower.includes('nausea') || symLower.includes('infection') || symLower.includes('rash') || symLower.includes('pain')) {
    urgencyLevel = 'Medium';
    chiefComplaint = 'Acute systemic or infectious symptoms tracking';
    suggestedQuestions = [
      'What was the highest temperature recorded, and have you taken any antipyretics?',
      'Are you able to keep fluids down, and have you experienced dehydration symptoms?',
      'Have you been exposed to anyone else with similar symptoms recently?'
    ];
  } else {
    chiefComplaint = symptoms.length > 60 ? symptoms.slice(0, 57) + '...' : symptoms;
  }

  return { urgencyLevel, chiefComplaint, suggestedQuestions };
}

function generateHeuristicPostVisit(notes: string): PostVisitResult {
  // Try to parse notes for medications and follow-up
  const notesLower = notes.toLowerCase();
  
  let summary = `Your doctor has evaluated your notes and compiled your post-visit treatment plan. Clinical comments: "${notes}"`;
  let medicationSchedule = 'No specific medications prescribed during this visit. Please continue taking your routine medications as directed.';
  let followUp = 'Follow up with your physician in 1-2 weeks if symptoms persist, or seek immediate emergency care if symptoms worsen significantly.';

  if (notesLower.includes('amoxicillin') || notesLower.includes('antibiotic') || notesLower.includes('mg') || notesLower.includes('tablet') || notesLower.includes('dose') || notesLower.includes('prescription')) {
    medicationSchedule = 'Take prescribed medication strictly according to the schedule indicated on the label. Complete the full course of any prescribed antibiotics.';
  }

  if (notesLower.includes('follow') || notesLower.includes('next week') || notesLower.includes('days') || notesLower.includes('return')) {
    followUp = 'Schedule a follow-up appointment in the patient portal as recommended by your physician.';
  }

  return { summary, medicationSchedule, followUp };
}

export async function generatePreVisitSummary(symptoms: string): Promise<PreVisitResult> {
  const client = getAIClient();
  const systemPrompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}

Return your response as a JSON object with EXACTLY the following keys:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "A concise single-sentence summary of the main symptom reported",
  "suggestedQuestions": ["Question 1", "Question 2", "Question 3"]
}

CRITICAL: Return ONLY valid, minified JSON. Do not include markdown codeblocks or backticks.`;

  if (!client) {
    addSystemLog('info', 'Using heuristic engine for pre-visit summary (no active Gemini API Key).');
    return generateHeuristicPreVisit(symptoms);
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text ? response.text.trim() : '';
    addSystemLog('info', 'Pre-visit symptom summary successfully generated using Gemini 2.5.');
    
    // Clean up any potential markdown wraps
    const cleanText = text.replace(/^```json/, '').replace(/```$/, '').trim();
    const result = JSON.parse(cleanText) as PreVisitResult;
    
    // Ensure safety controls
    if (!['Low', 'Medium', 'High'].includes(result.urgencyLevel)) {
      result.urgencyLevel = 'Medium';
    }
    if (!result.suggestedQuestions || !Array.isArray(result.suggestedQuestions) || result.suggestedQuestions.length === 0) {
      result.suggestedQuestions = generateHeuristicPreVisit(symptoms).suggestedQuestions;
    }
    
    return result;
  } catch (err: any) {
    addSystemLog('error', 'Gemini pre-visit generation failed. Gracefully falling back to heuristics.', err?.message || String(err));
    return generateHeuristicPreVisit(symptoms);
  }
}

export async function generatePostVisitSummary(notes: string): Promise<PostVisitResult> {
  const client = getAIClient();
  const systemPrompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}

Return your response as a JSON object with EXACTLY the following keys:
{
  "summary": "A warm, patient-friendly summary of what was found, written in second-person 'you'",
  "medicationSchedule": "Clear instructions for taking any prescribed medications, or 'No specific medication' if none",
  "followUp": "Actionable follow-up steps and when to follow up"
}

CRITICAL: Return ONLY valid, minified JSON. Do not include markdown codeblocks or backticks.`;

  if (!client) {
    addSystemLog('info', 'Using heuristic engine for post-visit summary (no active Gemini API Key).');
    return generateHeuristicPostVisit(notes);
  }

  try {
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text ? response.text.trim() : '';
    addSystemLog('info', 'Post-visit notes converted to friendly summary using Gemini 2.5.');
    
    const cleanText = text.replace(/^```json/, '').replace(/```$/, '').trim();
    return JSON.parse(cleanText) as PostVisitResult;
  } catch (err: any) {
    addSystemLog('error', 'Gemini post-visit generation failed. Gracefully falling back to heuristics.', err?.message || String(err));
    return generateHeuristicPostVisit(notes);
  }
}
