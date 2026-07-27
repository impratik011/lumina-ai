<div align="center">

# 🚀 Lumina AI

### AI-Powered Content Generation & Productivity Assistant

![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge\&logo=python\&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge\&logo=fastapi\&logoColor=white)
![Groq](https://img.shields.io/badge/Groq-F97316?style=for-the-badge)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge\&logo=sqlite)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge\&logo=docker\&logoColor=white)
![Render](https://img.shields.io/badge/Render-46E3B7?style=for-the-badge\&logo=render\&logoColor=black)

**Create • Summarize • Analyze • Learn with AI**

### 🌐 Live Demo

**Render Deployment:** https://lumina-ai-76mm.onrender.com/

</div>

---

# 📖 Overview

**Lumina AI** is an AI-powered productivity platform that combines multiple AI tools into one web application. It enables users to generate high-quality content, summarize PDF documents, analyze resumes, summarize YouTube videos, and perform various AI-powered writing tasks through a single, user-friendly interface.

Built using **FastAPI**, **Python**, **HTML**, **CSS**, **JavaScript**, **SQLite**, and **Docker**, Lumina AI delivers fast, secure, and efficient AI-powered productivity.

---

# ✨ Features

* 🤖 AI Content Generator
* 📄 PDF Summarizer
* 📺 YouTube Video Summarizer
* 📑 Resume Analyzer
* ✍️ AI Writing Assistant
* ⚡ Fast AI Responses using Groq API
* 🔐 Secure Backend Processing
* 📱 Responsive User Interface

---

# 🛠️ Tech Stack

| Component        | Technology            |
| ---------------- | --------------------- |
| Frontend         | HTML, CSS, JavaScript |
| Backend          | FastAPI (Python)      |
| AI Model         | Groq Llama 3          |
| API              | Groq API              |
| Database         | SQLite                |
| Containerization | Docker                |
| Deployment       | Render                |

---

# 🚀 Local Installation

## Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/lumina-ai.git
cd lumina-ai
```

## Install Dependencies

```bash
pip install -r requirements.txt
```

## Configure Environment

Copy the environment template.

```bash
cp .env.example .env
```

Add your API key.

```env
GROQ_API_KEY=your_actual_api_key
```

## Run the Application

```bash
uvicorn app:app --reload
```

Open:

```
http://localhost:8000
```

---

# ☁️ Deploy on Render

1. Push this repository to GitHub.
2. Log in to Render.
3. Click **New + → Web Service**.
4. Connect your GitHub repository.
5. Render will automatically detect the **Dockerfile**.
6. Add the following Environment Variable:

```env
GROQ_API_KEY=your_actual_api_key
```

7. Click **Create Web Service**.

Your application will be deployed at:

```
https://your-app-name.onrender.com
```

---

# 🔐 Environment Variables

Create the following environment variable in Render:

```env
GROQ_API_KEY=your_actual_api_key
```

> **Never commit your API keys to GitHub.**

---

# 📂 Project Structure

```text
lumina-ai/
│
├── app.py
├── requirements.txt
├── Dockerfile
├── Procfile
├── .env.example
├── README.md
├── static/
│   ├── index.html
│   ├── css/
│   └── js/
└── lumina.db
```

---

# 👨‍💻 Developer

**Pratik Pandey**

B.Sc. Computer Science Student

AICTE | IBM SkillsBuild Gen AI & Cloud Computing Internship

---

# 📄 License

This project is developed for educational and internship purposes.

---

<div align="center">

### 🚀 Lumina AI

**Render Live Demo:** https://lumina-ai-76mm.onrender.com/

</div>
