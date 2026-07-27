/**
 * api.js — Lumina AI v3 (Groq backend)
 */
const api = (() => {

  const TUTOR_SYSTEM = `You are Lumina, a friendly and brilliant AI tutor for students.
Explain any concept clearly and engagingly. Use simple language, analogies, and examples.
Structure longer answers with ### headings. Use **bold** for key terms. Be warm and encouraging.`;

  const SUMMARIZER_SYSTEM = `You are an expert study notes summarizer.
Given raw notes or text, produce a clean structured summary.
Format exactly as:
### Key Points
- bullet list of most important ideas

### Main Concepts
- deeper explanation of core concepts with **bold** terms

### Quick Recap
- 2-3 sentence TL;DR

Keep it concise and easy to review before an exam.`;

  const QUIZ_SYSTEM = `You are a quiz generator. Return ONLY a JSON array, no markdown fences.
Each item: {"question":"...","options":["A)...","B)...","C)...","D)..."],"answer":"A","explanation":"..."}`;

  const FLASHCARD_SYSTEM = `You are a flashcard generator. Return ONLY a JSON array, no markdown fences.
Each item: {"term":"...","definition":"..."}
Terms: concise (1-6 words). Definitions: clear (1-3 sentences).`;

  // ── Core helpers ──────────────────────────────────────────────────────────

  async function callBackend(system, messages, maxTokens = 1500) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e?.error || `Server error ${res.status}`); }
    return (await res.json()).text;
  }

  async function streamBackend(system, messages, onChunk, maxTokens = 1500) {
    const res = await fetch("/api/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system, messages, max_tokens: maxTokens }),
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = line.slice(6).trim();
        if (raw === "[DONE]") continue;
        try { const d = JSON.parse(raw)?.choices?.[0]?.delta?.content; if (d) { full += d; onChunk(full); } } catch {}
      }
    }
    return full;
  }

  async function postJSON(endpoint, body) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  }

  async function getJSON(endpoint) {
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
    return data;
  }

  // Mentor Dashboard: dropout-risk roster + proactive AI nudges
  async function mentorStudents() {
    return getJSON("/api/mentor/students");
  }
  async function mentorSimulate() {
    return postJSON("/api/mentor/simulate", {});
  }
  async function mentorNudge(studentId) {
    return postJSON("/api/mentor/nudge", { student_id: studentId });
  }

  // ── Existing features ─────────────────────────────────────────────────────

  async function tutorChatStream(history, onChunk) {
    return streamBackend(TUTOR_SYSTEM, history, onChunk, 1200);
  }

  async function summarize(notes) {
    return callBackend(SUMMARIZER_SYSTEM, [{ role: "user", content: `Summarize the following:\n\n${notes}` }], 1500);
  }

  async function generateQuiz(topic, count, difficulty) {
    const text = await callBackend(QUIZ_SYSTEM,
      [{ role: "user", content: `Generate exactly ${count} ${difficulty} difficulty MCQs about:\n\n${topic}\n\nReturn ONLY the JSON array.` }], 2000);
    return JSON.parse(text.replace(/```json|```/gi, "").trim());
  }

  async function generateFlashcards(topic, count) {
    const text = await callBackend(FLASHCARD_SYSTEM,
      [{ role: "user", content: `Generate exactly ${count} flashcards for:\n\n${topic}\n\nReturn ONLY the JSON array.` }], 1500);
    return JSON.parse(text.replace(/```json|```/gi, "").trim());
  }

  async function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `Upload failed ${res.status}`);
    return data;
  }

  async function youtubeTranscript(url) {
    return postJSON("/api/youtube", { url });
  }

  // ── New features ──────────────────────────────────────────────────────────

  // Feature 2: Feynman Checker
  async function feynmanCheck(topic, explanation) {
    return postJSON("/api/feynman", { topic, explanation });
  }

  // Feature 3: Exam Panic Mode
  async function examPanic(notes, hours, subject) {
    return postJSON("/api/panic", { notes, hours, subject });
  }

  // Feature 4: Concept Map
  async function conceptMap(notes) {
    return postJSON("/api/conceptmap", { notes });
  }

  // Feature 7: ELI5 → Expert Slider
  async function eli5(topic, level) {
    return postJSON("/api/eli5", { topic, level });
  }

  // Feature 10: Voice Answer Check
  async function voiceCheck(question, answer, correctAnswer, explanation) {
    return postJSON("/api/voice-check", { question, answer, correct_answer: correctAnswer, explanation });
  }

  return {
    tutorChatStream, summarize, generateQuiz, generateFlashcards, uploadFile, youtubeTranscript,
    feynmanCheck, examPanic, conceptMap, eli5, voiceCheck,
    mentorStudents, mentorSimulate, mentorNudge,
  };
})();

window.api = api;