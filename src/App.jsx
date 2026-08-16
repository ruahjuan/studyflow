import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Trash2, ChevronRight, ChevronLeft, Flame,
  BookOpen, X, ThumbsUp, ThumbsDown,
  Upload, Check, Layers, HelpCircle, RotateCcw, Loader2,
  GraduationCap, FileText, Target, Pencil, StickyNote,
  Calendar, Map, CalendarClock, Download, Home, Sun, Moon
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
   StudyFlow — estudio 100% local, sin IA.
   Paleta: violeta (foco), teal (dominio/repaso), ámbar (racha).
---------------------------------------------------------- */

const FONT_STYLE = `
  /* Fuentes: se cargan desde <link> en index.html (preconnect ya resuelto ahí).
     Si en algún momento este componente vive sin ese <head>, descomentá:
     @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=JetBrains+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap'); */
  .font-display { font-family: 'Fraunces', Georgia, serif; }
  .font-body { font-family: 'Inter', system-ui, sans-serif; }
  .font-mono { font-family: 'JetBrains Mono', monospace; }

  /* Evita que Safari/Chrome iOS hagan zoom automático al enfocar un input */
  input, textarea, select { font-size: 16px; }
  @media (min-width: 640px) {
    input, textarea, select { font-size: 0.875rem; }
  }

  /* min-height seguro: usa dvh donde está disponible, con fallback a vh */
  .min-h-dvh { min-height: 100vh; min-height: 100dvh; }

  /* padding inferior que respeta el home indicator / gesture bar de iOS y Android */
  .pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }

  /* El modo oscuro ahora vive en index.css como overrides de las variables
     de color de Tailwind (--color-violet-500, etc.) dentro de .dark —
     no hace falta pisar cada utility class acá. */

  @keyframes floatUp {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .anim-in { animation: floatUp 0.25s ease-out; }
`;

const SUBJECT_COLORS = [
  { name: "violeta", bar: "bg-violet-500", text: "text-violet-600", soft: "bg-violet-50", ring: "border-violet-200" },
  { name: "teal", bar: "bg-teal-500", text: "text-teal-600", soft: "bg-teal-50", ring: "border-teal-200" },
  { name: "ambar", bar: "bg-amber-500", text: "text-amber-600", soft: "bg-amber-50", ring: "border-amber-200" },
  { name: "rosa", bar: "bg-rose-500", text: "text-rose-600", soft: "bg-rose-50", ring: "border-rose-200" },
  { name: "esmeralda", bar: "bg-emerald-500", text: "text-emerald-600", soft: "bg-emerald-50", ring: "border-emerald-200" },
  { name: "indigo", bar: "bg-indigo-500", text: "text-indigo-600", soft: "bg-indigo-50", ring: "border-indigo-200" },
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

/* ---------------- repetición espaciada (Leitner simplificado) ---------------- */

const LEITNER_DAYS = [0, 1, 3, 7, 14]; // índice = caja (1 a 5)
const MASTERY_BOX = 3; // a partir de esta caja se considera "dominada"

function reviewCard(card, gotIt) {
  const box = gotIt ? Math.min(5, (card.box || 1) + 1) : 1;
  const days = LEITNER_DAYS[box - 1] ?? 0;
  const due = Date.now() + days * 86400000;
  return { ...card, box, due, lastResult: gotIt ? "correct" : "wrong" };
}

function unitMastery(unit) {
  const cards = unit.flashcards || [];
  if (!cards.length) return 0;
  const mastered = cards.filter(c => (c.box || 1) >= MASTERY_BOX).length;
  return Math.round((mastered / cards.length) * 100);
}

function dueCards(unit) {
  const now = Date.now();
  return (unit.flashcards || []).filter(c => (c.due || 0) <= now);
}

function subjectMastery(subject) {
  const units = subject.units || [];
  if (!units.length) return 0;
  return Math.round(units.reduce((a, u) => a + unitMastery(u), 0) / units.length);
}

function subjectDueCount(subject) {
  return (subject.units || []).reduce((a, u) => a + dueCards(u).length, 0);
}

/* ---------------- Progreso / racha ---------------- */

function ProgressBar({ value, colorClass = "bg-violet-500", variant = "solid" }) {
  const threadTextClass = variant === "thread" ? colorClass.replace("bg-", "text-") : "";
  return (
    <div className="w-full h-1.5 bg-slate-100 overflow-hidden">
      <div
        className={`h-full ${colorClass} ${variant === "thread" ? `sf-thread ${threadTextClass}` : ""} transition-all duration-500`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

/* ---------------- Bloc de notas (autoguardado, sin botón) ---------------- */

function NotesEditor({ value, onChange, placeholder }) {
  const [text, setText] = useState(value || "");
  const [pulse, setPulse] = useState(false);
  const timer = useRef(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onChange(v);
      setPulse(true);
      setTimeout(() => setPulse(false), 1200);
    }, 500);
  };

  return (
    <div className="anim-in">
      <div className="flex items-center justify-between mb-2 h-4">
        <p className="text-xs text-indigo-300">Se guarda solo mientras escribís.</p>
        <span className={`text-xs text-emerald-500 flex items-center gap-1 transition-opacity duration-300 ${pulse ? "opacity-100" : "opacity-0"}`}>
          <Check size={12} /> Guardado
        </span>
      </div>
      <textarea
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        rows={14}
        className="w-full border border-indigo-100 rounded-2xl px-4 py-3 text-[15px] outline-none focus:ring-2 focus:ring-violet-300 font-body leading-relaxed bg-white"
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

function useTheme() {
  const [stored, setStored] = useLocalStorage("studyflow_theme", null); // null = seguir al sistema
  const systemDark = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;
  const theme = stored || (systemDark ? "dark" : "light");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggle = () => setStored(theme === "dark" ? "light" : "dark");
  return [theme, toggle];
}

/* ---------------- App principal ---------------- */

export default function App() {
  const [subjects, setSubjects] = useLocalStorage("studyflow_subjects", []);
  const [view, setView] = useState({ screen: "dashboard" }); // dashboard | subject | unit
  const [streak, bumpStreak] = useStreak();
  const [theme, toggleTheme] = useTheme();

  const overallMastery = subjects.length
    ? Math.round(subjects.reduce((a, s) => a + subjectMastery(s), 0) / subjects.length)
    : 0;
  const totalDueToday = subjects.reduce((a, s) => a + subjectDueCount(s), 0);

  const addSubject = (name) => {
    const color = SUBJECT_COLORS[subjects.length % SUBJECT_COLORS.length];
    setSubjects([...subjects, { id: uid(), name, color: color.name, units: [], notes: "" }]);
  };

  const deleteSubject = (id) => {
    setSubjects(subjects.filter(s => s.id !== id));
    if (view.subjectId === id) setView({ screen: "dashboard" });
  };

  const addUnit = (subjectId, unitId, title, text, hasPdf) => {
    setSubjects(subjects.map(s => {
      if (s.id !== subjectId) return s;
      const unit = { id: unitId, title, text, read: false, flashcards: [], questions: [], notes: "", hasPdf: !!hasPdf };
      return { ...s, units: [...s.units, unit] };
    }));
  };

  const deleteUnit = (subjectId, unitId) => {
    setSubjects(subjects.map(s =>
      s.id === subjectId ? { ...s, units: s.units.filter(u => u.id !== unitId) } : s
    ));
    deletePdfBlob(unitId);
  };

  const updateSubject = (subjectId, patch) => {
    setSubjects(subjects.map(s => s.id === subjectId ? { ...s, ...patch } : s));
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
    <div className="min-h-dvh bg-indigo-50 font-body text-indigo-950">
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
            <span className="hidden sm:inline">StudyFlow</span>
          </button>

          <div className="hidden sm:flex items-center gap-1 sm:gap-1.5">
            <button
              onClick={() => setView({ screen: "calendario" })}
              className={`p-2 rounded-xl transition-colors ${view.screen === "calendario" ? "bg-violet-100 text-violet-700" : "text-indigo-400 hover:bg-indigo-50"}`}
              title="Calendario"
            >
              <Calendar size={18} />
            </button>
            <button
              onClick={() => setView({ screen: "carrera" })}
              className={`p-2 rounded-xl transition-colors ${view.screen === "carrera" ? "bg-violet-100 text-violet-700" : "text-indigo-400 hover:bg-indigo-50"}`}
              title="Mapa de carrera"
            >
              <Map size={18} />
            </button>
            <button
              onClick={() => setView({ screen: "backup" })}
              className={`p-2 rounded-xl transition-colors ${view.screen === "backup" ? "bg-violet-100 text-violet-700" : "text-indigo-400 hover:bg-indigo-50"}`}
              title="Backup"
            >
              <Download size={18} />
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl text-indigo-400 hover:bg-indigo-50 transition-colors"
              title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <div className="sf-seal w-11 h-11 flex flex-col items-center justify-center bg-white shrink-0">
              <Flame size={13} className={streak.count > 0 ? "text-violet-500" : "text-slate-300"} />
              <span className="font-mono text-sm font-semibold text-violet-500 leading-none mt-0.5">{streak.count}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-violet-600 font-display font-bold text-sm bg-violet-50 border border-violet-200 rounded-full px-3 py-1.5">
              <Target size={15} />
              {overallMastery}%
            </div>
            {totalDueToday > 0 && (
              <div className="flex items-center gap-1.5 text-teal-700 font-display font-bold text-sm bg-teal-50 border border-teal-200 rounded-full px-3 py-1.5">
                <Layers size={15} />
                {totalDueToday}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-24 sm:pb-6">
        {view.screen === "dashboard" && (
          <Dashboard
            subjects={subjects}
            addSubject={addSubject}
            deleteSubject={deleteSubject}
            openSubject={(id) => setView({ screen: "subject", subjectId: id })}
            openCalendar={() => setView({ screen: "calendario" })}
            openCareer={() => setView({ screen: "carrera" })}
          />
        )}

        {view.screen === "calendario" && (
          <CalendarView subjects={subjects} back={() => setView({ screen: "dashboard" })} />
        )}

        {view.screen === "carrera" && (
          <CareerView back={() => setView({ screen: "dashboard" })} />
        )}

        {view.screen === "backup" && (
          <BackupView back={() => setView({ screen: "dashboard" })} />
        )}

        {view.screen === "subject" && currentSubject && (
          <SubjectView
            subject={currentSubject}
            back={() => setView({ screen: "dashboard" })}
            openUnit={(unitId) => setView({ screen: "unit", subjectId: currentSubject.id, unitId })}
            addUnit={(unitId, title, text, hasPdf) => addUnit(currentSubject.id, unitId, title, text, hasPdf)}
            deleteUnit={(unitId) => deleteUnit(currentSubject.id, unitId)}
            update={(patch) => updateSubject(currentSubject.id, patch)}
          />
        )}

        {view.screen === "unit" && currentSubject && currentUnit && (
          <UnitView
            subject={currentSubject}
            unit={currentUnit}
            back={() => setView({ screen: "subject", subjectId: currentSubject.id })}
            update={(patch) => updateUnit(currentSubject.id, currentUnit.id, patch)}
            onStudy={bumpStreak}
          />
        )}
      </main>

      {/* Barra de navegación inferior — solo en mobile, con safe-area para el gesture bar */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 bg-white/95 backdrop-blur border-t border-indigo-100 pb-safe">
        <div className="grid grid-cols-4">
          {[
            { id: "dashboard", label: "Inicio", icon: Home },
            { id: "calendario", label: "Agenda", icon: Calendar },
            { id: "carrera", label: "Carrera", icon: Map },
            { id: "backup", label: "Backup", icon: Download },
          ].map(t => {
            const Icon = t.icon;
            const active = view.screen === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setView({ screen: t.id })}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] transition-colors ${
                  active ? "text-violet-600" : "text-indigo-300"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                <span className="text-[10px] font-display font-bold">{t.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */

/* ---------------- Frases motivadoras ---------------- */

const QUOTES = [
  { text: "La virtud es un hábito: nos volvemos justos haciendo actos de justicia, templados haciendo actos de templanza.", author: "Aristóteles" },
  { text: "No es que las cosas sean difíciles y por eso no nos atrevemos; es que no nos atrevemos y por eso son difíciles.", author: "Séneca" },
  { text: "Ten en cuenta que muy poco es necesario para vivir una vida feliz.", author: "Marco Aurelio" },
  { text: "El hombre que ha vaciado su mente de todo pensamiento perturbador encuentra la paz en cualquier lugar.", author: "Marco Aurelio" },
  { text: "Cuánto más útil sería aprender a soportar lo que no se puede cambiar y a mejorar lo que sí, con dignidad.", author: "Séneca" },
  { text: "El hábito es una segunda naturaleza que destruye la primera.", author: "Blaise Pascal" },
  { text: "Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.", author: "Aristóteles" },
  { text: "La disciplina es elegir entre lo que querés ahora y lo que más querés.", author: "Anónimo" },
  { text: "Un río abre camino a través de las rocas, no por su fuerza, sino por su constancia.", author: "Anónimo" },
  { text: "El que tiene un porqué para vivir puede soportar casi cualquier cómo.", author: "Friedrich Nietzsche" },
  { text: "No hay viento favorable para el que no sabe a dónde va.", author: "Séneca" },
  { text: "Entre el estímulo y la respuesta hay un espacio. En ese espacio está nuestro poder de elegir.", author: "Viktor Frankl" },
  { text: "Al hombre se le puede arrebatar todo salvo una cosa: la última de las libertades humanas, la elección de su actitud.", author: "Viktor Frankl" },
  { text: "Lo que no te transforma, te fortalece; y lo que te fortalece, te transforma.", author: "Anónimo" },
  { text: "Motivación es lo que te hace empezar. El hábito es lo que te hace seguir.", author: "Jim Ryun" },
  { text: "No cuentes los días, hacé que los días cuenten.", author: "Muhammad Ali" },
  { text: "Empezá donde estás, usá lo que tengas, hacé lo que puedas.", author: "Arthur Ashe" },
  { text: "El estudio, como todo camino de crecimiento, no pide perfección, sino constancia.", author: "Anónimo" },
  { text: "La mente que se abre a una idea nueva jamás vuelve a su tamaño original.", author: "Albert Einstein" },
  { text: "Cada vez que estudiás algo aunque sea diez minutos, le estás ganando a la versión de vos que no lo hacía.", author: "Anónimo" },
  { text: "La paciencia es amarga, pero su fruto es dulce.", author: "Aristóteles" },
  { text: "No hay atajos para ningún lugar al que valga la pena ir.", author: "Beverly Sills" },
  { text: "El fracaso es simplemente la oportunidad de comenzar de nuevo, esta vez de forma más inteligente.", author: "Henry Ford" },
  { text: "Sé fiel a las cosas pequeñas, porque en ellas reside tu fuerza.", author: "Madre Teresa de Calcuta" },
  { text: "La esperanza no es la convicción de que algo va a salir bien, sino la certeza de que algo tiene sentido.", author: "Václav Havel" },
  { text: "El que tiene esperanza vive de otra manera.", author: "Papa Francisco" },
  { text: "No temas a la perfección, nunca la vas a alcanzar.", author: "Salvador Dalí" },
  { text: "Los sueños no expiran. Respiran mientras vos seguís caminando hacia ellos.", author: "Anónimo" },
  { text: "Hacé de tu vida un sueño, y de un sueño, una realidad.", author: "Antoine de Saint-Exupéry" },
  { text: "Solo se puede alcanzar un gran éxito cuando nos aferramos con firmeza a un objetivo hasta conseguirlo.", author: "Napoleon Hill" },
];

function dayIndex(len) {
  const start = new Date(new Date().getFullYear(), 0, 0);
  const diff = new Date() - start;
  const day = Math.floor(diff / 86400000);
  return day % len;
}

function QuoteCard() {
  const [idx, setIdx] = useState(() => dayIndex(QUOTES.length));
  const quote = QUOTES[idx];

  const shuffle = () => {
    let next = Math.floor(Math.random() * QUOTES.length);
    if (next === idx) next = (next + 1) % QUOTES.length;
    setIdx(next);
  };

  return (
    <div className="sf-tape relative bg-white border border-indigo-100 p-5 mb-5 shadow-sm" style={{ transform: "rotate(-0.4deg)" }}>
      <p className="font-display text-[16px] sm:text-lg font-medium leading-snug text-indigo-950 pr-2">"{quote.text}"</p>
      <div className="flex items-center justify-between mt-3">
        <span className="font-mono text-xs text-indigo-400">— {quote.author}</span>
        <button
          onClick={shuffle}
          className="font-mono text-[11px] text-indigo-600 hover:bg-indigo-900 hover:text-indigo-50 flex items-center gap-1 border border-indigo-900 px-2.5 py-1 transition-colors"
        >
          <RotateCcw size={11} /> Otra frase
        </button>
      </div>
    </div>
  );
}

/* ---------------- Calendario / agenda ---------------- */

const DAY_MS = 86400000;
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAY_LETTERS = ["L", "M", "M", "J", "V", "S", "D"];

const EVENT_TYPES = [
  { id: "examen", label: "Examen", dot: "bg-rose-500" },
  { id: "entrega", label: "Entrega", dot: "bg-amber-500" },
  { id: "tarea", label: "Tarea", dot: "bg-violet-500" },
  { id: "otro", label: "Otro", dot: "bg-slate-400" },
];

function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Cuántas flashcards tocan repasar ese día puntual (hoy incluye atrasadas; días futuros, solo las que vencen justo ese día)
function cardsForDay(subjects, date) {
  const start = new Date(date); start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + DAY_MS);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const isToday = sameDay(date, now);
  const isPast = start < todayStart && !isToday;
  if (isPast) return 0;
  let count = 0;
  subjects.forEach(s => (s.units || []).forEach(u => (u.flashcards || []).forEach(c => {
    const due = c.due || 0;
    if (isToday ? due <= end.getTime() : (due >= start.getTime() && due < end.getTime())) count++;
  })));
  return count;
}

function upcomingEvents(events, limit = 4) {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  return events
    .filter(e => new Date(e.date + "T00:00:00") >= todayStart)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

function eventDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime() + DAY_MS);
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, tomorrow)) return "Mañana";
  return d.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

function EventForm({ subjects, initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "tarea");
  const [subjectId, setSubjectId] = useState(initial?.subjectId || "");
  const [note, setNote] = useState(initial?.note || "");

  const save = () => {
    if (!title.trim()) return;
    onSave(title.trim(), type, subjectId, note.trim());
  };

  return (
    <div className="border-2 border-violet-200 rounded-2xl p-3 mb-3 space-y-2 bg-white">
      <input
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Ej: Parcial de Filosofía"
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
      />
      <div className="flex gap-2 flex-wrap">
        <select value={type} onChange={e => setType(e.target.value)} className="border border-indigo-100 rounded-xl px-2 py-2 text-sm outline-none bg-white">
          {EVENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        {subjects.length > 0 && (
          <select value={subjectId} onChange={e => setSubjectId(e.target.value)} className="flex-1 min-w-[140px] border border-indigo-100 rounded-xl px-2 py-2 text-sm outline-none bg-white">
            <option value="">Sin materia vinculada</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Nota opcional..."
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-indigo-400">Cancelar</button>
        <button onClick={save} className="bg-violet-600 text-white rounded-xl px-4 py-2 font-display font-bold text-sm">Guardar</button>
      </div>
    </div>
  );
}

function CalendarView({ subjects, back }) {
  const [events, setEvents] = useLocalStorage("studyflow_events", []);
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selected, setSelected] = useState(() => new Date());
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const today = new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = (firstOfMonth.getDay() + 6) % 7; // lunes = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const eventsOnDay = (date) => events.filter(e => e.date === ymd(date));
  const selectedEvents = eventsOnDay(selected);
  const selectedDue = cardsForDay(subjects, selected);

  const addEvent = (title, type, subjectId, note) => {
    setEvents([...events, { id: uid(), date: ymd(selected), title, type, subjectId: subjectId || null, note }]);
    setAdding(false);
  };
  const editEvent = (id, title, type, subjectId, note) => {
    setEvents(events.map(e => e.id === id ? { ...e, title, type, subjectId: subjectId || null, note } : e));
    setEditingId(null);
  };
  const deleteEvent = (id) => setEvents(events.filter(e => e.id !== id));

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> Inicio
      </button>

      <h1 className="font-display text-2xl font-extrabold text-indigo-950 mb-5 flex items-center gap-2">
        <CalendarClock size={22} className="text-violet-500" /> Calendario
      </h1>

      <div className="bg-white border border-indigo-100 rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-full hover:bg-indigo-50 text-indigo-400">
            <ChevronLeft size={18} />
          </button>
          <p className="font-display font-extrabold text-indigo-950">{MONTH_NAMES[month]} {year}</p>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-full hover:bg-indigo-50 text-indigo-400">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LETTERS.map((w, i) => (
            <div key={i} className="text-center text-[11px] font-display font-bold text-indigo-300">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const isToday = sameDay(date, today);
            const isSelected = sameDay(date, selected);
            const dayEvents = eventsOnDay(date);
            const due = cardsForDay(subjects, date);
            return (
              <button
                key={i}
                onClick={() => setSelected(date)}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-medium transition-colors ${
                  isSelected ? "bg-violet-600 text-white" : isToday ? "bg-violet-50 text-violet-700 font-bold" : "hover:bg-indigo-50 text-indigo-700"
                }`}
              >
                {date.getDate()}
                <div className="flex items-center gap-0.5 mt-0.5 h-1.5">
                  {dayEvents.slice(0, 3).map(e => {
                    const t = EVENT_TYPES.find(t => t.id === e.type) || EVENT_TYPES[3];
                    return <span key={e.id} className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white" : t.dot}`} />;
                  })}
                  {due > 0 && dayEvents.length === 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-white/70" : "bg-teal-400"}`} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-indigo-100 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="font-display font-bold text-indigo-950 capitalize">
            {selected.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}
          </p>
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 flex items-center gap-1 text-xs font-display font-bold text-violet-600 hover:text-violet-800 bg-violet-50 rounded-full px-3 py-1.5"
          >
            <Plus size={13} /> Evento
          </button>
        </div>

        {selectedDue > 0 && (
          <div className="flex items-center gap-1.5 text-xs font-display font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 mb-2">
            <Layers size={13} /> {selectedDue} tarjeta{selectedDue !== 1 ? "s" : ""} para repasar
          </div>
        )}

        {adding && <EventForm subjects={subjects} onSave={addEvent} onCancel={() => setAdding(false)} />}

        {selectedEvents.length === 0 && !adding && selectedDue === 0 && (
          <p className="text-sm text-indigo-300 py-3 text-center">Sin eventos ni repasos para este día.</p>
        )}

        <div className="space-y-2">
          {selectedEvents.map(e => (
            editingId === e.id ? (
              <EventForm
                key={e.id}
                subjects={subjects}
                initial={e}
                onSave={(...args) => editEvent(e.id, ...args)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={e.id} className="flex items-center gap-3 border border-indigo-50 rounded-xl px-3 py-2.5">
                <span className={`w-2 h-2 rounded-full shrink-0 ${(EVENT_TYPES.find(t => t.id === e.type) || EVENT_TYPES[3]).dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-900 truncate">{e.title}</p>
                  {e.note && <p className="text-xs text-indigo-400 truncate">{e.note}</p>}
                </div>
                <button onClick={() => setEditingId(e.id)} className="text-indigo-300 hover:text-violet-600 shrink-0 p-1.5 -m-1.5"><Pencil size={14} /></button>
                <button onClick={() => deleteEvent(e.id)} className="text-indigo-300 hover:text-rose-500 shrink-0 p-1.5 -m-1.5"><Trash2 size={14} /></button>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Mapa de carrera (profesorado propio) ---------------- */

const CAREER_STATUS = [
  { id: "pendiente", label: "Pendiente", badge: "bg-slate-50 text-slate-500 border-slate-200" },
  { id: "cursando", label: "Cursando", badge: "bg-amber-50 text-amber-600 border-amber-200" },
  { id: "aprobada", label: "Aprobada", badge: "bg-emerald-50 text-emerald-600 border-emerald-200" },
];

function CareerForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || "");
  const [year, setYear] = useState(initial?.year || 1);
  const [status, setStatus] = useState(initial?.status || "pendiente");
  const [grade, setGrade] = useState(initial?.grade || "");
  const [note, setNote] = useState(initial?.note || "");

  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), year: Number(year) || 1, status, grade: grade.trim(), note: note.trim() });
  };

  return (
    <div className="border-2 border-violet-200 rounded-2xl p-3 space-y-2 bg-white">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Ej: Pedagogía II"
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
      />
      <div className="flex gap-2 flex-wrap">
        <input
          type="number"
          min="1"
          value={year}
          onChange={e => setYear(e.target.value)}
          className="w-20 border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none"
          placeholder="Año"
        />
        <select value={status} onChange={e => setStatus(e.target.value)} className="border border-indigo-100 rounded-xl px-2 py-2 text-sm outline-none bg-white">
          {CAREER_STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <input
          value={grade}
          onChange={e => setGrade(e.target.value)}
          placeholder="Nota (opcional)"
          className="flex-1 min-w-[100px] border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none"
        />
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        placeholder="Comentario opcional (correlativas, profesor, etc.)"
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-indigo-400">Cancelar</button>
        <button onClick={save} className="bg-violet-600 text-white rounded-xl px-4 py-2 font-display font-bold text-sm">Guardar</button>
      </div>
    </div>
  );
}

function CareerView({ back }) {
  const [career, setCareer] = useLocalStorage("studyflow_career", { title: "Mi profesorado", subjects: [] });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(career.title);

  const subjects = career.subjects || [];
  const approved = subjects.filter(s => s.status === "aprobada").length;
  const pct = subjects.length ? Math.round((approved / subjects.length) * 100) : 0;
  const years = [...new Set(subjects.map(s => s.year || 1))].sort((a, b) => a - b);

  const addSubject = (data) => {
    setCareer({ ...career, subjects: [...subjects, { id: uid(), ...data }] });
    setAdding(false);
  };
  const editSubject = (id, data) => {
    setCareer({ ...career, subjects: subjects.map(s => s.id === id ? { ...s, ...data } : s) });
    setEditingId(null);
  };
  const deleteSubject = (id) => setCareer({ ...career, subjects: subjects.filter(s => s.id !== id) });
  const cycleStatus = (s) => {
    const order = ["pendiente", "cursando", "aprobada"];
    editSubject(s.id, { ...s, status: order[(order.indexOf(s.status) + 1) % order.length] });
  };
  const saveTitle = () => {
    setCareer({ ...career, title: titleDraft.trim() || career.title });
    setEditingTitle(false);
  };

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> Inicio
      </button>

      {editingTitle ? (
        <div className="flex items-center gap-2 mb-2">
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onKeyDown={e => e.key === "Enter" && saveTitle()}
            className="flex-1 border border-indigo-100 rounded-xl px-3 py-2 text-lg font-display font-extrabold outline-none focus:ring-2 focus:ring-violet-300"
          />
          <button onClick={saveTitle} className="bg-violet-600 text-white rounded-xl px-3 py-2 text-sm font-display font-bold">Ok</button>
        </div>
      ) : (
        <button onClick={() => { setTitleDraft(career.title); setEditingTitle(true); }} className="flex items-center gap-2 group mb-2">
          <h1 className="font-display text-2xl font-extrabold text-indigo-950">{career.title}</h1>
          <Pencil size={14} className="text-indigo-300 opacity-0 group-hover:opacity-100" />
        </button>
      )}

      <div className="flex items-center gap-2 mb-5">
        <div className="w-40"><ProgressBar value={pct} colorClass="bg-emerald-500" variant="thread" /></div>
        <span className="text-xs font-display font-bold text-indigo-400">{approved}/{subjects.length} aprobadas ({pct}%)</span>
      </div>

      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-violet-600 hover:border-violet-300 rounded-2xl py-3 text-sm font-display font-bold mb-5"
        >
          <Plus size={15} /> Nueva materia de la carrera
        </button>
      ) : (
        <div className="mb-5"><CareerForm onSave={addSubject} onCancel={() => setAdding(false)} /></div>
      )}

      {subjects.length === 0 && !adding && (
        <div className="text-center py-14 bg-white rounded-3xl border border-dashed border-indigo-200">
          <Map size={32} className="mx-auto text-indigo-200 mb-2" />
          <p className="font-display font-bold text-indigo-400">Todavía no armaste tu mapa de carrera</p>
        </div>
      )}

      {years.map(year => (
        <div key={year} className="mb-5">
          <p className="text-xs font-display font-bold text-indigo-400 mb-2 uppercase tracking-wide">Año {year}</p>
          <div className="space-y-2">
            {subjects.filter(s => (s.year || 1) === year).map(s => (
              editingId === s.id ? (
                <CareerForm key={s.id} initial={s} onSave={(data) => editSubject(s.id, data)} onCancel={() => setEditingId(null)} />
              ) : (
                <div key={s.id} className="bg-white border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <button
                    onClick={() => cycleStatus(s)}
                    className={`shrink-0 text-[11px] font-display font-bold border rounded-full px-2.5 py-1 ${(CAREER_STATUS.find(c => c.id === s.status) || CAREER_STATUS[0]).badge}`}
                    title="Tocar para cambiar el estado"
                  >
                    {(CAREER_STATUS.find(c => c.id === s.status) || CAREER_STATUS[0]).label}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-indigo-900 truncate">{s.name}</p>
                    {(s.grade || s.note) && (
                      <p className="text-xs text-indigo-400 truncate">
                        {s.grade && `Nota: ${s.grade}`}{s.grade && s.note ? " · " : ""}{s.note}
                      </p>
                    )}
                  </div>
                  <button onClick={() => setEditingId(s.id)} className="shrink-0 text-indigo-300 hover:text-violet-600 p-1.5 -m-1.5"><Pencil size={15} /></button>
                  <button onClick={() => deleteSubject(s.id)} className="shrink-0 text-indigo-300 hover:text-rose-500 p-1.5 -m-1.5"><Trash2 size={15} /></button>
                </div>
              )
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Backup: exportar / importar todo en un .json ---------------- */

function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function exportBackup() {
  const subjects = readLS("studyflow_subjects", []);
  const streak = readLS("studyflow_streak", { count: 0, last: null });
  const events = readLS("studyflow_events", []);
  const career = readLS("studyflow_career", { title: "Mi profesorado", subjects: [] });

  // Los PDF originales viven en IndexedDB, no en localStorage — hay que juntarlos aparte.
  const pdfs = [];
  for (const s of subjects) {
    for (const u of (s.units || [])) {
      if (u.hasPdf) {
        try {
          const blob = await getPdfBlob(u.id);
          if (blob) pdfs.push({ unitId: u.id, dataUrl: await blobToDataUrl(blob) });
        } catch {
          // si un PDF puntual falla, seguimos con el resto del backup igual
        }
      }
    }
  }

  const backup = {
    app: "StudyFlow",
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    streak,
    events,
    career,
    pdfs,
  };

  const blob = new Blob([JSON.stringify(backup)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `studyflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importBackup(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Ese archivo no es un JSON válido.");
  }
  if (!data || !Array.isArray(data.subjects)) {
    throw new Error("Ese archivo no tiene el formato de un backup de StudyFlow.");
  }

  localStorage.setItem("studyflow_subjects", JSON.stringify(data.subjects));
  localStorage.setItem("studyflow_streak", JSON.stringify(data.streak || { count: 0, last: null }));
  localStorage.setItem("studyflow_events", JSON.stringify(data.events || []));
  localStorage.setItem("studyflow_career", JSON.stringify(data.career || { title: "Mi profesorado", subjects: [] }));

  if (Array.isArray(data.pdfs)) {
    for (const p of data.pdfs) {
      try {
        const res = await fetch(p.dataUrl);
        const blob = await res.blob();
        await savePdfBlob(p.unitId, blob);
      } catch {
        // si un PDF puntual falla al restaurar, seguimos con el resto igual
      }
    }
  }
}

function BackupView({ back }) {
  const subjects = readLS("studyflow_subjects", []);
  const events = readLS("studyflow_events", []);
  const career = readLS("studyflow_career", { subjects: [] });
  const unitCount = subjects.reduce((a, s) => a + (s.units?.length || 0), 0);
  const pdfCount = subjects.reduce((a, s) => a + (s.units || []).filter(u => u.hasPdf).length, 0);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);

  const doExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      await exportBackup();
      setMsg({ type: "ok", text: "Backup descargado correctamente." });
    } catch (e) {
      setMsg({ type: "error", text: "No se pudo generar el backup. Probá de nuevo." });
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    const ok = window.confirm(
      "Restaurar este backup va a REEMPLAZAR todas las materias, notas, eventos y el mapa de carrera que tenés ahora en esta compu por los del archivo. ¿Confirmás?"
    );
    if (!ok) { if (fileRef.current) fileRef.current.value = ""; return; }
    setImporting(true);
    setMsg(null);
    try {
      await importBackup(file);
      setMsg({ type: "ok", text: "Backup restaurado. Recargando la app..." });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setMsg({ type: "error", text: e.message || "No se pudo restaurar este archivo." });
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> Inicio
      </button>

      <h1 className="font-display text-2xl font-extrabold text-indigo-950 mb-1 flex items-center gap-2">
        <Download size={22} className="text-violet-500" /> Backup
      </h1>
      <p className="text-sm text-indigo-400 mb-5">Descargá una copia de todo lo que armaste, o restaurala en otra compu.</p>

      <div className="bg-white border border-indigo-100 rounded-2xl p-4 mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
        <div><p className="font-display text-xl font-extrabold text-indigo-950">{subjects.length}</p><p className="text-xs text-indigo-400">materias</p></div>
        <div><p className="font-display text-xl font-extrabold text-indigo-950">{unitCount}</p><p className="text-xs text-indigo-400">unidades</p></div>
        <div><p className="font-display text-xl font-extrabold text-indigo-950">{events.length}</p><p className="text-xs text-indigo-400">eventos</p></div>
        <div><p className="font-display text-xl font-extrabold text-indigo-950">{(career.subjects || []).length}</p><p className="text-xs text-indigo-400">carrera</p></div>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm mb-4 ${msg.type === "ok" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
          {msg.text}
        </div>
      )}

      <div className="bg-white border border-indigo-100 rounded-2xl p-4 mb-4">
        <p className="font-display font-bold text-indigo-950 mb-1">Descargar backup</p>
        <p className="text-sm text-indigo-400 mb-3">
          Un archivo .json con todas tus materias, apuntes, flashcards, preguntas, notas
          {pdfCount > 0 ? `, los ${pdfCount} PDF que subiste` : ""}, calendario y mapa de carrera.
        </p>
        <button
          onClick={doExport}
          disabled={exporting}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-display font-bold text-sm rounded-xl px-4 py-2.5"
        >
          {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          {exporting ? "Preparando..." : "Descargar backup (.json)"}
        </button>
      </div>

      <div className="bg-white border border-indigo-100 rounded-2xl p-4">
        <p className="font-display font-bold text-indigo-950 mb-1">Restaurar backup</p>
        <p className="text-sm text-indigo-400 mb-3">
          Ojo: esto <span className="font-semibold text-rose-500">reemplaza</span> todo lo que tenés ahora en esta compu por lo que haya en el archivo.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 bg-white border border-indigo-200 hover:border-violet-300 disabled:opacity-60 text-indigo-600 font-display font-bold text-sm rounded-xl px-4 py-2.5"
        >
          {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {importing ? "Restaurando..." : "Elegir archivo de backup..."}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Widgets de inicio: agenda y carrera ---------------- */

function AgendaWidget({ subjects, onOpen }) {
  const [events] = useLocalStorage("studyflow_events", []);
  const upcoming = upcomingEvents(events, 4);
  const dueToday = subjects.reduce((a, s) => a + subjectDueCount(s), 0);

  return (
    <button onClick={onOpen} className="text-left bg-white border border-indigo-100 rounded-2xl p-4 hover:shadow-sm transition-shadow w-full">
      <div className="flex items-center justify-between mb-3">
        <p className="font-display font-bold text-indigo-950 flex items-center gap-1.5">
          <CalendarClock size={16} className="text-violet-500" /> Agenda
        </p>
        <ChevronRight size={16} className="text-indigo-300 shrink-0" />
      </div>

      {dueToday > 0 && (
        <div className="flex items-center gap-1.5 text-xs font-display font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-1.5 mb-2 w-fit">
          <Layers size={12} /> {dueToday} para repasar hoy
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="text-sm text-indigo-300">Sin eventos próximos.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(e => (
            <div key={e.id} className="flex items-center gap-2 text-sm">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${(EVENT_TYPES.find(t => t.id === e.type) || EVENT_TYPES[3]).dot}`} />
              <span className="text-indigo-800 truncate flex-1">{e.title}</span>
              <span className="text-xs text-indigo-400 font-mono shrink-0">{eventDateLabel(e.date)}</span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function CareerWidget({ onOpen }) {
  const [career] = useLocalStorage("studyflow_career", { title: "Mi profesorado", subjects: [] });
  const subjects = career.subjects || [];
  const approved = subjects.filter(s => s.status === "aprobada").length;
  const pct = subjects.length ? Math.round((approved / subjects.length) * 100) : 0;

  return (
    <button onClick={onOpen} className="text-left bg-white border border-indigo-100 rounded-2xl p-4 hover:shadow-sm transition-shadow w-full">
      <div className="flex items-center justify-between mb-3 gap-2">
        <p className="font-display font-bold text-indigo-950 flex items-center gap-1.5 truncate">
          <Map size={16} className="text-violet-500 shrink-0" /> <span className="truncate">{career.title}</span>
        </p>
        <ChevronRight size={16} className="text-indigo-300 shrink-0" />
      </div>

      {subjects.length === 0 ? (
        <p className="text-sm text-indigo-300">Todavía no armaste tu mapa de carrera.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1"><ProgressBar value={pct} colorClass="bg-emerald-500" variant="thread" /></div>
            <span className="text-xs font-display font-bold text-indigo-400 shrink-0">{pct}%</span>
          </div>
          <p className="text-xs text-indigo-400">{approved}/{subjects.length} materias aprobadas</p>
        </>
      )}
    </button>
  );
}

function Dashboard({ subjects, addSubject, deleteSubject, openSubject, openCalendar, openCareer }) {
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
      <QuoteCard />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <AgendaWidget subjects={subjects} onOpen={openCalendar} />
        <CareerWidget onOpen={openCareer} />
      </div>

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
          const mastery = subjectMastery(s);
          const due = subjectDueCount(s);
          return (
            <div key={s.id} className="group relative bg-white border border-indigo-100 overflow-hidden hover:shadow-md transition-shadow">
              <div className={`absolute left-0 top-0 bottom-0 w-1 ${color.bar}`} />
              <button onClick={() => openSubject(s.id)} className="block w-full text-left p-5 pl-6">
                <div className="flex items-center justify-between mb-3">
                  <span className={`font-display font-extrabold text-lg ${color.text}`}>{s.name}</span>
                  <ChevronRight size={18} className="text-indigo-300 group-hover:translate-x-0.5 transition-transform" />
                </div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-indigo-400 font-mono">{s.units.length} unidad{s.units.length !== 1 ? "es" : ""}</p>
                  {due > 0 && (
                    <span className="text-[11px] font-display font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                      {due} para hoy
                    </span>
                  )}
                </div>
                <ProgressBar value={mastery} colorClass={color.bar} />
                <p className="text-right text-xs font-display font-bold text-indigo-400 mt-1">{mastery}% dominado</p>
              </button>
              <button
                onClick={() => deleteSubject(s.id)}
                className="absolute top-3 right-3 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-indigo-300 hover:text-rose-500 bg-white/80 rounded-full p-2"
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

function SubjectView({ subject, back, openUnit, addUnit, deleteUnit, update }) {
  const [sTab, setSTab] = useState("unidades");
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

      <div className="flex items-center justify-between mb-4 gap-3">
        <h1 className={`font-display text-2xl font-extrabold ${color.text}`}>{subject.name}</h1>
        {sTab === "unidades" && (
          <button
            onClick={() => setCreating(true)}
            className="shrink-0 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-display font-bold text-sm rounded-xl px-4 py-2.5"
          >
            <Plus size={16} /> Nueva unidad
          </button>
        )}
      </div>

      <div className="flex gap-1.5 mb-5">
        <button
          onClick={() => setSTab("unidades")}
          className={`flex-1 sm:flex-none sm:px-5 rounded-xl py-2 text-sm font-display font-bold transition-colors flex items-center justify-center gap-1.5 ${
            sTab === "unidades" ? `${color.bar} text-white` : "bg-white text-indigo-400 border border-indigo-100"
          }`}
        >
          <BookOpen size={14} /> Unidades
        </button>
        <button
          onClick={() => setSTab("notas")}
          className={`flex-1 sm:flex-none sm:px-5 rounded-xl py-2 text-sm font-display font-bold transition-colors flex items-center justify-center gap-1.5 ${
            sTab === "notas" ? `${color.bar} text-white` : "bg-white text-indigo-400 border border-indigo-100"
          }`}
        >
          <StickyNote size={14} /> Notas
        </button>
      </div>

      {sTab === "notas" && (
        <NotesEditor
          key={subject.id}
          value={subject.notes}
          onChange={(v) => update({ notes: v })}
          placeholder={`Notas generales de ${subject.name}: ideas sueltas, dudas, cosas para preguntar en clase...`}
        />
      )}

      {sTab === "unidades" && (
      <>
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
            <Layers size={12} /> Después de guardar, armás vos las flashcards y preguntas clave de esta unidad.
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
        {subject.units.map((u, i) => {
          const mastery = unitMastery(u);
          const due = dueCards(u).length;
          return (
          <div key={u.id} className="group bg-white border border-indigo-100 rounded-2xl p-4 flex items-center gap-4 hover:shadow-sm transition-shadow">
            <div className={`w-9 h-9 rounded-full ${color.soft} ${color.text} font-display font-extrabold flex items-center justify-center shrink-0`}>
              {i + 1}
            </div>
            <button onClick={() => openUnit(u.id)} className="flex-1 text-left min-w-0">
              <p className="font-display font-bold text-indigo-950 truncate">{u.title}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <div className="w-32"><ProgressBar value={mastery} colorClass={color.bar} /></div>
                <span className="text-xs text-indigo-400 font-mono">{mastery}%</span>
                <span className="text-xs text-indigo-300 flex items-center gap-1"><Layers size={11} />{u.flashcards.length}</span>
                {due > 0 && (
                  <span className="text-[11px] font-display font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                    {due} para hoy
                  </span>
                )}
              </div>
            </button>
            <ChevronRight size={18} className="text-indigo-300 shrink-0" />
            <button
              onClick={() => deleteUnit(u.id)}
              className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-indigo-300 hover:text-rose-500 shrink-0 p-1.5 -m-1.5"
            >
              <Trash2 size={15} />
            </button>
          </div>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

/* ---------------- Vista de unidad (lectura + herramientas) ---------------- */

function UnitView({ subject, unit, back, update, onStudy }) {
  const [tab, setTab] = useState("lectura");
  const color = SUBJECT_COLORS.find(c => c.name === subject.color) || SUBJECT_COLORS[0];
  const mastery = unitMastery(unit);
  const due = dueCards(unit).length;

  const markRead = () => update({ read: true });

  const tabs = [
    { id: "lectura", label: "Lectura", icon: BookOpen },
    ...(unit.hasPdf ? [{ id: "pdf", label: "Ver PDF", icon: FileText }] : []),
    { id: "flashcards", label: "Flashcards", icon: Layers, badge: due || null },
    { id: "preguntas", label: "Preguntas clave", icon: HelpCircle },
    { id: "notas", label: "Notas", icon: StickyNote },
  ];

  return (
    <div className="anim-in">
      <button onClick={back} className="flex items-center gap-1 text-indigo-400 hover:text-indigo-600 text-sm font-medium mb-4">
        <ChevronLeft size={16} /> {subject.name}
      </button>

      <div className="flex items-center justify-between mb-2 gap-3">
        <h1 className="font-display text-xl sm:text-2xl font-extrabold text-indigo-950">{unit.title}</h1>
        {!unit.read ? (
          <button onClick={markRead} className={`shrink-0 flex items-center gap-1.5 ${color.bar} text-white font-display font-bold text-sm rounded-xl px-3.5 py-2`}>
            <Check size={15} /> Marcar leída
          </button>
        ) : (
          <span className="shrink-0 flex items-center gap-1.5 bg-emerald-50 text-emerald-600 font-display font-bold text-sm rounded-xl px-3.5 py-2">
            <Check size={15} /> Leída
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-4">
        <div className="w-40"><ProgressBar value={mastery} colorClass={color.bar} /></div>
        <span className="text-xs font-display font-bold text-indigo-400">{mastery}% dominado</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
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
              {t.badge ? (
                <span className={`text-[10px] rounded-full px-1.5 ${active ? "bg-white/25" : "bg-amber-100 text-amber-700"}`}>
                  {t.badge}
                </span>
              ) : null}
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
        <FlashcardsTab unit={unit} update={update} onStudy={onStudy} color={color} />
      )}

      {tab === "preguntas" && (
        <QuestionsTab unit={unit} update={update} color={color} />
      )}

      {tab === "notas" && (
        <NotesEditor
          key={unit.id}
          value={unit.notes}
          onChange={(v) => update({ notes: v })}
          placeholder={`Notas de "${unit.title}": dudas, ideas, cosas para repasar antes del examen...`}
        />
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

function CardForm({ initial, onSave, onCancel, color }) {
  const [front, setFront] = useState(initial?.front || "");
  const [back, setBack] = useState(initial?.back || "");

  const save = () => {
    if (!front.trim() || !back.trim()) return;
    onSave(front.trim(), back.trim());
  };

  return (
    <div className={`bg-white border-2 ${color.ring} rounded-2xl p-4`}>
      <label className="text-xs text-indigo-400 font-display font-bold">Frente (pregunta o consigna)</label>
      <textarea
        autoFocus
        value={front}
        onChange={e => setFront(e.target.value)}
        rows={2}
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 font-body mt-1 mb-3"
        placeholder="¿Qué virtud armoniza deseo y razón?"
      />
      <label className="text-xs text-indigo-400 font-display font-bold">Dorso (respuesta)</label>
      <textarea
        value={back}
        onChange={e => setBack(e.target.value)}
        rows={2}
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 font-body mt-1 mb-3"
        placeholder="Templanza"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-indigo-400">Cancelar</button>
        <button onClick={save} className={`${color.bar} text-white rounded-xl px-4 py-2 font-display font-bold text-sm`}>
          Guardar
        </button>
      </div>
    </div>
  );
}

function FlashcardsTab({ unit, update, onStudy, color }) {
  const flashcards = unit.flashcards || [];
  const [mode, setMode] = useState(flashcards.length === 0 ? "manage" : "study");
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [reviewedNow, setReviewedNow] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addCard = (front, back) => {
    update({ flashcards: [...flashcards, { id: uid(), front, back, box: 1, due: 0 }] });
    setAdding(false);
  };
  const editCard = (id, front, back) => {
    update({ flashcards: flashcards.map(c => c.id === id ? { ...c, front, back } : c) });
    setEditingId(null);
  };
  const deleteCard = (id) => {
    update({ flashcards: flashcards.filter(c => c.id !== id) });
  };

  const ModeToggle = (
    <div className="flex gap-1.5 mb-4">
      <button
        onClick={() => setMode("study")}
        className={`flex-1 rounded-xl py-2 text-sm font-display font-bold transition-colors ${
          mode === "study" ? `${color.bar} text-white` : "bg-white text-indigo-400 border border-indigo-100"
        }`}
      >
        Estudiar
      </button>
      <button
        onClick={() => setMode("manage")}
        className={`flex-1 rounded-xl py-2 text-sm font-display font-bold transition-colors ${
          mode === "manage" ? `${color.bar} text-white` : "bg-white text-indigo-400 border border-indigo-100"
        }`}
      >
        Mis tarjetas {flashcards.length > 0 && `(${flashcards.length})`}
      </button>
    </div>
  );

  if (mode === "manage") {
    return (
      <div className="anim-in">
        {ModeToggle}

        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-violet-600 hover:border-violet-300 rounded-2xl py-3 text-sm font-display font-bold mb-3"
          >
            <Plus size={15} /> Nueva tarjeta
          </button>
        ) : (
          <div className="mb-3">
            <CardForm color={color} onSave={addCard} onCancel={() => setAdding(false)} />
          </div>
        )}

        {flashcards.length === 0 && !adding && (
          <p className="text-center text-sm text-indigo-300 py-6">Todavía no armaste tarjetas para esta unidad.</p>
        )}

        <div className="space-y-2">
          {flashcards.map(c => (
            editingId === c.id ? (
              <CardForm
                key={c.id}
                initial={c}
                color={color}
                onSave={(front, back) => editCard(c.id, front, back)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div key={c.id} className="bg-white border border-indigo-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-indigo-900 truncate">{c.front}</p>
                  <p className="text-xs text-indigo-400 truncate">{c.back}</p>
                </div>
                <span className="shrink-0 text-[11px] font-display font-bold text-indigo-400 bg-indigo-50 rounded-full px-2 py-0.5">
                  caja {c.box || 1}
                </span>
                <button onClick={() => setEditingId(c.id)} className="shrink-0 text-indigo-300 hover:text-violet-600 p-1.5 -m-1.5">
                  <Pencil size={15} />
                </button>
                <button onClick={() => deleteCard(c.id)} className="shrink-0 text-indigo-300 hover:text-rose-500 p-1.5 -m-1.5">
                  <Trash2 size={15} />
                </button>
              </div>
            )
          ))}
        </div>
      </div>
    );
  }

  // ---- modo estudio ----
  if (flashcards.length === 0) {
    return (
      <div className="anim-in">
        {ModeToggle}
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-indigo-200">
          <p className="text-indigo-400 font-display font-bold">Todavía no armaste tarjetas para esta unidad.</p>
          <button
            onClick={() => setMode("manage")}
            className={`flex items-center gap-1.5 ${color.bar} text-white font-display font-bold text-sm rounded-xl px-4 py-2 mx-auto mt-4`}
          >
            <Plus size={14} /> Armar la primera
          </button>
        </div>
      </div>
    );
  }

  const queue = dueCards(unit);
  const pool = queue.length > 0 ? queue : flashcards;

  if (i >= pool.length) {
    return (
      <div className="anim-in">
        {ModeToggle}
        <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-emerald-200">
          <Check size={28} className="mx-auto text-emerald-400 mb-2" />
          <p className="font-display font-bold text-emerald-600">
            {queue.length === 0 && reviewedNow === 0
              ? "Ya repasaste todo lo que tocaba por hoy."
              : "Terminaste esta vuelta de tarjetas."}
          </p>
          <button
            onClick={() => { setI(0); setFlipped(false); }}
            className={`flex items-center gap-1.5 ${color.bar} text-white font-display font-bold text-sm rounded-xl px-4 py-2 mx-auto mt-4`}
          >
            <RotateCcw size={13} /> Repasar de nuevo
          </button>
        </div>
      </div>
    );
  }

  const card = pool[i];
  const dragRef = useRef({ x: 0, active: false, moved: false });
  const [dragX, setDragX] = useState(0);

  const review = (gotIt) => {
    const updated = reviewCard(card, gotIt);
    update({ flashcards: flashcards.map(c => c.id === card.id ? updated : c) });
    onStudy();
    setReviewedNow(n => n + 1);
    setFlipped(false);
    setDragX(0);
    setI(i + 1);
  };

  const skip = () => { setFlipped(false); setI(i + 1); };
  const prev = () => { setFlipped(false); setI(Math.max(0, i - 1)); };

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    dragRef.current = { x: t.clientX, active: true, moved: false };
  };
  const handleTouchMove = (e) => {
    if (!dragRef.current.active || !flipped) return;
    const t = e.touches[0];
    const dx = t.clientX - dragRef.current.x;
    if (Math.abs(dx) > 6) dragRef.current.moved = true;
    setDragX(dx);
  };
  const handleTouchEnd = () => {
    if (!dragRef.current.active) return;
    dragRef.current.active = false;
    if (flipped && dragRef.current.moved) {
      if (dragX > 70) { review(true); return; }
      if (dragX < -70) { review(false); return; }
    }
    setDragX(0);
  };
  const handleCardTap = () => {
    if (dragRef.current.moved) { dragRef.current.moved = false; return; } // fue swipe, no toco
    setFlipped(!flipped);
  };

  return (
    <div className="anim-in">
      {ModeToggle}

      <p className="text-xs font-mono text-indigo-400 mb-3">
        {i + 1} / {pool.length}{queue.length > 0 ? " · para hoy" : ""}
      </p>

      <button
        onClick={handleCardTap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: dragX ? `translateX(${dragX}px) rotate(${dragX / 18}deg)` : undefined,
          transition: dragRef.current.active ? "none" : "transform 0.25s ease-out",
          borderColor: dragX > 30 ? "#10b981" : dragX < -30 ? "#f43f5e" : undefined,
        }}
        className={`w-full min-h-[200px] rounded-3xl border-2 ${color.ring} bg-white p-8 flex items-center justify-center text-center shadow-sm touch-pan-y select-none`}
      >
        <p className={`font-display text-lg sm:text-xl font-bold ${flipped ? color.text : "text-indigo-950"}`}>
          {flipped ? card.back : card.front}
        </p>
      </button>

      {!flipped ? (
        <p className="text-center text-xs text-indigo-300 mt-2">Tocá la tarjeta para dar vuelta</p>
      ) : (
        <>
          <p className="text-center text-xs text-indigo-300 mt-2 sm:hidden">Deslizá a la derecha si la sabías, a la izquierda si no</p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <button onClick={() => review(false)} className="flex items-center gap-1.5 bg-rose-50 text-rose-600 border border-rose-200 font-display font-bold text-sm rounded-xl px-4 py-2.5">
              <ThumbsDown size={15} /> No la sabía
            </button>
            <button onClick={() => review(true)} className="flex items-center gap-1.5 bg-emerald-50 text-emerald-600 border border-emerald-200 font-display font-bold text-sm rounded-xl px-4 py-2.5">
              <ThumbsUp size={15} /> La sabía
            </button>
          </div>
        </>
      )}

      <div className="flex items-center justify-center gap-3 mt-4">
        <button onClick={prev} disabled={i === 0} className="p-2.5 rounded-full bg-white border border-indigo-100 text-indigo-400 hover:text-indigo-600 disabled:opacity-30">
          <ChevronLeft size={18} />
        </button>
        <button onClick={skip} className="text-xs text-indigo-300 hover:text-indigo-500 px-3 py-2.5">Saltear</button>
      </div>
    </div>
  );
}

/* ---------------- Preguntas clave (armadas por el usuario) ---------------- */

function QuestionForm({ initial, onSave, onCancel, color }) {
  const [q, setQ] = useState(initial?.q || "");
  const [a, setA] = useState(initial?.a || "");

  const save = () => {
    if (!q.trim() || !a.trim()) return;
    onSave(q.trim(), a.trim());
  };

  return (
    <div className={`bg-white border-2 ${color.ring} rounded-2xl p-4`}>
      <label className="text-xs text-indigo-400 font-display font-bold">Pregunta</label>
      <textarea
        autoFocus
        value={q}
        onChange={e => setQ(e.target.value)}
        rows={2}
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 font-body mt-1 mb-3"
        placeholder="¿Qué plantea el texto sobre...?"
      />
      <label className="text-xs text-indigo-400 font-display font-bold">Respuesta</label>
      <textarea
        value={a}
        onChange={e => setA(e.target.value)}
        rows={3}
        className="w-full border border-indigo-100 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-violet-300 font-body mt-1 mb-3"
        placeholder="Escribí la respuesta con tus palabras..."
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 text-sm text-indigo-400">Cancelar</button>
        <button onClick={save} className={`${color.bar} text-white rounded-xl px-4 py-2 font-display font-bold text-sm`}>
          Guardar
        </button>
      </div>
    </div>
  );
}

function QuestionsTab({ unit, update, color }) {
  const questions = unit.questions || [];
  const [open, setOpen] = useState({});
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const addQuestion = (q, a) => {
    update({ questions: [...questions, { id: uid(), q, a }] });
    setAdding(false);
  };
  const editQuestion = (id, q, a) => {
    update({ questions: questions.map(item => item.id === id ? { ...item, q, a } : item) });
    setEditingId(null);
  };
  const deleteQuestion = (id) => {
    update({ questions: questions.filter(item => item.id !== id) });
  };

  return (
    <div className="anim-in space-y-2.5">
      {!adding ? (
        <button
          onClick={() => setAdding(true)}
          className="w-full flex items-center justify-center gap-1.5 border-2 border-dashed border-indigo-200 text-indigo-400 hover:text-violet-600 hover:border-violet-300 rounded-2xl py-3 text-sm font-display font-bold"
        >
          <Plus size={15} /> Nueva pregunta
        </button>
      ) : (
        <QuestionForm color={color} onSave={addQuestion} onCancel={() => setAdding(false)} />
      )}

      {questions.length === 0 && !adding && (
        <p className="text-center text-sm text-indigo-300 py-6">Todavía no armaste preguntas clave para esta unidad.</p>
      )}

      {questions.map((q, idx) => (
        editingId === q.id ? (
          <QuestionForm
            key={q.id}
            initial={q}
            color={color}
            onSave={(text, a) => editQuestion(q.id, text, a)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={q.id} className="bg-white border border-indigo-100 rounded-2xl overflow-hidden">
            <div className="w-full text-left px-4 py-3.5 flex items-center gap-3">
              <span className={`w-6 h-6 rounded-full ${color.soft} ${color.text} text-xs font-display font-extrabold flex items-center justify-center shrink-0`}>
                {idx + 1}
              </span>
              <button
                onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}
                className="flex-1 text-left text-sm font-medium text-indigo-900 min-w-0"
              >
                {q.q}
              </button>
              <button onClick={() => setEditingId(q.id)} className="shrink-0 text-indigo-300 hover:text-violet-600 p-1.5 -m-1.5">
                <Pencil size={14} />
              </button>
              <button onClick={() => deleteQuestion(q.id)} className="shrink-0 text-indigo-300 hover:text-rose-500 p-1.5 -m-1.5">
                <Trash2 size={14} />
              </button>
              <ChevronRight
                size={16}
                className={`text-indigo-300 transition-transform shrink-0 cursor-pointer ${open[q.id] ? "rotate-90" : ""}`}
                onClick={() => setOpen({ ...open, [q.id]: !open[q.id] })}
              />
            </div>
            {open[q.id] && (
              <div className="px-4 pb-4 pl-13 text-sm text-indigo-500 border-t border-indigo-50 pt-3">
                {q.a}
              </div>
            )}
          </div>
        )
      ))}
    </div>
  );
}

