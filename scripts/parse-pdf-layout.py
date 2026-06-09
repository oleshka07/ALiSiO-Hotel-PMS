import re, subprocess, sys

# Generate bbox HTML to stdout then parse it
result = subprocess.run(
    ['pdftotext', '-f', '1', '-l', '1', '-bbox', '/tmp/reference.pdf', '-'],
    capture_output=True, text=True
)
content = result.stdout

words = re.findall(
    r'<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]+)</word>',
    content
)

results = []
for x1, y1, x2, y2, txt in [(float(a), float(b), float(c), float(d), e) for a,b,c,d,e in words]:
    results.append((y1, x1, x2-x1, y2-y1, txt))

results.sort(key=lambda r: (round(r[0]/4)*4, r[1]))

for y, x, w, h, txt in results:
    print(f"y={y:6.1f} x={x:6.1f} h={h:.0f}  |  {txt}")
