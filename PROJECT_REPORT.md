# Project Report

## Lumina AI — AI-Powered Personalized Learning Assistant & Mentor Platform
*(rebranded from the original "Mentora AI" build)*

**Author:** Pritesh Patro
**Program:** Lenovo LEAP — Generative AI & Agentic Systems Engineering Internship, 2026
**Category:** Agentic AI / EdTech
**SDG Alignment:** United Nations SDG 4 — Quality Education

---

## 1. Abstract

Lumina AI is a full-stack, AI-powered learning platform that combines a personalized tutoring assistant for students with an analytics dashboard for mentors/teachers. It uses Groq's hosted Llama 3.3 (70B) model for all generative features — tutoring, summarization, quiz and flashcard generation, concept mapping, and adaptive explanation — and a lightweight SQLite-backed rule engine to flag students at risk of disengagement or academic decline, triggering AI-generated proactive outreach messages. The system is built on FastAPI (Python) with a vanilla HTML/CSS/JavaScript frontend, and has been hardened in this revision for containerized deployment (Docker) and cloud hosting on AWS (App Runner or Elastic Beanstalk).

## 2. Problem Statement

Classrooms today are large, teacher time is scarce, and generic e-learning tools rarely adapt to an individual student's pace or gaps. Two problems compound this:

1. **Students** lack on-demand, personalized explanation and practice — they either wait for class time or resort to unstructured internet searches.
2. **Teachers/mentors** cannot manually track engagement and performance trends for every student, so at-risk students are often identified only after they've already fallen significantly behind.

## 3. Objectives

- Provide instant, personalized AI tutoring and study tooling for students (explanations, summaries, quizzes, flashcards, concept maps, oral practice).
- Give mentors a transparent, explainable early-warning system for student disengagement — not a opaque "black box" score.
- Keep the system lightweight and inexpensive to run (no GPU infrastructure, no paid vector DB) while remaining production-deployable.
- Package the system for real cloud deployment (Docker + AWS) rather than a local-only prototype.

## 4. Existing Solutions & Gap

Generic LLM chat tools (ChatGPT, Gemini, etc.) provide tutoring but have no persistent, structured view of a student's trajectory over time, and no mentor-facing dashboard. Learning Management Systems (Moodle, Google Classroom) track submissions but offer no AI-generated personalization or proactive risk detection. Lumina AI's gap-fill is the **combination**: AI tutoring tools *and* a transparent, rule-based risk model feeding AI-generated human-sounding outreach — in one deployable service.

## 5. System Architecture

```
┌─────────────┐      HTTPS       ┌───────────────────┐      HTTPS      ┌─────────────┐
│  Browser     │ ───────────────▶│   FastAPI Backend   │ ──────────────▶│  Groq API    │
│ (HTML/CSS/JS)│◀─────────────── │   (app.py)          │◀────────────── │ Llama 3.3    │
└─────────────┘   JSON / SSE     └─────────┬──────────┘    JSON/SSE     └─────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │  SQLite (lumina.db) │
                                   │  student roster +   │
                                   │  risk metrics       │
                                   └─────────────────┘
```

The backend is a single FastAPI application (`app.py`) exposing REST + one Server-Sent-Events (SSE) endpoint. Static assets are served by FastAPI's `StaticFiles` mount, so the entire app is a single deployable unit with no separate frontend server needed.

## 6. Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript | No build step, fast to iterate, trivially served by FastAPI |
| Backend | FastAPI (Python 3.11) | Async-native, built-in OpenAPI docs, minimal boilerplate |
| LLM | Groq API — `llama-3.3-70b-versatile` | Very low inference latency (important for streaming UX), generous free tier |
| Database | SQLite | Zero-ops for this dataset size (a class roster); trivially portable |
| Document parsing | PyMuPDF (`fitz`), `python-docx` | Extract text from uploaded PDF/DOCX study material |
| Transcript extraction | `youtube-transcript-api` | Pulls captions for the "learn from a YouTube video" feature |
| Containerization | Docker, docker-compose | Reproducible builds, required for App Runner/EB deployment |
| Cloud hosting (this revision) | AWS App Runner / Elastic Beanstalk | Managed, auto-scaling, minimal ops overhead |

## 7. Core Features & Implementation Notes

| Feature | Endpoint | Notes |
|---|---|---|
| AI Tutor (streaming chat) | `POST /api/stream` | Proxies Groq's SSE stream token-by-token to the browser for a live-typing effect |
| General AI call (non-streaming) | `POST /api/chat` | Used by summarizer, quiz/flashcard generators |
| File upload & text extraction | `POST /api/upload` | Supports PDF, DOCX, TXT; 40,000-character truncation guard to protect context window |
| YouTube transcript import | `POST /api/youtube` | Regex-based video ID extraction, falls back to auto-generated captions |
| Feynman Technique Checker | `POST /api/feynman` | LLM grades a student's own explanation against a rubric, returns structured JSON feedback |
| Exam Panic Mode | `POST /api/panic` | Time-boxed, prioritized last-minute revision plan from raw notes |
| Concept Map Generator | `POST /api/conceptmap` | Returns a graph (nodes/edges) rendered client-side |
| ELI5 → Expert slider | `POST /api/eli5` | Same topic explained at 5 escalating depth levels via prompt variation |
| Voice Answer Check | `POST /api/voice-check` | Grades a transcribed spoken answer leniently on wording, strictly on fact |
| Mentor Dashboard roster | `GET /api/mentor/students` | Computes a transparent 0–100 risk score per student |
| Activity simulation | `POST /api/mentor/simulate` | Demo-only: randomly advances each student's activity for presentation purposes |
| AI proactive nudge | `POST /api/mentor/nudge` | Generates a warm, non-shaming outreach message for an at-risk student |
| Health check | `GET /health` | **Added in this revision** — required for AWS App Runner / ALB health probes |

### 7.1 Risk Scoring Model

The dropout-risk score is a deliberately **transparent, rule-based** weighted sum (not an opaque ML model), so mentors can trust and explain it:

- Inactivity: up to +40 points (8 pts/day inactive, capped)
- Score decline vs. previous average: up to +30 points
- Low weekly session count: up to +21 points (7 pts per missing session below 3/week)
- Absolute weak grasp (avg score < 50): +10 points
- Active streak: up to −10 points (protective factor)

Final score is clamped to [0, 100] and bucketed into `safe` (<30), `watch` (30–59), `at-risk` (≥60).

## 8. Security Hardening (this revision)

- **No hardcoded secrets** — confirmed via full-repository grep; `GROQ_API_KEY` is read exclusively from environment variables.
- Added `python-dotenv` support so local development actually honors a `.env` file (previously documented in the README but not implemented).
- Startup warning logged (not a crash) if `GROQ_API_KEY` is missing, to fail loudly rather than silently.
- CORS restricted via a configurable `ALLOWED_ORIGINS` environment variable.
- Docker image runs as a non-root `appuser`.
- `.gitignore` / `.dockerignore` added to prevent `.env` and the local SQLite database from ever being committed or baked into an image.

## 9. Deployment

The application is packaged for three deployment targets:

1. **Docker / docker-compose** — for local development and any container host, with a persistent named volume for the SQLite database and an automated `/health` check.
2. **AWS App Runner** — via `apprunner.yaml` (source-based deploy) or a container image pushed to ECR.
3. **AWS Elastic Beanstalk** — via the Docker platform (auto-detects the included `Dockerfile`) or the Python platform (via the included `Procfile`).

Full step-by-step instructions are in `README.md`.

## 10. Testing Performed

- Verified `app.py` compiles cleanly and boots under `uvicorn`.
- Live-tested `GET /health` → `200 {"status":"ok","groq_key_configured":...}`.
- Live-tested `GET /` → serves `index.html` correctly (static mount ordering verified).
- Confirmed no hardcoded API keys anywhere in the codebase via repository-wide search.
- Manually traced every frontend `fetch()` call in `api.js`/`app.js` against its corresponding FastAPI route to confirm parameter names match on both sides.

## 11. Challenges & Learnings

- **Static file mount ordering in FastAPI**: the catch-all `StaticFiles` mount at `/` must be registered *after* more specific routes (`/css`, `/js`, `/api/*`), or it silently swallows them. This was already correctly handled in the original build and preserved here.
- **Streaming error handling**: proxying an SSE stream means upstream failures (e.g., a Groq rate limit) can otherwise vanish silently on the client. This revision adds explicit error events to the stream.
- **Non-root Docker + SQLite**: running as a non-root container user requires explicitly `chown`-ing both the app directory and any mounted data volume, or the app can boot but fail to write its database.

## 12. Future Scope

- Migrate SQLite to a managed relational store (RDS/Aurora) once running multiple App Runner instances, since SQLite doesn't support concurrent writers across instances.
- Add authentication (currently the app has no login layer — acceptable for a single-class demo, not for multi-tenant production use).
- WhatsApp/SMS delivery for mentor nudges instead of in-app-only display.
- OCR ingestion for handwritten notes.

## 13. Conclusion

Lumina AI demonstrates how a relatively small, well-scoped agentic AI system — a handful of well-prompted LLM calls plus a transparent rule engine — can meaningfully support both learners and mentors without requiring heavy ML infrastructure. This revision focused on taking an already-functional prototype and making it deployment-ready: secured secrets, containerized, health-checked, and documented for real cloud hosting on AWS, while deliberately preserving 100% of the original feature set and UI.

## 14. References

- Groq API Documentation — https://console.groq.com/docs
- FastAPI Documentation — https://fastapi.tiangolo.com
- AWS App Runner Documentation — https://docs.aws.amazon.com/apprunner
- AWS Elastic Beanstalk Documentation — https://docs.aws.amazon.com/elasticbeanstalk
- United Nations Sustainable Development Goal 4 — https://sdgs.un.org/goals/goal4
