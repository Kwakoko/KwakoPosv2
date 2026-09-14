from pathlib import Path
import re

ROOT = Path(r'C:\Users\Administrator\Desktop\Projects\KwakoPos v2.0.0')
EXTS = {'.ts','.tsx','.js','.jsx','.css','.html','.json','.md','.yml','.yaml'}
SKIP = {'node_modules','.git','dist','artifacts','.vite'}
SUSPECT = set('ÃÂâð�€™œšžž‚†‡‰�')
SUSPECT.update(chr(i) for i in range(0x80, 0xA0))
RUN_RE = re.compile(r'[^\s\x00-\x7f]*[' + re.escape('ÃÂâð�') + r'][^\s]*')


def reverse_layer(s: str) -> str:
    try:
        out = bytearray()
        for ch in s:
            o = ord(ch)
            if o < 256:
                out.append(o)
            else:
                out.extend(ch.encode('cp1252'))
        return bytes(out).decode('utf-8')
    except Exception:
        return s


def repair_run(run: str) -> str:
    cur = run
    for _ in range(4):
        nxt = reverse_layer(cur)
        if nxt == cur:
            break
        bad_cur = sum(c in 'ÃÂâð�' or 0x80 <= ord(c) < 0xA0 for c in cur)
        bad_nxt = sum(c in 'ÃÂâð�' or 0x80 <= ord(c) < 0xA0 for c in nxt)
        if bad_nxt >= bad_cur:
            break
        cur = nxt
    return cur


def repair_text(text: str) -> str:
    def repl(m):
        r = m.group(0)
        return repair_run(r)
    return RUN_RE.sub(repl, text)

changed = []
for p in ROOT.rglob('*'):
    if not p.is_file() or p.suffix.lower() not in EXTS or any(x in p.parts for x in SKIP):
        continue
    try:
        s = p.read_text(encoding='utf-8')
    except UnicodeDecodeError:
        continue
    t = repair_text(s)
    if t != s:
        p.write_text(t, encoding='utf-8', newline='')
        changed.append((str(p), s.count('Ã')+s.count('Â')+s.count('â'), t.count('Ã')+t.count('Â')+t.count('â')))
print('changed', len(changed))
for row in changed:
    print(row[0], row[1], '->', row[2])
