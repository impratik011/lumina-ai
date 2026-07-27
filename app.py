import os, re, json, httpx, sqlite3, random, logging
from datetime import datetime, timedelta
from dotenv import load_dotenv
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# Load variables from a local .env file if present (no-op in production,
# where real environment variables are injected by Docker/App Runner/EB).
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lumina")

app = FastAPI(title="Lumina AI", version="1.0.0")

# CORS: configurable via ALLOWED_ORIGINS (comma-separated). Defaults to "*"
# since the frontend is normally served from the same origin as the API,
# but this makes it safe to split them across services later.
_origins = os.environ.get("ALLOWED_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _origins.strip() == "*" else [o.strip() for o in _origins.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Resolve paths relative to THIS file, not the current working directory.
# StaticFiles(directory="static") only resolves correctly if your terminal's
# cwd happens to be this folder. Anchoring to __file__ makes it work no
# matter where uvicorn is started from (local shell, Docker, App Runner...).
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
CSS_DIR = os.path.join(STATIC_DIR, "css")
JS_DIR = os.path.join(STATIC_DIR, "js")

# ── Mentor Dashboard: SQLite setup ───────────────────────────────────────────
DB_PATH = os.environ.get("LUMINA_DB", os.environ.get("MENTORA_DB", os.path.join(BASE_DIR, "lumina.db")))

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        subject TEXT NOT NULL,
        avg_quiz_score INTEGER NOT NULL,
        prev_avg_quiz_score INTEGER NOT NULL,
        sessions_this_week INTEGER NOT NULL,
        days_inactive INTEGER NOT NULL,
        streak_days INTEGER NOT NULL,
        last_nudge TEXT
    )""")
    count = conn.execute("SELECT COUNT(*) c FROM students").fetchone()["c"]
    if count == 0:
        seed = [
            ("Aarav Shah",      "Physics",         82, 85, 5, 0, 6, None),
            ("Isha Menon",      "Mathematics",      54, 71, 1, 6, 0, None),
            ("Kabir Verma",     "Computer Science", 91, 88, 6, 0, 12, None),
            ("Sanya Kapoor",    "Chemistry",        48, 66, 0, 8, 0, None),
            ("Rohan Deshmukh",  "Biology",          63, 60, 2, 3, 1, None),
            ("Meera Iyer",      "Mathematics",      75, 74, 4, 1, 4, None),
            ("Dev Patil",       "Physics",          39, 58, 0, 10, 0, None),
            ("Anaya Reddy",     "English",          88, 84, 5, 0, 9, None),
        ]
        conn.executemany("""INSERT INTO students
            (name, subject, avg_quiz_score, prev_avg_quiz_score, sessions_this_week, days_inactive, streak_days, last_nudge)
            VALUES (?,?,?,?,?,?,?,?)""", seed)
        conn.commit()
    conn.close()

init_db()

def risk_score(row) -> int:
    """0-100, higher = more at-risk. Simple transparent weighted rule-set."""
    score = 0
    score += min(row["days_inactive"] * 8, 40)                    # inactivity
    drop = row["prev_avg_quiz_score"] - row["avg_quiz_score"]
    if drop > 0: score += min(drop * 2, 30)                        # declining scores
    score += max(0, (3 - row["sessions_this_week"])) * 7           # low engagement
    if row["avg_quiz_score"] < 50: score += 10                     # absolute weak grasp
    score -= min(row["streak_days"], 10)                           # streak protects
    return max(0, min(100, score))

def risk_label(score: int) -> str:
    if score >= 60: return "at-risk"
    if score >= 30: return "watch"
    return "safe"

def row_to_dict(row):
    d = dict(row)
    s = risk_score(row)
    d["risk_score"] = s
    d["risk_label"] = risk_label(s)
    return d

GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions"
MODEL        = "llama-3.3-70b-versatile"

HEADERS = {
    "Authorization": f"Bearer {GROQ_API_KEY}",
    "Content-Type": "application/json",
}

if not GROQ_API_KEY:
    logger.warning(
        "GROQ_API_KEY is not set. AI features will fail until it's provided "
        "via a .env file (local dev) or an environment variable (deployment)."
    )

MAX_CHARS = 40_000

def truncate(text: str) -> str:
    if len(text) > MAX_CHARS:
        return text[:MAX_CHARS] + "\n\n[Content truncated to fit context window]"
    return text

def extract_youtube_id(url: str):
    for p in [r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"]:
        m = re.search(p, url)
        if m: return m.group(1)
    return None

async def call_groq(system: str, messages: list, max_tokens: int = 1500) -> str:
    payload = {
        "model": MODEL, "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}] + messages,
    }
    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(GROQ_URL, headers=HEADERS, json=payload)
    data = resp.json()
    if resp.status_code != 200:
        raise RuntimeError(data.get("error", {}).get("message", f"API {resp.status_code}"))
    return data["choices"][0]["message"]["content"]

# ── /api/stream  (AI Tutor) ──────────────────────────────────────────────────
@app.post("/api/stream")
async def stream_chat(request: Request):
    body = await request.json()
    payload = {
        "model": MODEL, "max_tokens": 1500, "stream": True,
        "messages": [{"role": "system", "content": body.get("system", "")}]
                    + body.get("messages", []),
    }
    async def gen():
        if not GROQ_API_KEY:
            yield f"data: {json.dumps({'error': 'Server is missing GROQ_API_KEY.'})}\n\n"
            return
        try:
            async with httpx.AsyncClient(timeout=90) as client:
                async with client.stream("POST", GROQ_URL, headers=HEADERS, json=payload) as r:
                    if r.status_code != 200:
                        body = await r.aread()
                        try:
                            msg = json.loads(body).get("error", {}).get("message", f"API {r.status_code}")
                        except Exception:
                            msg = f"API {r.status_code}"
                        yield f"data: {json.dumps({'error': msg})}\n\n"
                        return
                    async for line in r.aiter_lines():
                        if line.startswith("data: "):
                            yield f"{line}\n\n"
        except httpx.RequestError as e:
            logger.error(f"Stream request failed: {e}")
            yield f"data: {json.dumps({'error': 'Could not reach the AI provider. Please try again.'})}\n\n"
    return StreamingResponse(gen(), media_type="text/event-stream")

# ── /api/chat  (general) ─────────────────────────────────────────────────────
@app.post("/api/chat")
async def chat(request: Request):
    body = await request.json()
    try:
        text = await call_groq(body.get("system",""), body.get("messages",[]), body.get("max_tokens",1500))
        return JSONResponse({"text": text})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/upload  (PDF / DOCX / TXT) ──────────────────────────────────────────
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = filename.rsplit(".", 1)[-1].lower()
    raw = await file.read()
    text = ""
    try:
        if ext == "pdf":
            import fitz
            doc = fitz.open(stream=raw, filetype="pdf")
            text = "\n\n".join(page.get_text() for page in doc)
        elif ext in ("docx", "doc"):
            import io
            from docx import Document
            text = "\n".join(p.text for p in Document(io.BytesIO(raw)).paragraphs if p.text.strip())
        elif ext == "txt":
            text = raw.decode("utf-8", errors="ignore")
        else:
            return JSONResponse({"error": f"Unsupported file type: .{ext}."}, status_code=400)
    except Exception as e:
        return JSONResponse({"error": f"Could not read file: {str(e)}"}, status_code=500)
    text = text.strip()
    if not text:
        return JSONResponse({"error": "No text could be extracted from this file."}, status_code=400)
    return JSONResponse({"text": truncate(text), "chars": len(text), "filename": filename})

# ── /api/youtube ─────────────────────────────────────────────────────────────
@app.post("/api/youtube")
async def youtube_transcript(request: Request):
    body = await request.json()
    url  = body.get("url", "").strip()
    video_id = extract_youtube_id(url)
    if not video_id:
        return JSONResponse({"error": "Could not find a valid YouTube video ID."}, status_code=400)
    try:
        from youtube_transcript_api import YouTubeTranscriptApi, NoTranscriptFound
        ytt_api = YouTubeTranscriptApi()
        try:
            transcript = ytt_api.fetch(video_id, languages=["en", "en-US", "en-GB"])
        except Exception:
            transcript_list = ytt_api.list(video_id)
            transcript = transcript_list.find_generated_transcript([t.language_code for t in transcript_list]).fetch()
        text = " ".join(entry.text for entry in transcript)
    except Exception as e:
        msg = str(e)
        if "disabled" in msg.lower() or "no transcript" in msg.lower():
            return JSONResponse({"error": "This video has no captions available."}, status_code=400)
        return JSONResponse({"error": f"Could not fetch transcript: {msg}"}, status_code=500)
    if not text:
        return JSONResponse({"error": "Transcript is empty."}, status_code=400)
    return JSONResponse({"text": truncate(text), "chars": len(text), "video_id": video_id})

# ── /api/feynman  (Feature 2) ─────────────────────────────────────────────────
@app.post("/api/feynman")
async def feynman_check(request: Request):
    body = await request.json()
    topic       = body.get("topic", "")
    explanation = body.get("explanation", "")
    system = """You are the Feynman Technique evaluator. The student has explained a concept in their own words.
Your job is to assess their understanding deeply and return ONLY a JSON object (no markdown fences):
{
  "score": <0-100>,
  "grade": "<A/B/C/D/F>",
  "understood_well": ["<thing they got right>", ...],
  "gaps": ["<gap or misconception>", ...],
  "misconceptions": ["<specific wrong belief>", ...],
  "suggestion": "<one sentence on what to review>",
  "simplified_correction": "<explain the trickiest gap in 2 simple sentences>"
}
Be honest, specific, and encouraging. Score 90+ only if explanation is genuinely complete and correct."""
    try:
        text = await call_groq(system, [{"role":"user","content":f"Topic: {topic}\n\nStudent's explanation:\n{explanation}"}], 800)
        clean = text.replace("```json","").replace("```","").strip()
        return JSONResponse(json.loads(clean))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/panic  (Feature 3) ──────────────────────────────────────────────────
@app.post("/api/panic")
async def exam_panic(request: Request):
    body = await request.json()
    notes   = body.get("notes", "")
    hours   = body.get("hours", 2)
    subject = body.get("subject", "")
    system = """You are an emergency exam coach. A student has limited time before their exam.
Given their notes and time available, create a strict prioritized survival plan.
Return ONLY a JSON object (no markdown fences):
{
  "time_breakdown": [{"slot": "<e.g. 0-30 min>", "task": "<what to do>", "priority": "critical|important|optional"}],
  "must_know": ["<absolutely essential concept>", ...],
  "can_skip": ["<topic safe to skip if pressed for time>", ...],
  "memory_tricks": ["<quick mnemonic or trick>", ...],
  "final_tip": "<one powerful motivational + tactical tip for the exam itself>"
}"""
    try:
        text = await call_groq(system, [{"role":"user","content":f"Subject: {subject}\nHours available: {hours}\n\nNotes:\n{notes}"}], 1200)
        clean = text.replace("```json","").replace("```","").strip()
        return JSONResponse(json.loads(clean))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/conceptmap  (Feature 4) ─────────────────────────────────────────────
@app.post("/api/conceptmap")
async def concept_map(request: Request):
    body = await request.json()
    notes = body.get("notes", "")
    system = """You are a concept mapping expert. Analyze the text and extract key concepts and their relationships.
Return ONLY a JSON object (no markdown fences):
{
  "nodes": [{"id": "n1", "label": "<concept name>", "type": "core|sub|detail"}, ...],
  "edges": [{"from": "n1", "to": "n2", "label": "<relationship>"}, ...]
}
Rules:
- 6-14 nodes total. 1-2 core nodes, 3-5 sub nodes, rest detail.
- Edges should have meaningful relationship labels (e.g. "causes", "part of", "leads to", "requires")
- Keep node labels short (1-4 words)"""
    try:
        text = await call_groq(system, [{"role":"user","content":f"Extract concept map from:\n\n{notes}"}], 1000)
        clean = text.replace("```json","").replace("```","").strip()
        return JSONResponse(json.loads(clean))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/eli5  (Feature 7) ────────────────────────────────────────────────────
@app.post("/api/eli5")
async def eli5(request: Request):
    body = await request.json()
    topic = body.get("topic", "")
    level = body.get("level", 2)   # 1=age8, 2=highschool, 3=undergrad, 4=grad, 5=expert
    level_prompts = {
        1: "Explain like I'm 8 years old. Use toys, cartoons, and super simple words. No jargon at all.",
        2: "Explain for a high school student. Use relatable examples, avoid heavy math or jargon.",
        3: "Explain for an undergraduate student. Use proper terminology but keep it approachable.",
        4: "Explain for a graduate student. Use technical depth, assume strong foundational knowledge.",
        5: "Explain at expert/research level. Use precise terminology, nuances, current understanding, and edge cases.",
    }
    system = f"You are an adaptive tutor. {level_prompts.get(level, level_prompts[2])} Use ### headings and **bold** key terms. Be thorough but focused."
    try:
        text = await call_groq(system, [{"role":"user","content":f"Explain: {topic}"}], 1000)
        return JSONResponse({"text": text})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/voice-check  (Feature 10) ───────────────────────────────────────────
@app.post("/api/voice-check")
async def voice_check(request: Request):
    body = await request.json()
    question   = body.get("question", "")
    spoken_ans = body.get("answer", "")
    correct    = body.get("correct_answer", "")
    explanation= body.get("explanation", "")
    system = """You are a strict but fair oral exam marker. The student answered a question verbally (transcribed).
Return ONLY a JSON object (no markdown fences):
{
  "correct": <true|false>,
  "score": <0-100>,
  "verdict": "<one sentence verdict>",
  "what_was_right": "<what they got right>",
  "what_was_wrong": "<what they got wrong or missed>",
  "model_answer": "<ideal 1-2 sentence answer>"
}
Be lenient on wording but strict on factual correctness."""
    try:
        text = await call_groq(system, [{"role":"user","content":f"Question: {question}\nCorrect answer: {correct}\nExplanation: {explanation}\nStudent said: {spoken_ans}"}], 600)
        clean = text.replace("```json","").replace("```","").strip()
        return JSONResponse(json.loads(clean))
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /api/mentor/students  (Feature: Dropout-Risk Roster) ────────────────────
@app.get("/api/mentor/students")
async def mentor_students():
    conn = get_db()
    rows = conn.execute("SELECT * FROM students ORDER BY id").fetchall()
    conn.close()
    students = [row_to_dict(r) for r in rows]
    students.sort(key=lambda s: -s["risk_score"])
    return JSONResponse({"students": students})

# ── /api/mentor/simulate  (advance activity to demo risk changes) ───────────
@app.post("/api/mentor/simulate")
async def mentor_simulate():
    conn = get_db()
    rows = conn.execute("SELECT * FROM students").fetchall()
    for r in rows:
        active = random.random() > 0.35
        new_inactive = 0 if active else r["days_inactive"] + 1
        new_sessions = r["sessions_this_week"] + (1 if active else 0)
        score_drift = random.randint(-6, 4) if not active else random.randint(-2, 5)
        new_score = max(0, min(100, r["avg_quiz_score"] + score_drift))
        new_streak = r["streak_days"] + 1 if active else 0
        conn.execute("""UPDATE students SET
            prev_avg_quiz_score=?, avg_quiz_score=?, sessions_this_week=?,
            days_inactive=?, streak_days=? WHERE id=?""",
            (r["avg_quiz_score"], new_score, new_sessions, new_inactive, new_streak, r["id"]))
    conn.commit()
    rows = conn.execute("SELECT * FROM students ORDER BY id").fetchall()
    conn.close()
    students = [row_to_dict(r) for r in rows]
    students.sort(key=lambda s: -s["risk_score"])
    return JSONResponse({"students": students})

# ── /api/mentor/nudge  (AI Learning Mentor proactive outreach) ──────────────
@app.post("/api/mentor/nudge")
async def mentor_nudge(request: Request):
    body = await request.json()
    student_id = body.get("student_id")
    conn = get_db()
    row = conn.execute("SELECT * FROM students WHERE id=?", (student_id,)).fetchone()
    if not row:
        conn.close()
        return JSONResponse({"error": "Student not found"}, status_code=404)
    d = row_to_dict(row)
    system = """You are Lumina, a warm, encouraging AI Learning Mentor writing a short proactive
check-in message to a student who is showing signs of disengagement or struggle.
Return ONLY a JSON object (no markdown fences):
{
  "subject": "<short, warm, non-alarming subject line>",
  "message": "<3-5 sentence personalized message: notice their situation without shaming them,
               reference one concrete positive, suggest one small next step tied to their weak subject,
               end encouragingly>",
  "suggested_action": "<one specific in-app action e.g. '15-min ELI5 refresher on <subject>' or 'Try a 5-question quiz'>"
}
Never sound robotic or accusatory. Keep it human and brief."""
    user_msg = (f"Student: {d['name']}\nSubject: {d['subject']}\n"
                f"Avg quiz score: {d['avg_quiz_score']} (was {d['prev_avg_quiz_score']})\n"
                f"Days inactive: {d['days_inactive']}\nSessions this week: {d['sessions_this_week']}\n"
                f"Current streak: {d['streak_days']} days\nRisk level: {d['risk_label']} ({d['risk_score']}/100)")
    try:
        text = await call_groq(system, [{"role": "user", "content": user_msg}], 500)
        clean = text.replace("```json", "").replace("```", "").strip()
        nudge = json.loads(clean)
        conn.execute("UPDATE students SET last_nudge=? WHERE id=?",
                     (datetime.utcnow().isoformat(), student_id))
        conn.commit()
        conn.close()
        return JSONResponse(nudge)
    except Exception as e:
        conn.close()
        return JSONResponse({"error": str(e)}, status_code=500)

# ── /health  (used by AWS App Runner / ALB / docker-compose health checks) ──
@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "groq_key_configured": bool(GROQ_API_KEY),
    })

# ── Static files (MUST be last) ───────────────────────────────────────────────
# index.html requests "css/style.css" and "js/app.js" / "js/api.js" (relative,
# no leading slash), which the browser resolves against "/" → "/css/..." and
# "/js/...". Those only 404 if the folders below don't exist yet on disk.
for required_dir, label in [(CSS_DIR, "static/css"), (JS_DIR, "static/js")]:
    if not os.path.isdir(required_dir):
        raise RuntimeError(
            f"Missing folder: {required_dir}\n"
            f"Create a '{label}' folder next to app.py and put the matching "
            f"file(s) in it (style.css in static/css/, app.js + api.js in static/js/)."
        )

app.mount("/css", StaticFiles(directory=CSS_DIR), name="css")
app.mount("/js", StaticFiles(directory=JS_DIR), name="js")


@app.get("/favicon.ico")
async def favicon():
    # Prevents noisy 404s in the console when no favicon is provided.
    return Response(status_code=204)


# Any other static asset (images, etc.) placed directly in static/, plus
# index.html itself at "/". This mount MUST be last — FastAPI matches routes
# in the order they're registered, so /css, /js, /favicon.ico above take
# priority over this catch-all.
app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="static")