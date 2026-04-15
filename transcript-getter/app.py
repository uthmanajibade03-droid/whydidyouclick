from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
import yt_dlp
import os
import re
from datetime import datetime

app = Flask(__name__)
CORS(app)

@app.route('/')
def home():
    return render_template('index.html')

def parse_vtt_with_timestamps(vtt_content):
    """Extract text with timestamps from VTT"""
    lines = vtt_content.split('\n')
    segments = []
    current_time = None
    current_text = []
    
    for line in lines:
        if '-->' in line:
            time_match = re.search(r'(\d{2}:\d{2}:\d{2})', line)
            if time_match:
                current_time = time_match.group(1)
        elif line.strip() and not line.startswith('WEBVTT') and not line.strip().isdigit():
            cleaned = re.sub(r'<[\d:.]+>', '', line).strip()
            if cleaned:
                current_text.append(cleaned)
        elif not line.strip() and current_text and current_time:
            segments.append({
                'time': current_time,
                'text': ' '.join(current_text)
            })
            current_text = []
    
    return segments

def break_into_paragraphs(text):
    """Break transcript into paragraphs using simple heuristics"""
    sentence_pattern = re.compile(r'([.!?])\s+(?=[A-Z])')
    parts = sentence_pattern.split(text)
    
    sentences = []
    for i in range(0, len(parts), 2):
        if parts[i].strip():
            sentence = parts[i] + (parts[i + 1] if i + 1 < len(parts) else '.')
            sentences.append(sentence.strip())
    
    paragraphs = []
    current = []
    
    for i, sentence in enumerate(sentences):
        current.append(sentence)
        
        should_break = (
            len(current) >= 3 and (
                len(current) >= 5 or
                (i + 1 < len(sentences) and is_topic_change(sentences[i + 1]))
            )
        )
        
        if should_break:
            paragraphs.append(' '.join(current))
            current = []
    
    if current:
        paragraphs.append(' '.join(current))
    
    return paragraphs

def is_topic_change(sentence):
    """Detect if sentence likely starts a new topic"""
    sentence_lower = sentence.lower()
    
    patterns = [
        r'^(so|now|let\'s|actually|anyway|next)',
        r'^(and then|after that|later|then)',
        r'^(another|also|furthermore)',
        r'^(but|however|although|while)',
        r'^(because|since|therefore)',
        r'^(for example|for instance|like)',
    ]
    
    for pattern in patterns:
        if re.match(pattern, sentence_lower):
            return True
    
    return False

def match_paragraphs_with_timestamps(paragraphs, segments):
    """Match each paragraph with start and end timestamps"""
    result = []
    full_text = ' '.join([seg['text'] for seg in segments])
    char_position = 0
    
    for paragraph in paragraphs:
        start_time = "00:00:00"
        end_time = "00:00:00"
        
        # Find start timestamp
        for seg in segments:
            seg_start = full_text.find(seg['text'][:30], char_position)
            if seg_start != -1 and seg_start <= char_position + 100:
                start_time = seg['time']
                break
        
        # Move position forward
        char_position += len(paragraph)
        
        # Find end timestamp
        for seg in segments:
            seg_pos = full_text.find(seg['text'][:30])
            if seg_pos != -1 and seg_pos >= char_position - 200:
                end_time = seg['time']
                break
        
        result.append({
            'timestamp': start_time,
            'end_time': end_time,
            'text': paragraph
        })
    
    return result

@app.route('/get-transcript', methods=['POST'])
def get_transcript():
    data = request.json
    url = data.get('url')
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    try:
        ydl_opts = {
            'writeautomaticsub': True,
            'skip_download': True,
            'subtitleslangs': ['en'],
            'outtmpl': 'temp_transcript',
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
        transcript_file = 'temp_transcript.en.vtt'
        
        if os.path.exists(transcript_file):
            with open(transcript_file, 'r', encoding='utf-8') as f:
                vtt_content = f.read()
            
            segments = parse_vtt_with_timestamps(vtt_content)
            full_text = ' '.join([seg['text'] for seg in segments])
            
            paragraphs = break_into_paragraphs(full_text)
            formatted = match_paragraphs_with_timestamps(paragraphs, segments)
            
            os.remove(transcript_file)
            
            # Extract video ID from URL
            video_id = info.get('id', '')
            
            return jsonify({
                'transcript': formatted,
                'title': info.get('title', 'Untitled Video'),
                'channel': info.get('uploader', 'Unknown Channel'),
                'url': url,
                'video_id': video_id,
                'thumbnail': f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
                'upload_date': info.get('upload_date', '')
            })
        else:
            return jsonify({'error': 'No transcript available'}), 404
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=3000)