with open('main.js', 'r', encoding='utf-8') as f:
    code = f.read()

s1 = "const configA = { id: 'A', startX: 150, startY: 300, color: '#2ecc71', keys: { up: 'w', down: 's', left: 'a', right: 'd', skill1: '1', skill2: '2', skill3: '3', skill4: '4', skill5: '5' } };\nconst configB = { id: 'B', startX: 850, startY: 300, color: '#e74c3c', keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', skill1: '8', skill2: '9', skill3: '0', skill4: '-', skill5: '=' } };"

print(s1 in code)
