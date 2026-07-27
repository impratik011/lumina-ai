# 🎓 Lumina AI
## AI-Powered Personalized Learning Assistant & Mentor Platform
*(formerly "Mentora AI")*

### 1. Why This Problem?
Many students struggle to receive personalized academic support due to large classroom sizes, limited teacher availability, and the lack of intelligent learning tools. Teachers also find it difficult to identify students who are falling behind before it is too late.

This directly supports **United Nations SDG 4: Quality Education**.

### 2. The Problem
- No personalized learning experience
- Students struggle to understand difficult concepts
- Teachers cannot monitor every student's progress individually
- Lack of early identification of at-risk students
- Existing learning platforms provide limited intelligent guidance

### 3. My Solution
**Lumina AI** is an Agentic AI-powered education platform that:
1. AI Tutor for instant doubt solving
2. Smart Notes Summarizer
3. Quiz Generator
4. Flashcards
5. Concept Maps
6. Voice Quiz
7. Mentor Dashboard with risk prediction
8. Personalized learning recommendations

### 4. How It Works
- Student interacts through the web interface
- FastAPI backend processes requests
- Groq Llama 3.3 generates responses
- SQLite stores progress
- Mentor Dashboard analyzes performance
- AI recommends personalized learning

### 5. Technology

| Component | Tool |
|-----------|------|
| Frontend | HTML, CSS, JavaScript |
| Backend | FastAPI |
| AI Model | Groq Llama 3.3 |
| Database | SQLite |
| Containerization | Docker / docker-compose |
| Deployment | AWS App Runner / AWS Elastic Beanstalk |

### 6. Impact
- Personalized AI learning
- Reduced teacher workload
- Improved academic performance
- Early risk detection
- Supports SDG 4

### 7. SDG Alignment
**SDG 4 – Quality Education**
- Inclusive education
- Personalized learning
- Digital education
- Better learning outcomes

### 8. Deployment Readiness (added in this revision)
The platform was originally built and demoed on Render. This revision adds Docker containerization, environment-variable-based secret management, a `/health` endpoint, and AWS App Runner / Elastic Beanstalk deployment configuration — making it suitable for production-style cloud hosting rather than a single-host demo deployment.

### 9. Conclusion
Lumina AI demonstrates how Agentic AI can transform education through personalized learning and intelligent mentor support, packaged as a deployable, cloud-ready service.
