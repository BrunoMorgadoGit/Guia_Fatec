from flask import Flask, render_template, jsonify, request
import os, json, urllib.request

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/rooms')
def get_rooms():
    path = os.path.join(app.static_folder, 'data', 'rooms.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    except FileNotFoundError:
        return jsonify([])

@app.route('/api/rooms/<int:room_id>/toggle', methods=['POST'])
def toggle_room(room_id):
    path = os.path.join(app.static_folder, 'data', 'rooms.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            rooms = json.load(f)
        for r in rooms:
            if r['id'] == room_id:
                req_data = request.get_json(silent=True) or {}
                if 'status' in req_data:
                    r['status'] = req_data['status']
                    if req_data['status'] == 'occupied':
                        if 'reserved_by' in req_data:
                            r['reserved_by'] = req_data['reserved_by']
                        if 'reserved_subject' in req_data:
                            r['reserved_subject'] = req_data['reserved_subject']
                    elif req_data['status'] == 'available':
                        r['reserved_by'] = None
                        r['reserved_subject'] = None
                else:
                    r['status'] = 'available' if r['status'] == 'occupied' else 'occupied'
                    if r['status'] == 'available':
                        r['reserved_by'] = None
                        r['reserved_subject'] = None
                break
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(rooms, f, ensure_ascii=False, indent=4)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/chat', methods=['POST'])
def chat():
    api_key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'Configure ANTHROPIC_API_KEY no servidor.'}), 500
    data = request.get_json()
    path = os.path.join(app.static_folder, 'data', 'rooms.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            rooms_ctx = json.dumps(json.load(f), ensure_ascii=False)
    except:
        rooms_ctx = '[]'
    payload = json.dumps({
        'model': 'claude-sonnet-4-20250514',
        'max_tokens': 1000,
        'system': f'Você é o assistente virtual da FATEC Pompéia – Shunji Nishimura (Garça, SP). Salas: {rooms_ctx}. Responda em português, de forma curta e amigável.',
        'messages': [{'role':'user','content': data.get('message','')}]
    }).encode('utf-8')
    req = urllib.request.Request(
        'https://api.anthropic.com/v1/messages', data=payload,
        headers={'Content-Type':'application/json','x-api-key':api_key,'anthropic-version':'2023-06-01'}
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return jsonify({'reply': result['content'][0]['text']})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
