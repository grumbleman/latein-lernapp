document.addEventListener('DOMContentLoaded', () => {
    // --- DOM-Referenzen ---
    const mainMenu = document.getElementById('main-menu');
    const questionCard = document.getElementById('question-card');
    const practiceModal = document.getElementById('practice-modal');
    const historyDisplay = document.getElementById('history-display');
    const historyList = document.getElementById('history-list');
    const historyNameFilter = document.getElementById('history-name-filter');
    const trainerNameInput = document.getElementById('trainer-name-input');
    const reviewModal = document.getElementById('review-modal');
    const reviewModalList = document.getElementById('review-modal-list');
    const closeReviewModalButton = document.getElementById('close-review-modal');
    const reviewAnswersButton = document.getElementById('review-answers-button');

    const totalQuestionsSpan = document.getElementById('total-questions');
    const categoryStatsList = document.getElementById('category-stats');

    const startExamButton = document.getElementById('start-exam-button');
    const practiceCategoryButton = document.getElementById('practice-category-button');
    const schwaechenButton = document.getElementById('schwaechen-button');
    const historyButton = document.getElementById('history-button');
    const backFromHistoryButton = document.getElementById('back-from-history-button');

    const categorySelect = document.getElementById('category-select');
    const numQuestionsSelect = document.getElementById('num-questions-select');
    const startPracticeButton = document.getElementById('start-practice-button');
    const closePracticeModalButton = document.getElementById('close-practice-modal');
    const backToMenuButton = document.getElementById('back-to-menu-button');

    const currentQuestionNumberSpan = document.getElementById('current-question-number');
    const totalQuestionsInSetSpan = document.getElementById('total-questions-in-set');
    const liveScoreEl = document.getElementById('live-score');

    const sachgebietElement = document.getElementById('sachgebiet');
    const questionTextElement = document.getElementById('frage-text');
    const antwortOptionenElement = document.getElementById('antwort-optionen');
    const feedbackElement = document.getElementById('feedback');
    const nextButton = document.getElementById('next-button');

    const saveToast = document.getElementById('save-toast');

    // --- Zustand ---
    let questions = [];
    let allQuestionsFromAPI = [];
    let currentQuestionIndex = 0;
    let selectedOption = null;
    let correctCount = 0;
    let incorrectCount = 0;
    let categoryResults = {};
    let currentMode = 'exam';
    let resultSaved = false;
    let answeredQuestions = [];
    let schwaechenStreaks = {};
    let schwaechenMastered = 0;

    // Name aus localStorage laden
    trainerNameInput.value = localStorage.getItem('trainerName') || '';

    function updateMenuForName() {
        const hasName = trainerNameInput.value.trim().length > 0;
        startExamButton.disabled = !hasName;
        practiceCategoryButton.disabled = !hasName;
        historyButton.classList.toggle('hidden', !hasName);
        if (hasName) {
            fetchSchwaechenCount();
        } else {
            schwaechenButton.textContent = 'Schwächen-Training (0 Fragen)';
            schwaechenButton.disabled = true;
        }
    }

    async function fetchSchwaechenCount() {
        const name = trainerNameInput.value.trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/schwaechen_fragen/${encodeURIComponent(name)}`);
            const data = await res.json();
            const count = data.length;
            schwaechenButton.textContent = `Schwächen-Training (${count} ${count === 1 ? 'Frage' : 'Fragen'})`;
            schwaechenButton.disabled = count === 0;
        } catch (e) {
            console.error('Fehler beim Laden der Schwächenanzahl:', e);
        }
    }

    trainerNameInput.addEventListener('input', () => {
        localStorage.setItem('trainerName', trainerNameInput.value.trim());
        updateMenuForName();
    });

    // --- API: Fragen und Stats laden ---
    async function loadStats() {
        try {
            const res = await fetch('/api/stats');
            const stats = await res.json();
            totalQuestionsSpan.textContent = stats.total;

            categoryStatsList.innerHTML = '';
            for (const [cat, count] of Object.entries(stats.categories)) {
                const li = document.createElement('li');
                li.innerHTML = `<span>${cat}</span><span>${count} Fragen</span>`;
                categoryStatsList.appendChild(li);
            }

            // Kategorie-Select für Übungsmodus befüllen
            categorySelect.innerHTML = '';
            for (const cat of Object.keys(stats.categories)) {
                const opt = document.createElement('option');
                opt.value = cat;
                opt.textContent = cat;
                categorySelect.appendChild(opt);
            }
        } catch (e) {
            console.error('Fehler beim Laden der Statistiken:', e);
        }
    }

    async function loadAllQuestions() {
        try {
            const res = await fetch('/api/questions');
            allQuestionsFromAPI = await res.json();
        } catch (e) {
            console.error('Fehler beim Laden der Fragen:', e);
        }
    }

    // --- Quiz starten ---
    function shuffleArray(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function startQuiz(questionsToUse, mode) {
        questions = shuffleArray(questionsToUse);
        currentQuestionIndex = 0;
        correctCount = 0;
        incorrectCount = 0;
        categoryResults = {};
        currentMode = mode;
        resultSaved = false;
        answeredQuestions = [];
        schwaechenStreaks = {};
        schwaechenMastered = 0;

        showView('question');
        showQuestion();
    }

    function showQuestion() {
        if (currentQuestionIndex >= questions.length) {
            showResults();
            return;
        }

        const q = questions[currentQuestionIndex];
        selectedOption = null;

        currentQuestionNumberSpan.textContent = currentQuestionIndex + 1;
        totalQuestionsInSetSpan.textContent = questions.length;
        sachgebietElement.textContent = q.sachgebiet;
        questionTextElement.textContent = q.frage;

        // Live-Score
        liveScoreEl.classList.remove('hidden');
        liveScoreEl.innerHTML =
            `<span class="score-correct">${correctCount} ✓</span> / <span class="score-incorrect">${incorrectCount} ✗</span>`;

        // Überprüfen-Button
        reviewAnswersButton.classList.toggle('hidden', answeredQuestions.length === 0);
        if (answeredQuestions.length > 0) {
            reviewAnswersButton.textContent = `Überprüfen (${answeredQuestions.length})`;
        }

        // Antwortoptionen
        antwortOptionenElement.innerHTML = '';
        const shuffledOptions = shuffleArray(q.optionen);
        shuffledOptions.forEach(option => {
            const btn = document.createElement('button');
            btn.classList.add('antwort-option');
            btn.textContent = option;
            btn.addEventListener('click', () => selectOption(btn, option, q));
            antwortOptionenElement.appendChild(btn);
        });

        feedbackElement.textContent = '';
        feedbackElement.className = 'feedback';
        nextButton.disabled = true;
    }

    function selectOption(btn, option, q) {
        if (selectedOption !== null) return;
        selectedOption = option;

        const isCorrect = option === q.korrekte_antwort;
        const name = trainerNameInput.value.trim();

        if (!categoryResults[q.sachgebiet]) {
            categoryResults[q.sachgebiet] = { richtig: 0, falsch: 0 };
        }

        // Alle Optionen markieren
        document.querySelectorAll('.antwort-option').forEach(b => {
            if (b.textContent === q.korrekte_antwort) {
                b.classList.add('correct');
            } else if (b.textContent === option && !isCorrect) {
                b.classList.add('incorrect');
            } else {
                b.style.pointerEvents = 'none';
                b.style.opacity = '0.6';
            }
        });

        answeredQuestions.push({
            question: q,
            selected: option,
            correct: q.korrekte_antwort,
            wasCorrect: isCorrect,
            questionNumber: currentQuestionIndex + 1
        });

        if (isCorrect) {
            correctCount++;
            categoryResults[q.sachgebiet].richtig++;
            feedbackElement.textContent = '✓ Richtig!';
            feedbackElement.className = 'feedback correct';
        } else {
            incorrectCount++;
            categoryResults[q.sachgebiet].falsch++;
            feedbackElement.innerHTML = `✗ Falsch! Richtig wäre: <strong>${q.korrekte_antwort}</strong>`;
            feedbackElement.className = 'feedback incorrect';
        }

        // Schwächen-Update
        if (currentMode === 'schwaechen' && name) {
            updateSchwaechen(name, q.id, isCorrect);
        }

        nextButton.disabled = false;

        // Überprüfen-Button aktualisieren
        reviewAnswersButton.classList.remove('hidden');
        reviewAnswersButton.textContent = `Überprüfen (${answeredQuestions.length})`;
        liveScoreEl.innerHTML =
            `<span class="score-correct">${correctCount} ✓</span> / <span class="score-incorrect">${incorrectCount} ✗</span>`;
    }

    async function updateSchwaechen(name, questionId, wasCorrect) {
        try {
            const res = await fetch('/api/schwaechen_update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, question_id: questionId, was_correct: wasCorrect })
            });
            const data = await res.json();
            if (data.mastered) {
                schwaechenMastered++;
                schwaechenStreaks[questionId] = 3;
            } else {
                schwaechenStreaks[questionId] = data.streak;
            }
        } catch (e) {
            console.error('Fehler beim Schwächen-Update:', e);
        }
    }

    nextButton.addEventListener('click', () => {
        currentQuestionIndex++;
        showQuestion();
    });

    // --- Ergebnisseite ---
    function showResults() {
        const total = questions.length;
        const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

        // Kategorie-Auswertung
        let catRows = '';
        for (const [cat, res] of Object.entries(categoryResults)) {
            const catTotal = res.richtig + res.falsch;
            const catPct = catTotal > 0 ? Math.round((res.richtig / catTotal) * 100) : 0;
            const cls = catPct >= 70 ? 'good' : 'bad';
            catRows += `<li><span>${cat}</span><span class="cat-score ${cls}">${res.richtig}/${catTotal} (${catPct}%)</span></li>`;
        }

        // Schwächen-Modus Extra-Info
        let schwaechenInfo = '';
        if (currentMode === 'schwaechen') {
            const allMastered = schwaechenMastered === questions.length;
            schwaechenInfo = `
                <div class="${allMastered ? 'schwaechen-result-banner bestanden' : 'schwaechen-result-banner'}">
                    ${allMastered ? '🎉 Alle Schwächen gemeistert!' : `${schwaechenMastered} von ${questions.length} Schwächen gemeistert`}
                </div>
                <div class="schwaechen-result-info">
                    Jede Frage muss 3× hintereinander richtig beantwortet werden, um als gemeistert zu gelten.
                </div>
            `;
        }

        questionCard.innerHTML = `
            <div class="result-summary">
                <h2>Ergebnis</h2>
                ${schwaechenInfo}
                <div class="result-score-big">
                    <span class="score-correct">${correctCount}</span> / <span class="score-incorrect">${incorrectCount}</span>
                </div>
                <div class="result-percent">${pct}% richtig (${total} Fragen)</div>
                ${catRows ? `<ul class="result-category-list">${catRows}</ul>` : ''}
                <button id="result-review-button" class="button button-secondary" style="width:auto;margin-right:10px;">Alle Antworten ansehen</button>
                <button id="result-back-button" class="button" style="width:auto;">Zurück zum Menü</button>
            </div>
        `;

        document.getElementById('result-back-button').addEventListener('click', () => {
            showView('menu');
            fetchSchwaechenCount();
        });

        document.getElementById('result-review-button').addEventListener('click', openReviewModal);

        saveResult();
    }

    async function saveResult() {
        if (resultSaved) return;
        resultSaved = true;
        const name = trainerNameInput.value.trim();
        if (!name) return;

        const falseFragen = answeredQuestions
            .filter(a => !a.wasCorrect)
            .map(a => a.question.id);

        const catData = {};
        for (const [cat, res] of Object.entries(categoryResults)) {
            catData[cat] = { richtig: res.richtig, gesamt: res.richtig + res.falsch };
        }

        const payload = {
            name,
            modus: currentMode === 'schwaechen' ? 'Schwächen' : currentMode === 'exam' ? 'Gesamt' : 'Übung',
            datum: new Date().toISOString(),
            richtig: correctCount,
            gesamt: questions.length,
            kategorien: catData,
            falsche_fragen: falseFragen
        };

        try {
            await fetch('/api/training_result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            showToast('Ergebnis gespeichert!', 'success');
        } catch (e) {
            console.error('Fehler beim Speichern des Ergebnisses:', e);
        }
    }

    // --- Review-Modal ---
    function openReviewModal() {
        reviewModalList.innerHTML = '';
        answeredQuestions.forEach((item, idx) => {
            const div = document.createElement('div');
            div.classList.add('review-question-item');
            div.classList.add(item.wasCorrect ? 'review-correct' : 'review-incorrect');

            const optionsHtml = item.question.optionen.map(opt => {
                let cls = 'review-option';
                if (opt === item.correct) cls += ' review-option-correct';
                else if (opt === item.selected && !item.wasCorrect) cls += ' review-option-wrong';
                return `<div class="${cls}">${opt}</div>`;
            }).join('');

            div.innerHTML = `
                <div class="review-question-header">
                    <div class="review-question-number">${item.questionNumber}</div>
                    <div class="review-question-category">${item.question.sachgebiet}</div>
                    <div class="review-result-icon">${item.wasCorrect ? '✓' : '✗'}</div>
                </div>
                <div class="review-question-text">${item.question.frage}</div>
                <div class="review-options">${optionsHtml}</div>
            `;
            reviewModalList.appendChild(div);
        });
        reviewModal.classList.remove('hidden');
    }

    closeReviewModalButton.addEventListener('click', () => {
        reviewModal.classList.add('hidden');
    });

    reviewAnswersButton.addEventListener('click', openReviewModal);

    reviewModal.addEventListener('click', (e) => {
        if (e.target === reviewModal) reviewModal.classList.add('hidden');
    });

    // --- Ansichten wechseln ---
    function showView(view) {
        mainMenu.classList.add('hidden');
        questionCard.classList.add('hidden');
        historyDisplay.classList.add('hidden');

        if (view === 'menu') mainMenu.classList.remove('hidden');
        else if (view === 'question') questionCard.classList.remove('hidden');
        else if (view === 'history') historyDisplay.classList.remove('hidden');
    }

    // --- Event-Listener: Menü ---
    startExamButton.addEventListener('click', () => {
        startQuiz(allQuestionsFromAPI, 'exam');
    });

    practiceCategoryButton.addEventListener('click', () => {
        practiceModal.classList.remove('hidden');
    });

    startPracticeButton.addEventListener('click', () => {
        const cat = categorySelect.value;
        const num = numQuestionsSelect.value;
        const filtered = allQuestionsFromAPI.filter(q => q.sachgebiet === cat);
        const subset = num === 'all' ? filtered : filtered.slice(0, parseInt(num));
        practiceModal.classList.add('hidden');
        startQuiz(subset, 'practice');
    });

    closePracticeModalButton.addEventListener('click', () => {
        practiceModal.classList.add('hidden');
    });

    schwaechenButton.addEventListener('click', async () => {
        const name = trainerNameInput.value.trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/schwaechen_fragen/${encodeURIComponent(name)}`);
            const data = await res.json();
            if (data.length === 0) {
                showToast('Keine Schwächefragen vorhanden!', 'info');
                return;
            }
            data.forEach(q => { schwaechenStreaks[q.id] = q.streak || 0; });
            startQuiz(data, 'schwaechen');
        } catch (e) {
            console.error('Fehler beim Laden der Schwächefragen:', e);
        }
    });

    backToMenuButton.addEventListener('click', () => {
        showView('menu');
        fetchSchwaechenCount();
    });

    // --- Trainingsverlauf ---
    historyButton.addEventListener('click', async () => {
        showView('history');
        await renderHistory();
    });

    backFromHistoryButton.addEventListener('click', () => {
        showView('menu');
    });

    historyNameFilter.addEventListener('change', () => renderHistory());

    async function renderHistory() {
        try {
            const res = await fetch('/api/training_history');
            const all = await res.json();

            // Namen-Filter befüllen
            const names = [...new Set(all.map(e => e.name))].sort();
            const currentFilter = historyNameFilter.value;
            historyNameFilter.innerHTML = '<option value="">Alle</option>';
            names.forEach(n => {
                const opt = document.createElement('option');
                opt.value = n;
                opt.textContent = n;
                if (n === currentFilter) opt.selected = true;
                historyNameFilter.appendChild(opt);
            });

            const filtered = historyNameFilter.value
                ? all.filter(e => e.name === historyNameFilter.value)
                : all;

            historyList.innerHTML = '';
            if (filtered.length === 0) {
                historyList.innerHTML = '<div class="history-empty">Noch keine Trainingseinträge vorhanden.</div>';
                return;
            }

            [...filtered].reverse().forEach(entry => {
                const pct = entry.gesamt > 0 ? Math.round((entry.richtig / entry.gesamt) * 100) : 0;
                const datum = new Date(entry.datum).toLocaleString('de-DE', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                let catBadges = '';
                if (entry.kategorien) {
                    for (const [cat, res] of Object.entries(entry.kategorien)) {
                        const catPct = res.gesamt > 0 ? Math.round((res.richtig / res.gesamt) * 100) : 0;
                        const cls = catPct >= 70 ? 'good' : 'bad';
                        // Kategoriename kürzen für Badge
                        const shortCat = cat.replace('nd-Formen (Gerundium & Gerundivum)', 'nd-Formen')
                                           .replace('ACI (Accusativus cum Infinitivo)', 'ACI')
                                           .replace('Substantive – Deklination', 'Substantive')
                                           .replace('Verben – Konjugation', 'Verben');
                        catBadges += `<span class="history-cat-badge ${cls}">${shortCat}: ${res.richtig}/${res.gesamt}</span>`;
                    }
                }

                const modusClass = entry.modus === 'Gesamt' ? '' : 'uebung';
                const card = document.createElement('div');
                card.classList.add('history-card');
                card.innerHTML = `
                    <div class="history-card-header">
                        <span class="history-card-name">${entry.name}</span>
                        <span class="history-card-meta">${datum}</span>
                        <span class="history-card-modus ${modusClass}">${entry.modus}</span>
                    </div>
                    <div class="history-score-row">
                        <span class="history-score-total">${entry.richtig}/${entry.gesamt}</span>
                        <span class="history-score-pct">(${pct}%)</span>
                    </div>
                    ${catBadges ? `<div class="history-categories">${catBadges}</div>` : ''}
                `;
                historyList.appendChild(card);
            });
        } catch (e) {
            console.error('Fehler beim Laden des Verlaufs:', e);
            historyList.innerHTML = '<div class="history-empty">Fehler beim Laden des Verlaufs.</div>';
        }
    }

    // --- Toast ---
    let toastTimeout = null;
    function showToast(msg, type = 'info') {
        saveToast.textContent = msg;
        saveToast.className = `save-toast save-toast--${type}`;
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            saveToast.classList.add('hidden');
        }, 2500);
    }

    // --- Init ---
    updateMenuForName();
    loadStats();
    loadAllQuestions();
});
