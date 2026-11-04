#!/usr/bin/env python3
"""Add new src/*.js modules to index.html (before a given script) and to the service worker cache list.
Usage: tools/register.py <before-module> <new-module> [<new-module> ...]   e.g. tools/register.py shell errors"""
import re, sys
before, mods = sys.argv[1], sys.argv[2:]
idx = open('index.html').read()
sw = open('sw.js').read()
for m in mods:
    tag = f'<script src="src/{m}.js"></script>'
    if tag not in idx:
        anchor = f'<script src="src/{before}.js"></script>'
        i = idx.index(anchor)
        line_start = idx.rindex('\n', 0, i) + 1
        indent = idx[line_start:i]
        idx = idx[:line_start] + indent + tag + '\n' + idx[line_start:]
    entry = f"'./src/{m}.js'"
    if entry not in sw:
        sw = sw.replace("'./src/app.js'", f"{entry}, './src/app.js'", 1)
n = int(re.search(r"athleteos-v(\d+)", sw).group(1))
sw = re.sub(r"athleteos-v\d+", f"athleteos-v{n+1}", sw, count=1)
open('index.html', 'w').write(idx)
open('sw.js', 'w').write(sw)
print('registered', mods, 'cache v', n + 1)
