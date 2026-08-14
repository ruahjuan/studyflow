import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronLeft, Wifi, WifiOff, Flame,
  BookOpen, MessageSquare, Headphones, GitBranch, Sparkles, X,
  Upload, Check, Layers, HelpCircle, RotateCcw, Send, Loader2,
  GraduationCap, Home, ArrowRight, FileText
} from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/* ---------------- extracción de texto de PDF (100% local) ---------------- */

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(it => it.str).join(" ");
    fullText += pageText.trim() + "\n\n";
  }
  return fullText.trim();
}

function cleanExtractedText(raw) {
  return (raw || "")
    .replace(/\.{4,}/g, " ")       // puntos suspensivos de índices/tablas de contenido
    .replace(/[ \t]{2,}/g, " ")    // espacios repetidos por columnas mal alineadas
    .split("\n")
    .map(l => l.trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n")
    .trim();
}

/* ---------------- almacenamiento del PDF original (IndexedDB, offline) ---------------- */

const PDF_DB_NAME = "studyflow_pdfs";
const PDF_STORE = "pdfs";

function openPdfDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PDF_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(PDF_STORE)) {
        req.result.createObjectStore(PDF_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePdfBlob(unitId, blob) {
  const db = await openPdfDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readwrite");
    tx.objectStore(PDF_STORE).put(blob, unitId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getPdfBlob(unitId) {
  const db = await openPdfDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PDF_STORE, "readonly");
    const req = tx.objectStore(PDF_STORE).get(unitId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deletePdfBlob(unitId) {
  try {
    const db = await openPdfDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PDF_STORE, "readwrite");
      tx.objectStore(PDF_STORE).delete(unitId);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------
   StudyFlow — estudio local + funciones inteligentes online
   Paleta: violeta (foco), teal (señal online), ámbar (racha),
   rosa (offline). Firma visual: la "línea de señal" pulsante
   en el header que representa el estado online/offline.
---------------------------------------------------------- */

const FONT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700;800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
  .font-display { font-family: 'Baloo 2', system-ui, sans-serif; }
  .font-body { font-family: 'Figtree', system-ui, sans-serif; }
  .font-mono { font-family: 'IBM Plex Mono', monospace; }
  @keyframes pulseLine {
    0% { stroke-dashoffset: 24; }
    100% { stroke-dashoffset: 0; }
  }
  .signal-online { animation: pulseLine 1.1s linear infinite; }
  @keyframes floatUp {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .anim-in { animation: floatUp 0.25s ease-out; }
`;

const SUBJECT_COLORS = [
  { name: "violeta", bar: "bg-violet-500", text: "text-violet-600", soft: "bg-violet-50", ring: "ring-violet-200" },
  { name: "teal", bar: "bg-teal-500", text: "text-teal-600", soft: "bg-teal-50", ring: "ring-teal-200" },
  { name: "ambar", bar: "bg-amber-500", text: "text-amber-600", soft: "bg-amber-50", ring: "ring-amber-200" },
  { name: "rosa", bar: "bg-rose-500", text: "text-rose-600", soft: "bg-rose-50", ring: "ring-rose-200" },
  { name: "esmeralda", bar: "bg-emerald-500", text: "text-emerald-600", soft: "bg-emerald-50", ring: "ring-emerald-200" },
  { name: "indigo", bar: "bg-indigo-500", text: "text-indigo-600", soft: "bg-indigo-50", ring: "ring-indigo-200" },
];

/* ---------------- localStorage helpers ---------------- */

function useLocalStorage(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(key) : null;
      return raw ? JSON.parse(raw) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      window.localStorage && window.localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue];
}

const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------------- generación local (offline) ---------------- */

function splitSentences(text) {
  return (text || "")
    .replace(/\s+/g, " ")
    .match(/[^.!?]+[.!?]+/g) || [];
}

function cleanWord(w) {
  return w.replace(/[",.;:()¿?¡!"“”]/g, "");
}

// Descarta "oraciones" que en realidad son datos de portada, pie de imprenta,
// índices mal cortados, URLs o títulos en mayúsculas — ruido típico de PDFs.
function isJunkSentence(s) {
  const trimmed = s.trim();
  if (/[©®™]/.test(trimmed)) return true;
  if (/\bISBN\b/i.test(trimmed)) return true;
  if (/derechos reservados|impreso en|dep[oó]sito legal|editorial|fondo de cultura|biblioteca b[aá]sica/i.test(trimmed)) return true;
  if (/https?:\/\/|www\.|@/i.test(trimmed)) return true;
  const digits = (trimmed.match(/\d/g) || []).length;
  if (digits / trimmed.length > 0.2) return true;
  const letters = (trimmed.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g) || []).length;
  if (letters / trimmed.length < 0.55) return true;
  if (trimmed.length < 60 && trimmed === trimmed.toUpperCase()) return true; // títulos/encabezados
  return false;
}

function pickKeyTerm(sentence) {
  const words = sentence.trim().split(" ").map(cleanWord).filter(Boolean);
  if (words.length === 0) return null;
  // Preferí palabras capitalizadas que no estén al inicio de la oración
  const capitalized = words.slice(1).filter(w => /^[A-ZÁÉÍÓÚÑ]/.test(w) && w.length > 3);
  const numeric = words.filter(w => /\d/.test(w));
  const candidate = capitalized[0] || numeric[0] ||
    words.slice().sort((a, b) => b.length - a.length)[0];
  return candidate;
}

function generateFlashcards(text, max = 8) {
  const sentences = splitSentences(text)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 220)
    .filter(s => !isJunkSentence(s));
  const used = new Set();
  const cards = [];
  for (const s of sentences) {
    if (cards.length >= max) break;
    const term = pickKeyTerm(s);
    if (!term || used.has(term.toLowerCase())) continue;
    const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!re.test(s)) continue;
    const front = s.replace(re, "▁▁▁▁▁");
    used.add(term.toLowerCase());
    cards.push({ id: uid(), front, back: term });
  }
  return cards;
}

// Elige una plantilla de pregunta según el tipo de oración, para no repetir
// siempre "¿Qué plantea el texto sobre...?"
function questionFor(sentence, preview) {
  if (/\bpor qué\b|\bporque\b|\bdebido a\b|\ba causa de\b/i.test(sentence)) {
    return `¿Qué causa o motivo plantea el texto en relación con "${preview}..."?`;
  }
  if (/\bsin embargo\b|\baunque\b|\ben cambio\b|\bpor el contrario\b/i.test(sentence)) {
    return `¿Qué contraste o matiz introduce el texto en "${preview}..."?`;
  }
  if (/\bes\b|\bson\b|\bconsiste en\b|\bse define como\b/i.test(sentence)) {
    return `¿Cómo caracteriza o define el texto a "${preview}..."?`;
  }
  if (/\bpor lo tanto\b|\ben consecuencia\b|\bde ah[ií]\b/i.test(sentence)) {
    return `¿Qué conclusión se desprende de "${preview}..."?`;
  }
  return `¿Qué plantea el texto sobre "${preview}..."?`;
}

function generateQuestions(text, max = 6) {
  const sentences = splitSentences(text)
    .map(s => s.trim())
    .filter(s => s.length > 40 && s.length < 260)
    .filter(s => !isJunkSentence(s));
  const step = Math.max(1, Math.floor(sentences.length / max) || 1);
  const questions = [];
  for (let i = 0; i < sentences.length && questions.length < max; i += step) {
    const s = sentences[i];
    const preview = s.split(" ").slice(0, 6).join(" ");
    questions.push({ id: uid(), q: questionFor(s, preview), a: s });
  }
  return questions;
}

/* ---------------- llamadas a la API de Gemini (modo online) ---------------- */

const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// messages: [{ role: "user" | "model", text: "..." }]
async function callGemini({ system, messages }) {
  if (!GEMINI_API_KEY) {
    throw new Error("Falta la API key de Gemini (VITE_GEMINI_API_KEY en tu archivo .env).");
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.text }],
      })),
      generationConfig: { maxOutputTokens: 1000 },
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || "";
    } catch {}
    throw new Error(`Gemini respondió con error ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts.map(p => p.text || "").join("\n");
}

function extractJson(text) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Sin JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/* ---------------- UI: señal online/offline (elemento de firma) ---------------- */

function SignalLine({ online, small }) {
  const w = small ? 40 : 64;
  const h = small ? 14 : 20;
  return (
    <svg width={w} height={h} viewBox="0 0 64 20" className="shrink-0">
      <polyline
        points="0,10 10,10 14,3 20,17 26,10 34,10 38,14 42,6 48,10 64,10"
        fill="none"
        stroke={online ? "#2dd4bf" : "#94a3b8"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={online ? "3 3" : "0"}
        className={online ? "signal-online" : ""}
        opacity={online ? 1 : 0.5}
      />
    </svg>
  );
}

function ModeToggle({ mode, setMode }) {
  const online = mode === "online";
  return (
    <button
      onClick={() => setMode(online ? "offline" : "online")}
      className={`flex items-center gap-2 rounded-full pl-2 pr-3 py-1.5 border transition-colors ${
        online ? "bg-teal-50 border-teal-200" : "bg-rose-50 border-rose-200"
      }`}
      title="Cambiar modo online/offline"
    >
      <span
        className={`flex items-center justify-center w-6 h-6 rounded-full text-white ${
          online ? "bg-teal-500" : "bg-rose-400"
        }`}
      >
        {online ? <Wifi size={13} /> : <WifiOff size={13} />}
      </span>
      <span className={`font-display text-xs font-bold ${online ? "text-teal-700" : "text-rose-600"}`}>
        {online ? "ONLINE" : "OFFLINE"}
      </span>
      <SignalLine online={online} small />
    </button>
  );
}

function OfflineNotice({ onDismiss }) {
  return (
    <div className="anim-in flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4 text-rose-700">
      <WifiOff size={18} className="mt-0.5 shrink-0" />
      <div className="flex-1 text-sm font-body">
        <p className="font-semibold">Estás en modo offline 📴</p>
        <p className="mt-0.5">Esta función necesita conexión. Activá el modo online arriba a la derecha para usarla — no te va a consumir datos hasta que la actives.</p>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="text-rose-400 hover:text-rose-600">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* ---------------- Progreso / racha ---------------- */

function ProgressBar({ value, colorClass = "bg-violet-500" }) {
  return (
    <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden">
      <div
        className={`h-full ${colorClass} rounded-full transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

function useStreak() {
  const [streak, setStreak] = useLocalStorage("studyflow_streak", { count: 0, last: null });
  const bump = useCallback(() => {
    const today = new Date().toDateString();
    setStreak(prev => {
      if (prev.last === today) return prev;
      const yesterday = new Date(Date.now() - 86400000).toDateString();
      const count = prev.last === yesterday ? prev.count + 1 : 1;
      return { count, last: today };
    });
  }, [setStreak]);
  return [streak, bump];
}

/* ---------------- App principal ---------------- */

export default function App() {
  const [subjects, setSubjects] = useLocalStorage("studyflow_subjects", []);
  const [mode, setMode] = useLocalStorage("studyflow_mode", "offline");
  const [view, setView] = useState({ screen: "dashboard" }); // dashboard | subject | unit
  const [streak, bumpStreak] = useStreak();
  const online = mode === "online";

  const addSubject = (name) => {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    setSubjects([...subjects, { id: uid(), name, color: color.name, units: [] }]);
  };

  const deleteSubject = (id) => {
    setSubjects(subjects.filter(s => s.id !== id));
    if (view.subjectId === id) setView({ screen: "dashboard" });
  };

  const addUnit = (subjectId, unitId, title, text, hasPdf) => {
    setSubjects(subjects.map(s => {
      if (s.id !== subjectId) return s;
      const flashcards = generateFlashcards(text);
      const questions = generateQuestions(text);
      const unit = { id: unitId, title, text, progress: 0, flashcards, questions, chat: [], hasPdf: !!hasPdf };
      return { ...s, units: [...s.units, unit] };
    }));
  };

  const deleteUnit = (subjectId, unitId) => {
    setSubjects(subjects.map(s =>
      s.id === subjectId ? { ...s, units: s.units.filter(u => u.id !== unitId) } : s
    ));
    deletePdfBlob(unitId);
  };

  const updateUnit = (subjectId, unitId, patch) => {
    setSubjects(subjects.map(s => {
      if (s.id !== subjectId) return s;
      return { ...s, units: s.units.map(u => u.id === unitId ? { ...u, ...patch } : u) };
    }));
  };

  const currentSubject = subjects.find(s => s.id === view.subjectId);
  const currentUnit = currentSubject?.units.find(u => u.id === view.unitId);

  return (
    <div className="min-h-screen bg-indigo-50 font-body text-indigo-950">
      <style>{FONT_STYLE}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-indigo-100">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => setView({ screen: "dashboard" })}
            className="flex items-center gap-2 font-display text-lg sm:text-xl font-extrabold text-violet-700"
          >
            <span className="w-8 h-8 rounded-xl bg-violet-600 text-white flex items-center justify-center">
              <GraduationCap size={18} />
            </span>
            StudyFlow
          </button>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-amber-600 font-display font-bold text-sm bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
              <Flame size={15} className={streak.count > 0 ? "text-amber-500" : "text-slate-300"} />
              {streak.count}
            </div>
            <ModeToggle mode={mode} setMode={setMode} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {view.screen === "dashboard" && (
          <Dashboard
            subjects={subjects}
            addSubject={addSubject}
            deleteSubject={deleteSubject}
            openSubject={(id) => setView({ screen: "subject", subjectId: id })}
          />
        )}

        {view.screen === "subject" && currentSubject && (
          <SubjectView
            subject={currentSubject}
            back={() => setView({ screen: "dashboard" })}
            openUnit={(unitId) => setView({ screen: "unit", subjectId: currentSubject.id, unitId })}
            addUnit={(unitId, title, text, hasPdf) => addUnit(currentSubject.id, unitId, title, text, hasPdf)}
            deleteUnit={(unitId) => deleteUnit(currentSubject.id, unitId)}
          />
        )}

        {view.screen === "unit" && currentSubject && currentUnit && (
          <UnitView
            subject={currentSubject}
            unit={currentUnit}
            online={online}
            back={() => setView({ screen: "subject", subjectId: currentSubject.id })}
            update={(patch) => updateUnit(currentSubject.id, currentUnit.id, patch)}
            onStudy={bumpStreak}
          />
        )}
      </main>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

function Dashboard({ subjects, addSubject, deleteSubject, openSubject }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    addSubject(name.trim());
    setName("");
    setCreating(false);
  };

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-5">
        <h1 className="font-display text-2xl font-extrabold text-indigo-950">Tus materias</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-display font-bold text-sm rounded-xl px-4 py-2.5 shadow-sm shadow-violet-200"
        >
          <Plus size={16} /> Nueva materia
        </button>
      </div>

      {creating && (
        <div className="anim-in mb-5 bg-white border border-indigo-100 rounded-2xl p-4 flex items-center gap-2">
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="Ej: Formación Ética y Ciudadana"
            className="flex-1 border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button onClick={submit} className="bg-violet-600 text-white rounded-xl px-3 py-2 font-display font-bold text-sm">
            Crear
          </button>
          <button onClick={() => setCreating(false)} className="text-indigo-300 hover:text-indigo-500 px-2">
            <X size={18} />
          </button>
        </div>
      )}

      {subjects.length === 0 && !creating && (
        <div className="text-center py-16 bg-white rounded-3xl border border-dashed border-indigo-200">
          <BookOpen size={36} className="mx-auto text-indigo-200 mb-3" />
          <p className="font-display font-bold text-indigo-400">Todavía no creaste ninguna materia</p>
          <p className="text-sm text-indigo-300 mt-1">Arrancá creando una y pegá el primer apunte.</p>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        {subjects.map(s => {
          const color = SUBJECT_COLORS.find(c => c.name === s.color) || SUBJECT_COLORS[0];
          const avgProgress = s.units.length
            ? Math.round(s.units.reduce((a, u) => a + u.progress, 0) / s.units.length)
            : 0;
          return (
            <div key={s.id} className="group relative bg-white rounded-2xl border border-indigo-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className={`h-1.5 ${color.bar}`} />
              <button onClick={() => openSubject(s.id)} className="block w-full text-left p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-display font-extrabold text-lg ${color.text}`}>{s.name}</span>
                  <ChevronRight size={18} className="text-indigo-300 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <p className="text-xs text-indigo-400 font-mono mb-2">{s.units.length} unidad{s.units.length !== 1 ? "es" : ""}</p>
                <ProgressBar value={avgProgress} colorClass={color.bar} />
                <p className="text-right text-xs font-display font-bold text-indigo-400 mt-1">{avgProgress}%</p>
              </button>
              <button
                onClick={() => deleteSubject(s.id)}
                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-300 hover:text-rose-500 bg-white/80 rounded-full p-1.5"
              >
                <Trash2 size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- Vista de materia (unidades) ---------------- */

function SubjectView({ subject, back, openUnit, addUnit, deleteUnit }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [pdfFile, setPdfFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);
  const color = SUBJECT_COLORS.find(c => c.name === subject.color) || SUBJECT_COLORS[0];

  const submit = async () => {
    if (!title.trim() || !text.trim() || saving) return;
    setSaving(true);
    const newUnitId = uid();
    addUnit(newUnitId, title.trim(), text.trim(), !!pdfFile);
    if (pdfFile) {
      try { await savePdfBlob(newUnitId, pdfFile); } catch (e) { /* la unidad ya quedó creada con el texto igual */ }
    }
    setTitle(""); setText(""); setPdfName(""); setPdfFile(null); setCreating(false); setSaving(false);
  };

  const handlePdfFile = async (file) => {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setPdfError("Ese archivo no es un PDF.");
      return;
    }
    setPdfError("");
    setExtracting(true);
    setPdfName(file.name);
    setPdfFile(file);
    try {
      const extracted = cleanExtractedText(await extractPdfText(file));
      if (!extracted) {
        setPdfError("No se encontró texto en el PDF (puede ser un escaneo de imágenes). Vas a poder ver las páginas igual, pero pegá el texto a mano para que funcionen las flashcards.");
      } else {
        setText(extracted);
        if (!title.trim()) setTitle(file.name.replace(/\.pdf$/i, ""));
      }
    } catch (e) {
      setPdfError("No se pudo leer este PDF. Probá con otro archivo o pegá el texto manualmente.");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> Materias
      </button>

      <div className="flex items-center justify-between mb-5">
        <h1 className={`font-display text-2xl font-extrabold ${color.text}`}>{subject.name}</h1>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-display font-bold text-sm rounded-xl px-4 py-2.5"
        >
          <Plus size={16} /> Nueva unidad
        </button>
      </div>

      {creating && (
        <div className="anim-in mb-6 bg-white border border-indigo-100 rounded-2xl p-4 space-y-3">
          <input
            autoFocus
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Título de la unidad"
            className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={e => handlePdfFile(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={extracting}
              className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-display font-bold text-xs rounded-xl px-3 py-2 disabled:opacity-50"
            >
              {extracting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
              {extracting ? "Extrayendo texto..." : "Subir PDF"}
            </button>
            {pdfName && !extracting && !pdfError && (
              <span className="text-xs text-emerald-600 flex items-center gap-1">
                <Check size={12} /> {pdfName}
              </span>
            )}
            <span className="text-xs text-indigo-300">o pegá el texto abajo</span>
          </div>
          {pdfError && (
            <p className="text-xs text-rose-500 flex items-center gap-1">
              <X size={12} /> {pdfError}
            </p>
          )}
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Pegá acá el texto de estudio, o subí un PDF arriba..."
            rows={8}
            className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 font-body"
          />
          <p className="text-xs text-indigo-300 flex items-center gap-1">
            <Sparkles size={12} /> Al guardar se generan automáticamente flashcards y preguntas clave, sin conexión.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setCreating(false)} className="px-3 py-2 text-sm text-indigo-400">Cancelar</button>
            <button onClick={submit} disabled={saving} className="bg-violet-600 text-white rounded-xl px-4 py-2 font-display font-bold text-sm disabled:opacity-60 flex items-center gap-1.5">
              {saving && <Loader2 size={14} className="animate-spin" />}
              Guardar unidad
            </button>
          </div>
        </div>
      )}

      {subject.units.length === 0 && !creating && (
        <div className="text-center py-14 bg-white rounded-3xl border border-dashed border-indigo-200">
          <Upload size={32} className="mx-auto text-indigo-200 mb-2" />
          <p className="font-display font-bold text-indigo-400">Sumá tu primer apunte</p>
        </div>
      )}

      <div className="space-y-3">
        {subject.units.map((u, i) => (
          <div key={u.id} className="group bg-white border border-indigo-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
            <div className={`w-9 h-9 rounded-full ${color.soft} ${color.text} font-display font-extrabold flex items-center justify-center shrink-0`}>
              {i + 1}
            </div>
            <button onClick={() => openUnit(u.id)} className="flex-1 text-left min-w-0">
              <p className="font-display font-bold text-indigo-950 truncate">{u.title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="w-32"><ProgressBar value={u.progress} colorClass={color.bar} /></div>
                <span className="text-xs text-indigo-400 font-mono">{u.progress}%</span>
                <span className="text-xs text-indigo-300 flex items-center gap-1"><Layers size={11} />{u.flashcards.length}</span>
              </div>
            </button>
            <ChevronRight size={18} className="text-indigo-300 shrink-0" />
            <button
              onClick={() => deleteUnit(u.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-300 hover:text-rose-500 shrink-0"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Vista de unidad (lectura + herramientas) ---------------- */

function UnitView({ subject, unit, online, back, update, onStudy }) {
  const [tab, setTab] = useState("lectura");
  const color = SUBJECT_COLORS.find(c => c.name === subject.color) || SUBJECT_COLORS[0];

  useEffect(() => { onStudy(); }, []); // eslint-disable-line

  const markRead = () => update({ progress: 100 });
  const regenerate = () => update({
    flashcards: generateFlashcards(unit.text),
    questions: generateQuestions(unit.text),
  });

  const tabs = [
    { id: "lectura", label: "Lectura", icon: BookOpen },
    ...(unit.hasPdf ? [{ id: "pdf", label: "Ver PDF", icon: FileText }] : []),
    { id: "flashcards", label: "Flashcards", icon: Layers },
    { id: "preguntas", label: "Preguntas clave", icon: HelpCircle },
    { id: "ia", label: "Herramientas IA", icon: Sparkles },
  ];

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> {subject.name}
      </button>

      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-extrabold text-indigo-950">{unit.title}</h1>
        {unit.progress < 100 ? (
          <button onClick={markRead} className={`shrink-0 flex items-center gap-1.5 ${color.bar} text-white font-display font-bold text-sm rounded-xl px-3.5 py-2`}>
            <Check size={15} /> Marcar leída
          </button>
        ) : (
          <span className="shrink-0 flex items-center gap-1.5 bg-emerald-50 text-emerald-600 font-display font-bold text-sm rounded-xl px-3.5 py-2">
            <Check size={15} /> Leída
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          const locked = t.id === "ia" && !online;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-display font-bold border transition-colors ${
                active
                  ? `${color.bar} text-white border-transparent`
                  : "bg-white text-indigo-400 border-indigo-100 hover:text-indigo-600"
              }`}
            >
              <Icon size={14} />
              {t.label}
              {locked && <WifiOff size={12} className="opacity-70" />}
            </button>
          );
        })}
      </div>

      {tab === "lectura" && (
        <div className="bg-white border border-indigo-100 rounded-2xl p-5 sm:p-6 whitespace-pre-wrap leading-relaxed text-[15px] text-indigo-900">
          {unit.text}
        </div>
      )}

      {tab === "pdf" && unit.hasPdf && (
        <PdfViewerTab unitId={unit.id} color={color} />
      )}

      {tab === "flashcards" && (
        <FlashcardsTab flashcards={unit.flashcards} onRegenerate={regenerate} color={color} />
      )}

      {tab === "preguntas" && (
        <QuestionsTab questions={unit.questions} onRegenerate={regenerate} color={color} />
      )}

      {tab === "ia" && (
        online
          ? <AiToolsPanel unit={unit} update={update} color={color} />
          : <OfflineNotice />
      )}
    </div>
  );
}

/* ---------------- Visor de PDF propio (offline, desde IndexedDB) ---------------- */

function PdfViewerTab({ unitId, color }) {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(false);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const touchStartX = useRef(null);

  // Carga el PDF guardado en IndexedDB
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(false);
      try {
        const blob = await getPdfBlob(unitId);
        if (!blob) { if (!cancelled) { setError(true); setLoading(false); } return; }
        const buffer = await blob.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
      } catch (e) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [unitId]);

  // Renderiza la página actual en el canvas
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;
    (async () => {
      setRendering(true);
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;
        const containerWidth = Math.min(containerRef.current?.clientWidth || 360, 640);
        const dpr = window.devicePixelRatio || 1;
        const base = page.getViewport({ scale: 1 });
        const scale = (containerWidth / base.width) * dpr;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = containerWidth + "px";
        canvas.style.height = (viewport.height / dpr) + "px";
        const ctx = canvas.getContext("2d");
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (e) {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfDoc, pageNum]);

  const prev = () => setPageNum(p => Math.max(1, p - 1));
  const next = () => setPageNum(p => Math.min(numPages, p + 1));

  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 50) prev();
    else if (dx < -50) next();
    touchStartX.current = null;
  };

  if (loading) {
    return <div className="text-center py-14"><Loader2 className="animate-spin mx-auto text-indigo-400" size={26} /></div>;
  }
  if (error) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-indigo-200">
        <FileText size={30} className="mx-auto text-indigo-200 mb-2" />
        <p className="text-indigo-400 font-display font-bold">No se pudo cargar el PDF guardado.</p>
      </div>
    );
  }

  return (
    <div className="anim-in">
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative bg-white border border-indigo-100 rounded-2xl p-3 flex justify-center overflow-hidden select-none"
      >
        <canvas ref={canvasRef} className="max-w-full rounded-lg shadow-sm" />
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60">
            <Loader2 className="animate-spin text-indigo-400" size={22} />
          </div>
        )}
      </div>
      <div className="flex items-center justify-center gap-4 mt-4">
        <button
          onClick={prev}
          disabled={pageNum <= 1}
          className="p-2.5 rounded-full bg-white border border-indigo-100 text-indigo-400 disabled:opacity-30"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs font-mono text-indigo-400 w-16 text-center">{pageNum} / {numPages}</span>
        <button
          onClick={next}
          disabled={pageNum >= numPages}
          className={`p-2.5 rounded-full ${color.bar} text-white disabled:opacity-30`}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <p className="text-center text-xs text-indigo-300 mt-2">Deslizá a los costados para cambiar de página</p>
    </div>
  );
}

/* ---------------- Flashcards (offline) ---------------- */

function FlashcardsTab({ flashcards, onRegenerate, color }) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);

  if (flashcards.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-indigo-200">
        <p className="text-indigo-400 font-display font-bold">No se pudieron generar flashcards de este texto.</p>
        <p className="text-xs text-indigo-300 mt-1">Probá con un apunte un poco más largo.</p>
      </div>
    );
  }

  const card = flashcards[i];
  const next = () => { setFlipped(false); setI((i + 1) % flashcards.length); };
  const prev = () => { setFlipped(false); setI((i - 1 + flashcards.length) % flashcards.length); };

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-mono text-indigo-400">{i + 1} / {flashcards.length}</p>
        <button onClick={onRegenerate} className="flex items-center gap-1 text-xs font-display font-bold text-indigo-400 hover:text-violet-600">
          <RotateCcw size={12} /> Regenerar
        </button>
      </div>

      <button
        onClick={() => setFlipped(!flipped)}
        className={`w-full min-h-[200px] rounded-3xl border-2 ${color.ring} bg-white p-8 flex items-center justify-center text-center shadow-sm`}
      >
        <p className={`font-display text-lg sm:text-xl font-bold ${flipped ? color.text : "text-indigo-950"}`}>
          {flipped ? card.back : card.front}
        </p>
      </button>
      <p className="text-center text-xs text-indigo-300 mt-2">Tocá la tarjeta para dar vuelta</p>

      <div className="flex items-center justify-center gap-3 mt-4">
        <button onClick={prev} className="p-2.5 rounded-full bg-white border border-indigo-100 text-indigo-400 hover:text-indigo-600">
          <ChevronLeft size={18} />
        </button>
        <button onClick={next} className={`p-2.5 rounded-full ${color.bar} text-white`}>
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Preguntas clave (offline) ---------------- */

function QuestionsTab({ questions, onRegenerate, color }) {
  const [open, setOpen] = useState({});

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-indigo-200">
        <p className="text-indigo-400 font-display font-bold">No se generaron preguntas todavía.</p>
      </div>
    );
  }

  return (
    <div className="anim-in space-y-2.5">
      <div className="flex justify-end">
        <button onClick={onRegenerate} className="flex items-center gap-1 text-xs font-display font-bold text-indigo-400 hover:text-violet-600 mb-1">
          <RotateCcw size={12} /> Regenerar
        </button>
      </div>
      {questions.map((q, idx) => (
        <div key={q.id} className="bg-white border border-indigo-100 rounded-2xl overflow-hidden">
          <button
            onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}
            className="w-full text-left px-4 py-3.5 flex items-center gap-3"
          >
            <span className={`w-6 h-6 rounded-full ${color.soft} ${color.text} text-xs font-display font-extrabold flex items-center justify-center shrink-0`}>
              {idx + 1}
            </span>
            <span className="flex-1 text-sm font-medium text-indigo-900">{q.q}</span>
            <ChevronRight size={16} className={`text-indigo-300 transition-transform shrink-0 ${open[q.id] ? "rotate-90" : ""}`} />
          </button>
          {open[q.id] && (
            <div className="px-4 pb-4 pl-13 text-sm text-indigo-500 border-t border-indigo-50 pt-3">
              {q.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------------- Panel IA (solo online) ---------------- */

function AiToolsPanel({ unit, update, color }) {
  const [sub, setSub] = useState("chat");

  const subtabs = [
    { id: "chat", label: "Chat", icon: MessageSquare },
    { id: "podcast", label: "Podcast", icon: Headphones },
    { id: "mapa", label: "Mapa conceptual", icon: GitBranch },
  ];

  return (
    <div className="anim-in">
      <div className="flex items-center gap-1.5 mb-4 bg-teal-50 border border-teal-100 rounded-xl px-3 py-2 text-teal-700 text-xs font-display font-bold">
        <Wifi size={13} /> Modo online activo — estas funciones usan la API de Gemini.
      </div>

      <div className="flex gap-1.5 mb-4">
        {subtabs.map(t => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-display font-bold border ${
                active ? "bg-indigo-950 text-white border-transparent" : "bg-white text-indigo-400 border-indigo-100"
              }`}
            >
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {sub === "chat" && <ChatPanel unit={unit} update={update} color={color} />}
      {sub === "podcast" && <PodcastPanel unit={unit} color={color} />}
      {sub === "mapa" && <MapPanel unit={unit} color={color} />}
    </div>
  );
}

function ChatPanel({ unit, update, color }) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chat = unit.chat || [];
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chat.length]);

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    const newChat = [...chat, { role: "user", text: question }];
    update({ chat: newChat });
    setLoading(true);
    try {
      const answer = await callGemini({
        system: `Sos un tutor de estudio. Respondé en español rioplatense, de forma breve y clara, basándote únicamente en los siguientes apuntes:\n\n${unit.text.slice(0, 6000)}`,
        messages: newChat,
      });
      update({ chat: [...newChat, { role: "assistant", text: answer || "No pude generar una respuesta." }] });
    } catch (e) {
      update({ chat: [...newChat, { role: "assistant", text: `Hubo un error: ${e.message || "no se pudo conectar con Gemini."}` }] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-indigo-100 rounded-2xl flex flex-col h-[420px]">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.length === 0 && (
          <p className="text-sm text-indigo-300 text-center mt-8">Preguntale lo que quieras a tus apuntes.</p>
        )}
        {chat.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
              m.role === "user" ? `${color.bar} text-white` : "bg-indigo-50 text-indigo-900"
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-indigo-50 rounded-2xl px-3.5 py-2.5">
              <Loader2 size={15} className="animate-spin text-indigo-400" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-indigo-100 p-3 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Preguntá sobre este apunte..."
          className="flex-1 border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
        />
        <button onClick={send} disabled={loading} className={`${color.bar} text-white rounded-xl px-3.5 flex items-center justify-center disabled:opacity-50`}>
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function PodcastPanel({ unit, color }) {
  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generate = async () => {
    setLoading(true); setError(false); setScript(null);
    try {
      const text = await callGemini({
        system: `Convertí el siguiente apunte en un guion de diálogo tipo podcast de estudio, con dos conductores llamados "Fede" y "Male" que conversan de forma natural y explican el contenido para repasarlo. Formato: cada línea "Fede: ..." o "Male: ...", sin viñetas ni markdown, entre 10 y 16 líneas. Apunte:\n\n${unit.text.slice(0, 6000)}`,
        messages: [{ role: "user", text: "Generá el guion del podcast." }],
      });
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean)
        .map(l => {
          const m = l.match(/^(Fede|Male)\s*:\s*(.*)$/i);
          return m ? { speaker: m[1], line: m[2] } : { speaker: "Fede", line: l };
        });
      setScript(lines);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {!script && !loading && (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-indigo-200">
          <Headphones size={30} className="mx-auto text-indigo-200 mb-2" />
          <p className="font-display font-bold text-indigo-400 mb-3">Generá un diálogo de estudio sobre esta unidad</p>
          <button onClick={generate} className={`${color.bar} text-white font-display font-bold text-sm rounded-xl px-5 py-2.5`}>
            Generar podcast
          </button>
        </div>
      )}
      {loading && (
        <div className="text-center py-14"><Loader2 className="animate-spin mx-auto text-indigo-400" size={26} /></div>
      )}
      {error && <OfflineNotice />}
      {script && (
        <div className="anim-in bg-white border border-indigo-100 rounded-2xl p-5 space-y-3 max-h-[420px] overflow-y-auto">
          {script.map((l, i) => (
            <div key={i} className={`flex ${l.speaker === "Fede" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                l.speaker === "Fede" ? "bg-indigo-50 text-indigo-900" : `${color.soft} ${color.text}`
              }`}>
                <span className="block text-[11px] font-display font-bold opacity-60 mb-0.5">{l.speaker}</span>
                {l.line}
              </div>
            </div>
          ))}
          <button onClick={generate} className="text-xs font-display font-bold text-indigo-400 hover:text-violet-600 flex items-center gap-1 mt-2">
            <RotateCcw size={12} /> Generar otra versión
          </button>
        </div>
      )}
    </div>
  );
}

function MapPanel({ unit, color }) {
  const [map, setMap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const generate = async () => {
    setLoading(true); setError(false); setMap(null);
    try {
      const text = await callGemini({
        system: `Analizá el apunte y devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma exacta: {"center":"tema central","nodes":["concepto 1","concepto 2","concepto 3","concepto 4","concepto 5","concepto 6"]}. Máximo 6 nodos, cada uno de 2 a 5 palabras. Apunte:\n\n${unit.text.slice(0, 6000)}`,
        messages: [{ role: "user", text: "Generá el mapa conceptual." }],
      });
      const parsed = extractJson(text);
      setMap(parsed);
    } catch (e) {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const nodes = map?.nodes || [];
  const radius = 130;
  const cx = 160, cy = 160;

  return (
    <div>
      {!map && !loading && (
        <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-indigo-200">
          <GitBranch size={30} className="mx-auto text-indigo-200 mb-2" />
          <p className="font-display font-bold text-indigo-400 mb-3">Generá un mapa conceptual de esta unidad</p>
          <button onClick={generate} className={`${color.bar} text-white font-display font-bold text-sm rounded-xl px-5 py-2.5`}>
            Generar mapa
          </button>
        </div>
      )}
      {loading && (
        <div className="text-center py-14"><Loader2 className="animate-spin mx-auto text-indigo-400" size={26} /></div>
      )}
      {error && <OfflineNotice />}
      {map && (
        <div className="anim-in bg-white border border-indigo-100 rounded-2xl p-5">
          <svg viewBox="0 0 320 320" className="w-full max-w-md mx-auto">
            {nodes.map((_, i) => {
              const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
              const x = cx + radius * Math.cos(angle);
              const y = cy + radius * Math.sin(angle);
              return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#c7d2fe" strokeWidth="2" />;
            })}
            <circle cx={cx} cy={cy} r="46" fill="#7c3aed" />
            <foreignObject x={cx - 44} y={cy - 30} width="88" height="60">
              <div className="text-white text-[10px] font-display font-extrabold text-center flex items-center justify-center h-full leading-tight">
                {map.center}
              </div>
            </foreignObject>
            {nodes.map((n, i) => {
              const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
              const x = cx + radius * Math.cos(angle);
              const y = cy + radius * Math.sin(angle);
              return (
                <g key={i}>
                  <circle cx={x} cy={y} r="36" fill="#ccfbf1" stroke="#2dd4bf" strokeWidth="1.5" />
                  <foreignObject x={x - 34} y={y - 24} width="68" height="48">
                    <div className="text-teal-800 text-[9px] font-display font-bold text-center flex items-center justify-center h-full leading-tight">
                      {n}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
          </svg>
          <button onClick={generate} className="text-xs font-display font-bold text-indigo-400 hover:text-violet-600 flex items-center gap-1 mt-2">
            <RotateCcw size={12} /> Regenerar mapa
          </button>
        </div>
      )}
    </div>
  );
}
