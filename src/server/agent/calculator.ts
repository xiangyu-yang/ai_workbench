/**
 * 安全表达式求值（不使用 eval）：支持 + - * / % ^、括号、一元负号与常用函数。
 */
export function evaluateExpression(input: string): number {
  if (!input || input.length > 400) throw new Error('表达式为空或过长');
  if (!/^[0-9+\-*/%^().,\s a-z]+$/i.test(input)) throw new Error('表达式包含非法字符');

  let pos = 0;
  const src = input.replace(/\s+/g, '').toLowerCase();

  const peek = () => src[pos];
  const eat = (ch: string) => {
    if (src[pos] === ch) {
      pos++;
      return true;
    }
    return false;
  };

  function parseExpression(): number {
    let value = parseTerm();
    while (true) {
      if (eat('+')) value += parseTerm();
      else if (eat('-')) value -= parseTerm();
      else break;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parsePower();
    while (true) {
      if (eat('*')) value *= parsePower();
      else if (eat('/')) {
        const divisor = parsePower();
        if (divisor === 0) throw new Error('除数不能为 0');
        value /= divisor;
      } else if (eat('%')) {
        const divisor = parsePower();
        if (divisor === 0) throw new Error('除数不能为 0');
        value %= divisor;
      } else break;
    }
    return value;
  }

  function parsePower(): number {
    const base = parseUnary();
    if (eat('^')) return Math.pow(base, parsePower());
    return base;
  }

  function parseUnary(): number {
    if (eat('-')) return -parseUnary();
    if (eat('+')) return parseUnary();
    return parsePrimary();
  }

  function parsePrimary(): number {
    if (eat('(')) {
      const value = parseExpression();
      if (!eat(')')) throw new Error('缺少右括号');
      return value;
    }
    if (/[a-z]/.test(peek() || '')) {
      let name = '';
      while (/[a-z]/.test(peek() || '')) name += src[pos++];
      if (!eat('(')) throw new Error(`函数 ${name} 需要括号`);
      const args: number[] = [];
      if (!eat(')')) {
        do {
          args.push(parseExpression());
        } while (eat(','));
        if (!eat(')')) throw new Error('函数缺少右括号');
      }
      return applyFunction(name, args);
    }
    let num = '';
    while (/[0-9.]/.test(peek() || '')) num += src[pos++];
    if (!num) throw new Error(`无法解析字符：${peek() || 'EOF'}`);
    const value = Number(num);
    if (!Number.isFinite(value)) throw new Error('数字格式错误');
    return value;
  }

  const result = parseExpression();
  if (pos !== src.length) throw new Error(`表达式存在多余内容：${src.slice(pos, pos + 12)}`);
  if (!Number.isFinite(result)) throw new Error('计算结果不是有限数值');
  return result;
}

function applyFunction(name: string, args: number[]): number {
  const [a, b] = args;
  switch (name) {
    case 'sqrt':
      if (a < 0) throw new Error('sqrt 参数不能为负');
      return Math.sqrt(a);
    case 'abs':
      return Math.abs(a);
    case 'round':
      return Math.round(a);
    case 'floor':
      return Math.floor(a);
    case 'ceil':
      return Math.ceil(a);
    case 'min':
      return Math.min(...args);
    case 'max':
      return Math.max(...args);
    case 'pow':
      return Math.pow(a, b);
    case 'log':
      return Math.log(a);
    default:
      throw new Error(`不支持的函数：${name}`);
  }
}
