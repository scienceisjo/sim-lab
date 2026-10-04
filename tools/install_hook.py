# -*- coding: utf-8 -*-
"""
단원 레포에 CLICK SCIENCE 자동 등록 훅을 건다.

    python tools/install_hook.py C:\\Users\\user\\electricity-staging [다른 레포 …]

그 레포를 main 으로 push 할 때마다 tools/sync_labs.py 가 돌아,
페이지 안 click-science 카드 표시를 읽고 갤러리(sim-lab)에 카드·썸네일을 올린다.
등록이 실패해도 단원 push 는 그대로 진행된다.
"""
import io, os, subprocess, sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

SYNC = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sync_labs.py').replace('\\', '/')
MARK_A, MARK_B = '# >>> CLICK SCIENCE 자동 등록 >>>', '# <<< CLICK SCIENCE 자동 등록 <<<'
BLOCK = r'''%s
# 이 레포를 main 으로 push 하면 실험실 카드(click-science 표시)를 CLICK SCIENCE 갤러리에 올린다.
# 끄려면 이 묶음을 지우거나:  git push --no-verify
cs_git_dir="$(git rev-parse --git-common-dir)"
while read cs_lref cs_lsha cs_rref cs_rsha; do
  case "$cs_rref" in refs/heads/main|refs/heads/master) ;; *) continue ;; esac
  case "$cs_lsha" in 0000000000000000000000000000000000000000) continue ;; esac
  python "%s" --git-dir "$cs_git_dir" --sha "$cs_lsha" --push || echo "[CLICK SCIENCE] 등록을 건너뜁니다"
done
%s
''' % (MARK_A, SYNC, MARK_B)


def install(repo):
    gd = subprocess.run(['git', 'rev-parse', '--git-common-dir'], cwd=repo, capture_output=True, text=True)
    if gd.returncode:
        print('git 레포가 아님:', repo); return
    git_dir = os.path.join(repo, gd.stdout.strip()) if not os.path.isabs(gd.stdout.strip()) else gd.stdout.strip()
    hook = os.path.join(git_dir, 'hooks', 'pre-push')
    os.makedirs(os.path.dirname(hook), exist_ok=True)
    s = io.open(hook, encoding='utf-8').read() if os.path.exists(hook) else '#!/bin/sh\n'
    if MARK_A in s:
        a, b = s.index(MARK_A), s.index(MARK_B) + len(MARK_B) + 1
        s = s[:a] + BLOCK + s[b:]
    else:
        # 다른 훅 내용이 있으면 맨 앞(첫 줄 다음)에 끼운다 — stdin 을 우리가 먼저 읽으므로 다른 훅이 stdin 을 쓰면 안 됨
        if 'read ' in s.split('\n', 1)[-1]:
            print('⚠ 기존 pre-push 훅이 stdin 을 읽습니다 — 손으로 합쳐 주세요:', hook); return
        first, rest = (s.split('\n', 1) + [''])[:2]
        s = first + '\n' + BLOCK + rest
    io.open(hook, 'w', encoding='utf-8', newline='\n').write(s)
    print('훅 설치:', hook)


if __name__ == '__main__':
    for r in sys.argv[1:]:
        install(r)
