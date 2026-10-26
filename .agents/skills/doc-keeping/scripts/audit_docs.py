"""Read-only structural audit of repository documentation; no third-party dependencies."""
import argparse
from collections import Counter, deque
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote


def heading_ids(text):
    counts = Counter()
    ids = set()
    in_fence = False
    for line in text.splitlines():
        if line.lstrip().startswith(('```', '~~~')):
            in_fence = not in_fence
        if in_fence:
            continue
        match = re.match(r'^#{1,6}\s+(.+?)\s*#*$', line)
        if not match:
            continue
        slug = re.sub(r'<[^>]*>', '', match[1]).lower().replace('`', '')
        slug = re.sub(r'[^\w\- ]', '', slug).replace(' ', '-')
        count = counts[slug]
        ids.add(slug + (f'-{count}' if count else ''))
        counts[slug] += 1
    ids.update(re.findall(r'(?:id|name)=["\']([^"\']+)["\']', text))
    return ids


def audit(root):
    result = subprocess.run(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', 'docs'],
        cwd=root, capture_output=True, check=True,
    )
    docs = {(root / name).resolve() for name in result.stdout.decode('utf-8').split('\0')
            if name and (root / name).is_file()}
    extras = {root / 'README.md', root / 'AGENTS.md',
              root / '.agents/skills/doc-keeping/SKILL.md'}
    markdown = {p for p in docs | extras if p.suffix == '.md' and p.is_file()}
    contents = {p: p.read_text(encoding='utf-8') for p in markdown}
    graph = {}
    errors = []
    external = set()
    links = 0
    for path, content in contents.items():
        targets = set()
        for match in re.finditer(r'\[[^\]\n]*\]\(([^\)\n]+)\)', content):
            target = re.split(r'\s+["\']', match[1], maxsplit=1)[0].strip('<>')
            if '://' in target or target.startswith(('mailto:', 'data:')):
                continue
            name, _, anchor = target.partition('#')
            # Codex source links may include a one-based line suffix.
            name = re.sub(r':\d+$', '', unquote(name))
            dest = (path.parent / name).resolve() if name else path
            links += 1
            label = f'{path.relative_to(root)}: {target}'
            if not dest.is_relative_to(root):
                external.add(label)
                continue
            if not dest.exists():
                errors.append('Missing target: ' + label)
                continue
            targets.add(dest)
            if anchor and dest in contents and unquote(anchor) not in heading_ids(contents[dest]):
                errors.append('Missing anchor: ' + label)
        graph[path] = targets
    reached = set()
    queue = deque([root / 'docs/README.md'])
    while queue:
        path = queue.popleft()
        if path in reached:
            continue
        reached.add(path)
        queue.extend(graph.get(path, set()) - reached)
    for path in sorted(docs - reached):
        errors.append(f'Not reachable from docs/README.md: {path.relative_to(root)}')
    for folder in sorted({p.parent for p in docs}):
        count = sum(p.is_file() for p in folder.iterdir())
        if count > 20:
            errors.append(f'File limit: {folder.relative_to(root)} has {count} files (maximum 20)')
    print(f'Inventory: {len(docs)} docs artifacts; {len(markdown)} Markdown files checked; {links} local links/anchors.')
    for label in sorted(external):
        print('External local dependency (not validated): ' + label)
    for error in errors:
        print(error)
    if errors:
        print(f'FAIL: {len(errors)} structural issue(s).')
        return 1
    print('PASS: local links/anchors, index reachability and directory file limits.')
    print('Factual accuracy, historical measurements and live acceptance require evidence review.')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[4])
    args = parser.parse_args()
    sys.exit(audit(args.root.resolve()))
