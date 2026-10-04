# -*- coding: utf-8 -*-
"""
CLICK SCIENCE 자동 등록 — 단원 레포의 실험실 페이지를 갤러리 카드로 올린다.

실험실 페이지 <head> 안에 카드 표시를 하나 넣어 두면 된다.

    <script type="application/json" id="click-science">
    {"id":"electrophorus", "subject":"phys", "unit":"전기와 자기", "grade":"중2",
     "tags":["sim","3d"], "title":"…", "desc":"…", "shot":"?thumb=1", "added":"2026-10-04"}
    </script>

  · id      갤러리 안에서 겹치지 않는 영문 이름. sims.js 에 같은 id(또는 같은 주소)가 있으면 그 카드를 이 내용으로 덮는다.
  · subject phys · chem · life · earth      · unit  교육과정 단원 이름(curriculum/order.js 의 제목과 같게)
  · grade   중1 · 중2 · 중3 · 심화 …         · tags  sim game 3d data mic cam sensor
  · query   (선택) 카드가 열 주소 뒤에 붙일 것, 예 "?tab=explore"
  · shot    (선택) 썸네일을 찍을 때 붙일 것, 예 "?thumb=1" (안내 창 없이 실험판만 보이게)
  · parts   (선택) [["이름","주소(이 페이지 기준 상대 주소 가능)"], …]
  · added   (선택) 처음 올린 날 — 30일 동안 카드에 NEW 가 붙는다

사용
    python tools/sync_labs.py --git-dir <단원 레포 .git> --sha <올릴 커밋> [--push]
    python tools/sync_labs.py --src <배포 폴더> --repo electricity [--push]

단원 레포의 .git/hooks/pre-push 가 push 때마다 이 파일을 부른다(tools/install_hook.py 로 설치).
결과: auto-labs.json(원본 기록) · auto-labs.js(갤러리가 읽음) · thumbs/<id>.jpg
"""
import argparse, datetime, hashlib, http.server, io, json, os, re, shutil, socketserver
import subprocess, sys, tempfile, threading, time, urllib.parse

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
SIMLAB = os.path.dirname(HERE)
BASE = 'https://scienceisjo.github.io/'
STORE = os.path.join(SIMLAB, 'auto-labs.json')
OUTJS = os.path.join(SIMLAB, 'auto-labs.js')
THUMBS = os.path.join(SIMLAB, 'thumbs')
SKIP_DIRS = ('share/', 'node_modules/', '.git/', '_backup/', 'lib/')
SUBJECTS = {'phys', 'chem', 'life', 'earth'}
TAGS = {'sim', 'game', '3d', 'data', 'mic', 'cam', 'sensor'}
TAG_RE = re.compile(r'<script[^>]*\bid=["\']click-science["\'][^>]*>(.*?)</script>', re.S | re.I)
ID_RE = re.compile(r'^[a-z0-9][a-z0-9\-]*$')


def say(msg):
    print('[CLICK SCIENCE] ' + msg, flush=True)


def git(args, cwd=None, git_dir=None, binary=False, check=True):
    cmd = ['git'] + (['--git-dir', git_dir] if git_dir else []) + args
    r = subprocess.run(cmd, cwd=cwd, capture_output=True)
    if check and r.returncode:
        raise RuntimeError('git %s 실패: %s' % (' '.join(args), r.stderr.decode('utf-8', 'replace').strip()))
    return r.stdout if binary else r.stdout.decode('utf-8', 'replace')


# ── 페이지 읽기: git 커밋 또는 폴더 ─────────────────────────────
class GitTree:
    def __init__(self, git_dir, sha):
        self.git_dir, self.sha = git_dir, sha
        self.files = [f for f in git(['ls-tree', '-r', '--name-only', sha], git_dir=git_dir).splitlines() if f]

    def read(self, path):
        r = subprocess.run(['git', '--git-dir', self.git_dir, 'show', '%s:%s' % (self.sha, path)], capture_output=True)
        return r.stdout if r.returncode == 0 else None


class DirTree:
    def __init__(self, root):
        self.root = root
        self.files = []
        for d, _, fs in os.walk(root):
            for f in fs:
                self.files.append(os.path.relpath(os.path.join(d, f), root).replace('\\', '/'))

    def read(self, path):
        p = os.path.join(self.root, path)
        return open(p, 'rb').read() if os.path.isfile(p) else None


def repo_from_remote(git_dir):
    url = git(['remote', 'get-url', 'origin'], git_dir=git_dir).strip()
    m = re.search(r'[/:]scienceisjo/([^/]+?)(?:\.git)?$', url)
    if not m:
        raise RuntimeError('scienceisjo 레포가 아님: ' + url)
    return m.group(1)


def find_cards(tree, repo):
    cards, problems = [], []
    for path in tree.files:
        if not path.lower().endswith('.html') or path.startswith(SKIP_DIRS) or '/share/' in path:
            continue
        raw = tree.read(path)
        if not raw or b'click-science' not in raw:
            continue
        html = raw.decode('utf-8', 'replace')
        m = TAG_RE.search(html)
        if not m:
            continue
        try:
            c = json.loads(m.group(1))
        except ValueError as e:
            problems.append('%s: 카드 표시 JSON 오류 (%s)' % (path, e))
            continue
        miss = [k for k in ('id', 'title', 'desc', 'subject', 'unit', 'grade') if not c.get(k)]
        if miss:
            problems.append('%s: 빠진 칸 %s' % (path, ', '.join(miss)))
            continue
        if not ID_RE.match(c['id']):
            problems.append('%s: id 는 영문 소문자·숫자·- 만 (%s)' % (path, c['id']))
            continue
        if c['subject'] not in SUBJECTS:
            problems.append('%s: subject 는 %s 중 하나' % (path, '/'.join(sorted(SUBJECTS))))
            continue
        tags = [t for t in c.get('tags', ['sim']) if t in TAGS] or ['sim']
        page_url = BASE + repo + '/' + path
        entry = {
            'id': c['id'], 'subject': c['subject'], 'unit': c['unit'], 'grade': c['grade'], 'tags': tags,
            'title': c['title'], 'desc': c['desc'], 'url': page_url + c.get('query', ''),
            'repo': repo, 'path': path, 'auto': True,
        }
        if c.get('parts'):
            entry['parts'] = [[p[0], urllib.parse.urljoin(page_url, p[1])] for p in c['parts']]
        if c.get('added'):
            entry['added'] = c['added']
        entry['_shot'] = c.get('shot', '')
        entry['_hash'] = hashlib.sha1(raw + entry['_shot'].encode()).hexdigest()[:16]
        cards.append(entry)
    return cards, problems


# ── 썸네일: 커밋 속 파일을 그대로 내보내는 작은 서버 + 헤드리스 크롬 ──
def serve(tree):
    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            p = urllib.parse.unquote(urllib.parse.urlparse(self.path).path).lstrip('/') or 'index.html'
            data = tree.read(p)
            if data is None:
                self.send_response(404); self.end_headers(); return
            ext = os.path.splitext(p)[1].lower()
            ctype = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css',
                     '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
                     '.svg': 'image/svg+xml', '.json': 'application/json', '.mp3': 'audio/mpeg'}.get(ext, 'application/octet-stream')
            self.send_response(200)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def log_message(self, *a):
            pass

    srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), H)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def browser():
    for p in (r'C:\Program Files\Google\Chrome\Application\chrome.exe',
              r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
              os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
              r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'):
        if os.path.exists(p):
            return p
    return shutil.which('chrome') or shutil.which('google-chrome') or shutil.which('msedge')


def shoot(url, out_jpg):
    exe = browser()
    if not exe:
        say('크롬을 찾지 못해 썸네일은 건너뜁니다')
        return False
    tmp = tempfile.mkdtemp(prefix='cs-shot-')
    png = os.path.join(tmp, 'shot.png')
    cmd = [exe, '--headless=new', '--hide-scrollbars', '--disable-extensions', '--mute-audio',
           '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist',
           '--window-size=1280,800', '--virtual-time-budget=9000', '--user-data-dir=' + os.path.join(tmp, 'ud'),
           '--screenshot=' + png, url]
    try:
        subprocess.run(cmd, capture_output=True, timeout=90)
        if not os.path.exists(png):
            return False
        from PIL import Image
        im = Image.open(png).convert('RGB')
        w, h = im.size
        tw = int(h * 1.6)                       # 16:10 로 가운데 자르기
        if tw <= w:
            im = im.crop(((w - tw) // 2, 0, (w - tw) // 2 + tw, h))
        else:
            th = int(w / 1.6); im = im.crop((0, (h - th) // 2, w, (h - th) // 2 + th))
        im = im.resize((640, 400), Image.LANCZOS)
        im.save(out_jpg, 'JPEG', quality=84, optimize=True)
        return True
    except Exception as e:
        say('썸네일 실패 %s (%s)' % (url, e))
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── 기록 · 갤러리 파일 ───────────────────────────────────────
def load_store():
    if os.path.exists(STORE):
        return json.load(io.open(STORE, encoding='utf-8'))
    return {'labs': []}


def write_outputs(store):
    store['labs'].sort(key=lambda e: (e['repo'], e['path'], e['id']))
    io.open(STORE, 'w', encoding='utf-8', newline='\n').write(json.dumps(store, ensure_ascii=False, indent=1) + '\n')
    pub = []
    for e in store['labs']:
        pub.append({k: v for k, v in e.items() if not k.startswith('_')})
    js = ('// 자동 생성 — 손으로 고치지 마세요.\n'
          '// 단원 레포(electricity 등)를 push 하면 tools/sync_labs.py 가 다시 씁니다.\n'
          '// 실험실 페이지 안 <script type="application/json" id="click-science"> 가 원본입니다.\n'
          'const AUTO_LABS = ' + json.dumps(pub, ensure_ascii=False, indent=1) + ';\n')
    io.open(OUTJS, 'w', encoding='utf-8', newline='\n').write(js)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--git-dir'); ap.add_argument('--sha')
    ap.add_argument('--src'); ap.add_argument('--repo')
    ap.add_argument('--push', action='store_true')
    ap.add_argument('--reshoot', action='store_true', help='바뀌지 않았어도 썸네일을 다시 찍는다')
    ap.add_argument('--dry', help='시험: 썸네일을 이 폴더에만 찍고 기록·커밋은 하지 않는다')
    a = ap.parse_args()

    if a.git_dir:
        repo = a.repo or repo_from_remote(a.git_dir)
        tree = GitTree(a.git_dir, a.sha or 'HEAD')
    elif a.src and a.repo:
        repo, tree = a.repo, DirTree(a.src)
    else:
        ap.error('--git-dir(+--sha) 또는 --src+--repo 를 주세요')
    if repo == 'sim-lab':
        return

    cards, problems = find_cards(tree, repo)
    for p in problems:
        say('⚠ ' + p)

    store = load_store()
    old = {e['id']: e for e in store['labs'] if e['repo'] == repo}
    others = [e for e in store['labs'] if e['repo'] != repo]
    taken = {e['id']: e['repo'] for e in others}
    keep, changed = [], []
    today = datetime.date.today().isoformat()
    for c in cards:
        if c['id'] in taken:
            say('⚠ id "%s" 를 %s 레포가 이미 씁니다 — 건너뜀' % (c['id'], taken[c['id']]))
            continue
        prev = old.get(c['id'])
        c.setdefault('added', prev.get('added') if prev else today)
        thumb = os.path.join(THUMBS, c['id'] + '.jpg')
        if a.reshoot or not prev or prev.get('_hash') != c['_hash'] or not os.path.exists(thumb):
            changed.append(c)
        keep.append(c)
    removed = [i for i in old if i not in {c['id'] for c in keep}]

    if changed:
        srv = serve(tree)
        port = srv.server_address[1]
        for c in changed:
            u = 'http://127.0.0.1:%d/%s%s' % (port, urllib.parse.quote(c['path']), c['_shot'])
            ok = shoot(u, os.path.join(a.dry or THUMBS, c['id'] + '.jpg'))
            say('썸네일 %s %s' % (c['id'], '찍음' if ok else '못 찍음(기존 그림 유지)'))
        srv.shutdown()

    if a.dry:
        for c in keep:
            say('시험 %s → %s (%s)' % (c['id'], c['url'], c['title']))
        return
    if not changed and not removed:
        say('%s: 바뀐 실험실 카드 없음 (%d개 등록 유지)' % (repo, len(keep)))
        return

    store['labs'] = others + keep
    write_outputs(store)
    ids = [c['id'] for c in changed] + ['-' + i for i in removed]
    say('%s: 카드 %d개 (바뀜 %s)' % (repo, len(keep), ', '.join(ids)))

    paths = ['auto-labs.json', 'auto-labs.js'] + ['thumbs/%s.jpg' % c['id'] for c in changed
                                                   if os.path.exists(os.path.join(THUMBS, c['id'] + '.jpg'))]
    git(['add', '--'] + paths, cwd=SIMLAB)
    if not git(['diff', '--cached', '--name-only'], cwd=SIMLAB).strip():
        say('갤러리 파일 변화 없음')
        return
    git(['commit', '-q', '-m', 'CLICK SCIENCE 자동 등록 · %s: %s' % (repo, ', '.join(ids)), '--'] + paths, cwd=SIMLAB)
    if not a.push:
        say('sim-lab 에 커밋만 했습니다 (--push 없음)')
        return
    branch = git(['branch', '--show-current'], cwd=SIMLAB).strip()
    if branch != 'main':
        say('sim-lab 이 main 이 아니라(%s) push 하지 않았습니다' % branch)
        return
    for i in range(3):
        r = subprocess.run(['git', 'pull', '--rebase', '--autostash', '-q'], cwd=SIMLAB, capture_output=True)
        p = subprocess.run(['git', 'push', '-q', 'origin', 'main'], cwd=SIMLAB, capture_output=True)
        if p.returncode == 0:
            say('sim-lab 배포 완료 → https://scienceisjo.github.io/sim-lab/ (1~2분 뒤 반영)')
            return
        time.sleep(2)
    say('⚠ sim-lab push 실패: ' + p.stderr.decode('utf-8', 'replace').strip())


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        say('⚠ 등록 실패: %s' % e)
        sys.exit(0)   # 단원 배포는 막지 않는다
