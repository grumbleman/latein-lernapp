import json
import logging
import os
from flask import Flask, render_template, jsonify, request

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

QUESTIONS_FILE = 'latein_fragen.json'
HISTORY_FILE = 'training_history.json'
SCHWAECHEN_FILE = 'schwaechen.json'

questions_data = []
questions_stats = {}


def load_schwaechen():
    if not os.path.exists(SCHWAECHEN_FILE):
        return {}
    try:
        with open(SCHWAECHEN_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        logger.warning("schwaechen.json konnte nicht gelesen werden.")
        return {}


def save_schwaechen(data):
    with open(SCHWAECHEN_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_questions():
    global questions_data, questions_stats
    try:
        with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
            questions_data = json.load(f)
        logger.info("Loaded %d questions from %s", len(questions_data), QUESTIONS_FILE)

        total_questions = len(questions_data)
        questions_by_category = {}
        for q in questions_data:
            category = q.get('sachgebiet', 'Unbekannt')
            questions_by_category[category] = questions_by_category.get(category, 0) + 1

        questions_stats = {'total': total_questions, 'categories': questions_by_category}
        logger.info("Statistiken berechnet: %d Kategorien.", len(questions_by_category))

    except FileNotFoundError:
        logger.error("%s nicht gefunden.", QUESTIONS_FILE)
        questions_data = []
        questions_stats = {'total': 0, 'categories': {}}
    except json.JSONDecodeError:
        logger.error("JSON-Fehler in %s.", QUESTIONS_FILE)
        questions_data = []
        questions_stats = {'total': 0, 'categories': {}}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/stats')
def get_stats():
    return jsonify(questions_stats)


@app.route('/api/questions')
def get_all_questions():
    return jsonify(questions_data)


@app.route('/api/questions/<category_name>')
def get_questions_by_category(category_name):
    filtered = [q for q in questions_data if q.get('sachgebiet') == category_name]
    return jsonify(filtered)


@app.route('/api/training_history', methods=['GET'])
def get_training_history():
    if not os.path.exists(HISTORY_FILE):
        return jsonify([])
    with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))


@app.route('/api/training_result', methods=['POST'])
def save_training_result():
    data = request.get_json()
    if not data or not data.get('name') or not data.get('gesamt'):
        return jsonify({'status': 'error', 'message': 'Ungültige Daten'}), 400

    try:
        history = []
        if os.path.exists(HISTORY_FILE):
            with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
                history = json.load(f)

        history.append(data)

        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        logger.info(
            "Trainingsergebnis gespeichert: %s | %s | %d/%d",
            data.get('name'), data.get('modus'),
            data.get('richtig', 0), data.get('gesamt', 0),
        )

        # Falsch beantwortete Fragen in Schwächen-Datenbank aufnehmen
        falsche_fragen = data.get('falsche_fragen', [])
        if falsche_fragen:
            name = data['name']
            schwaechen = load_schwaechen()
            if name not in schwaechen:
                schwaechen[name] = {}
            for qid in falsche_fragen:
                schwaechen[name][qid] = 0
            save_schwaechen(schwaechen)
            logger.info("Schwächen aktualisiert für %s: %d Fragen", name, len(falsche_fragen))

        return jsonify({'status': 'success'})

    except Exception as e:
        logger.error("Fehler beim Speichern: %s", e, exc_info=True)
        return jsonify({'status': 'error', 'message': 'Interner Fehler'}), 500


@app.route('/api/schwaechen_fragen/<name>')
def get_schwaechen_fragen(name):
    schwaechen = load_schwaechen()
    user_schwaechen = schwaechen.get(name, {})
    if not user_schwaechen:
        return jsonify([])
    questions_by_id = {q['id']: q for q in questions_data}
    result = []
    for qid, streak in user_schwaechen.items():
        q = questions_by_id.get(qid)
        if q:
            result.append({**q, 'streak': streak})
    return jsonify(result)


@app.route('/api/schwaechen_update', methods=['POST'])
def update_schwaechen():
    data = request.get_json()
    name = data.get('name')
    qid = data.get('question_id')
    was_correct = data.get('was_correct')

    if not name or not qid or was_correct is None:
        return jsonify({'status': 'error', 'message': 'Fehlende Parameter'}), 400

    schwaechen = load_schwaechen()
    if name not in schwaechen or qid not in schwaechen[name]:
        return jsonify({'status': 'ok', 'streak': 0, 'mastered': False})

    if was_correct:
        schwaechen[name][qid] += 1
        mastered = schwaechen[name][qid] >= 3
        if mastered:
            del schwaechen[name][qid]
    else:
        schwaechen[name][qid] = 0
        mastered = False

    save_schwaechen(schwaechen)
    new_streak = 3 if mastered else schwaechen.get(name, {}).get(qid, 0)
    return jsonify({'status': 'ok', 'streak': new_streak, 'mastered': mastered})


load_questions()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0')
