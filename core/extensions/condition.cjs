// Small typed expression grammar. No JavaScript evaluation or property traversal.
function compileCondition(source, types) {
  if (typeof source !== 'string' || !source.length || source.length > 1000) throw new Error('Invalid condition length');
  const tokens = []; let offset = 0;
  const pattern = /\s*(===|!==|==|!=|<=|>=|&&|\|\||[!()<>]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|-?(?:0|[1-9]\d*)(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_.-]*)/y;
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break;
    pattern.lastIndex = offset; const match = pattern.exec(source);
    if (!match) throw new Error(`Invalid condition token at ${offset}`);
    tokens.push(match[1]); offset = pattern.lastIndex;
  }
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function atom() {
    const token = take();
    if (token === '(') { const node = or(); if (take() !== ')') throw new Error('Missing closing parenthesis'); return node; }
    if (token === '!') { const node = atom(); boolean(node); return { type: 'boolean', run: values => !node.run(values) }; }
    if (token === 'true' || token === 'false') return { type: 'boolean', run: () => token === 'true' };
    if (/^-?\d/.test(token || '')) { const value = Number(token); if (!Number.isFinite(value)) throw new Error('Invalid number'); return { type: 'number', run: () => value }; }
    if (token?.startsWith('"') || token?.startsWith("'")) {
      // Only quote/backslash escapes; reject accidental JS escape syntax.
      const quote = token[0]; let value = '';
      for (let i = 1; i < token.length - 1; i++) {
        if (token[i] === '\\') { i++; if (token[i] !== quote && token[i] !== '\\') throw new Error('Invalid string escape'); }
        value += token[i];
      }
      return { type: 'string', run: () => value };
    }
    if (!Object.hasOwn(types, token)) throw new Error(`Unknown context key: ${token}`);
    return { type: types[token], run: values => { if (!Object.hasOwn(values, token) || typeof values[token] !== types[token]) throw new Error(`Missing/invalid context value: ${token}`); return values[token]; } };
  }
  function boolean(node) { if (node.type !== 'boolean') throw new Error('Boolean condition required'); }
  function comparison() {
    const left = atom();
    if (!['==', '!=', '===', '!==', '<', '>', '<=', '>='].includes(peek())) return left;
    const op = take(), right = atom();
    if (left.type !== right.type || (['<', '>', '<=', '>='].includes(op) && left.type !== 'number')) throw new Error('Condition comparison type mismatch');
    return { type: 'boolean', run: values => {
      const a = left.run(values), b = right.run(values);
      return ({ '==': () => a === b, '===': () => a === b, '!=': () => a !== b, '!==': () => a !== b, '<': () => a < b, '>': () => a > b, '<=': () => a <= b, '>=': () => a >= b })[op]();
    } };
  }
  function and() { let node = comparison(); while (peek() === '&&') { take(); const left = node, right = comparison(); boolean(left); boolean(right); node = { type: 'boolean', run: v => left.run(v) && right.run(v) }; } return node; }
  function or() { let node = and(); while (peek() === '||') { take(); const left = node, right = and(); boolean(left); boolean(right); node = { type: 'boolean', run: v => left.run(v) || right.run(v) }; } return node; }
  const root = or(); boolean(root); if (index !== tokens.length) throw new Error('Unexpected condition token');
  return values => root.run(values);
}
module.exports = { compileCondition };
