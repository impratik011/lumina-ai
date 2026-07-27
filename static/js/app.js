/**
 * app.js — Lumina AI v3
 * Features: AI Tutor, Summarizer, Quiz, Flashcards,
 *           Feynman Checker, Exam Panic, Concept Map, ELI5 Slider, Voice Quiz
 */
const App = (() => {

  const state = {
    chatHistory: [],
    quizQuestions: [], quizIndex: 0, quizScore: 0, examTimerInterval: null,
    flashcards: [], flashcardIndex: 0,
    activeSource: "text", uploadedFile: null,
    focusInterval: null, focusRunning: false, focusSeconds: 25 * 60,
    voiceQuestions: [], voiceIndex: 0, voiceScore: 0,
    mediaRecorder: null, isRecording: false, recognition: null,
    voiceTranscript: "",
  };

  const $ = id => document.getElementById(id);
  function showLoading(msg="Thinking...") { $("loadingText").textContent=msg; $("loadingOverlay").classList.remove("hidden"); }
  function hideLoading() { $("loadingOverlay").classList.add("hidden"); }

  function showToast(msg, type="info") {
    const t = document.createElement("div");
    t.style.cssText=`position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface2);
      border:1px solid var(--border);color:var(--text);padding:12px 20px;border-radius:var(--radius);
      font-size:13px;z-index:9999;animation:msgIn .2s ease;box-shadow:0 4px 20px rgba(0,0,0,.4);white-space:nowrap;max-width:90vw;`;
    if(type==="error") t.style.borderColor="var(--danger)";
    if(type==="success") t.style.borderColor="var(--success)";
    t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3500);
  }

  function fmtBytes(b) { if(b<1024)return`${b} B`; if(b<1048576)return`${(b/1024).toFixed(1)} KB`; return`${(b/1048576).toFixed(1)} MB`; }

  function renderMarkdown(text) {
    const lines=text.split("\n"); let html="",inList=false;
    for(let line of lines) {
      line=line.trim();
      if(!line){ if(inList){html+="</ul>";inList=false;} continue; }
      if(line.startsWith("### ")||line.startsWith("## ")){
        if(inList){html+="</ul>";inList=false;}
        html+=`<h3>${escHtml(line.replace(/^#{2,3} /,""))}</h3>`;
      } else if(line.startsWith("- ")||line.startsWith("* ")){
        if(!inList){html+="<ul>";inList=true;}
        html+=`<li>${inlineMd(line.slice(2))}</li>`;
      } else {
        if(inList){html+="</ul>";inList=false;}
        html+=`<p>${inlineMd(line)}</p>`;
      }
    }
    if(inList) html+="</ul>";
    return html;
  }
  function inlineMd(t){ return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>").replace(/`(.*?)`/g,"<code>$1</code>").replace(/\*(.*?)\*/g,"<em>$1</em>"); }
  function escHtml(t){ return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // ── Navigation ──────────────────────────────────────────────────
  function navigate(page) {
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
    $(`page-${page}`).classList.add("active");
    document.querySelector(`[data-page="${page}"]`).classList.add("active");
    document.getElementById("sidebar").classList.remove("open");
  }
  function toggleSidebar() { document.getElementById("sidebar").classList.toggle("open"); }

  // ── Fullscreen ──────────────────────────────────────────────────
  function toggleFullScreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(()=>{});
    } else {
      document.exitFullscreen().catch(()=>{});
    }
  }
  document.addEventListener("fullscreenchange", () => {
    const btns = document.querySelectorAll(".fullscreen-btn, .btn-icon");
    btns.forEach(b => b.textContent = document.fullscreenElement ? "✕ Exit" : "⛶");
  });

  // ── Focus Timer ─────────────────────────────────────────────────
  function toggleFocusTimer() {
    if (state.focusRunning) {
      clearInterval(state.focusInterval);
      state.focusRunning = false;
      state.focusSeconds = 25 * 60;
      $("focusTimeDisplay").textContent = "25:00";
      $("focusBtn").textContent = "Start";
    } else {
      state.focusRunning = true;
      $("focusBtn").textContent = "Stop";
      state.focusInterval = setInterval(() => {
        state.focusSeconds--;
        const m = Math.floor(state.focusSeconds / 60);
        const s = state.focusSeconds % 60;
        $("focusTimeDisplay").textContent = `${m}:${s.toString().padStart(2,"0")}`;
        if (state.focusSeconds <= 0) {
          clearInterval(state.focusInterval);
          state.focusRunning = false;
          $("focusBtn").textContent = "Start";
          state.focusSeconds = 25 * 60;
          $("focusTimeDisplay").textContent = "25:00";
          showToast("⏰ Focus session complete! Take a 5 min break.", "success");
          if (Notification.permission === "granted") new Notification("Lumina AI", { body: "Focus session done! Take a break." });
        }
      }, 1000);
    }
  }

  // ── AI TUTOR ────────────────────────────────────────────────────
  function fillChat(text) { const i=$("chatInput"); i.value=text; i.focus(); autoResize(i); }
  function chatKeydown(e) { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendChat();} }
  function autoResize(el) { el.style.height="auto"; el.style.height=Math.min(el.scrollHeight,120)+"px"; }

  function appendMessage(role, html) {
    const c=$("chatMessages");
    const w=c.querySelector(".chat-welcome"); if(w) w.remove();
    const msg=document.createElement("div"); msg.className=`msg ${role}`;
    msg.innerHTML=`<div class="msg-avatar">${role==="ai"?"✦":"U"}</div><div class="msg-bubble">${html}</div>`;
    c.appendChild(msg); c.scrollTop=c.scrollHeight;
    return msg.querySelector(".msg-bubble");
  }
  function showTyping() {
    const c=$("chatMessages"); const d=document.createElement("div");
    d.className="msg ai"; d.id="typingMsg";
    d.innerHTML=`<div class="msg-avatar">✦</div><div class="msg-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    c.appendChild(d); c.scrollTop=c.scrollHeight;
  }
  function removeTyping() { const t=$("typingMsg"); if(t) t.remove(); }

  async function sendChat() {
    const input=$("chatInput"); const text=input.value.trim(); if(!text) return;
    const sendBtn=$("sendBtn"); sendBtn.disabled=true;
    input.value=""; input.style.height="auto";
    appendMessage("user",escHtml(text));
    state.chatHistory.push({role:"user",content:text});
    showTyping();
    try {
      let bubble=null;
      await window.api.tutorChatStream(state.chatHistory, (full)=>{
        removeTyping();
        if(!bubble){
          const c=$("chatMessages"); const msg=document.createElement("div");
          msg.className="msg ai"; msg.innerHTML=`<div class="msg-avatar">✦</div><div class="msg-bubble"></div>`;
          c.appendChild(msg); bubble=msg.querySelector(".msg-bubble");
        }
        bubble.innerHTML=renderMarkdown(full);
        $("chatMessages").scrollTop=$("chatMessages").scrollHeight;
      });
      state.chatHistory.push({role:"assistant",content:bubble?.innerText||""});
    } catch(err) {
      removeTyping();
      appendMessage("ai",`<span style="color:var(--danger)">Something went wrong. Please try again.</span>`);
    } finally { sendBtn.disabled=false; input.focus(); }
  }

  // ── SUMMARIZER ──────────────────────────────────────────────────
  function switchSource(src) {
    state.activeSource=src;
    document.querySelectorAll(".source-tab").forEach(t=>t.classList.toggle("active",t.dataset.source===src));
    document.querySelectorAll(".source-pane").forEach(p=>p.classList.toggle("active",p.id===`pane-${src}`));
  }
  function handleDrop(e) { e.preventDefault(); $("dropzone").classList.remove("drag-over"); const f=e.dataTransfer.files[0]; if(f) setFile(f); }
  function handleFileSelect(e) { const f=e.target.files[0]; if(f) setFile(f); }
  function setFile(file) {
    const ext=file.name.split(".").pop().toLowerCase();
    if(!["pdf","docx","doc","txt"].includes(ext)){showToast("Unsupported file. Use PDF, DOCX or TXT.","error");return;}
    if(file.size>20*1024*1024){showToast("File too large (max 20 MB).","error");return;}
    state.uploadedFile=file;
    $("dropzone").classList.add("hidden"); $("fileInfo").classList.remove("hidden");
    $("fileName").textContent=file.name; $("fileSize").textContent=fmtBytes(file.size);
  }
  function clearFile() {
    state.uploadedFile=null; $("fileInput").value="";
    $("fileInfo").classList.add("hidden"); $("dropzone").classList.remove("hidden");
  }
  async function summarize() {
    const btn=$("summarizeBtn"); btn.disabled=true;
    let text="",label="";
    try {
      if(state.activeSource==="text"){
        text=$("notesInput").value.trim();
        if(!text||text.length<30){showToast("Please paste some notes first.","error");return;}
        label="Pasted notes";
      } else if(state.activeSource==="file"){
        if(!state.uploadedFile){showToast("Please upload a file first.","error");return;}
        showLoading("Extracting text from file...");
        const r=await window.api.uploadFile(state.uploadedFile);
        text=r.text; label=`${r.filename} (${fmtBytes(state.uploadedFile.size)})`;
        hideLoading();
      } else {
        const url=$("youtubeUrl").value.trim();
        if(!url){showToast("Please enter a YouTube URL.","error");return;}
        showLoading("Fetching video transcript...");
        const r=await window.api.youtubeTranscript(url);
        text=r.text; label=`YouTube (${Math.round(r.chars/5)} words)`;
        hideLoading();
      }
      showLoading("Summarizing with AI...");
      const summary=await window.api.summarize(text);
      $("summaryOutput").innerHTML=`
        <div style="display:flex;flex-direction:column;gap:12px;flex:1;">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
            <div class="panel-label" style="color:var(--accent)">Summary</div>
            <span class="extracted-badge">◈ ${escHtml(label)}</span>
          </div>
          <div class="summary-content">${renderMarkdown(summary)}</div>
          <button class="btn-secondary" onclick="App.copySummary()" style="align-self:flex-start;margin-top:auto;">Copy Summary</button>
        </div>`;
    } catch(err) { hideLoading(); showToast(err.message||"Failed to summarize.","error"); }
    finally { btn.disabled=false; hideLoading(); }
  }
  function clearSummarizer() {
    $("notesInput").value=""; $("youtubeUrl").value="";
    $("videoPreview").classList.add("hidden"); $("videoFrame").src="";
    clearFile();
    $("summaryOutput").innerHTML=`<div class="output-placeholder"><span class="placeholder-icon">◈</span><p>Your summary will appear here</p></div>`;
  }
  function copySummary() {
    const c=document.querySelector(".summary-content");
    if(c) navigator.clipboard.writeText(c.innerText).then(()=>showToast("Summary copied!","success")).catch(()=>showToast("Copy manually."));
  }

  // ── QUIZ ────────────────────────────────────────────────────────
  async function generateQuiz() {
    const topic=$("quizTopic").value.trim(); if(!topic){showToast("Please enter a topic.","error");return;}
    const btn=$("generateQuizBtn"); btn.disabled=true; showLoading("Generating your quiz...");
    try {
      state.quizQuestions=await window.api.generateQuiz(topic,parseInt($("quizCount").value),$("quizDifficulty").value);
      state.quizIndex=0; state.quizScore=0;
      $("quizSetup").classList.add("hidden"); $("quizActive").classList.remove("hidden");
      renderQuestion();
    } catch(err){showToast("Failed to generate quiz.","error");}
    finally{btn.disabled=false;hideLoading();}
  }
  function renderQuestion() {
    const q=state.quizQuestions[state.quizIndex]; const total=state.quizQuestions.length;
    $("quizProgressText").textContent=`Question ${state.quizIndex+1} of ${total}`;
    $("quizProgressFill").style.width=`${(state.quizIndex/total)*100}%`;
    $("quizScore").textContent=`Score: ${state.quizScore}`;
    $("questionText").textContent=q.question;
    const grid=$("optionsGrid"); grid.innerHTML="";
    ["A","B","C","D"].forEach((l,i)=>{
      const btn=document.createElement("button"); btn.className="option-btn"; btn.dataset.value=l;
      btn.innerHTML=`<span class="option-letter">${l}</span> ${escHtml(q.options[i]?.replace(/^[A-D]\)\s*/,"")||"")}`;
      btn.onclick=()=>selectAnswer(l); grid.appendChild(btn);
    });
    $("questionFeedback").classList.add("hidden"); $("questionFeedback").className="question-feedback hidden";
    $("nextQuestionBtn").classList.add("hidden");
    // Exam timer
    const secs=parseInt($("quizExamMode").value);
    if(state.examTimerInterval){clearInterval(state.examTimerInterval);}
    if(secs>0){
      let remaining=secs; const timerEl=$("examTimer");
      timerEl.classList.remove("hidden"); timerEl.textContent=`⏱ 0:${secs.toString().padStart(2,"0")}`;
      state.examTimerInterval=setInterval(()=>{
        remaining--;
        const m=Math.floor(remaining/60); const s=remaining%60;
        timerEl.textContent=`⏱ ${m}:${s.toString().padStart(2,"0")}`;
        if(remaining<=5) timerEl.style.color="var(--danger)";
        if(remaining<=0){clearInterval(state.examTimerInterval); timerEl.style.color=""; autoSelectOnTimeout();}
      },1000);
    } else { $("examTimer").classList.add("hidden"); }
  }
  function autoSelectOnTimeout(){
    document.querySelectorAll(".option-btn").forEach(b=>b.disabled=true);
    const q=state.quizQuestions[state.quizIndex];
    document.querySelectorAll(".option-btn").forEach(b=>{if(b.dataset.value===q.answer.toUpperCase())b.classList.add("correct");});
    $("questionFeedback").className="question-feedback wrong";
    $("questionFeedback").innerHTML=`<strong>⏱ Time's up!</strong> The answer was ${q.answer.toUpperCase()}. ${escHtml(q.explanation||"")}`;
    $("questionFeedback").classList.remove("hidden"); $("nextQuestionBtn").classList.remove("hidden");
  }
  function selectAnswer(chosen) {
    if(state.examTimerInterval) clearInterval(state.examTimerInterval);
    const q=state.quizQuestions[state.quizIndex]; const correct=q.answer.toUpperCase(); const isRight=chosen===correct;
    document.querySelectorAll(".option-btn").forEach(b=>{b.disabled=true;if(b.dataset.value===correct)b.classList.add("correct");else if(b.dataset.value===chosen&&!isRight)b.classList.add("wrong");});
    if(isRight) state.quizScore++;
    $("quizScore").textContent=`Score: ${state.quizScore}`;
    const fb=$("questionFeedback"); fb.className=`question-feedback ${isRight?"correct":"wrong"}`;
    fb.innerHTML=`<strong>${isRight?"✓ Correct!":"✗ Incorrect."}</strong> ${escHtml(q.explanation||"")}`;
    fb.classList.remove("hidden"); $("nextQuestionBtn").classList.remove("hidden");
  }
  function nextQuestion() { state.quizIndex++; if(state.quizIndex>=state.quizQuestions.length) showQuizResults(); else renderQuestion(); }
  function showQuizResults() {
    if(state.examTimerInterval){clearInterval(state.examTimerInterval);} $("examTimer").classList.add("hidden");
    $("quizActive").classList.add("hidden"); $("quizResults").classList.remove("hidden");
    const total=state.quizQuestions.length; const pct=Math.round((state.quizScore/total)*100);
    $("quizProgressFill").style.width="100%";
    let title,msg;
    if(pct>=80){title="Excellent!";msg="You've mastered this topic.";}
    else if(pct>=60){title="Good job!";msg="Solid effort. Keep reviewing!";}
    else if(pct>=40){title="Keep studying!";msg="You're getting there.";}
    else{title="Needs more practice";msg="Review your notes and try again.";}
    $("resultsTitle").textContent=title; $("resultsMessage").textContent=msg;
    $("resultsStats").innerHTML=`<div class="stat-box"><div class="stat-val">${state.quizScore}/${total}</div><div class="stat-lbl">Correct</div></div><div class="stat-box"><div class="stat-val">${pct}%</div><div class="stat-lbl">Score</div></div>`;
  }
  function restartQuiz(){$("quizResults").classList.add("hidden");$("quizActive").classList.add("hidden");$("quizSetup").classList.remove("hidden");$("quizTopic").value="";$("generateQuizBtn").disabled=false;$("quizProgressFill").style.width="0";}

  // ── FLASHCARDS ──────────────────────────────────────────────────
  async function generateFlashcards(){
    const topic=$("flashcardTopic").value.trim(); if(!topic){showToast("Please enter a topic.","error");return;}
    const btn=$("generateFlashcardsBtn"); btn.disabled=true; showLoading("Creating your flashcards...");
    try{
      state.flashcards=await window.api.generateFlashcards(topic,parseInt($("flashcardCount").value));
      state.flashcardIndex=0;
      $("flashcardSetup").classList.add("hidden"); $("flashcardsView").classList.remove("hidden");
      renderFlashcard(); buildDots();
    }catch(err){showToast("Failed to generate flashcards.","error");}
    finally{btn.disabled=false;hideLoading();}
  }
  function renderFlashcard(){const c=state.flashcards[state.flashcardIndex];$("cardFront").textContent=c.term;$("cardBack").textContent=c.definition;$("flashcardInner").classList.remove("flipped");$("flashcardCounter").textContent=`Card ${state.flashcardIndex+1} of ${state.flashcards.length}`;updateDots();}
  function flipCard(){$("flashcardInner").classList.toggle("flipped");}
  function prevCard(){if(state.flashcardIndex>0){state.flashcardIndex--;renderFlashcard();}}
  function nextCard(){if(state.flashcardIndex<state.flashcards.length-1){state.flashcardIndex++;renderFlashcard();}}
  function shuffleFlashcards(){for(let i=state.flashcards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.flashcards[i],state.flashcards[j]]=[state.flashcards[j],state.flashcards[i]];}state.flashcardIndex=0;renderFlashcard();showToast("Cards shuffled!","success");}
  function buildDots(){const d=$("cardDots");d.innerHTML="";const max=Math.min(state.flashcards.length,10);for(let i=0;i<max;i++){const dot=document.createElement("div");dot.className="dot"+(i===0?" active":"");dot.onclick=()=>{state.flashcardIndex=i;renderFlashcard();};d.appendChild(dot);}}
  function updateDots(){const dots=$("cardDots").querySelectorAll(".dot");const idx=Math.min(state.flashcardIndex,dots.length-1);dots.forEach((d,i)=>d.classList.toggle("active",i===idx));}
  function resetFlashcards(){$("flashcardsView").classList.add("hidden");$("flashcardSetup").classList.remove("hidden");$("flashcardTopic").value="";$("generateFlashcardsBtn").disabled=false;}

  // ── FEATURE 2: FEYNMAN CHECKER ──────────────────────────────────
  async function runFeynman() {
    const topic=$("feynmanTopic").value.trim(); const explanation=$("feynmanText").value.trim();
    if(!topic){showToast("Please enter the concept you're explaining.","error");return;}
    if(explanation.length<30){showToast("Write a more detailed explanation first.","error");return;}
    const btn=$("feynmanBtn"); btn.disabled=true; showLoading("Analysing your understanding...");
    try {
      const r=await window.api.feynmanCheck(topic,explanation);
      const scoreColor=r.score>=80?"var(--success)":r.score>=60?"var(--warning)":"var(--danger)";
      const gradeEmoji={"A":"🏆","B":"👍","C":"📚","D":"⚠️","F":"❌"}[r.grade]||"📊";
      $("feynmanResult").innerHTML=`
        <div style="display:flex;flex-direction:column;gap:16px;flex:1;">
          <div style="display:flex;align-items:center;gap:16px;">
            <div style="font-size:48px;font-family:var(--font-display);font-weight:800;color:${scoreColor};">${r.score}</div>
            <div>
              <div style="font-size:24px;">${gradeEmoji} Grade ${r.grade}</div>
              <div style="color:var(--text2);font-size:13px;">Understanding Score</div>
            </div>
          </div>
          ${r.understood_well?.length ? `
          <div class="feynman-section success-section">
            <div class="feynman-section-title">✓ What you understood well</div>
            <ul>${r.understood_well.map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
          </div>` : ""}
          ${r.gaps?.length ? `
          <div class="feynman-section warning-section">
            <div class="feynman-section-title">⚠ Gaps in your explanation</div>
            <ul>${r.gaps.map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
          </div>` : ""}
          ${r.misconceptions?.length ? `
          <div class="feynman-section danger-section">
            <div class="feynman-section-title">✗ Misconceptions to fix</div>
            <ul>${r.misconceptions.map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
          </div>` : ""}
          <div class="feynman-section info-section">
            <div class="feynman-section-title">💡 Simplified correction</div>
            <p>${escHtml(r.simplified_correction||"")}</p>
          </div>
          <div style="color:var(--text2);font-size:13px;padding:10px 14px;background:var(--surface);border-radius:var(--radius);">
            📌 <strong>Suggestion:</strong> ${escHtml(r.suggestion||"")}
          </div>
        </div>`;
    } catch(err){showToast(err.message||"Analysis failed.","error");}
    finally{btn.disabled=false;hideLoading();}
  }

  // ── FEATURE 3: EXAM PANIC MODE ──────────────────────────────────
  async function runPanic() {
    const notes=$("panicNotes").value.trim(); const subject=$("panicSubject").value.trim();
    if(!notes&&!subject){showToast("Please enter at least a subject or some notes.","error");return;}
    const hours=parseInt($("panicHours").value);
    const btn=$("panicBtn"); btn.disabled=true; showLoading(`Building your ${hours}h survival plan...`);
    try {
      const r=await window.api.examPanic(notes||subject,hours,subject);
      const priorityColor={"critical":"var(--danger)","important":"var(--warning)","optional":"var(--text3)"};
      $("panicResult").innerHTML=`
        <div class="panic-header">
          <span class="panic-badge">⚡ ${hours}h Survival Plan — ${escHtml(subject||"Exam")}</span>
        </div>
        <div class="panic-grid">
          <div class="panic-card">
            <h3>⏰ Time Breakdown</h3>
            <div class="time-slots">
              ${(r.time_breakdown||[]).map(s=>`
                <div class="time-slot">
                  <span class="slot-time">${escHtml(s.slot)}</span>
                  <span class="slot-task">${escHtml(s.task)}</span>
                  <span class="slot-priority" style="color:${priorityColor[s.priority]||"var(--text2)"};">●</span>
                </div>`).join("")}
            </div>
          </div>
          <div class="panic-card">
            <h3>🎯 Must Know</h3>
            <ul>${(r.must_know||[]).map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
            <h3 style="margin-top:16px;">⏭ Can Skip</h3>
            <ul style="opacity:0.6;">${(r.can_skip||[]).map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
          </div>
          <div class="panic-card">
            <h3>🧠 Memory Tricks</h3>
            <ul>${(r.memory_tricks||[]).map(x=>`<li>${escHtml(x)}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="panic-tip">💪 ${escHtml(r.final_tip||"")}</div>`;
      $("panicResult").classList.remove("hidden");
    } catch(err){showToast(err.message||"Plan generation failed.","error");}
    finally{btn.disabled=false;hideLoading();}
  }

  // ── FEATURE 4: CONCEPT MAP ──────────────────────────────────────
  function clearConceptMap(){$("conceptMapWrap").innerHTML=`<div class="output-placeholder"><span class="placeholder-icon">🕸</span><p>Your concept map will appear here</p></div>`;}
  async function generateConceptMap(){
    const notes=$("conceptInput").value.trim(); if(!notes){showToast("Please paste some notes first.","error");return;}
    const btn=$("conceptMapBtn"); btn.disabled=true; showLoading("Building concept map...");
    try {
      const data=await window.api.conceptMap(notes);
      renderConceptMap(data);
    } catch(err){showToast(err.message||"Map generation failed.","error");}
    finally{btn.disabled=false;hideLoading();}
  }
  function renderConceptMap(data){
    const wrap=$("conceptMapWrap"); wrap.innerHTML="";
    const W=wrap.offsetWidth||800; const H=420;
    const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.style.cssText="width:100%;height:420px;";

    // Layout: place nodes in a circle/force-ish layout
    const nodes=data.nodes||[]; const edges=data.edges||[];
    const pos={};
    const cx=W/2, cy=H/2;
    const coreNodes=nodes.filter(n=>n.type==="core");
    const subNodes=nodes.filter(n=>n.type==="sub");
    const detailNodes=nodes.filter(n=>n.type==="detail");

    coreNodes.forEach((n,i)=>{ pos[n.id]={x:cx+i*60-((coreNodes.length-1)*30),y:cy}; });
    subNodes.forEach((n,i)=>{ const a=(i/subNodes.length)*2*Math.PI-Math.PI/2; pos[n.id]={x:cx+Math.cos(a)*160,y:cy+Math.sin(a)*130}; });
    detailNodes.forEach((n,i)=>{ const a=(i/detailNodes.length)*2*Math.PI; pos[n.id]={x:cx+Math.cos(a)*280,y:cy+Math.sin(a)*180}; });

    const typeColor={"core":"#c8f04e","sub":"#4edec8","detail":"#8b91a8"};

    // Draw edges first
    edges.forEach(e=>{
      const s=pos[e.from]; const t=pos[e.to]; if(!s||!t) return;
      const line=document.createElementNS("http://www.w3.org/2000/svg","line");
      line.setAttribute("x1",s.x); line.setAttribute("y1",s.y);
      line.setAttribute("x2",t.x); line.setAttribute("y2",t.y);
      line.setAttribute("stroke","#2e354a"); line.setAttribute("stroke-width","1.5");
      svg.appendChild(line);
      // Edge label
      if(e.label){
        const tx=document.createElementNS("http://www.w3.org/2000/svg","text");
        tx.setAttribute("x",(s.x+t.x)/2); tx.setAttribute("y",(s.y+t.y)/2-4);
        tx.setAttribute("text-anchor","middle"); tx.setAttribute("font-size","9");
        tx.setAttribute("fill","#555d78"); tx.textContent=e.label; svg.appendChild(tx);
      }
    });

    // Draw nodes
    nodes.forEach(n=>{
      const p=pos[n.id]; if(!p) return;
      const r=n.type==="core"?36:n.type==="sub"?28:22;
      const color=typeColor[n.type]||"#8b91a8";
      const g=document.createElementNS("http://www.w3.org/2000/svg","g");
      g.style.cursor="pointer";
      const circle=document.createElementNS("http://www.w3.org/2000/svg","circle");
      circle.setAttribute("cx",p.x); circle.setAttribute("cy",p.y); circle.setAttribute("r",r);
      circle.setAttribute("fill",n.type==="core"?"rgba(200,240,78,0.15)":"rgba(30,35,48,0.9)");
      circle.setAttribute("stroke",color); circle.setAttribute("stroke-width","2");
      g.appendChild(circle);
      // wrap label
      const words=n.label.split(" "); const lines=[];
      let cur="";
      words.forEach(w=>{ if((cur+" "+w).length>12&&cur){lines.push(cur);cur=w;}else{cur=cur?cur+" "+w:w;} });
      if(cur) lines.push(cur);
      lines.forEach((line,li)=>{
        const tx=document.createElementNS("http://www.w3.org/2000/svg","text");
        tx.setAttribute("x",p.x); tx.setAttribute("y",p.y+(li-(lines.length-1)/2)*13+1);
        tx.setAttribute("text-anchor","middle"); tx.setAttribute("dominant-baseline","middle");
        tx.setAttribute("font-size",n.type==="core"?"11":"9.5"); tx.setAttribute("fill",color);
        tx.setAttribute("font-weight",n.type==="core"?"700":"400"); tx.textContent=line; g.appendChild(tx);
      });
      svg.appendChild(g);
    });
    wrap.appendChild(svg);
    // Legend
    const legend=document.createElement("div"); legend.style.cssText="display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--text3);";
    [["core","#c8f04e","Core concept"],["sub","#4edec8","Sub-topic"],["detail","#8b91a8","Detail"]].forEach(([,c,l])=>{
      legend.innerHTML+=`<span><span style="color:${c}">●</span> ${l}</span>`;
    });
    wrap.appendChild(legend);
  }

  // ── FEATURE 7: ELI5 → EXPERT ────────────────────────────────────
  const levelNames=["","Age 8","High School","Undergrad","Graduate","Expert"];
  function updateLevelLabel(){$("levelBadge").textContent=levelNames[parseInt($("eli5Level").value)];}
  async function runEli5(){
    const topic=$("eli5Topic").value.trim(); if(!topic){showToast("Please enter a topic.","error");return;}
    const level=parseInt($("eli5Level").value);
    const btn=$("eli5Btn"); btn.disabled=true; showLoading(`Explaining at ${levelNames[level]} level...`);
    try {
      const r=await window.api.eli5(topic,level);
      $("eli5Output").innerHTML=`
        <div style="display:flex;flex-direction:column;gap:12px;flex:1;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div class="panel-label" style="color:var(--accent)">Explanation</div>
            <span class="extracted-badge">🎚 ${levelNames[level]} Level</span>
          </div>
          <div class="summary-content">${renderMarkdown(r.text)}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${[1,2,3,4,5].map(l=>`<button class="chip${l===level?" chip-active":""}" onclick="App.switchLevel(${l})">${levelNames[l]}</button>`).join("")}
          </div>
        </div>`;
    } catch(err){showToast(err.message||"Explanation failed.","error");}
    finally{btn.disabled=false;hideLoading();}
  }
  function switchLevel(l){$("eli5Level").value=l;updateLevelLabel();runEli5();}

  // ── FEATURE 10: VOICE QUIZ ──────────────────────────────────────
  async function startVoiceQuiz(){
    const topic=$("voiceTopic").value.trim(); if(!topic){showToast("Please enter a topic.","error");return;}
    const count=parseInt($("voiceCount").value);
    const btn=$("voiceStartBtn"); btn.disabled=true; showLoading("Generating voice quiz questions...");
    try {
      state.voiceQuestions=await window.api.generateQuiz(topic,count,"medium");
      state.voiceIndex=0; state.voiceScore=0;
      $("voiceSetup").classList.add("hidden"); $("voiceActive").classList.remove("hidden");
      renderVoiceQuestion();
    } catch(err){showToast("Failed to generate questions.","error");}
    finally{btn.disabled=false;hideLoading();}
  }
  function renderVoiceQuestion(){
    const q=state.voiceQuestions[state.voiceIndex]; const total=state.voiceQuestions.length;
    $("voiceProgressText").textContent=`Question ${state.voiceIndex+1} of ${total}`;
    $("voiceProgressFill").style.width=`${(state.voiceIndex/total)*100}%`;
    $("voiceScore").textContent=`Score: ${state.voiceScore}`;
    $("voiceQuestionText").textContent=q.question;
    $("voiceTranscript").textContent="Your answer will appear here as you speak...";
    $("voiceTranscript").style.color="var(--text3)";
    $("submitVoiceBtn").classList.add("hidden");
    $("voiceFeedback").classList.add("hidden"); $("voiceFeedback").innerHTML="";
    $("nextVoiceBtn").classList.add("hidden");
    $("recordBtn").classList.remove("recording");
    $("recordLabel").textContent="Tap to speak";
    state.voiceTranscript=""; state.isRecording=false;
  }
  function toggleRecording(){
    if(state.isRecording){stopRecording();}else{startRecording();}
  }
  function startRecording(){
    const SpeechRecognition=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SpeechRecognition){showToast("Speech recognition not supported in this browser. Try Chrome.","error");return;}
    state.recognition=new SpeechRecognition();
    state.recognition.continuous=true; state.recognition.interimResults=true; state.recognition.lang="en-US";
    state.recognition.onresult=(e)=>{
      let interim="",final="";
      for(let i=e.resultIndex;i<e.results.length;i++){
        if(e.results[i].isFinal) final+=e.results[i][0].transcript;
        else interim+=e.results[i][0].transcript;
      }
      if(final) state.voiceTranscript+=final+" ";
      $("voiceTranscript").textContent=(state.voiceTranscript+interim)||"Listening...";
      $("voiceTranscript").style.color="var(--text)";
      if(state.voiceTranscript.trim()) $("submitVoiceBtn").classList.remove("hidden");
    };
    state.recognition.onerror=()=>{ stopRecording(); };
    state.recognition.start();
    state.isRecording=true;
    $("recordBtn").classList.add("recording");
    $("recordLabel").textContent="Recording... Tap to stop";
  }
  function stopRecording(){
    if(state.recognition){state.recognition.stop();}
    state.isRecording=false;
    $("recordBtn").classList.remove("recording");
    $("recordLabel").textContent="Tap to speak again";
  }
  async function submitVoiceAnswer(){
    const answer=state.voiceTranscript.trim(); if(!answer){showToast("Please record an answer first.","error");return;}
    const q=state.voiceQuestions[state.voiceIndex];
    const submitBtn=$("submitVoiceBtn"); submitBtn.disabled=true;
    showLoading("Grading your answer...");
    try {
      const r=await window.api.voiceCheck(q.question,answer,q.answer,q.explanation);
      if(r.correct||r.score>=60) state.voiceScore++;
      $("voiceScore").textContent=`Score: ${state.voiceScore}`;
      const isRight=r.correct||r.score>=60;
      $("voiceFeedback").innerHTML=`
        <div class="voice-grade ${isRight?"correct":"wrong"}">
          <div class="voice-grade-score" style="color:${isRight?"var(--success)":"var(--danger)"};">${r.score}/100</div>
          <div class="voice-grade-verdict">${escHtml(r.verdict||"")}</div>
        </div>
        ${r.what_was_right?`<div class="feynman-section success-section"><div class="feynman-section-title">✓ What was right</div><p>${escHtml(r.what_was_right)}</p></div>`:""}
        ${r.what_was_wrong?`<div class="feynman-section ${isRight?"info-section":"danger-section"}"><div class="feynman-section-title">${isRight?"💡 Could improve":"✗ What was wrong"}</div><p>${escHtml(r.what_was_wrong)}</p></div>`:""}
        <div class="feynman-section info-section"><div class="feynman-section-title">📖 Model answer</div><p>${escHtml(r.model_answer||"")}</p></div>`;
      $("voiceFeedback").classList.remove("hidden");
      $("nextVoiceBtn").classList.remove("hidden");
    } catch(err){showToast("Grading failed. Try again.","error");}
    finally{submitBtn.disabled=false;hideLoading();}
  }
  function nextVoiceQuestion(){
    state.voiceIndex++;
    if(state.voiceIndex>=state.voiceQuestions.length) showVoiceResults();
    else renderVoiceQuestion();
  }
  function showVoiceResults(){
    $("voiceActive").classList.add("hidden"); $("voiceResults").classList.remove("hidden");
    const total=state.voiceQuestions.length; const pct=Math.round((state.voiceScore/total)*100);
    $("voiceProgressFill").style.width="100%";
    $("voiceResultsTitle").textContent=pct>=70?"Great performance!":"Keep practising!";
    $("voiceResultsMsg").textContent="You completed the oral quiz.";
    $("voiceResultsStats").innerHTML=`<div class="stat-box"><div class="stat-val">${state.voiceScore}/${total}</div><div class="stat-lbl">Correct</div></div><div class="stat-box"><div class="stat-val">${pct}%</div><div class="stat-lbl">Score</div></div>`;
  }
  function restartVoiceQuiz(){$("voiceResults").classList.add("hidden");$("voiceActive").classList.add("hidden");$("voiceSetup").classList.remove("hidden");$("voiceTopic").value="";$("voiceStartBtn").disabled=false;$("voiceProgressFill").style.width="0";}

  // ── Mentor Dashboard ───────────────────────────────────────────
  function initials(name){
    return name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
  }
  function riskColor(label){
    return label==="at-risk" ? "var(--danger)" : label==="watch" ? "var(--warn)" : "var(--safe)";
  }
  function renderMentorRoster(students){
    const atRisk = students.filter(s=>s.risk_label==="at-risk").length;
    const watch  = students.filter(s=>s.risk_label==="watch").length;
    const safe   = students.filter(s=>s.risk_label==="safe").length;
    $("mentorTotalStudents").textContent = students.length;
    $("mentorAtRiskCount").textContent = atRisk;
    $("mentorWatchCount").textContent = watch;
    $("mentorSafeCount").textContent = safe;

    $("mentorRoster").innerHTML = students.map(s=>`
      <div class="student-card">
        <div class="student-avatar">${initials(s.name)}</div>
        <div class="student-info">
          <div class="student-name">${escHtml(s.name)} <span style="color:var(--text3);font-weight:400;">· ${escHtml(s.subject)}</span></div>
          <div class="student-meta">Avg score ${s.avg_quiz_score}% &nbsp;·&nbsp; ${s.days_inactive===0?"active today":s.days_inactive+"d inactive"} &nbsp;·&nbsp; ${s.sessions_this_week} sessions this week &nbsp;·&nbsp; ${s.streak_days}d streak</div>
        </div>
        <div class="risk-meter"><div class="risk-meter-fill" style="width:${s.risk_score}%;background:${riskColor(s.risk_label)};"></div></div>
        <div class="risk-badge ${s.risk_label}">${s.risk_label.replace("-"," ")}</div>
        <div class="student-actions">
          <button class="btn-nudge" onclick="App.mentorSendNudge(${s.id},'${escHtml(s.name).replace(/'/g,"\\'")}')">
            ${s.risk_label==="safe" ? "Message" : "🤖 AI Nudge"}
          </button>
        </div>
      </div>
    `).join("");
  }
  async function loadMentorDashboard(){
    $("mentorRoster").innerHTML = `<div class="loading-spinner"></div>`;
    try{
      const {students} = await api.mentorStudents();
      state.mentorStudents = students;
      renderMentorRoster(students);
    }catch(err){
      $("mentorRoster").innerHTML = `<p style="color:var(--danger);">Could not load student data.</p>`;
    }
  }
  async function mentorSimulateDay(){
    const btn = $("mentorSimBtn");
    btn.disabled = true; btn.textContent = "Simulating...";
    try{
      const {students} = await api.mentorSimulate();
      state.mentorStudents = students;
      renderMentorRoster(students);
      showToast("Advanced one day — risk scores updated.","success");
    }catch(err){ showToast("Simulation failed.","error"); }
    finally{ btn.disabled = false; btn.textContent = "⏱ Simulate Next Day"; }
  }
  async function mentorSendNudge(studentId, name){
    $("mentorNudgePanel").classList.remove("hidden");
    $("mentorNudgeName").textContent = `Draft check-in for ${name}`;
    $("mentorNudgeBody").innerHTML = `<div class="loading-spinner"></div>`;
    $("mentorNudgePanel").scrollIntoView({behavior:"smooth", block:"nearest"});
    try{
      const nudge = await api.mentorNudge(studentId);
      $("mentorNudgeBody").innerHTML = `
        <div class="nudge-subject">${escHtml(nudge.subject||"")}</div>
        <div class="nudge-message">${escHtml(nudge.message||"")}</div>
        <div class="nudge-action">Suggested: ${escHtml(nudge.suggested_action||"")}</div>`;
    }catch(err){
      $("mentorNudgeBody").innerHTML = `<p style="color:var(--danger);">Could not generate nudge. Try again.</p>`;
    }
  }
  function closeMentorNudge(){ $("mentorNudgePanel").classList.add("hidden"); }

  // ── Init ────────────────────────────────────────────────────────
  document.addEventListener("DOMContentLoaded",()=>{
    loadMentorDashboard();
    const ci=$("chatInput"); if(ci) ci.addEventListener("input",()=>autoResize(ci));
    const yt=$("youtubeUrl"); if(yt) yt.addEventListener("input",e=>{
      const m=e.target.value.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
      if(m){$("videoFrame").src=`https://www.youtube.com/embed/${m[1]}`;$("videoPreview").classList.remove("hidden");}
      else $("videoPreview").classList.add("hidden");
    });
    document.addEventListener("click",e=>{
      const sb=document.getElementById("sidebar"); const hb=document.querySelector(".hamburger");
      if(sb.classList.contains("open")&&!sb.contains(e.target)&&e.target!==hb) sb.classList.remove("open");
    });
    if("Notification" in window && Notification.permission==="default") Notification.requestPermission();
    updateLevelLabel();
  });

  return {
    navigate, toggleSidebar, toggleFullScreen, toggleFocusTimer,
    fillChat, chatKeydown, sendChat,
    switchSource, handleDrop, handleFileSelect, clearFile,
    summarize, clearSummarizer, copySummary,
    generateQuiz, nextQuestion, restartQuiz,
    generateFlashcards, flipCard, prevCard, nextCard, shuffleFlashcards, resetFlashcards,
    runFeynman, runPanic,
    generateConceptMap, clearConceptMap,
    updateLevelLabel, runEli5, switchLevel,
    startVoiceQuiz, toggleRecording, submitVoiceAnswer, nextVoiceQuestion, restartVoiceQuiz,
    loadMentorDashboard, mentorSimulateDay, mentorSendNudge, closeMentorNudge,
  };
})();
window.App = App;