"use strict";
var TTRPGBundle = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/engine/browser.ts
  var browser_exports = {};
  __export(browser_exports, {
    TTRPG: () => TTRPG,
    default: () => browser_default
  });

  // src/engine/loader.ts
  function extractBaseName(filename) {
    return filename.replace(/^.*[\\\/]/, "").replace(/\.(yaml|yml)$/, "");
  }
  var TableLoader = class {
    constructor() {
      // Index by filename (basename key) and tablename
      this.tablesByFilename = /* @__PURE__ */ new Map();
      this.tablesByName = /* @__PURE__ */ new Map();
      this.allTables = [];
    }
    /**
     * Loads tables from a pre-compiled JSON file path, JSON string, or parsed table array.
     */
    loadFromJSON(source) {
      try {
        let tables;
        if (Array.isArray(source)) {
          tables = source;
        } else if (typeof source === "string" && source.trim().startsWith("[")) {
          tables = JSON.parse(source);
        } else if (typeof source === "string") {
          const fs = typeof __require !== "undefined" ? __require("fs") : null;
          if (!fs) {
            console.error("File system access not available in browser. Pass parsed array or JSON string.");
            return;
          }
          const content = fs.readFileSync(source, "utf8");
          tables = JSON.parse(content);
        } else {
          console.error("Invalid tables data format.");
          return;
        }
        if (Array.isArray(tables)) {
          tables.forEach((t) => this.processTable(t));
          console.log(`Loaded ${tables.length} tables into index.`);
        } else {
          console.error("Invalid tables.json format: expected array.");
        }
      } catch (e) {
        console.error(`Failed to load tables: ${e.message}`);
      }
    }
    /**
     * Indexes already-parsed tables (e.g. from the compiler, tests, or browser storage).
     */
    loadTables(tables) {
      tables.forEach((t) => this.processTable(t));
    }
    /**
     * Helper to process valid table objects into the index.
     */
    processTable(t) {
      if (!t) return;
      if (t.filename) {
        if (!this.tablesByFilename.has(t.filename)) {
          this.tablesByFilename.set(t.filename, t);
          const baseName = extractBaseName(t.filename);
          this.tablesByFilename.set(baseName, t);
        }
      }
      this.allTables.push(t);
      if (t.tablename) {
        this.tablesByName.set(t.tablename, t);
      }
      this.indexSubTables(t);
    }
    /**
     * Recursively indexes all subtables within a table.
     */
    indexSubTables(table) {
      const subList = table.subTables || table.subtables;
      const subtableLists = [table.tables, subList];
      for (const list of subtableLists) {
        if (Array.isArray(list)) {
          for (const sub of list) {
            if (sub && sub.tablename) {
              if (!this.tablesByName.has(sub.tablename)) {
                this.tablesByName.set(sub.tablename, sub);
              }
            }
            this.indexSubTables(sub);
          }
        }
      }
    }
    /**
     * DEPRECATED: Use loadFromJSON instead.
     */
    loadFromDirectory(dir) {
      console.warn("loadFromDirectory is DEPRECATED. Please use loadFromJSON.");
    }
    getTableByFilename(filename) {
      return this.tablesByFilename.get(filename);
    }
    getTableByName(name) {
      let table = this.tablesByName.get(name);
      if (table) return table;
      return void 0;
    }
    getAllTables() {
      return this.allTables;
    }
    // Deep search for a table/subtable by name
    findTable(name) {
      if (this.tablesByName.has(name)) return this.tablesByName.get(name);
      if (this.tablesByFilename.has(name)) return this.tablesByFilename.get(name);
      if (!name.endsWith(".yaml") && !name.endsWith(".yml")) {
        if (this.tablesByFilename.has(name + ".yaml")) return this.tablesByFilename.get(name + ".yaml");
        if (this.tablesByFilename.has(name + ".yml")) return this.tablesByFilename.get(name + ".yml");
      }
      for (const table of this.allTables) {
        const found = this.findSubTable(table, name);
        if (found) return found;
      }
      return void 0;
    }
    findSubTable(table, name) {
      if (table.tablename === name || table.name === name) return table;
      const subList = table.subTables || table.subtables;
      if (subList) {
        for (const sub of subList) {
          const found = this.findSubTable(sub, name);
          if (found) return found;
        }
      }
      if (table.tables) {
        for (const sub of table.tables) {
          const found = this.findSubTable(sub, name);
          if (found) return found;
        }
      }
      if (subList) {
        const found = subList.find((s) => s.tablename && s.tablename.toLowerCase().includes(name.toLowerCase()));
        if (found) return found;
      }
      if (table.tables) {
        const found = table.tables.find((s) => s.tablename && s.tablename.toLowerCase().includes(name.toLowerCase()));
        if (found) return found;
      }
      return void 0;
    }
  };

  // src/engine/rng.ts
  function xmur3(str2) {
    let h = 1779033703 ^ str2.length;
    for (let i = 0; i < str2.length; i++) {
      h = Math.imul(h ^ str2.charCodeAt(i), 3432918353);
      h = h << 13 | h >>> 19;
    }
    return function() {
      h = Math.imul(h ^ h >>> 16, 2246822507);
      h = Math.imul(h ^ h >>> 13, 3266489909);
      return (h ^= h >>> 16) >>> 0;
    };
  }
  function mulberry32(a) {
    return function() {
      var t = a += 1831565813;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var RNG = class {
    constructor(seed) {
      if (seed) {
        const seedFunc = xmur3(seed);
        this.rng = mulberry32(seedFunc());
      } else {
        this.rng = Math.random;
      }
    }
    // Returns float between 0 and 1
    nextFloat() {
      return this.rng();
    }
    // Returns integer between min and max (inclusive)
    nextInt(min, max) {
      return Math.floor(this.rng() * (max - min + 1)) + min;
    }
    choice(list) {
      if (list.length === 0) throw new Error("Cannot choose from empty list");
      return list[this.nextInt(0, list.length - 1)];
    }
    weightedChoice(list) {
      const totalWeight = list.reduce((sum, item) => sum + item.weight, 0);
      let randomVal = this.nextFloat() * totalWeight;
      for (const entry of list) {
        randomVal -= entry.weight;
        if (randomVal <= 0) {
          return entry.item;
        }
      }
      return list[list.length - 1].item;
    }
  };

  // src/engine/dice.ts
  var Dice = class {
    constructor(rng) {
      this.rng = rng;
    }
    // Parses string like "3d6+1", "1d20", "2d8-5"
    // Returns result number
    roll(expression) {
      const match = expression.match(/^(\d+)d(\d+)(?:([+-])(\d+))?$/i);
      if (!match) {
        throw new Error(`Invalid dice expression: ${expression}`);
      }
      const count = parseInt(match[1], 10);
      const sides = parseInt(match[2], 10);
      const operator = match[3];
      const modifier = match[4] ? parseInt(match[4], 10) : 0;
      let total = 0;
      for (let i = 0; i < count; i++) {
        total += this.rng.nextInt(1, sides);
      }
      if (operator === "+") {
        total += modifier;
      } else if (operator === "-") {
        total -= modifier;
      }
      return total;
    }
  };

  // src/engine/expr.ts
  var ExpressionEvaluator = class {
    // Evaluates "10 + 5", "TestInput * 2", "100 / 0", "Dice > 5"
    // Valid tokens: numbers, +, -, *, /, %, >, <, >=, <=, ==, !=, (, ), identifiers
    evaluate(expr, context) {
      const tokens = this.tokenize(expr);
      if (tokens.length === 0) return 0;
      const activeTokens = tokens.map((t) => {
        if (this.isNumber(t)) return parseFloat(t);
        if (this.isOperator(t) || t === "(" || t === ")") return t;
        const val = context[t];
        if (val === void 0) {
          return 0;
        }
        return Number(val);
      });
      try {
        return this.calculate(activeTokens);
      } catch (e) {
        console.warn(`Math error in "${expr}":`, e);
        return 0;
      }
    }
    isNumber(s) {
      return !isNaN(parseFloat(s)) && isFinite(parseFloat(s));
    }
    isOperator(s) {
      return ["+", "-", "*", "/", "%", ">", "<", ">=", "<=", "==", "!="].includes(s);
    }
    tokenize(expr) {
      const pattern = /(>=|<=|==|!=|[+\-*/%><()]|[a-zA-Z0-9_.]+|"[^"]*")/g;
      const matches = expr.match(pattern);
      return matches ? matches : [];
    }
    // Shunting-yard algorithm to RPN then evaluate
    calculate(tokens) {
      const outputQueue = [];
      const operatorStack = [];
      const precedence = {
        "*": 3,
        "/": 3,
        "%": 3,
        "+": 2,
        "-": 2,
        ">": 1,
        "<": 1,
        ">=": 1,
        "<=": 1,
        "==": 1,
        "!=": 1
      };
      for (const token of tokens) {
        if (typeof token === "number") {
          outputQueue.push(token);
        } else if (token === "(") {
          operatorStack.push(token);
        } else if (token === ")") {
          while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== "(") {
            outputQueue.push(operatorStack.pop());
          }
          operatorStack.pop();
        } else if (this.isOperator(token)) {
          const op = token;
          while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== "(" && (precedence[operatorStack[operatorStack.length - 1]] || 0) >= (precedence[op] || 0)) {
            outputQueue.push(operatorStack.pop());
          }
          operatorStack.push(op);
        }
      }
      while (operatorStack.length > 0) {
        outputQueue.push(operatorStack.pop());
      }
      const evalStack = [];
      for (const token of outputQueue) {
        if (typeof token === "number") {
          evalStack.push(token);
        } else {
          const b = evalStack.pop();
          const a = evalStack.pop();
          if (a === void 0 || b === void 0) throw new Error("Invalid expression");
          switch (token) {
            case "+":
              evalStack.push(a + b);
              break;
            case "-":
              evalStack.push(a - b);
              break;
            case "*":
              evalStack.push(a * b);
              break;
            case "/":
              evalStack.push(b === 0 ? 0 : a / b);
              break;
            case "%":
              evalStack.push(a % b);
              break;
            case ">":
              evalStack.push(a > b ? 1 : 0);
              break;
            case "<":
              evalStack.push(a < b ? 1 : 0);
              break;
            case ">=":
              evalStack.push(a >= b ? 1 : 0);
              break;
            case "<=":
              evalStack.push(a <= b ? 1 : 0);
              break;
            case "==":
              evalStack.push(a === b ? 1 : 0);
              break;
            case "!=":
              evalStack.push(a !== b ? 1 : 0);
              break;
          }
        }
      }
      return evalStack.length > 0 ? evalStack[0] : 0;
    }
  };

  // src/engine/referenceTables.ts
  var ReferenceTableHandler = class {
    lookup(table, key) {
      const strKey = String(key);
      const numKey = parseFloat(strKey);
      const isNum = !isNaN(numKey);
      for (const entry of table.entries) {
        if (String(entry.key) === strKey) return entry.value;
        if (isNum && parseFloat(String(entry.key)) === numKey) return entry.value;
        if (isNum && typeof entry.key === "string" && entry.key.includes("-") && !entry.key.startsWith("-")) {
          const parts = entry.key.split("-");
          if (parts.length === 2) {
            const min = parseFloat(parts[0]);
            const max = parseFloat(parts[1]);
            if (!isNaN(min) && !isNaN(max) && numKey >= min && numKey <= max) {
              return entry.value;
            }
          }
        }
        if (isNum && typeof entry.key === "string") {
          if (entry.key.startsWith("<=")) {
            const val = parseFloat(entry.key.substring(2));
            if (!isNaN(val) && numKey <= val) return entry.value;
          } else if (entry.key.endsWith("<=")) {
            const val = parseFloat(entry.key.substring(0, entry.key.length - 2));
            if (!isNaN(val) && numKey >= val) return entry.value;
          }
          const plus = entry.key.match(/^\s*(-?\d+(?:\.\d+)?)\s*\+\s*$/);
          if (plus && numKey >= parseFloat(plus[1])) return entry.value;
        }
      }
      return "[Reference lookup failed]";
    }
  };

  // src/engine/template.ts
  function splitTopLevelCommas(str2) {
    const parts = [];
    let current = "";
    let braces = 0;
    let brackets = 0;
    for (const c of str2) {
      if (c === "{") braces++;
      else if (c === "}") braces--;
      else if (c === "[") brackets++;
      else if (c === "]") brackets--;
      else if (c === "," && braces === 0 && brackets === 0) {
        parts.push(current);
        current = "";
        continue;
      }
      current += c;
    }
    parts.push(current);
    return parts;
  }
  function findClose(str2, start, open, close) {
    let depth = 1;
    for (let i = start + 1; i < str2.length; i++) {
      if (str2[i] === open) depth++;
      else if (str2[i] === close) depth--;
      if (depth === 0) return i;
    }
    return -1;
  }
  function isDynamic(nodes) {
    return nodes.some((n) => n.kind !== "text");
  }
  function staticText(nodes) {
    if (isDynamic(nodes)) return void 0;
    return nodes.map((n) => n.value).join("");
  }
  function parseTemplate(str2, offset = 0) {
    const nodes = [];
    let text = "";
    let textStart = 0;
    let index = 0;
    const pushText = (s, at) => {
      if (!text) textStart = at;
      text += s;
    };
    const flushText = () => {
      if (text) nodes.push({ kind: "text", value: text, start: offset + textStart, end: offset + textStart + text.length });
      text = "";
    };
    while (index < str2.length) {
      const nextBrace = str2.indexOf("{", index);
      const nextBracket = str2.indexOf("[", index);
      if (nextBrace === -1 && nextBracket === -1) {
        pushText(str2.substring(index), index);
        break;
      }
      const isBrace = nextBrace !== -1 && (nextBracket === -1 || nextBrace < nextBracket);
      const start = isBrace ? nextBrace : nextBracket;
      if (start > index) pushText(str2.substring(index, start), index);
      const end = isBrace ? findClose(str2, start, "{", "}") : findClose(str2, start, "[", "]");
      if (end === -1) {
        pushText(str2[start], start);
        index = start + 1;
        continue;
      }
      const raw = str2.substring(start, end + 1);
      const inner = str2.substring(start + 1, end);
      const innerOffset = offset + start + 1;
      const span = { start: offset + start, end: offset + end + 1 };
      if (isBrace) {
        flushText();
        if (inner.startsWith("useReferenceTable")) {
          nodes.push(parseReferenceTable(raw, inner, innerOffset, span));
        } else {
          const children = parseTemplate(inner, innerOffset);
          nodes.push({ kind: "expression", raw, inner, children, staticToken: staticText(children), ...span });
        }
      } else {
        const prevChar = text.length > 0 ? text[text.length - 1] : nodes.length === 0 ? "" : "\0";
        if (/^\d+$/.test(inner) && /[a-zA-Z0-9_]/.test(prevChar)) {
          pushText(raw, start);
        } else {
          flushText();
          nodes.push(parseBracket(str2, raw, inner, innerOffset, span, start === 0 && end === str2.length - 1));
        }
      }
      index = end + 1;
    }
    flushText();
    return nodes;
  }
  function parseReferenceTable(raw, inner, innerOffset, span) {
    let cursor = "useReferenceTable".length;
    const extractArg = () => {
      if (cursor >= inner.length || inner[cursor] !== "{") return null;
      const close = findClose(inner, cursor, "{", "}");
      if (close === -1) return null;
      const arg = { text: inner.substring(cursor + 1, close), at: cursor + 1 };
      cursor = close + 1;
      return arg;
    };
    const table = extractArg();
    const key = extractArg();
    if (!table || !key) {
      return { kind: "invalid", raw, reason: "useReferenceTable requires two arguments: {useReferenceTable{Table}{Key}}", ...span };
    }
    const tableArg = parseTemplate(table.text, innerOffset + table.at);
    const keyArg = parseTemplate(key.text, innerOffset + key.at);
    return {
      kind: "referenceTable",
      raw,
      tableArg,
      keyArg,
      staticTable: staticText(tableArg),
      staticKey: staticText(keyArg),
      ...span
    };
  }
  function parseParts(content, contentOffset) {
    let cursor = 0;
    return splitTopLevelCommas(content).map((part) => {
      const nodes = parseTemplate(part, contentOffset + cursor);
      cursor += part.length + 1;
      return nodes;
    });
  }
  function parseBracket(_src, raw, inner, innerOffset, span, isWholeString) {
    if (inner.startsWith("set:")) {
      const parts = splitTopLevelCommas(inner.substring(4));
      if (parts.length < 2) return { kind: "invalid", raw, reason: "set requires a name and a value: [set:Name, value]", ...span };
      const valueSrc = parts.slice(1).join(",");
      const valueOffset = innerOffset + 4 + parts[0].length + 1;
      return { kind: "set", raw, name: parts[0].trim(), value: parseTemplate(valueSrc.trim(), valueOffset + (valueSrc.length - valueSrc.trimStart().length)), ...span };
    }
    if (inner.startsWith("if:")) {
      const parts = parseParts(inner.substring(3), innerOffset + 3);
      if (parts.length < 2) return { kind: "invalid", raw, reason: "if requires a condition and a value: [if:cond, then, else]", ...span };
      return { kind: "if", raw, condition: parts[0], then: parts[1], else: parts[2] || [], ...span };
    }
    if (isWholeString && inner.includes("thisResult")) {
      return { kind: "sequence", raw, items: parseParts(inner, innerOffset), ...span };
    }
    return { kind: "choice", raw, children: parseTemplate(inner, innerOffset), ...span };
  }
  function walkTemplate(nodes, visit) {
    for (const node of nodes) {
      visit(node);
      switch (node.kind) {
        case "expression":
          walkTemplate(node.children, visit);
          break;
        case "referenceTable":
          walkTemplate(node.tableArg, visit);
          walkTemplate(node.keyArg, visit);
          break;
        case "choice":
          walkTemplate(node.children, visit);
          break;
        case "set":
          walkTemplate(node.value, visit);
          break;
        case "if":
          walkTemplate(node.condition, visit);
          walkTemplate(node.then, visit);
          walkTemplate(node.else, visit);
          break;
        case "sequence":
          node.items.forEach((item) => walkTemplate(item, visit));
          break;
      }
    }
  }
  var DICE_PATTERN = /^(\d+)d(\d+)(?:([+-])(\d+))?$/i;

  // src/engine/card.ts
  var nextNodeId = 1;
  function generateNodeId() {
    return `node_${Date.now()}_${nextNodeId++}_${Math.random().toString(36).substring(2, 7)}`;
  }
  function generateCardId() {
    return `card_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  function createResultNode(params) {
    const tokens = params.rawExpression ? parseTemplate(params.rawExpression) : void 0;
    return {
      id: generateNodeId(),
      label: params.label,
      displayValue: params.displayValue,
      generator: {
        sourceFile: params.sourceFile,
        tableName: params.tableName,
        rawExpression: params.rawExpression,
        tokens
      },
      history: [
        {
          rolledAt: Date.now(),
          value: params.displayValue
        }
      ],
      locked: params.locked ?? false,
      dependencies: params.dependencies,
      provides: params.provides,
      children: params.children
    };
  }
  function createCardFromResult(result, source, context = {}, title) {
    const cardId = generateCardId();
    const nodes = transformGeneratedResultToNodes(result, source.file);
    return {
      id: cardId,
      title: title || result.header || source.tableName,
      source: {
        file: source.file,
        tableName: source.tableName
      },
      context: sanitizeContext(context),
      nodes,
      createdAt: Date.now()
    };
  }
  function sanitizeContext(ctx) {
    const clean = {};
    for (const [key, val] of Object.entries(ctx)) {
      if (key.startsWith("_")) continue;
      if (typeof val === "function") continue;
      clean[key] = val;
    }
    return clean;
  }
  function transformGeneratedResultToNodes(res, fallbackFile) {
    const nodes = [];
    const sourceFile = res._fileName || fallbackFile;
    const tableName = res._tableName || res.header;
    if (res._isSeparateRows && Array.isArray(res.result)) {
      res.result.forEach((line, i) => {
        const lineStr = String(line);
        nodes.push(createResultNode({
          label: `${res.header} #${i + 1}`,
          displayValue: lineStr,
          tableName,
          sourceFile,
          rawExpression: lineStr
        }));
      });
      return nodes;
    }
    if (res._isCareer && Array.isArray(res.result)) {
      const careerVal = String(res.result[0] ?? "");
      const itemsVal = String(res.result[1] ?? "");
      const careerNode = createResultNode({
        label: res.header,
        displayValue: careerVal,
        tableName,
        sourceFile,
        rawExpression: careerVal
      });
      const itemsNode = createResultNode({
        label: "Items",
        displayValue: itemsVal,
        tableName,
        sourceFile,
        rawExpression: itemsVal
      });
      careerNode.children = [itemsNode];
      nodes.push(careerNode);
      return nodes;
    }
    if (Array.isArray(res.result)) {
      const isNestedObjects = res.result.some((x) => x && typeof x === "object" && "header" in x && "result" in x);
      if (isNestedObjects) {
        for (const sub of res.result) {
          if (sub && typeof sub === "object" && "header" in sub) {
            const subNodes = transformGeneratedResultToNodes(sub, sourceFile);
            nodes.push(...subNodes);
          }
        }
        return nodes;
      }
      const display = res.result.map((x) => String(x)).join(", ");
      nodes.push(createResultNode({
        label: res.header,
        displayValue: display,
        tableName,
        sourceFile,
        rawExpression: display
      }));
      return nodes;
    }
    const displayStr = String(res.result ?? "");
    nodes.push(createResultNode({
      label: res.header,
      displayValue: displayStr,
      tableName,
      sourceFile,
      rawExpression: displayStr
    }));
    return nodes;
  }
  function serializeCard(card) {
    return JSON.stringify(card, null, 2);
  }
  function hydrateCard(json2) {
    const raw = typeof json2 === "string" ? JSON.parse(json2) : json2;
    if (!raw || typeof raw !== "object") {
      throw new Error("Invalid Card JSON: root must be an object");
    }
    if (!raw.id || typeof raw.id !== "string") {
      throw new Error('Invalid Card JSON: missing or invalid "id"');
    }
    if (!raw.title || typeof raw.title !== "string") {
      throw new Error('Invalid Card JSON: missing or invalid "title"');
    }
    if (!raw.source || typeof raw.source.tableName !== "string") {
      throw new Error('Invalid Card JSON: missing or invalid "source"');
    }
    if (!Array.isArray(raw.nodes)) {
      throw new Error('Invalid Card JSON: "nodes" must be an array');
    }
    const hydrateNode = (node) => {
      if (!node || typeof node !== "object") {
        throw new Error("Invalid ResultNode: must be an object");
      }
      if (!node.id || !node.label || node.displayValue === void 0) {
        throw new Error(`Invalid ResultNode: missing required properties (id, label, displayValue)`);
      }
      const rawExpr = node.generator?.rawExpression;
      const tokens = rawExpr ? parseTemplate(rawExpr) : node.generator?.tokens;
      return {
        id: node.id,
        label: node.label,
        displayValue: String(node.displayValue),
        generator: {
          sourceFile: node.generator?.sourceFile,
          tableName: node.generator?.tableName || node.label,
          rawExpression: rawExpr,
          tokens
        },
        history: Array.isArray(node.history) ? node.history : [{ rolledAt: Date.now(), value: String(node.displayValue) }],
        locked: Boolean(node.locked),
        dependencies: Array.isArray(node.dependencies) ? node.dependencies : void 0,
        provides: node.provides && typeof node.provides === "object" ? node.provides : void 0,
        children: Array.isArray(node.children) ? node.children.map(hydrateNode) : void 0
      };
    };
    return {
      id: raw.id,
      title: raw.title,
      source: {
        file: raw.source.file || "",
        tableName: raw.source.tableName
      },
      context: raw.context && typeof raw.context === "object" ? raw.context : {},
      nodes: raw.nodes.map(hydrateNode),
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now()
    };
  }
  function findNodeById(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return void 0;
  }
  function updateNodeValue(node, newValue) {
    node.displayValue = newValue;
    node.history.push({
      rolledAt: Date.now(),
      value: newValue
    });
  }
  function exportCardToMarkdown(card) {
    let md = `## ${card.title}
`;
    if (card.source.tableName && card.source.tableName !== card.title) {
      md += `*Source: ${card.source.tableName}*

`;
    } else {
      md += "\n";
    }
    const renderNodeMd = (node, indentLevel = 0) => {
      const indent = "  ".repeat(indentLevel);
      let out = `${indent}- **${node.label}**: ${node.displayValue}
`;
      if (node.children && node.children.length > 0) {
        for (const child of node.children) {
          out += renderNodeMd(child, indentLevel + 1);
        }
      }
      return out;
    };
    for (const node of card.nodes) {
      md += renderNodeMd(node, 0);
    }
    return md;
  }

  // src/engine/renderer.ts
  var Renderer = class {
    constructor(loader2, seed, timeoutMs = 5e3) {
      this.DEBUG = false;
      this.loader = loader2;
      this.rng = new RNG(seed);
      this.dice = new Dice(this.rng);
      this.expr = new ExpressionEvaluator();
      this.refHandler = new ReferenceTableHandler();
      this.timeoutMs = timeoutMs;
      this.startTime = Date.now();
    }
    generate(identifier, context = {}) {
      if (!context.memory) {
        context.memory = {};
      }
      const tracker = {
        depth: 0,
        tables: /* @__PURE__ */ new Set(),
        counts: /* @__PURE__ */ new Map(),
        maxDepth: 30
      };
      const rootTable = this.loader.findTable(identifier);
      if (!rootTable) {
        return {
          header: identifier,
          result: `[Table ${identifier} not found]`,
          _tableName: identifier
        };
      }
      this.startTime = Date.now();
      const res = this.processTable(rootTable, context, tracker);
      return { ...res, context };
    }
    /**
     * Generates a persistent, typed Card data model.
     */
    generateCard(identifier, context = {}, title) {
      const rootTable = this.loader.findTable(identifier);
      const genResult = this.generate(identifier, context);
      const sourceFile = rootTable?.filename || `${identifier}.yaml`;
      const sourceTable = rootTable?.tablename || identifier;
      return createCardFromResult(
        genResult,
        { file: sourceFile, tableName: sourceTable },
        genResult.context || context,
        title
      );
    }
    processTable(table, context, tracker, overrideResults) {
      if (Date.now() - this.startTime > this.timeoutMs) {
        throw new Error(`[Renderer Timeout] Execution exceeded ${this.timeoutMs}ms`);
      }
      const trackerId = `${table.filename || ""}:${table.tablename}`;
      const currentCount = tracker.counts.get(trackerId) || 0;
      if (currentCount >= 2) {
        return { header: table.tablename, result: `[Loop Limit: ${table.tablename}]` };
      }
      if (tracker.depth > tracker.maxDepth) {
        return { header: table.tablename, result: `[Max depth reached: ${table.tablename}]` };
      }
      const newCounts = new Map(tracker.counts);
      newCounts.set(trackerId, currentCount + 1);
      const newTracker = {
        depth: tracker.depth + 1,
        tables: new Set(tracker.tables).add(trackerId),
        counts: newCounts,
        maxDepth: tracker.maxDepth
      };
      const currentContext = { ...context, _currentTable: table };
      const header = table.tablename;
      const sourceInfo = {
        _tableName: table.tablename,
        _fileName: table.filename
      };
      if (table.customDisplay) {
        const display = this.processCustomDisplay(table.customDisplay, table, currentContext, newTracker);
        currentContext[header] = display;
        currentContext["thisResult"] = display;
        return {
          header,
          result: display,
          _hasCustomDisplay: true,
          ...sourceInfo
        };
      }
      const resultsToUse = overrideResults || table.results;
      if (table.tables && !resultsToUse) {
        const subResults = table.tables.map(
          (sub) => this.processTable(sub, currentContext, newTracker)
        );
        const separateLines = [];
        let allSeparate = true;
        for (const s of subResults) {
          if (s._isSeparateRows && Array.isArray(s.result)) {
            separateLines.push(...s.result);
          } else {
            allSeparate = false;
            break;
          }
        }
        if (allSeparate && subResults.length > 0) {
          return { header, result: separateLines, _isSeparateRows: true, ...sourceInfo };
        }
        const flattened = subResults.map((r) => r.result);
        currentContext[header] = flattened;
        return { header, result: subResults, ...sourceInfo };
      }
      if (resultsToUse) {
        const picked = this.pickResult(resultsToUse);
        const entry = picked.entry;
        const index = picked.index;
        const processed = this.processResultEntry(entry, table, currentContext, newTracker);
        let finalResult = processed.result;
        if (processed._isMultiElementArray && Array.isArray(finalResult)) {
          const directiveIndex = finalResult.findIndex((x) => x && typeof x === "object" && "roll" in x);
          if (directiveIndex !== -1) {
            const directive = finalResult[directiveIndex];
            const numRolls = directive.roll;
            const exclude = directive.exclude;
            const bonusResults = [];
            let subOptions = table.results;
            if (exclude) {
              subOptions = subOptions.filter((_, i) => i !== index);
            }
            for (let i = 0; i < numRolls; i++) {
              if (subOptions.length === 0) break;
              const subRes = this.processTable(table, currentContext, newTracker, subOptions);
              if (Array.isArray(subRes.result) && subRes._isMultiElementArray) {
                bonusResults.push(...subRes.result);
              } else {
                bonusResults.push(subRes.result);
              }
            }
            finalResult.splice(directiveIndex, 1);
            finalResult.push(...bonusResults);
          }
        }
        if (!processed._isSeparateRows) {
          currentContext[header] = finalResult;
          currentContext["thisResult"] = finalResult;
        }
        return {
          header,
          result: finalResult,
          _isCareer: processed._isCareer,
          _isMultiElementArray: processed._isMultiElementArray,
          _isSeparateRows: processed._isSeparateRows,
          ...sourceInfo
        };
      }
      return { header, result: "No results", ...sourceInfo };
    }
    // Helper to flatten results into a string for token replacement
    flattenResultToString(res) {
      if (typeof res === "string") return res;
      if (typeof res === "number") return String(res);
      if (Array.isArray(res)) {
        return res.map((r) => this.flattenResultToString(r)).join(", ");
      }
      if (typeof res === "object" && res !== null) {
        if ("result" in res) {
          return this.flattenResultToString(res.result);
        }
        try {
          return JSON.stringify(res);
        } catch (e) {
          return `[Complex Object: ${Object.keys(res).join(", ")}]`;
        }
      }
      return String(res);
    }
    pickResult(results) {
      const weightedList = [];
      results.forEach((r, i) => {
        let weight = 1;
        let item = r;
        if (Array.isArray(r) && r.length === 2 && typeof r[1] === "number") {
          const val = r[0];
          item = val;
          weight = r[1];
        }
        weightedList.push({ item: { entry: item, index: i }, weight });
      });
      const chosen = this.rng.weightedChoice(weightedList);
      return chosen;
    }
    reroll(table, header, context) {
      const currentContext = { ...context };
      const tracker = {
        depth: 0,
        tables: /* @__PURE__ */ new Set(),
        counts: /* @__PURE__ */ new Map(),
        maxDepth: 30
      };
      if (/[+\-*/]/.test(header)) {
        const expr = `{${header}}`;
        const res = this.processStringRecursive(expr, currentContext, tracker);
        return {
          header,
          result: res,
          _tableName: header
        };
      }
      let targetSubTable;
      if (table.tables) {
        targetSubTable = table.tables.find((t) => t.name === header || t.tablename === header);
      }
      if (!targetSubTable && table.subTables) {
        targetSubTable = table.subTables.find((t) => t.name === header || t.tablename === header);
      }
      if (!targetSubTable && table.tablename === header && table.tables && table.tables.length > 0) {
        targetSubTable = table.tables[0];
      }
      if (!targetSubTable && table.tables && table.tables.length === 1) {
        targetSubTable = table.tables[0];
      }
      if (!targetSubTable) {
        const lower = header.toLowerCase();
        if (table.tables) {
          targetSubTable = table.tables.find((t) => (t.name || t.tablename || "").toLowerCase() === lower);
        }
        if (!targetSubTable && table.subTables) {
          targetSubTable = table.subTables.find((t) => (t.name || t.tablename || "").toLowerCase() === lower);
        }
      }
      if (!targetSubTable && table.results) {
        targetSubTable = table;
      }
      if (targetSubTable) {
        currentContext._currentTable = targetSubTable;
        const res = this.processTable(targetSubTable, currentContext, tracker);
        return {
          ...res,
          header,
          context: currentContext
        };
      }
      return {
        header,
        result: `[Could not find subtable for header: ${header}]`
      };
    }
    processResultEntry(entry, table, context, tracker) {
      if (typeof entry === "object" && entry !== null && "separateRows" in entry) {
        const rows = entry.separateRows;
        const processedRows = rows.map((row) => {
          const rowContext = { ...context };
          if (typeof row === "string") {
            return this.processString(row, rowContext, tracker);
          } else {
            return JSON.stringify(row);
          }
        });
        return { header: "SeparateRows", result: processedRows, _isSeparateRows: true };
      }
      if (Array.isArray(entry)) {
        const processedArray = entry.map((e) => {
          if (typeof e === "string") return this.processString(e, context, tracker);
          return e;
        });
        const isCareer = processedArray.length === 2 && processedArray.every((x) => typeof x === "string");
        const isMulti = processedArray.length > 2 || processedArray.some((x) => typeof x === "object");
        return {
          header: "Array",
          result: processedArray,
          _isCareer: isCareer,
          _isMultiElementArray: isMulti
        };
      }
      if (typeof entry === "string") {
        return { header: "String", result: this.processString(entry, context, tracker) };
      }
      if (typeof entry === "object" && entry !== null) {
        const keys = Object.keys(entry);
        if (keys.length === 1) {
          const key = keys[0];
          const val = entry[key];
          const reconstructed = `${key}: ${val}`;
          return { header: "String", result: this.processString(reconstructed, context, tracker) };
        }
        return { header: "Object", result: JSON.stringify(entry) };
      }
      return { header: "Number", result: entry };
    }
    processString(template, context, tracker) {
      return this.processStringRecursive(template, context, tracker);
    }
    processStringRecursive(str2, context, tracker) {
      let index = 0;
      let result = "";
      let isBuildingString = true;
      let iterations = 0;
      const append = (val) => {
        if (isBuildingString) {
          if (typeof val === "object") {
            result += JSON.stringify(val);
          } else {
            result += val;
          }
        }
      };
      while (index < str2.length) {
        this.checkTimeout();
        if (++iterations > 1e3) {
          const msg = `[PSR] Infinite recursion protection hit for string: ${str2.substring(0, 100)}... (Length: ${str2.length})`;
          console.error(msg);
          throw new Error(msg);
        }
        const nextBrace = str2.indexOf("{", index);
        const nextBracket = str2.indexOf("[", index);
        let nextIndex = -1;
        let type2 = "";
        if (nextBrace === -1 && nextBracket === -1) {
          if (typeof result === "string") result += str2.substring(index);
          break;
        }
        if (nextBrace !== -1 && (nextBracket === -1 || nextBrace < nextBracket)) {
          nextIndex = nextBrace;
          type2 = "brace";
        } else {
          nextIndex = nextBracket;
          type2 = "bracket";
        }
        if (typeof result === "string") result += str2.substring(index, nextIndex);
        const start = nextIndex;
        let end = -1;
        let depth = 1;
        for (let i = start + 1; i < str2.length; i++) {
          if (str2[i] === (type2 === "brace" ? "{" : "[")) depth++;
          else if (str2[i] === (type2 === "brace" ? "}" : "]")) depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
        if (end === -1) {
          if (typeof result === "string") result += str2[start];
          index = start + 1;
          continue;
        }
        const content = str2.substring(start + 1, end);
        if (type2 === "brace") {
          if (content.startsWith("useReferenceTable")) {
            let cursor = "useReferenceTable".length;
            const extractArg = () => {
              if (cursor >= content.length || content[cursor] !== "{") return null;
              let depth2 = 1;
              let start2 = cursor;
              for (let i = cursor + 1; i < content.length; i++) {
                if (content[i] === "{") depth2++;
                if (content[i] === "}") depth2--;
                if (depth2 === 0) {
                  cursor = i + 1;
                  return content.substring(start2 + 1, i);
                }
              }
              return null;
            };
            const rawRef = extractArg();
            const rawKey = extractArg();
            if (rawRef && rawKey) {
              const refName = String(this.processStringRecursive(rawRef, context, tracker));
              let keyVal = String(this.processStringRecursive(rawKey, context, tracker));
              if (keyVal.includes("thisResult")) {
                const evaluated = this.evaluateToken(keyVal, context, tracker);
                if (typeof evaluated !== "string" || !evaluated.startsWith("[")) {
                  keyVal = String(evaluated);
                }
              }
              let foundTable = null;
              for (const t of this.loader.getAllTables()) {
                if (t.referenceTables) {
                  foundTable = t.referenceTables.find((rt) => rt.tablename === refName);
                  if (foundTable) break;
                }
              }
              if (foundTable) {
                if (typeof result === "string") result += this.refHandler.lookup(foundTable, keyVal);
              } else {
                if (typeof result === "string") result += `[ReferenceTable ${refName} not found]`;
              }
            } else {
              if (typeof result === "string") result += `[Invalid useReferenceTable syntax]`;
            }
          } else {
            const processedContent = this.processStringRecursive(content, context, tracker);
            const evalRes = this.evaluateToken(String(processedContent), context, tracker);
            if (typeof result === "string") {
              result += this.flattenResultToString(evalRes);
            }
          }
        } else {
          const isInteger2 = /^\d+$/.test(content);
          const prevChar = typeof result === "string" && result.length > 0 ? result[result.length - 1] : "";
          const looksLikeIndex = isInteger2 && /[a-zA-Z0-9_]/.test(prevChar);
          if (looksLikeIndex) {
            if (typeof result === "string") result += `[${content}]`;
          } else if (content.startsWith("set:")) {
            const parts = this.splitByCommaIgnoringGenerics(content.substring(4));
            if (parts.length >= 2) {
              const varName = parts[0].trim();
              const valueExpr = parts.slice(1).join(",").trim();
              const processedValue = this.processStringRecursive(valueExpr, context, tracker);
              if (context.memory) {
                context.memory[varName] = processedValue;
              } else {
                context[varName] = processedValue;
              }
              if (typeof result === "string") result += "";
            } else {
              if (typeof result === "string") result += `[Invalid set syntax]`;
            }
          } else if (content.startsWith("if:")) {
            const parts = this.splitByCommaIgnoringGenerics(content.substring(3));
            if (parts.length >= 2) {
              const condition = parts[0];
              const trueVal = parts[1];
              const falseVal = parts[2] || "";
              const condRes = this.evaluateToken(String(this.processStringRecursive(condition, context, tracker)), context, tracker);
              let isTrue = false;
              if (typeof condRes === "number") isTrue = condRes !== 0;
              else if (typeof condRes === "string") isTrue = condRes === "true" || condRes.length > 0 && condRes !== "false";
              else if (typeof condRes === "boolean") isTrue = condRes;
              if (isTrue) {
                if (typeof result === "string") result += this.processStringRecursive(trueVal, context, tracker);
              } else {
                if (typeof result === "string") result += this.processStringRecursive(falseVal, context, tracker);
              }
            }
          } else {
            const isWholeString = start === 0 && end === str2.length - 1;
            const hasDependency = content.includes("thisResult");
            if (isWholeString && hasDependency) {
              const items = this.splitByCommaIgnoringGenerics(content);
              const seqResults = [];
              const seqContext = { ...context };
              for (const item of items) {
                seqContext["thisResult"] = [...seqResults];
                const processedItem = this.processStringRecursive(item.trim(), seqContext, tracker);
                seqResults.push(processedItem);
              }
              return seqResults;
            } else {
              const processedContent = this.processStringRecursive(content, context, tracker);
              const valToAppend = String(processedContent);
              const choices = valToAppend.split(",").map((s) => s.trim());
              const pick = this.rng.choice(choices);
              if (typeof result === "string") result += pick;
            }
          }
        }
        index = end + 1;
      }
      return result;
    }
    splitByCommaIgnoringGenerics(str2) {
      const parts = [];
      let current = "";
      let depth = 0;
      let bracketDepth = 0;
      for (let i = 0; i < str2.length; i++) {
        const c = str2[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        else if (c === "[") bracketDepth++;
        else if (c === "]") bracketDepth--;
        else if (c === "," && depth === 0 && bracketDepth === 0) {
          parts.push(current);
          current = "";
          continue;
        }
        current += c;
      }
      parts.push(current);
      return parts;
    }
    evaluateToken(token, context, tracker) {
      this.checkTimeout();
      try {
        const roll = this.dice.roll(token);
        context["thisResult"] = roll;
        return roll;
      } catch (e) {
      }
      const probMatch = token.match(/^(.+?),\s*((?:0\.)?\d+)$/);
      if (probMatch) {
        const tableName = probMatch[1].trim();
        const prob = parseFloat(probMatch[2]);
        if (!isNaN(prob)) {
          if (this.rng.nextFloat() <= prob) {
            return this.evaluateToken(tableName, context, tracker);
          } else {
            return "";
          }
        }
      }
      if (/[+\-*/%<>=!]/.test(token) && !/\|/.test(token)) {
        return this.expr.evaluate(token, context);
      }
      if (token.startsWith("selectedResult,")) {
        const keyTable = token.substring("selectedResult,".length).trim();
        let table = this.loader.findTable(keyTable);
        if (!table && context._currentTable) {
          const sub = this.loader.findSubTable(context._currentTable, keyTable);
          if (sub) table = sub;
        }
        if (table) {
          const keyRes = this.processTable(table, context, tracker).result;
          const keyResStr = String(keyRes);
          let targetSub = this.loader.findTable(keyResStr);
          if (!targetSub && context._currentTable) {
            targetSub = this.loader.findSubTable(context._currentTable, keyResStr);
          }
          if (targetSub) {
            return String(this.processTable(targetSub, context, tracker).result);
          }
        }
        return `[${token} target not found]`;
      }
      const match = token.match(/^(.+?)(\[(\d+)\])?(?:\|(.+))?$/);
      if (match) {
        const base = match[1];
        const index = match[3] ? parseInt(match[3]) : -1;
        const sub = match[4];
        if (base in context) {
          const val = context[base];
          if (index !== -1 && Array.isArray(val)) return val[index];
          return val;
        }
        if (context.memory && base in context.memory) {
          const val = context.memory[base];
          if (index !== -1 && Array.isArray(val)) return val[index];
          return val;
        }
        if (base === "thisResult" && context.thisResult) {
          const val = context.thisResult;
          if (index !== -1 && Array.isArray(val)) return val[index];
          if (index !== -1 && !Array.isArray(val) && index === 0) return val;
          return val;
        }
        if (base in context) {
          return context[base];
        }
        let table = this.loader.findTable(base);
        if (!table && context._currentTable) {
          const sub2 = this.loader.findSubTable(context._currentTable, base);
          if (sub2) table = sub2;
        }
        if (table) {
          if (sub) {
            const foundSub = this.loader.findSubTable(table, sub);
            if (foundSub) table = foundSub;
          }
          const res = this.processTable(table, context, tracker);
          const val = res.result;
          context["thisResult"] = val;
          if (index !== -1) {
            if (Array.isArray(val)) return val[index];
            return `[Index ${index} invalid]`;
          }
          if (Array.isArray(val)) return this.flattenResultToString(val);
          return this.flattenResultToString(val);
        }
      }
      return `[${token} not found]`;
    }
    processCustomDisplay(template, table, context, tracker) {
      return String(this.processString(template, context, tracker));
    }
    checkTimeout(extraInfo) {
      if (Date.now() - this.startTime > this.timeoutMs) {
        if (extraInfo) console.error(extraInfo);
        throw new Error(`[Renderer Timeout] Execution exceeded ${this.timeoutMs}ms`);
      }
    }
  };

  // src/engine/execution.ts
  var ExecutionEngine = class {
    constructor(loader2, renderer) {
      this.loader = loader2;
      this.renderer = renderer || new Renderer(loader2);
    }
    /**
     * 3.1 Evaluates and returns micro-token positions within a node's raw expression.
     * Identifies embedded dice expressions like {1d6}, {{1d6}*10}, etc.
     */
    getMicroTokens(node) {
      const raw = node.generator.rawExpression;
      if (!raw) return [];
      const tokens = parseTemplate(raw);
      const results = [];
      walkTemplate(tokens, (t) => {
        if (t.kind === "expression") {
          const isDice = DICE_PATTERN.test(t.inner.trim());
          const isRollable = isDice || (t.staticToken ? DICE_PATTERN.test(t.staticToken) : false);
          results.push({
            raw: t.raw,
            evaluatedValue: t.inner,
            start: t.start,
            end: t.end,
            isRollable
          });
        }
      });
      return results;
    }
    /**
     * 3.1 Micro Re-roll: Re-evaluates only a single embedded dice token (or expression) within
     * a node without re-rolling the rest of the text, updates the node displayValue and history.
     */
    rerollMicroToken(card, nodeId, tokenRaw, tokenIndex = 0) {
      const node = findNodeById(card.nodes, nodeId);
      if (!node) {
        throw new Error(`Node with id "${nodeId}" not found in card`);
      }
      if (node.locked) {
        throw new Error(`Node "${node.label}" is locked`);
      }
      const rawExpr = node.generator.rawExpression || node.displayValue;
      const previousValue = node.displayValue;
      const tokens = parseTemplate(rawExpr);
      let matchCount = 0;
      let targetNode;
      walkTemplate(tokens, (t) => {
        if ("raw" in t && t.raw === tokenRaw) {
          if (matchCount === tokenIndex) {
            targetNode = t;
          }
          matchCount++;
        }
      });
      if (!targetNode || targetNode.kind !== "expression") {
        throw new Error(`Token "${tokenRaw}" at index ${tokenIndex} not found in node expression`);
      }
      const tempContext = { ...card.context };
      const evaluated = this.renderer.generate(card.source.tableName, tempContext);
      let rolledSubVal;
      try {
        const diceResult = this.renderer["dice"].roll(targetNode.inner);
        rolledSubVal = String(diceResult);
      } catch {
        rolledSubVal = String(this.renderer["evaluateToken"](targetNode.inner, tempContext, {
          depth: 0,
          tables: /* @__PURE__ */ new Set(),
          counts: /* @__PURE__ */ new Map(),
          maxDepth: 10
        }));
      }
      const newDisplay = node.displayValue.replace(new RegExp(tokenRaw.replace(/[{}]/g, ""), "g"), rolledSubVal);
      const finalDisplay = newDisplay !== node.displayValue ? newDisplay : node.displayValue.replace(/\d+/, rolledSubVal);
      updateNodeValue(node, finalDisplay);
      const cascadedUpdates = this.cascadeDependencies(card, node);
      return {
        card,
        node,
        previousValue,
        newValue: finalDisplay,
        cascadedUpdates
      };
    }
    /**
     * 3.2 Row-Level Re-roll with Provenance: Executes the generator recipe stored on the node
     * instead of inspecting the DOM or relying on globally active table selection.
     */
    rerollNode(card, nodeId) {
      const node = findNodeById(card.nodes, nodeId);
      if (!node) {
        throw new Error(`Node "${nodeId}" not found in card`);
      }
      if (node.locked) {
        throw new Error(`Node "${node.label}" is locked and cannot be rerolled`);
      }
      const tableName = node.generator.tableName || node.label;
      const sourceFile = node.generator.sourceFile || card.source.file;
      let targetTable = this.loader.getTableByFilename(sourceFile);
      if (targetTable && targetTable.tablename !== tableName) {
        const sub = this.loader.findSubTable(targetTable, tableName);
        if (sub) targetTable = sub;
      }
      if (!targetTable) {
        targetTable = this.loader.findTable(tableName);
      }
      if (!targetTable) {
        throw new Error(`Source table "${tableName}" could not be found in loaded tables`);
      }
      const previousValue = node.displayValue;
      const currentContext = { ...card.context };
      const genResult = this.renderer.reroll(targetTable, tableName, currentContext);
      const newValue = String(genResult.result ?? "");
      updateNodeValue(node, newValue);
      if (node.provides) {
        for (const key of Object.keys(node.provides)) {
          node.provides[key] = newValue;
          card.context[key] = newValue;
        }
      } else {
        card.context[node.label] = newValue;
      }
      const cascadedUpdates = this.cascadeDependencies(card, node);
      return {
        card,
        updatedNode: node,
        cascadedUpdates
      };
    }
    /**
     * 3.3 Dependency Tracking (Cascading Updates):
     * When a node with `provides` (or whose label matches dependencies) changes,
     * re-roll affected unlocked nodes that declare dependencies on it.
     */
    cascadeDependencies(card, sourceNode) {
      const providedKeys = /* @__PURE__ */ new Set();
      if (sourceNode.provides) {
        Object.keys(sourceNode.provides).forEach((k) => providedKeys.add(k));
      }
      providedKeys.add(sourceNode.label);
      const updates = [];
      const checkAndReroll = (node) => {
        if (node.id === sourceNode.id || node.locked) return;
        const dependsOnSource = node.dependencies?.some((dep) => providedKeys.has(dep));
        const rawMentionsSource = node.generator.rawExpression && Array.from(providedKeys).some(
          (key) => node.generator.rawExpression?.includes(`{${key}}`) || node.generator.rawExpression?.includes(`{selectedResult, ${key}}`)
        );
        if (dependsOnSource || rawMentionsSource) {
          const prev = node.displayValue;
          try {
            const res = this.rerollNodeInternal(card, node);
            updates.push({
              nodeId: node.id,
              label: node.label,
              previousValue: prev,
              newValue: res.displayValue
            });
          } catch (e) {
            console.warn(`[Cascade] Failed to update dependent node "${node.label}": ${e.message}`);
          }
        }
        if (node.children) {
          node.children.forEach(checkAndReroll);
        }
      };
      card.nodes.forEach(checkAndReroll);
      return updates;
    }
    rerollNodeInternal(card, node) {
      const tableName = node.generator.tableName || node.label;
      const sourceFile = node.generator.sourceFile || card.source.file;
      let targetTable = this.loader.getTableByFilename(sourceFile) || this.loader.findTable(tableName);
      if (targetTable) {
        const sub = this.loader.findSubTable(targetTable, tableName);
        if (sub) targetTable = sub;
      }
      if (!targetTable) {
        return node;
      }
      const genResult = this.renderer.reroll(targetTable, tableName, card.context);
      const newValue = String(genResult.result ?? "");
      updateNodeValue(node, newValue);
      if (node.provides) {
        for (const key of Object.keys(node.provides)) {
          node.provides[key] = newValue;
          card.context[key] = newValue;
        }
      }
      return node;
    }
    /**
     * 3.4 Template Cards: Instantiates a fixed-schema template card (e.g. Monster Statblock)
     * with rollable, static, and formula fields.
     */
    generateTemplateCard(template, context = {}) {
      const cardId = `template_card_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const cardContext = { ...context };
      const nodes = [];
      for (const field of template.fields) {
        let displayVal = "";
        let rawExpr;
        if (field.type === "static") {
          displayVal = String(field.defaultValue ?? "");
        } else if (field.type === "rollable" && field.tableName) {
          const targetTable = this.loader.findTable(field.tableName);
          if (targetTable) {
            const res = this.renderer.generate(field.tableName, cardContext);
            displayVal = String(res.result ?? "");
            rawExpr = `{${field.tableName}}`;
          } else {
            displayVal = String(field.defaultValue ?? `[Table ${field.tableName} not found]`);
          }
        } else if (field.type === "formula" && field.formula) {
          rawExpr = field.formula;
          const evaluated = this.renderer["expr"].evaluate(field.formula, cardContext);
          displayVal = String(evaluated);
        } else if (field.type === "lookup" && field.tableName) {
          rawExpr = `{useReferenceTable{${field.tableName}}{${field.defaultValue ?? 0}}}`;
          displayVal = String(field.defaultValue ?? "");
        }
        if (field.providesKey) {
          cardContext[field.providesKey] = displayVal;
        }
        cardContext[field.key] = displayVal;
        const node = createResultNode({
          label: field.label,
          displayValue: displayVal,
          tableName: field.tableName || field.key,
          rawExpression: rawExpr,
          dependencies: field.dependencies,
          provides: field.providesKey ? { [field.providesKey]: displayVal } : void 0
        });
        nodes.push(node);
      }
      return {
        id: cardId,
        title: template.title,
        source: {
          file: `${template.game}_Templates.yaml`,
          tableName: template.id
        },
        context: cardContext,
        nodes,
        createdAt: Date.now()
      };
    }
  };

  // node_modules/js-yaml/dist/js-yaml.mjs
  function isNothing(subject) {
    return typeof subject === "undefined" || subject === null;
  }
  function isObject(subject) {
    return typeof subject === "object" && subject !== null;
  }
  function toArray(sequence) {
    if (Array.isArray(sequence)) return sequence;
    else if (isNothing(sequence)) return [];
    return [sequence];
  }
  function extend(target, source) {
    var index, length, key, sourceKeys;
    if (source) {
      sourceKeys = Object.keys(source);
      for (index = 0, length = sourceKeys.length; index < length; index += 1) {
        key = sourceKeys[index];
        target[key] = source[key];
      }
    }
    return target;
  }
  function repeat(string, count) {
    var result = "", cycle;
    for (cycle = 0; cycle < count; cycle += 1) {
      result += string;
    }
    return result;
  }
  function isNegativeZero(number) {
    return number === 0 && Number.NEGATIVE_INFINITY === 1 / number;
  }
  var isNothing_1 = isNothing;
  var isObject_1 = isObject;
  var toArray_1 = toArray;
  var repeat_1 = repeat;
  var isNegativeZero_1 = isNegativeZero;
  var extend_1 = extend;
  var common = {
    isNothing: isNothing_1,
    isObject: isObject_1,
    toArray: toArray_1,
    repeat: repeat_1,
    isNegativeZero: isNegativeZero_1,
    extend: extend_1
  };
  function formatError(exception2, compact) {
    var where = "", message = exception2.reason || "(unknown reason)";
    if (!exception2.mark) return message;
    if (exception2.mark.name) {
      where += 'in "' + exception2.mark.name + '" ';
    }
    where += "(" + (exception2.mark.line + 1) + ":" + (exception2.mark.column + 1) + ")";
    if (!compact && exception2.mark.snippet) {
      where += "\n\n" + exception2.mark.snippet;
    }
    return message + " " + where;
  }
  function YAMLException$1(reason, mark) {
    Error.call(this);
    this.name = "YAMLException";
    this.reason = reason;
    this.mark = mark;
    this.message = formatError(this, false);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack || "";
    }
  }
  YAMLException$1.prototype = Object.create(Error.prototype);
  YAMLException$1.prototype.constructor = YAMLException$1;
  YAMLException$1.prototype.toString = function toString(compact) {
    return this.name + ": " + formatError(this, compact);
  };
  var exception = YAMLException$1;
  function getLine(buffer, lineStart, lineEnd, position, maxLineLength) {
    var head = "";
    var tail = "";
    var maxHalfLength = Math.floor(maxLineLength / 2) - 1;
    if (position - lineStart > maxHalfLength) {
      head = " ... ";
      lineStart = position - maxHalfLength + head.length;
    }
    if (lineEnd - position > maxHalfLength) {
      tail = " ...";
      lineEnd = position + maxHalfLength - tail.length;
    }
    return {
      str: head + buffer.slice(lineStart, lineEnd).replace(/\t/g, "\u2192") + tail,
      pos: position - lineStart + head.length
      // relative position
    };
  }
  function padStart(string, max) {
    return common.repeat(" ", max - string.length) + string;
  }
  function makeSnippet(mark, options) {
    options = Object.create(options || null);
    if (!mark.buffer) return null;
    if (!options.maxLength) options.maxLength = 79;
    if (typeof options.indent !== "number") options.indent = 1;
    if (typeof options.linesBefore !== "number") options.linesBefore = 3;
    if (typeof options.linesAfter !== "number") options.linesAfter = 2;
    var re = /\r?\n|\r|\0/g;
    var lineStarts = [0];
    var lineEnds = [];
    var match;
    var foundLineNo = -1;
    while (match = re.exec(mark.buffer)) {
      lineEnds.push(match.index);
      lineStarts.push(match.index + match[0].length);
      if (mark.position <= match.index && foundLineNo < 0) {
        foundLineNo = lineStarts.length - 2;
      }
    }
    if (foundLineNo < 0) foundLineNo = lineStarts.length - 1;
    var result = "", i, line;
    var lineNoLength = Math.min(mark.line + options.linesAfter, lineEnds.length).toString().length;
    var maxLineLength = options.maxLength - (options.indent + lineNoLength + 3);
    for (i = 1; i <= options.linesBefore; i++) {
      if (foundLineNo - i < 0) break;
      line = getLine(
        mark.buffer,
        lineStarts[foundLineNo - i],
        lineEnds[foundLineNo - i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo - i]),
        maxLineLength
      );
      result = common.repeat(" ", options.indent) + padStart((mark.line - i + 1).toString(), lineNoLength) + " | " + line.str + "\n" + result;
    }
    line = getLine(mark.buffer, lineStarts[foundLineNo], lineEnds[foundLineNo], mark.position, maxLineLength);
    result += common.repeat(" ", options.indent) + padStart((mark.line + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    result += common.repeat("-", options.indent + lineNoLength + 3 + line.pos) + "^\n";
    for (i = 1; i <= options.linesAfter; i++) {
      if (foundLineNo + i >= lineEnds.length) break;
      line = getLine(
        mark.buffer,
        lineStarts[foundLineNo + i],
        lineEnds[foundLineNo + i],
        mark.position - (lineStarts[foundLineNo] - lineStarts[foundLineNo + i]),
        maxLineLength
      );
      result += common.repeat(" ", options.indent) + padStart((mark.line + i + 1).toString(), lineNoLength) + " | " + line.str + "\n";
    }
    return result.replace(/\n$/, "");
  }
  var snippet = makeSnippet;
  var TYPE_CONSTRUCTOR_OPTIONS = [
    "kind",
    "multi",
    "resolve",
    "construct",
    "instanceOf",
    "predicate",
    "represent",
    "representName",
    "defaultStyle",
    "styleAliases"
  ];
  var YAML_NODE_KINDS = [
    "scalar",
    "sequence",
    "mapping"
  ];
  function compileStyleAliases(map2) {
    var result = {};
    if (map2 !== null) {
      Object.keys(map2).forEach(function(style) {
        map2[style].forEach(function(alias) {
          result[String(alias)] = style;
        });
      });
    }
    return result;
  }
  function Type$1(tag, options) {
    options = options || {};
    Object.keys(options).forEach(function(name) {
      if (TYPE_CONSTRUCTOR_OPTIONS.indexOf(name) === -1) {
        throw new exception('Unknown option "' + name + '" is met in definition of "' + tag + '" YAML type.');
      }
    });
    this.options = options;
    this.tag = tag;
    this.kind = options["kind"] || null;
    this.resolve = options["resolve"] || function() {
      return true;
    };
    this.construct = options["construct"] || function(data) {
      return data;
    };
    this.instanceOf = options["instanceOf"] || null;
    this.predicate = options["predicate"] || null;
    this.represent = options["represent"] || null;
    this.representName = options["representName"] || null;
    this.defaultStyle = options["defaultStyle"] || null;
    this.multi = options["multi"] || false;
    this.styleAliases = compileStyleAliases(options["styleAliases"] || null);
    if (YAML_NODE_KINDS.indexOf(this.kind) === -1) {
      throw new exception('Unknown kind "' + this.kind + '" is specified for "' + tag + '" YAML type.');
    }
  }
  var type = Type$1;
  function compileList(schema2, name) {
    var result = [];
    schema2[name].forEach(function(currentType) {
      var newIndex = result.length;
      result.forEach(function(previousType, previousIndex) {
        if (previousType.tag === currentType.tag && previousType.kind === currentType.kind && previousType.multi === currentType.multi) {
          newIndex = previousIndex;
        }
      });
      result[newIndex] = currentType;
    });
    return result;
  }
  function compileMap() {
    var result = {
      scalar: {},
      sequence: {},
      mapping: {},
      fallback: {},
      multi: {
        scalar: [],
        sequence: [],
        mapping: [],
        fallback: []
      }
    }, index, length;
    function collectType(type2) {
      if (type2.multi) {
        result.multi[type2.kind].push(type2);
        result.multi["fallback"].push(type2);
      } else {
        result[type2.kind][type2.tag] = result["fallback"][type2.tag] = type2;
      }
    }
    for (index = 0, length = arguments.length; index < length; index += 1) {
      arguments[index].forEach(collectType);
    }
    return result;
  }
  function Schema$1(definition) {
    return this.extend(definition);
  }
  Schema$1.prototype.extend = function extend2(definition) {
    var implicit = [];
    var explicit = [];
    if (definition instanceof type) {
      explicit.push(definition);
    } else if (Array.isArray(definition)) {
      explicit = explicit.concat(definition);
    } else if (definition && (Array.isArray(definition.implicit) || Array.isArray(definition.explicit))) {
      if (definition.implicit) implicit = implicit.concat(definition.implicit);
      if (definition.explicit) explicit = explicit.concat(definition.explicit);
    } else {
      throw new exception("Schema.extend argument should be a Type, [ Type ], or a schema definition ({ implicit: [...], explicit: [...] })");
    }
    implicit.forEach(function(type$1) {
      if (!(type$1 instanceof type)) {
        throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
      if (type$1.loadKind && type$1.loadKind !== "scalar") {
        throw new exception("There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported.");
      }
      if (type$1.multi) {
        throw new exception("There is a multi type in the implicit list of a schema. Multi tags can only be listed as explicit.");
      }
    });
    explicit.forEach(function(type$1) {
      if (!(type$1 instanceof type)) {
        throw new exception("Specified list of YAML types (or a single Type object) contains a non-Type object.");
      }
    });
    var result = Object.create(Schema$1.prototype);
    result.implicit = (this.implicit || []).concat(implicit);
    result.explicit = (this.explicit || []).concat(explicit);
    result.compiledImplicit = compileList(result, "implicit");
    result.compiledExplicit = compileList(result, "explicit");
    result.compiledTypeMap = compileMap(result.compiledImplicit, result.compiledExplicit);
    return result;
  };
  var schema = Schema$1;
  var str = new type("tag:yaml.org,2002:str", {
    kind: "scalar",
    construct: function(data) {
      return data !== null ? data : "";
    }
  });
  var seq = new type("tag:yaml.org,2002:seq", {
    kind: "sequence",
    construct: function(data) {
      return data !== null ? data : [];
    }
  });
  var map = new type("tag:yaml.org,2002:map", {
    kind: "mapping",
    construct: function(data) {
      return data !== null ? data : {};
    }
  });
  var failsafe = new schema({
    explicit: [
      str,
      seq,
      map
    ]
  });
  function resolveYamlNull(data) {
    if (data === null) return true;
    var max = data.length;
    return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
  }
  function constructYamlNull() {
    return null;
  }
  function isNull(object) {
    return object === null;
  }
  var _null = new type("tag:yaml.org,2002:null", {
    kind: "scalar",
    resolve: resolveYamlNull,
    construct: constructYamlNull,
    predicate: isNull,
    represent: {
      canonical: function() {
        return "~";
      },
      lowercase: function() {
        return "null";
      },
      uppercase: function() {
        return "NULL";
      },
      camelcase: function() {
        return "Null";
      },
      empty: function() {
        return "";
      }
    },
    defaultStyle: "lowercase"
  });
  function resolveYamlBoolean(data) {
    if (data === null) return false;
    var max = data.length;
    return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
  }
  function constructYamlBoolean(data) {
    return data === "true" || data === "True" || data === "TRUE";
  }
  function isBoolean(object) {
    return Object.prototype.toString.call(object) === "[object Boolean]";
  }
  var bool = new type("tag:yaml.org,2002:bool", {
    kind: "scalar",
    resolve: resolveYamlBoolean,
    construct: constructYamlBoolean,
    predicate: isBoolean,
    represent: {
      lowercase: function(object) {
        return object ? "true" : "false";
      },
      uppercase: function(object) {
        return object ? "TRUE" : "FALSE";
      },
      camelcase: function(object) {
        return object ? "True" : "False";
      }
    },
    defaultStyle: "lowercase"
  });
  function isHexCode(c) {
    return 48 <= c && c <= 57 || 65 <= c && c <= 70 || 97 <= c && c <= 102;
  }
  function isOctCode(c) {
    return 48 <= c && c <= 55;
  }
  function isDecCode(c) {
    return 48 <= c && c <= 57;
  }
  function resolveYamlInteger(data) {
    if (data === null) return false;
    var max = data.length, index = 0, hasDigits = false, ch;
    if (!max) return false;
    ch = data[index];
    if (ch === "-" || ch === "+") {
      ch = data[++index];
    }
    if (ch === "0") {
      if (index + 1 === max) return true;
      ch = data[++index];
      if (ch === "b") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (ch !== "0" && ch !== "1") return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
      if (ch === "x") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (!isHexCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
      if (ch === "o") {
        index++;
        for (; index < max; index++) {
          ch = data[index];
          if (ch === "_") continue;
          if (!isOctCode(data.charCodeAt(index))) return false;
          hasDigits = true;
        }
        return hasDigits && ch !== "_";
      }
    }
    if (ch === "_") return false;
    for (; index < max; index++) {
      ch = data[index];
      if (ch === "_") continue;
      if (!isDecCode(data.charCodeAt(index))) {
        return false;
      }
      hasDigits = true;
    }
    if (!hasDigits || ch === "_") return false;
    return true;
  }
  function constructYamlInteger(data) {
    var value = data, sign = 1, ch;
    if (value.indexOf("_") !== -1) {
      value = value.replace(/_/g, "");
    }
    ch = value[0];
    if (ch === "-" || ch === "+") {
      if (ch === "-") sign = -1;
      value = value.slice(1);
      ch = value[0];
    }
    if (value === "0") return 0;
    if (ch === "0") {
      if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
      if (value[1] === "x") return sign * parseInt(value.slice(2), 16);
      if (value[1] === "o") return sign * parseInt(value.slice(2), 8);
    }
    return sign * parseInt(value, 10);
  }
  function isInteger(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 === 0 && !common.isNegativeZero(object));
  }
  var int = new type("tag:yaml.org,2002:int", {
    kind: "scalar",
    resolve: resolveYamlInteger,
    construct: constructYamlInteger,
    predicate: isInteger,
    represent: {
      binary: function(obj) {
        return obj >= 0 ? "0b" + obj.toString(2) : "-0b" + obj.toString(2).slice(1);
      },
      octal: function(obj) {
        return obj >= 0 ? "0o" + obj.toString(8) : "-0o" + obj.toString(8).slice(1);
      },
      decimal: function(obj) {
        return obj.toString(10);
      },
      /* eslint-disable max-len */
      hexadecimal: function(obj) {
        return obj >= 0 ? "0x" + obj.toString(16).toUpperCase() : "-0x" + obj.toString(16).toUpperCase().slice(1);
      }
    },
    defaultStyle: "decimal",
    styleAliases: {
      binary: [2, "bin"],
      octal: [8, "oct"],
      decimal: [10, "dec"],
      hexadecimal: [16, "hex"]
    }
  });
  var YAML_FLOAT_PATTERN = new RegExp(
    // 2.5e4, 2.5 and integers
    "^(?:[-+]?(?:[0-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
  );
  function resolveYamlFloat(data) {
    if (data === null) return false;
    if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
    // Probably should update regexp & check speed
    data[data.length - 1] === "_") {
      return false;
    }
    return true;
  }
  function constructYamlFloat(data) {
    var value, sign;
    value = data.replace(/_/g, "").toLowerCase();
    sign = value[0] === "-" ? -1 : 1;
    if ("+-".indexOf(value[0]) >= 0) {
      value = value.slice(1);
    }
    if (value === ".inf") {
      return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    } else if (value === ".nan") {
      return NaN;
    }
    return sign * parseFloat(value, 10);
  }
  var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
  function representYamlFloat(object, style) {
    var res;
    if (isNaN(object)) {
      switch (style) {
        case "lowercase":
          return ".nan";
        case "uppercase":
          return ".NAN";
        case "camelcase":
          return ".NaN";
      }
    } else if (Number.POSITIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return ".inf";
        case "uppercase":
          return ".INF";
        case "camelcase":
          return ".Inf";
      }
    } else if (Number.NEGATIVE_INFINITY === object) {
      switch (style) {
        case "lowercase":
          return "-.inf";
        case "uppercase":
          return "-.INF";
        case "camelcase":
          return "-.Inf";
      }
    } else if (common.isNegativeZero(object)) {
      return "-0.0";
    }
    res = object.toString(10);
    return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
  }
  function isFloat(object) {
    return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || common.isNegativeZero(object));
  }
  var float = new type("tag:yaml.org,2002:float", {
    kind: "scalar",
    resolve: resolveYamlFloat,
    construct: constructYamlFloat,
    predicate: isFloat,
    represent: representYamlFloat,
    defaultStyle: "lowercase"
  });
  var json = failsafe.extend({
    implicit: [
      _null,
      bool,
      int,
      float
    ]
  });
  var core = json;
  var YAML_DATE_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  );
  var YAML_TIMESTAMP_REGEXP = new RegExp(
    "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  );
  function resolveYamlTimestamp(data) {
    if (data === null) return false;
    if (YAML_DATE_REGEXP.exec(data) !== null) return true;
    if (YAML_TIMESTAMP_REGEXP.exec(data) !== null) return true;
    return false;
  }
  function constructYamlTimestamp(data) {
    var match, year, month, day, hour, minute, second, fraction = 0, delta = null, tz_hour, tz_minute, date;
    match = YAML_DATE_REGEXP.exec(data);
    if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data);
    if (match === null) throw new Error("Date resolve error");
    year = +match[1];
    month = +match[2] - 1;
    day = +match[3];
    if (!match[4]) {
      return new Date(Date.UTC(year, month, day));
    }
    hour = +match[4];
    minute = +match[5];
    second = +match[6];
    if (match[7]) {
      fraction = match[7].slice(0, 3);
      while (fraction.length < 3) {
        fraction += "0";
      }
      fraction = +fraction;
    }
    if (match[9]) {
      tz_hour = +match[10];
      tz_minute = +(match[11] || 0);
      delta = (tz_hour * 60 + tz_minute) * 6e4;
      if (match[9] === "-") delta = -delta;
    }
    date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
    if (delta) date.setTime(date.getTime() - delta);
    return date;
  }
  function representYamlTimestamp(object) {
    return object.toISOString();
  }
  var timestamp = new type("tag:yaml.org,2002:timestamp", {
    kind: "scalar",
    resolve: resolveYamlTimestamp,
    construct: constructYamlTimestamp,
    instanceOf: Date,
    represent: representYamlTimestamp
  });
  function resolveYamlMerge(data) {
    return data === "<<" || data === null;
  }
  var merge = new type("tag:yaml.org,2002:merge", {
    kind: "scalar",
    resolve: resolveYamlMerge
  });
  var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
  function resolveYamlBinary(data) {
    if (data === null) return false;
    var code, idx, bitlen = 0, max = data.length, map2 = BASE64_MAP;
    for (idx = 0; idx < max; idx++) {
      code = map2.indexOf(data.charAt(idx));
      if (code > 64) continue;
      if (code < 0) return false;
      bitlen += 6;
    }
    return bitlen % 8 === 0;
  }
  function constructYamlBinary(data) {
    var idx, tailbits, input = data.replace(/[\r\n=]/g, ""), max = input.length, map2 = BASE64_MAP, bits = 0, result = [];
    for (idx = 0; idx < max; idx++) {
      if (idx % 4 === 0 && idx) {
        result.push(bits >> 16 & 255);
        result.push(bits >> 8 & 255);
        result.push(bits & 255);
      }
      bits = bits << 6 | map2.indexOf(input.charAt(idx));
    }
    tailbits = max % 4 * 6;
    if (tailbits === 0) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    } else if (tailbits === 18) {
      result.push(bits >> 10 & 255);
      result.push(bits >> 2 & 255);
    } else if (tailbits === 12) {
      result.push(bits >> 4 & 255);
    }
    return new Uint8Array(result);
  }
  function representYamlBinary(object) {
    var result = "", bits = 0, idx, tail, max = object.length, map2 = BASE64_MAP;
    for (idx = 0; idx < max; idx++) {
      if (idx % 3 === 0 && idx) {
        result += map2[bits >> 18 & 63];
        result += map2[bits >> 12 & 63];
        result += map2[bits >> 6 & 63];
        result += map2[bits & 63];
      }
      bits = (bits << 8) + object[idx];
    }
    tail = max % 3;
    if (tail === 0) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    } else if (tail === 2) {
      result += map2[bits >> 10 & 63];
      result += map2[bits >> 4 & 63];
      result += map2[bits << 2 & 63];
      result += map2[64];
    } else if (tail === 1) {
      result += map2[bits >> 2 & 63];
      result += map2[bits << 4 & 63];
      result += map2[64];
      result += map2[64];
    }
    return result;
  }
  function isBinary(obj) {
    return Object.prototype.toString.call(obj) === "[object Uint8Array]";
  }
  var binary = new type("tag:yaml.org,2002:binary", {
    kind: "scalar",
    resolve: resolveYamlBinary,
    construct: constructYamlBinary,
    predicate: isBinary,
    represent: representYamlBinary
  });
  var _hasOwnProperty$3 = Object.prototype.hasOwnProperty;
  var _toString$2 = Object.prototype.toString;
  function resolveYamlOmap(data) {
    if (data === null) return true;
    var objectKeys = [], index, length, pair, pairKey, pairHasKey, object = data;
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      pairHasKey = false;
      if (_toString$2.call(pair) !== "[object Object]") return false;
      for (pairKey in pair) {
        if (_hasOwnProperty$3.call(pair, pairKey)) {
          if (!pairHasKey) pairHasKey = true;
          else return false;
        }
      }
      if (!pairHasKey) return false;
      if (objectKeys.indexOf(pairKey) === -1) objectKeys.push(pairKey);
      else return false;
    }
    return true;
  }
  function constructYamlOmap(data) {
    return data !== null ? data : [];
  }
  var omap = new type("tag:yaml.org,2002:omap", {
    kind: "sequence",
    resolve: resolveYamlOmap,
    construct: constructYamlOmap
  });
  var _toString$1 = Object.prototype.toString;
  function resolveYamlPairs(data) {
    if (data === null) return true;
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      if (_toString$1.call(pair) !== "[object Object]") return false;
      keys = Object.keys(pair);
      if (keys.length !== 1) return false;
      result[index] = [keys[0], pair[keys[0]]];
    }
    return true;
  }
  function constructYamlPairs(data) {
    if (data === null) return [];
    var index, length, pair, keys, result, object = data;
    result = new Array(object.length);
    for (index = 0, length = object.length; index < length; index += 1) {
      pair = object[index];
      keys = Object.keys(pair);
      result[index] = [keys[0], pair[keys[0]]];
    }
    return result;
  }
  var pairs = new type("tag:yaml.org,2002:pairs", {
    kind: "sequence",
    resolve: resolveYamlPairs,
    construct: constructYamlPairs
  });
  var _hasOwnProperty$2 = Object.prototype.hasOwnProperty;
  function resolveYamlSet(data) {
    if (data === null) return true;
    var key, object = data;
    for (key in object) {
      if (_hasOwnProperty$2.call(object, key)) {
        if (object[key] !== null) return false;
      }
    }
    return true;
  }
  function constructYamlSet(data) {
    return data !== null ? data : {};
  }
  var set = new type("tag:yaml.org,2002:set", {
    kind: "mapping",
    resolve: resolveYamlSet,
    construct: constructYamlSet
  });
  var _default = core.extend({
    implicit: [
      timestamp,
      merge
    ],
    explicit: [
      binary,
      omap,
      pairs,
      set
    ]
  });
  var _hasOwnProperty$1 = Object.prototype.hasOwnProperty;
  var CONTEXT_FLOW_IN = 1;
  var CONTEXT_FLOW_OUT = 2;
  var CONTEXT_BLOCK_IN = 3;
  var CONTEXT_BLOCK_OUT = 4;
  var CHOMPING_CLIP = 1;
  var CHOMPING_STRIP = 2;
  var CHOMPING_KEEP = 3;
  var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
  var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
  var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
  var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
  var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
  function _class(obj) {
    return Object.prototype.toString.call(obj);
  }
  function is_EOL(c) {
    return c === 10 || c === 13;
  }
  function is_WHITE_SPACE(c) {
    return c === 9 || c === 32;
  }
  function is_WS_OR_EOL(c) {
    return c === 9 || c === 32 || c === 10 || c === 13;
  }
  function is_FLOW_INDICATOR(c) {
    return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
  }
  function fromHexCode(c) {
    var lc;
    if (48 <= c && c <= 57) {
      return c - 48;
    }
    lc = c | 32;
    if (97 <= lc && lc <= 102) {
      return lc - 97 + 10;
    }
    return -1;
  }
  function escapedHexLen(c) {
    if (c === 120) {
      return 2;
    }
    if (c === 117) {
      return 4;
    }
    if (c === 85) {
      return 8;
    }
    return 0;
  }
  function fromDecimalCode(c) {
    if (48 <= c && c <= 57) {
      return c - 48;
    }
    return -1;
  }
  function simpleEscapeSequence(c) {
    return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
  }
  function charFromCodepoint(c) {
    if (c <= 65535) {
      return String.fromCharCode(c);
    }
    return String.fromCharCode(
      (c - 65536 >> 10) + 55296,
      (c - 65536 & 1023) + 56320
    );
  }
  function setProperty(object, key, value) {
    if (key === "__proto__") {
      Object.defineProperty(object, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value
      });
    } else {
      object[key] = value;
    }
  }
  var simpleEscapeCheck = new Array(256);
  var simpleEscapeMap = new Array(256);
  for (i = 0; i < 256; i++) {
    simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
    simpleEscapeMap[i] = simpleEscapeSequence(i);
  }
  var i;
  function State$1(input, options) {
    this.input = input;
    this.filename = options["filename"] || null;
    this.schema = options["schema"] || _default;
    this.onWarning = options["onWarning"] || null;
    this.legacy = options["legacy"] || false;
    this.json = options["json"] || false;
    this.listener = options["listener"] || null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
    this.position = 0;
    this.line = 0;
    this.lineStart = 0;
    this.lineIndent = 0;
    this.firstTabInLine = -1;
    this.documents = [];
  }
  function generateError(state, message) {
    var mark = {
      name: state.filename,
      buffer: state.input.slice(0, -1),
      // omit trailing \0
      position: state.position,
      line: state.line,
      column: state.position - state.lineStart
    };
    mark.snippet = snippet(mark);
    return new exception(message, mark);
  }
  function throwError(state, message) {
    throw generateError(state, message);
  }
  function throwWarning(state, message) {
    if (state.onWarning) {
      state.onWarning.call(null, generateError(state, message));
    }
  }
  var directiveHandlers = {
    YAML: function handleYamlDirective(state, name, args) {
      var match, major, minor;
      if (state.version !== null) {
        throwError(state, "duplication of %YAML directive");
      }
      if (args.length !== 1) {
        throwError(state, "YAML directive accepts exactly one argument");
      }
      match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
      if (match === null) {
        throwError(state, "ill-formed argument of the YAML directive");
      }
      major = parseInt(match[1], 10);
      minor = parseInt(match[2], 10);
      if (major !== 1) {
        throwError(state, "unacceptable YAML version of the document");
      }
      state.version = args[0];
      state.checkLineBreaks = minor < 2;
      if (minor !== 1 && minor !== 2) {
        throwWarning(state, "unsupported YAML version of the document");
      }
    },
    TAG: function handleTagDirective(state, name, args) {
      var handle, prefix;
      if (args.length !== 2) {
        throwError(state, "TAG directive accepts exactly two arguments");
      }
      handle = args[0];
      prefix = args[1];
      if (!PATTERN_TAG_HANDLE.test(handle)) {
        throwError(state, "ill-formed tag handle (first argument) of the TAG directive");
      }
      if (_hasOwnProperty$1.call(state.tagMap, handle)) {
        throwError(state, 'there is a previously declared suffix for "' + handle + '" tag handle');
      }
      if (!PATTERN_TAG_URI.test(prefix)) {
        throwError(state, "ill-formed tag prefix (second argument) of the TAG directive");
      }
      try {
        prefix = decodeURIComponent(prefix);
      } catch (err) {
        throwError(state, "tag prefix is malformed: " + prefix);
      }
      state.tagMap[handle] = prefix;
    }
  };
  function captureSegment(state, start, end, checkJson) {
    var _position, _length, _character, _result;
    if (start < end) {
      _result = state.input.slice(start, end);
      if (checkJson) {
        for (_position = 0, _length = _result.length; _position < _length; _position += 1) {
          _character = _result.charCodeAt(_position);
          if (!(_character === 9 || 32 <= _character && _character <= 1114111)) {
            throwError(state, "expected valid JSON character");
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(_result)) {
        throwError(state, "the stream contains non-printable characters");
      }
      state.result += _result;
    }
  }
  function mergeMappings(state, destination, source, overridableKeys) {
    var sourceKeys, key, index, quantity;
    if (!common.isObject(source)) {
      throwError(state, "cannot merge mappings; the provided source object is unacceptable");
    }
    sourceKeys = Object.keys(source);
    for (index = 0, quantity = sourceKeys.length; index < quantity; index += 1) {
      key = sourceKeys[index];
      if (!_hasOwnProperty$1.call(destination, key)) {
        setProperty(destination, key, source[key]);
        overridableKeys[key] = true;
      }
    }
  }
  function storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, startLine, startLineStart, startPos) {
    var index, quantity;
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (index = 0, quantity = keyNode.length; index < quantity; index += 1) {
        if (Array.isArray(keyNode[index])) {
          throwError(state, "nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (_result === null) {
      _result = {};
    }
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        for (index = 0, quantity = valueNode.length; index < quantity; index += 1) {
          mergeMappings(state, _result, valueNode[index], overridableKeys);
        }
      } else {
        mergeMappings(state, _result, valueNode, overridableKeys);
      }
    } else {
      if (!state.json && !_hasOwnProperty$1.call(overridableKeys, keyNode) && _hasOwnProperty$1.call(_result, keyNode)) {
        state.line = startLine || state.line;
        state.lineStart = startLineStart || state.lineStart;
        state.position = startPos || state.position;
        throwError(state, "duplicated mapping key");
      }
      setProperty(_result, keyNode, valueNode);
      delete overridableKeys[keyNode];
    }
    return _result;
  }
  function readLineBreak(state) {
    var ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 10) {
      state.position++;
    } else if (ch === 13) {
      state.position++;
      if (state.input.charCodeAt(state.position) === 10) {
        state.position++;
      }
    } else {
      throwError(state, "a line break is expected");
    }
    state.line += 1;
    state.lineStart = state.position;
    state.firstTabInLine = -1;
  }
  function skipSeparationSpace(state, allowComments, checkIndent) {
    var lineBreaks = 0, ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      while (is_WHITE_SPACE(ch)) {
        if (ch === 9 && state.firstTabInLine === -1) {
          state.firstTabInLine = state.position;
        }
        ch = state.input.charCodeAt(++state.position);
      }
      if (allowComments && ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 10 && ch !== 13 && ch !== 0);
      }
      if (is_EOL(ch)) {
        readLineBreak(state);
        ch = state.input.charCodeAt(state.position);
        lineBreaks++;
        state.lineIndent = 0;
        while (ch === 32) {
          state.lineIndent++;
          ch = state.input.charCodeAt(++state.position);
        }
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
      throwWarning(state, "deficient indentation");
    }
    return lineBreaks;
  }
  function testDocumentSeparator(state) {
    var _position = state.position, ch;
    ch = state.input.charCodeAt(_position);
    if ((ch === 45 || ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
      _position += 3;
      ch = state.input.charCodeAt(_position);
      if (ch === 0 || is_WS_OR_EOL(ch)) {
        return true;
      }
    }
    return false;
  }
  function writeFoldedLines(state, count) {
    if (count === 1) {
      state.result += " ";
    } else if (count > 1) {
      state.result += common.repeat("\n", count - 1);
    }
  }
  function readPlainScalar(state, nodeIndent, withinFlowCollection) {
    var preceding, following, captureStart, captureEnd, hasPendingContent, _line, _lineStart, _lineIndent, _kind = state.kind, _result = state.result, ch;
    ch = state.input.charCodeAt(state.position);
    if (is_WS_OR_EOL(ch) || is_FLOW_INDICATOR(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
      return false;
    }
    if (ch === 63 || ch === 45) {
      following = state.input.charCodeAt(state.position + 1);
      if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
        return false;
      }
    }
    state.kind = "scalar";
    state.result = "";
    captureStart = captureEnd = state.position;
    hasPendingContent = false;
    while (ch !== 0) {
      if (ch === 58) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following) || withinFlowCollection && is_FLOW_INDICATOR(following)) {
          break;
        }
      } else if (ch === 35) {
        preceding = state.input.charCodeAt(state.position - 1);
        if (is_WS_OR_EOL(preceding)) {
          break;
        }
      } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && is_FLOW_INDICATOR(ch)) {
        break;
      } else if (is_EOL(ch)) {
        _line = state.line;
        _lineStart = state.lineStart;
        _lineIndent = state.lineIndent;
        skipSeparationSpace(state, false, -1);
        if (state.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = state.input.charCodeAt(state.position);
          continue;
        } else {
          state.position = captureEnd;
          state.line = _line;
          state.lineStart = _lineStart;
          state.lineIndent = _lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        captureSegment(state, captureStart, captureEnd, false);
        writeFoldedLines(state, state.line - _line);
        captureStart = captureEnd = state.position;
        hasPendingContent = false;
      }
      if (!is_WHITE_SPACE(ch)) {
        captureEnd = state.position + 1;
      }
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, captureEnd, false);
    if (state.result) {
      return true;
    }
    state.kind = _kind;
    state.result = _result;
    return false;
  }
  function readSingleQuotedScalar(state, nodeIndent) {
    var ch, captureStart, captureEnd;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 39) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 39) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (ch === 39) {
          captureStart = state.position;
          state.position++;
          captureEnd = state.position;
        } else {
          return true;
        }
      } else if (is_EOL(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a single quoted scalar");
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }
    throwError(state, "unexpected end of the stream within a single quoted scalar");
  }
  function readDoubleQuotedScalar(state, nodeIndent) {
    var captureStart, captureEnd, hexLength, hexResult, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 34) {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    state.position++;
    captureStart = captureEnd = state.position;
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      if (ch === 34) {
        captureSegment(state, captureStart, state.position, true);
        state.position++;
        return true;
      } else if (ch === 92) {
        captureSegment(state, captureStart, state.position, true);
        ch = state.input.charCodeAt(++state.position);
        if (is_EOL(ch)) {
          skipSeparationSpace(state, false, nodeIndent);
        } else if (ch < 256 && simpleEscapeCheck[ch]) {
          state.result += simpleEscapeMap[ch];
          state.position++;
        } else if ((tmp = escapedHexLen(ch)) > 0) {
          hexLength = tmp;
          hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = state.input.charCodeAt(++state.position);
            if ((tmp = fromHexCode(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throwError(state, "expected hexadecimal character");
            }
          }
          state.result += charFromCodepoint(hexResult);
          state.position++;
        } else {
          throwError(state, "unknown escape sequence");
        }
        captureStart = captureEnd = state.position;
      } else if (is_EOL(ch)) {
        captureSegment(state, captureStart, captureEnd, true);
        writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
        captureStart = captureEnd = state.position;
      } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
        throwError(state, "unexpected end of the document within a double quoted scalar");
      } else {
        state.position++;
        captureEnd = state.position;
      }
    }
    throwError(state, "unexpected end of the stream within a double quoted scalar");
  }
  function readFlowCollection(state, nodeIndent) {
    var readNext = true, _line, _lineStart, _pos, _tag = state.tag, _result, _anchor = state.anchor, following, terminator, isPair, isExplicitPair, isMapping, overridableKeys = /* @__PURE__ */ Object.create(null), keyNode, keyTag, valueNode, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 91) {
      terminator = 93;
      isMapping = false;
      _result = [];
    } else if (ch === 123) {
      terminator = 125;
      isMapping = true;
      _result = {};
    } else {
      return false;
    }
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(++state.position);
    while (ch !== 0) {
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === terminator) {
        state.position++;
        state.tag = _tag;
        state.anchor = _anchor;
        state.kind = isMapping ? "mapping" : "sequence";
        state.result = _result;
        return true;
      } else if (!readNext) {
        throwError(state, "missed comma between flow collection entries");
      } else if (ch === 44) {
        throwError(state, "expected the node content, but found ','");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === 63) {
        following = state.input.charCodeAt(state.position + 1);
        if (is_WS_OR_EOL(following)) {
          isPair = isExplicitPair = true;
          state.position++;
          skipSeparationSpace(state, true, nodeIndent);
        }
      }
      _line = state.line;
      _lineStart = state.lineStart;
      _pos = state.position;
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      keyTag = state.tag;
      keyNode = state.result;
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if ((isExplicitPair || state.line === _line) && ch === 58) {
        isPair = true;
        ch = state.input.charCodeAt(++state.position);
        skipSeparationSpace(state, true, nodeIndent);
        composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
        valueNode = state.result;
      }
      if (isMapping) {
        storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos);
      } else if (isPair) {
        _result.push(storeMappingPair(state, null, overridableKeys, keyTag, keyNode, valueNode, _line, _lineStart, _pos));
      } else {
        _result.push(keyNode);
      }
      skipSeparationSpace(state, true, nodeIndent);
      ch = state.input.charCodeAt(state.position);
      if (ch === 44) {
        readNext = true;
        ch = state.input.charCodeAt(++state.position);
      } else {
        readNext = false;
      }
    }
    throwError(state, "unexpected end of the stream within a flow collection");
  }
  function readBlockScalar(state, nodeIndent) {
    var captureStart, folding, chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false, tmp, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch === 124) {
      folding = false;
    } else if (ch === 62) {
      folding = true;
    } else {
      return false;
    }
    state.kind = "scalar";
    state.result = "";
    while (ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
      if (ch === 43 || ch === 45) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throwError(state, "repeat of a chomping mode identifier");
        }
      } else if ((tmp = fromDecimalCode(ch)) >= 0) {
        if (tmp === 0) {
          throwError(state, "bad explicit indentation width of a block scalar; it cannot be less than one");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throwError(state, "repeat of an indentation width identifier");
        }
      } else {
        break;
      }
    }
    if (is_WHITE_SPACE(ch)) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (is_WHITE_SPACE(ch));
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (!is_EOL(ch) && ch !== 0);
      }
    }
    while (ch !== 0) {
      readLineBreak(state);
      state.lineIndent = 0;
      ch = state.input.charCodeAt(state.position);
      while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
      if (!detectedIndent && state.lineIndent > textIndent) {
        textIndent = state.lineIndent;
      }
      if (is_EOL(ch)) {
        emptyLines++;
        continue;
      }
      if (state.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            state.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (is_WHITE_SPACE(ch)) {
          atMoreIndented = true;
          state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          state.result += common.repeat("\n", emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            state.result += " ";
          }
        } else {
          state.result += common.repeat("\n", emptyLines);
        }
      } else {
        state.result += common.repeat("\n", didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      captureStart = state.position;
      while (!is_EOL(ch) && ch !== 0) {
        ch = state.input.charCodeAt(++state.position);
      }
      captureSegment(state, captureStart, state.position, false);
    }
    return true;
  }
  function readBlockSequence(state, nodeIndent) {
    var _line, _tag = state.tag, _anchor = state.anchor, _result = [], following, detected = false, ch;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      if (ch !== 45) {
        break;
      }
      following = state.input.charCodeAt(state.position + 1);
      if (!is_WS_OR_EOL(following)) {
        break;
      }
      detected = true;
      state.position++;
      if (skipSeparationSpace(state, true, -1)) {
        if (state.lineIndent <= nodeIndent) {
          _result.push(null);
          ch = state.input.charCodeAt(state.position);
          continue;
        }
      }
      _line = state.line;
      composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
      _result.push(state.result);
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a sequence entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "sequence";
      state.result = _result;
      return true;
    }
    return false;
  }
  function readBlockMapping(state, nodeIndent, flowIndent) {
    var following, allowCompact, _line, _keyLine, _keyLineStart, _keyPos, _tag = state.tag, _anchor = state.anchor, _result = {}, overridableKeys = /* @__PURE__ */ Object.create(null), keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
    if (state.firstTabInLine !== -1) return false;
    if (state.anchor !== null) {
      state.anchorMap[state.anchor] = _result;
    }
    ch = state.input.charCodeAt(state.position);
    while (ch !== 0) {
      if (!atExplicitKey && state.firstTabInLine !== -1) {
        state.position = state.firstTabInLine;
        throwError(state, "tab characters must not be used in indentation");
      }
      following = state.input.charCodeAt(state.position + 1);
      _line = state.line;
      if ((ch === 63 || ch === 58) && is_WS_OR_EOL(following)) {
        if (ch === 63) {
          if (atExplicitKey) {
            storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throwError(state, "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line");
        }
        state.position += 1;
        ch = following;
      } else {
        _keyLine = state.line;
        _keyLineStart = state.lineStart;
        _keyPos = state.position;
        if (!composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
          break;
        }
        if (state.line === _line) {
          ch = state.input.charCodeAt(state.position);
          while (is_WHITE_SPACE(ch)) {
            ch = state.input.charCodeAt(++state.position);
          }
          if (ch === 58) {
            ch = state.input.charCodeAt(++state.position);
            if (!is_WS_OR_EOL(ch)) {
              throwError(state, "a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
              keyTag = keyNode = valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = state.tag;
            keyNode = state.result;
          } else if (detected) {
            throwError(state, "can not read an implicit mapping pair; a colon is missed");
          } else {
            state.tag = _tag;
            state.anchor = _anchor;
            return true;
          }
        } else if (detected) {
          throwError(state, "can not read a block mapping entry; a multiline key may not be an implicit key");
        } else {
          state.tag = _tag;
          state.anchor = _anchor;
          return true;
        }
      }
      if (state.line === _line || state.lineIndent > nodeIndent) {
        if (atExplicitKey) {
          _keyLine = state.line;
          _keyLineStart = state.lineStart;
          _keyPos = state.position;
        }
        if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
          if (atExplicitKey) {
            keyNode = state.result;
          } else {
            valueNode = state.result;
          }
        }
        if (!atExplicitKey) {
          storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, valueNode, _keyLine, _keyLineStart, _keyPos);
          keyTag = keyNode = valueNode = null;
        }
        skipSeparationSpace(state, true, -1);
        ch = state.input.charCodeAt(state.position);
      }
      if ((state.line === _line || state.lineIndent > nodeIndent) && ch !== 0) {
        throwError(state, "bad indentation of a mapping entry");
      } else if (state.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      storeMappingPair(state, _result, overridableKeys, keyTag, keyNode, null, _keyLine, _keyLineStart, _keyPos);
    }
    if (detected) {
      state.tag = _tag;
      state.anchor = _anchor;
      state.kind = "mapping";
      state.result = _result;
    }
    return detected;
  }
  function readTagProperty(state) {
    var _position, isVerbatim = false, isNamed = false, tagHandle, tagName, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 33) return false;
    if (state.tag !== null) {
      throwError(state, "duplication of a tag property");
    }
    ch = state.input.charCodeAt(++state.position);
    if (ch === 60) {
      isVerbatim = true;
      ch = state.input.charCodeAt(++state.position);
    } else if (ch === 33) {
      isNamed = true;
      tagHandle = "!!";
      ch = state.input.charCodeAt(++state.position);
    } else {
      tagHandle = "!";
    }
    _position = state.position;
    if (isVerbatim) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 0 && ch !== 62);
      if (state.position < state.length) {
        tagName = state.input.slice(_position, state.position);
        ch = state.input.charCodeAt(++state.position);
      } else {
        throwError(state, "unexpected end of the stream within a verbatim tag");
      }
    } else {
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        if (ch === 33) {
          if (!isNamed) {
            tagHandle = state.input.slice(_position - 1, state.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throwError(state, "named tag handle cannot contain such characters");
            }
            isNamed = true;
            _position = state.position + 1;
          } else {
            throwError(state, "tag suffix cannot contain exclamation marks");
          }
        }
        ch = state.input.charCodeAt(++state.position);
      }
      tagName = state.input.slice(_position, state.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throwError(state, "tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throwError(state, "tag name cannot contain such characters: " + tagName);
    }
    try {
      tagName = decodeURIComponent(tagName);
    } catch (err) {
      throwError(state, "tag name is malformed: " + tagName);
    }
    if (isVerbatim) {
      state.tag = tagName;
    } else if (_hasOwnProperty$1.call(state.tagMap, tagHandle)) {
      state.tag = state.tagMap[tagHandle] + tagName;
    } else if (tagHandle === "!") {
      state.tag = "!" + tagName;
    } else if (tagHandle === "!!") {
      state.tag = "tag:yaml.org,2002:" + tagName;
    } else {
      throwError(state, 'undeclared tag handle "' + tagHandle + '"');
    }
    return true;
  }
  function readAnchorProperty(state) {
    var _position, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 38) return false;
    if (state.anchor !== null) {
      throwError(state, "duplication of an anchor property");
    }
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an anchor node must contain at least one character");
    }
    state.anchor = state.input.slice(_position, state.position);
    return true;
  }
  function readAlias(state) {
    var _position, alias, ch;
    ch = state.input.charCodeAt(state.position);
    if (ch !== 42) return false;
    ch = state.input.charCodeAt(++state.position);
    _position = state.position;
    while (ch !== 0 && !is_WS_OR_EOL(ch) && !is_FLOW_INDICATOR(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (state.position === _position) {
      throwError(state, "name of an alias node must contain at least one character");
    }
    alias = state.input.slice(_position, state.position);
    if (!_hasOwnProperty$1.call(state.anchorMap, alias)) {
      throwError(state, 'unidentified alias "' + alias + '"');
    }
    state.result = state.anchorMap[alias];
    skipSeparationSpace(state, true, -1);
    return true;
  }
  function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
    var allowBlockStyles, allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, typeIndex, typeQuantity, typeList, type2, flowIndent, blockIndent;
    if (state.listener !== null) {
      state.listener("open", state);
    }
    state.tag = null;
    state.anchor = null;
    state.kind = null;
    state.result = null;
    allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    if (allowToSeek) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (readTagProperty(state) || readAnchorProperty(state)) {
        if (skipSeparationSpace(state, true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (state.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (state.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (state.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      if (CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext) {
        flowIndent = parentIndent;
      } else {
        flowIndent = parentIndent + 1;
      }
      blockIndent = state.position - state.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
          hasContent = true;
        } else {
          if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
            hasContent = true;
          } else if (readAlias(state)) {
            hasContent = true;
            if (state.tag !== null || state.anchor !== null) {
              throwError(state, "alias node should not have any properties");
            }
          } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (state.tag === null) {
              state.tag = "?";
            }
          }
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
      }
    }
    if (state.tag === null) {
      if (state.anchor !== null) {
        state.anchorMap[state.anchor] = state.result;
      }
    } else if (state.tag === "?") {
      if (state.result !== null && state.kind !== "scalar") {
        throwError(state, 'unacceptable node kind for !<?> tag; it should be "scalar", not "' + state.kind + '"');
      }
      for (typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex += 1) {
        type2 = state.implicitTypes[typeIndex];
        if (type2.resolve(state.result)) {
          state.result = type2.construct(state.result);
          state.tag = type2.tag;
          if (state.anchor !== null) {
            state.anchorMap[state.anchor] = state.result;
          }
          break;
        }
      }
    } else if (state.tag !== "!") {
      if (_hasOwnProperty$1.call(state.typeMap[state.kind || "fallback"], state.tag)) {
        type2 = state.typeMap[state.kind || "fallback"][state.tag];
      } else {
        type2 = null;
        typeList = state.typeMap.multi[state.kind || "fallback"];
        for (typeIndex = 0, typeQuantity = typeList.length; typeIndex < typeQuantity; typeIndex += 1) {
          if (state.tag.slice(0, typeList[typeIndex].tag.length) === typeList[typeIndex].tag) {
            type2 = typeList[typeIndex];
            break;
          }
        }
      }
      if (!type2) {
        throwError(state, "unknown tag !<" + state.tag + ">");
      }
      if (state.result !== null && type2.kind !== state.kind) {
        throwError(state, "unacceptable node kind for !<" + state.tag + '> tag; it should be "' + type2.kind + '", not "' + state.kind + '"');
      }
      if (!type2.resolve(state.result, state.tag)) {
        throwError(state, "cannot resolve a node with !<" + state.tag + "> explicit tag");
      } else {
        state.result = type2.construct(state.result, state.tag);
        if (state.anchor !== null) {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    }
    if (state.listener !== null) {
      state.listener("close", state);
    }
    return state.tag !== null || state.anchor !== null || hasContent;
  }
  function readDocument(state) {
    var documentStart = state.position, _position, directiveName, directiveArgs, hasDirectives = false, ch;
    state.version = null;
    state.checkLineBreaks = state.legacy;
    state.tagMap = /* @__PURE__ */ Object.create(null);
    state.anchorMap = /* @__PURE__ */ Object.create(null);
    while ((ch = state.input.charCodeAt(state.position)) !== 0) {
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
      if (state.lineIndent > 0 || ch !== 37) {
        break;
      }
      hasDirectives = true;
      ch = state.input.charCodeAt(++state.position);
      _position = state.position;
      while (ch !== 0 && !is_WS_OR_EOL(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveName = state.input.slice(_position, state.position);
      directiveArgs = [];
      if (directiveName.length < 1) {
        throwError(state, "directive name must not be less than one character in length");
      }
      while (ch !== 0) {
        while (is_WHITE_SPACE(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 35) {
          do {
            ch = state.input.charCodeAt(++state.position);
          } while (ch !== 0 && !is_EOL(ch));
          break;
        }
        if (is_EOL(ch)) break;
        _position = state.position;
        while (ch !== 0 && !is_WS_OR_EOL(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        directiveArgs.push(state.input.slice(_position, state.position));
      }
      if (ch !== 0) readLineBreak(state);
      if (_hasOwnProperty$1.call(directiveHandlers, directiveName)) {
        directiveHandlers[directiveName](state, directiveName, directiveArgs);
      } else {
        throwWarning(state, 'unknown document directive "' + directiveName + '"');
      }
    }
    skipSeparationSpace(state, true, -1);
    if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    } else if (hasDirectives) {
      throwError(state, "directives end mark is expected");
    }
    composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
    skipSeparationSpace(state, true, -1);
    if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(state.input.slice(documentStart, state.position))) {
      throwWarning(state, "non-ASCII line breaks are interpreted as content");
    }
    state.documents.push(state.result);
    if (state.position === state.lineStart && testDocumentSeparator(state)) {
      if (state.input.charCodeAt(state.position) === 46) {
        state.position += 3;
        skipSeparationSpace(state, true, -1);
      }
      return;
    }
    if (state.position < state.length - 1) {
      throwError(state, "end of the stream or a document separator is expected");
    } else {
      return;
    }
  }
  function loadDocuments(input, options) {
    input = String(input);
    options = options || {};
    if (input.length !== 0) {
      if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
        input += "\n";
      }
      if (input.charCodeAt(0) === 65279) {
        input = input.slice(1);
      }
    }
    var state = new State$1(input, options);
    var nullpos = input.indexOf("\0");
    if (nullpos !== -1) {
      state.position = nullpos;
      throwError(state, "null byte is not allowed in input");
    }
    state.input += "\0";
    while (state.input.charCodeAt(state.position) === 32) {
      state.lineIndent += 1;
      state.position += 1;
    }
    while (state.position < state.length - 1) {
      readDocument(state);
    }
    return state.documents;
  }
  function loadAll$1(input, iterator, options) {
    if (iterator !== null && typeof iterator === "object" && typeof options === "undefined") {
      options = iterator;
      iterator = null;
    }
    var documents = loadDocuments(input, options);
    if (typeof iterator !== "function") {
      return documents;
    }
    for (var index = 0, length = documents.length; index < length; index += 1) {
      iterator(documents[index]);
    }
  }
  function load$1(input, options) {
    var documents = loadDocuments(input, options);
    if (documents.length === 0) {
      return void 0;
    } else if (documents.length === 1) {
      return documents[0];
    }
    throw new exception("expected a single document in the stream, but found more");
  }
  var loadAll_1 = loadAll$1;
  var load_1 = load$1;
  var loader = {
    loadAll: loadAll_1,
    load: load_1
  };
  var _toString = Object.prototype.toString;
  var _hasOwnProperty = Object.prototype.hasOwnProperty;
  var CHAR_BOM = 65279;
  var CHAR_TAB = 9;
  var CHAR_LINE_FEED = 10;
  var CHAR_CARRIAGE_RETURN = 13;
  var CHAR_SPACE = 32;
  var CHAR_EXCLAMATION = 33;
  var CHAR_DOUBLE_QUOTE = 34;
  var CHAR_SHARP = 35;
  var CHAR_PERCENT = 37;
  var CHAR_AMPERSAND = 38;
  var CHAR_SINGLE_QUOTE = 39;
  var CHAR_ASTERISK = 42;
  var CHAR_COMMA = 44;
  var CHAR_MINUS = 45;
  var CHAR_COLON = 58;
  var CHAR_EQUALS = 61;
  var CHAR_GREATER_THAN = 62;
  var CHAR_QUESTION = 63;
  var CHAR_COMMERCIAL_AT = 64;
  var CHAR_LEFT_SQUARE_BRACKET = 91;
  var CHAR_RIGHT_SQUARE_BRACKET = 93;
  var CHAR_GRAVE_ACCENT = 96;
  var CHAR_LEFT_CURLY_BRACKET = 123;
  var CHAR_VERTICAL_LINE = 124;
  var CHAR_RIGHT_CURLY_BRACKET = 125;
  var ESCAPE_SEQUENCES = {};
  ESCAPE_SEQUENCES[0] = "\\0";
  ESCAPE_SEQUENCES[7] = "\\a";
  ESCAPE_SEQUENCES[8] = "\\b";
  ESCAPE_SEQUENCES[9] = "\\t";
  ESCAPE_SEQUENCES[10] = "\\n";
  ESCAPE_SEQUENCES[11] = "\\v";
  ESCAPE_SEQUENCES[12] = "\\f";
  ESCAPE_SEQUENCES[13] = "\\r";
  ESCAPE_SEQUENCES[27] = "\\e";
  ESCAPE_SEQUENCES[34] = '\\"';
  ESCAPE_SEQUENCES[92] = "\\\\";
  ESCAPE_SEQUENCES[133] = "\\N";
  ESCAPE_SEQUENCES[160] = "\\_";
  ESCAPE_SEQUENCES[8232] = "\\L";
  ESCAPE_SEQUENCES[8233] = "\\P";
  var DEPRECATED_BOOLEANS_SYNTAX = [
    "y",
    "Y",
    "yes",
    "Yes",
    "YES",
    "on",
    "On",
    "ON",
    "n",
    "N",
    "no",
    "No",
    "NO",
    "off",
    "Off",
    "OFF"
  ];
  var DEPRECATED_BASE60_SYNTAX = /^[-+]?[0-9_]+(?::[0-9_]+)+(?:\.[0-9_]*)?$/;
  function compileStyleMap(schema2, map2) {
    var result, keys, index, length, tag, style, type2;
    if (map2 === null) return {};
    result = {};
    keys = Object.keys(map2);
    for (index = 0, length = keys.length; index < length; index += 1) {
      tag = keys[index];
      style = String(map2[tag]);
      if (tag.slice(0, 2) === "!!") {
        tag = "tag:yaml.org,2002:" + tag.slice(2);
      }
      type2 = schema2.compiledTypeMap["fallback"][tag];
      if (type2 && _hasOwnProperty.call(type2.styleAliases, style)) {
        style = type2.styleAliases[style];
      }
      result[tag] = style;
    }
    return result;
  }
  function encodeHex(character) {
    var string, handle, length;
    string = character.toString(16).toUpperCase();
    if (character <= 255) {
      handle = "x";
      length = 2;
    } else if (character <= 65535) {
      handle = "u";
      length = 4;
    } else if (character <= 4294967295) {
      handle = "U";
      length = 8;
    } else {
      throw new exception("code point within a string may not be greater than 0xFFFFFFFF");
    }
    return "\\" + handle + common.repeat("0", length - string.length) + string;
  }
  var QUOTING_TYPE_SINGLE = 1;
  var QUOTING_TYPE_DOUBLE = 2;
  function State(options) {
    this.schema = options["schema"] || _default;
    this.indent = Math.max(1, options["indent"] || 2);
    this.noArrayIndent = options["noArrayIndent"] || false;
    this.skipInvalid = options["skipInvalid"] || false;
    this.flowLevel = common.isNothing(options["flowLevel"]) ? -1 : options["flowLevel"];
    this.styleMap = compileStyleMap(this.schema, options["styles"] || null);
    this.sortKeys = options["sortKeys"] || false;
    this.lineWidth = options["lineWidth"] || 80;
    this.noRefs = options["noRefs"] || false;
    this.noCompatMode = options["noCompatMode"] || false;
    this.condenseFlow = options["condenseFlow"] || false;
    this.quotingType = options["quotingType"] === '"' ? QUOTING_TYPE_DOUBLE : QUOTING_TYPE_SINGLE;
    this.forceQuotes = options["forceQuotes"] || false;
    this.replacer = typeof options["replacer"] === "function" ? options["replacer"] : null;
    this.implicitTypes = this.schema.compiledImplicit;
    this.explicitTypes = this.schema.compiledExplicit;
    this.tag = null;
    this.result = "";
    this.duplicates = [];
    this.usedDuplicates = null;
  }
  function indentString(string, spaces) {
    var ind = common.repeat(" ", spaces), position = 0, next = -1, result = "", line, length = string.length;
    while (position < length) {
      next = string.indexOf("\n", position);
      if (next === -1) {
        line = string.slice(position);
        position = length;
      } else {
        line = string.slice(position, next + 1);
        position = next + 1;
      }
      if (line.length && line !== "\n") result += ind;
      result += line;
    }
    return result;
  }
  function generateNextLine(state, level) {
    return "\n" + common.repeat(" ", state.indent * level);
  }
  function testImplicitResolving(state, str2) {
    var index, length, type2;
    for (index = 0, length = state.implicitTypes.length; index < length; index += 1) {
      type2 = state.implicitTypes[index];
      if (type2.resolve(str2)) {
        return true;
      }
    }
    return false;
  }
  function isWhitespace(c) {
    return c === CHAR_SPACE || c === CHAR_TAB;
  }
  function isPrintable(c) {
    return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== CHAR_BOM || 65536 <= c && c <= 1114111;
  }
  function isNsCharOrWhitespace(c) {
    return isPrintable(c) && c !== CHAR_BOM && c !== CHAR_CARRIAGE_RETURN && c !== CHAR_LINE_FEED;
  }
  function isPlainSafe(c, prev, inblock) {
    var cIsNsCharOrWhitespace = isNsCharOrWhitespace(c);
    var cIsNsChar = cIsNsCharOrWhitespace && !isWhitespace(c);
    return (
      // ns-plain-safe
      (inblock ? (
        // c = flow-in
        cIsNsCharOrWhitespace
      ) : cIsNsCharOrWhitespace && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET) && c !== CHAR_SHARP && !(prev === CHAR_COLON && !cIsNsChar) || isNsCharOrWhitespace(prev) && !isWhitespace(prev) && c === CHAR_SHARP || prev === CHAR_COLON && cIsNsChar
    );
  }
  function isPlainSafeFirst(c) {
    return isPrintable(c) && c !== CHAR_BOM && !isWhitespace(c) && c !== CHAR_MINUS && c !== CHAR_QUESTION && c !== CHAR_COLON && c !== CHAR_COMMA && c !== CHAR_LEFT_SQUARE_BRACKET && c !== CHAR_RIGHT_SQUARE_BRACKET && c !== CHAR_LEFT_CURLY_BRACKET && c !== CHAR_RIGHT_CURLY_BRACKET && c !== CHAR_SHARP && c !== CHAR_AMPERSAND && c !== CHAR_ASTERISK && c !== CHAR_EXCLAMATION && c !== CHAR_VERTICAL_LINE && c !== CHAR_EQUALS && c !== CHAR_GREATER_THAN && c !== CHAR_SINGLE_QUOTE && c !== CHAR_DOUBLE_QUOTE && c !== CHAR_PERCENT && c !== CHAR_COMMERCIAL_AT && c !== CHAR_GRAVE_ACCENT;
  }
  function isPlainSafeLast(c) {
    return !isWhitespace(c) && c !== CHAR_COLON;
  }
  function codePointAt(string, pos) {
    var first = string.charCodeAt(pos), second;
    if (first >= 55296 && first <= 56319 && pos + 1 < string.length) {
      second = string.charCodeAt(pos + 1);
      if (second >= 56320 && second <= 57343) {
        return (first - 55296) * 1024 + second - 56320 + 65536;
      }
    }
    return first;
  }
  function needIndentIndicator(string) {
    var leadingSpaceRe = /^\n* /;
    return leadingSpaceRe.test(string);
  }
  var STYLE_PLAIN = 1;
  var STYLE_SINGLE = 2;
  var STYLE_LITERAL = 3;
  var STYLE_FOLDED = 4;
  var STYLE_DOUBLE = 5;
  function chooseScalarStyle(string, singleLineOnly, indentPerLevel, lineWidth, testAmbiguousType, quotingType, forceQuotes, inblock) {
    var i;
    var char = 0;
    var prevChar = null;
    var hasLineBreak = false;
    var hasFoldableLine = false;
    var shouldTrackWidth = lineWidth !== -1;
    var previousLineBreak = -1;
    var plain = isPlainSafeFirst(codePointAt(string, 0)) && isPlainSafeLast(codePointAt(string, string.length - 1));
    if (singleLineOnly || forceQuotes) {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
    } else {
      for (i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
        char = codePointAt(string, i);
        if (char === CHAR_LINE_FEED) {
          hasLineBreak = true;
          if (shouldTrackWidth) {
            hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
            i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ";
            previousLineBreak = i;
          }
        } else if (!isPrintable(char)) {
          return STYLE_DOUBLE;
        }
        plain = plain && isPlainSafe(char, prevChar, inblock);
        prevChar = char;
      }
      hasFoldableLine = hasFoldableLine || shouldTrackWidth && (i - previousLineBreak - 1 > lineWidth && string[previousLineBreak + 1] !== " ");
    }
    if (!hasLineBreak && !hasFoldableLine) {
      if (plain && !forceQuotes && !testAmbiguousType(string)) {
        return STYLE_PLAIN;
      }
      return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
    }
    if (indentPerLevel > 9 && needIndentIndicator(string)) {
      return STYLE_DOUBLE;
    }
    if (!forceQuotes) {
      return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
    }
    return quotingType === QUOTING_TYPE_DOUBLE ? STYLE_DOUBLE : STYLE_SINGLE;
  }
  function writeScalar(state, string, level, iskey, inblock) {
    state.dump = (function() {
      if (string.length === 0) {
        return state.quotingType === QUOTING_TYPE_DOUBLE ? '""' : "''";
      }
      if (!state.noCompatMode) {
        if (DEPRECATED_BOOLEANS_SYNTAX.indexOf(string) !== -1 || DEPRECATED_BASE60_SYNTAX.test(string)) {
          return state.quotingType === QUOTING_TYPE_DOUBLE ? '"' + string + '"' : "'" + string + "'";
        }
      }
      var indent = state.indent * Math.max(1, level);
      var lineWidth = state.lineWidth === -1 ? -1 : Math.max(Math.min(state.lineWidth, 40), state.lineWidth - indent);
      var singleLineOnly = iskey || state.flowLevel > -1 && level >= state.flowLevel;
      function testAmbiguity(string2) {
        return testImplicitResolving(state, string2);
      }
      switch (chooseScalarStyle(
        string,
        singleLineOnly,
        state.indent,
        lineWidth,
        testAmbiguity,
        state.quotingType,
        state.forceQuotes && !iskey,
        inblock
      )) {
        case STYLE_PLAIN:
          return string;
        case STYLE_SINGLE:
          return "'" + string.replace(/'/g, "''") + "'";
        case STYLE_LITERAL:
          return "|" + blockHeader(string, state.indent) + dropEndingNewline(indentString(string, indent));
        case STYLE_FOLDED:
          return ">" + blockHeader(string, state.indent) + dropEndingNewline(indentString(foldString(string, lineWidth), indent));
        case STYLE_DOUBLE:
          return '"' + escapeString(string) + '"';
        default:
          throw new exception("impossible error: invalid scalar style");
      }
    })();
  }
  function blockHeader(string, indentPerLevel) {
    var indentIndicator = needIndentIndicator(string) ? String(indentPerLevel) : "";
    var clip = string[string.length - 1] === "\n";
    var keep = clip && (string[string.length - 2] === "\n" || string === "\n");
    var chomp = keep ? "+" : clip ? "" : "-";
    return indentIndicator + chomp + "\n";
  }
  function dropEndingNewline(string) {
    return string[string.length - 1] === "\n" ? string.slice(0, -1) : string;
  }
  function foldString(string, width) {
    var lineRe = /(\n+)([^\n]*)/g;
    var result = (function() {
      var nextLF = string.indexOf("\n");
      nextLF = nextLF !== -1 ? nextLF : string.length;
      lineRe.lastIndex = nextLF;
      return foldLine(string.slice(0, nextLF), width);
    })();
    var prevMoreIndented = string[0] === "\n" || string[0] === " ";
    var moreIndented;
    var match;
    while (match = lineRe.exec(string)) {
      var prefix = match[1], line = match[2];
      moreIndented = line[0] === " ";
      result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
      prevMoreIndented = moreIndented;
    }
    return result;
  }
  function foldLine(line, width) {
    if (line === "" || line[0] === " ") return line;
    var breakRe = / [^ ]/g;
    var match;
    var start = 0, end, curr = 0, next = 0;
    var result = "";
    while (match = breakRe.exec(line)) {
      next = match.index;
      if (next - start > width) {
        end = curr > start ? curr : next;
        result += "\n" + line.slice(start, end);
        start = end + 1;
      }
      curr = next;
    }
    result += "\n";
    if (line.length - start > width && curr > start) {
      result += line.slice(start, curr) + "\n" + line.slice(curr + 1);
    } else {
      result += line.slice(start);
    }
    return result.slice(1);
  }
  function escapeString(string) {
    var result = "";
    var char = 0;
    var escapeSeq;
    for (var i = 0; i < string.length; char >= 65536 ? i += 2 : i++) {
      char = codePointAt(string, i);
      escapeSeq = ESCAPE_SEQUENCES[char];
      if (!escapeSeq && isPrintable(char)) {
        result += string[i];
        if (char >= 65536) result += string[i + 1];
      } else {
        result += escapeSeq || encodeHex(char);
      }
    }
    return result;
  }
  function writeFlowSequence(state, level, object) {
    var _result = "", _tag = state.tag, index, length, value;
    for (index = 0, length = object.length; index < length; index += 1) {
      value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level, value, false, false) || typeof value === "undefined" && writeNode(state, level, null, false, false)) {
        if (_result !== "") _result += "," + (!state.condenseFlow ? " " : "");
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = "[" + _result + "]";
  }
  function writeBlockSequence(state, level, object, compact) {
    var _result = "", _tag = state.tag, index, length, value;
    for (index = 0, length = object.length; index < length; index += 1) {
      value = object[index];
      if (state.replacer) {
        value = state.replacer.call(object, String(index), value);
      }
      if (writeNode(state, level + 1, value, true, true, false, true) || typeof value === "undefined" && writeNode(state, level + 1, null, true, true, false, true)) {
        if (!compact || _result !== "") {
          _result += generateNextLine(state, level);
        }
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          _result += "-";
        } else {
          _result += "- ";
        }
        _result += state.dump;
      }
    }
    state.tag = _tag;
    state.dump = _result || "[]";
  }
  function writeFlowMapping(state, level, object) {
    var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, pairBuffer;
    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
      pairBuffer = "";
      if (_result !== "") pairBuffer += ", ";
      if (state.condenseFlow) pairBuffer += '"';
      objectKey = objectKeyList[index];
      objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level, objectKey, false, false)) {
        continue;
      }
      if (state.dump.length > 1024) pairBuffer += "? ";
      pairBuffer += state.dump + (state.condenseFlow ? '"' : "") + ":" + (state.condenseFlow ? "" : " ");
      if (!writeNode(state, level, objectValue, false, false)) {
        continue;
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = "{" + _result + "}";
  }
  function writeBlockMapping(state, level, object, compact) {
    var _result = "", _tag = state.tag, objectKeyList = Object.keys(object), index, length, objectKey, objectValue, explicitPair, pairBuffer;
    if (state.sortKeys === true) {
      objectKeyList.sort();
    } else if (typeof state.sortKeys === "function") {
      objectKeyList.sort(state.sortKeys);
    } else if (state.sortKeys) {
      throw new exception("sortKeys must be a boolean or a function");
    }
    for (index = 0, length = objectKeyList.length; index < length; index += 1) {
      pairBuffer = "";
      if (!compact || _result !== "") {
        pairBuffer += generateNextLine(state, level);
      }
      objectKey = objectKeyList[index];
      objectValue = object[objectKey];
      if (state.replacer) {
        objectValue = state.replacer.call(object, objectKey, objectValue);
      }
      if (!writeNode(state, level + 1, objectKey, true, true, true)) {
        continue;
      }
      explicitPair = state.tag !== null && state.tag !== "?" || state.dump && state.dump.length > 1024;
      if (explicitPair) {
        if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
          pairBuffer += "?";
        } else {
          pairBuffer += "? ";
        }
      }
      pairBuffer += state.dump;
      if (explicitPair) {
        pairBuffer += generateNextLine(state, level);
      }
      if (!writeNode(state, level + 1, objectValue, true, explicitPair)) {
        continue;
      }
      if (state.dump && CHAR_LINE_FEED === state.dump.charCodeAt(0)) {
        pairBuffer += ":";
      } else {
        pairBuffer += ": ";
      }
      pairBuffer += state.dump;
      _result += pairBuffer;
    }
    state.tag = _tag;
    state.dump = _result || "{}";
  }
  function detectType(state, object, explicit) {
    var _result, typeList, index, length, type2, style;
    typeList = explicit ? state.explicitTypes : state.implicitTypes;
    for (index = 0, length = typeList.length; index < length; index += 1) {
      type2 = typeList[index];
      if ((type2.instanceOf || type2.predicate) && (!type2.instanceOf || typeof object === "object" && object instanceof type2.instanceOf) && (!type2.predicate || type2.predicate(object))) {
        if (explicit) {
          if (type2.multi && type2.representName) {
            state.tag = type2.representName(object);
          } else {
            state.tag = type2.tag;
          }
        } else {
          state.tag = "?";
        }
        if (type2.represent) {
          style = state.styleMap[type2.tag] || type2.defaultStyle;
          if (_toString.call(type2.represent) === "[object Function]") {
            _result = type2.represent(object, style);
          } else if (_hasOwnProperty.call(type2.represent, style)) {
            _result = type2.represent[style](object, style);
          } else {
            throw new exception("!<" + type2.tag + '> tag resolver accepts not "' + style + '" style');
          }
          state.dump = _result;
        }
        return true;
      }
    }
    return false;
  }
  function writeNode(state, level, object, block, compact, iskey, isblockseq) {
    state.tag = null;
    state.dump = object;
    if (!detectType(state, object, false)) {
      detectType(state, object, true);
    }
    var type2 = _toString.call(state.dump);
    var inblock = block;
    var tagStr;
    if (block) {
      block = state.flowLevel < 0 || state.flowLevel > level;
    }
    var objectOrArray = type2 === "[object Object]" || type2 === "[object Array]", duplicateIndex, duplicate;
    if (objectOrArray) {
      duplicateIndex = state.duplicates.indexOf(object);
      duplicate = duplicateIndex !== -1;
    }
    if (state.tag !== null && state.tag !== "?" || duplicate || state.indent !== 2 && level > 0) {
      compact = false;
    }
    if (duplicate && state.usedDuplicates[duplicateIndex]) {
      state.dump = "*ref_" + duplicateIndex;
    } else {
      if (objectOrArray && duplicate && !state.usedDuplicates[duplicateIndex]) {
        state.usedDuplicates[duplicateIndex] = true;
      }
      if (type2 === "[object Object]") {
        if (block && Object.keys(state.dump).length !== 0) {
          writeBlockMapping(state, level, state.dump, compact);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowMapping(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object Array]") {
        if (block && state.dump.length !== 0) {
          if (state.noArrayIndent && !isblockseq && level > 0) {
            writeBlockSequence(state, level - 1, state.dump, compact);
          } else {
            writeBlockSequence(state, level, state.dump, compact);
          }
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + state.dump;
          }
        } else {
          writeFlowSequence(state, level, state.dump);
          if (duplicate) {
            state.dump = "&ref_" + duplicateIndex + " " + state.dump;
          }
        }
      } else if (type2 === "[object String]") {
        if (state.tag !== "?") {
          writeScalar(state, state.dump, level, iskey, inblock);
        }
      } else if (type2 === "[object Undefined]") {
        return false;
      } else {
        if (state.skipInvalid) return false;
        throw new exception("unacceptable kind of an object to dump " + type2);
      }
      if (state.tag !== null && state.tag !== "?") {
        tagStr = encodeURI(
          state.tag[0] === "!" ? state.tag.slice(1) : state.tag
        ).replace(/!/g, "%21");
        if (state.tag[0] === "!") {
          tagStr = "!" + tagStr;
        } else if (tagStr.slice(0, 18) === "tag:yaml.org,2002:") {
          tagStr = "!!" + tagStr.slice(18);
        } else {
          tagStr = "!<" + tagStr + ">";
        }
        state.dump = tagStr + " " + state.dump;
      }
    }
    return true;
  }
  function getDuplicateReferences(object, state) {
    var objects = [], duplicatesIndexes = [], index, length;
    inspectNode(object, objects, duplicatesIndexes);
    for (index = 0, length = duplicatesIndexes.length; index < length; index += 1) {
      state.duplicates.push(objects[duplicatesIndexes[index]]);
    }
    state.usedDuplicates = new Array(length);
  }
  function inspectNode(object, objects, duplicatesIndexes) {
    var objectKeyList, index, length;
    if (object !== null && typeof object === "object") {
      index = objects.indexOf(object);
      if (index !== -1) {
        if (duplicatesIndexes.indexOf(index) === -1) {
          duplicatesIndexes.push(index);
        }
      } else {
        objects.push(object);
        if (Array.isArray(object)) {
          for (index = 0, length = object.length; index < length; index += 1) {
            inspectNode(object[index], objects, duplicatesIndexes);
          }
        } else {
          objectKeyList = Object.keys(object);
          for (index = 0, length = objectKeyList.length; index < length; index += 1) {
            inspectNode(object[objectKeyList[index]], objects, duplicatesIndexes);
          }
        }
      }
    }
  }
  function dump$1(input, options) {
    options = options || {};
    var state = new State(options);
    if (!state.noRefs) getDuplicateReferences(input, state);
    var value = input;
    if (state.replacer) {
      value = state.replacer.call({ "": value }, "", value);
    }
    if (writeNode(state, 0, value, true, true)) return state.dump + "\n";
    return "";
  }
  var dump_1 = dump$1;
  var dumper = {
    dump: dump_1
  };
  function renamed(from, to) {
    return function() {
      throw new Error("Function yaml." + from + " is removed in js-yaml 4. Use yaml." + to + " instead, which is now safe by default.");
    };
  }
  var Type = type;
  var Schema = schema;
  var FAILSAFE_SCHEMA = failsafe;
  var JSON_SCHEMA = json;
  var CORE_SCHEMA = core;
  var DEFAULT_SCHEMA = _default;
  var load = loader.load;
  var loadAll = loader.loadAll;
  var dump = dumper.dump;
  var YAMLException = exception;
  var types = {
    binary,
    float,
    map,
    null: _null,
    pairs,
    set,
    timestamp,
    bool,
    int,
    merge,
    omap,
    seq,
    str
  };
  var safeLoad = renamed("safeLoad", "load");
  var safeLoadAll = renamed("safeLoadAll", "loadAll");
  var safeDump = renamed("safeDump", "dump");
  var jsYaml = {
    Type,
    Schema,
    FAILSAFE_SCHEMA,
    JSON_SCHEMA,
    CORE_SCHEMA,
    DEFAULT_SCHEMA,
    load,
    loadAll,
    dump,
    YAMLException,
    types,
    safeLoad,
    safeLoadAll,
    safeDump
  };

  // src/engine/normalize.ts
  function normalizeTable(table, filename) {
    table.filename = filename;
    if (typeof table.type === "string" && table.type.includes(",")) {
      table.type = table.type.split(",").map((t) => t.trim());
    }
    normalizeSubTable(table, filename.replace(/\.(yaml|yml)$/, ""), 0);
  }
  function normalizeSubTable(table, parentName, index) {
    if (!table.tablename) {
      table.tablename = `${parentName}_SubTable_${index + 1}`;
    }
    if (Array.isArray(table.results)) {
      table.results.forEach((entry, i) => {
        if (typeof entry !== "string") return;
        const match = entry.match(/^(.+?)\s*\^(\d+(?:\.\d+)?)$/);
        if (match) table.results[i] = [match[1], parseFloat(match[2])];
      });
    }
    for (const key of ["tables", "subTables"]) {
      if (Array.isArray(table[key])) {
        table[key].forEach((sub, i) => {
          if (sub && typeof sub === "object") normalizeSubTable(sub, table.tablename, i);
        });
      }
    }
  }

  // src/engine/sync.ts
  var MemoryTableStorage = class {
    constructor() {
      this.store = /* @__PURE__ */ new Map();
    }
    async saveTable(record) {
      this.store.set(record.filename, record);
    }
    async getTable(filename) {
      return this.store.get(filename);
    }
    async getAllTables() {
      return Array.from(this.store.values());
    }
    async deleteTable(filename) {
      this.store.delete(filename);
    }
    async clearAll() {
      this.store.clear();
    }
  };
  var IndexedDBTableStorage = class {
    constructor() {
      this.dbName = "TTRPG_Tables_DB";
      this.storeName = "tables";
      this.version = 1;
    }
    async openDB() {
      return new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          return reject(new Error("IndexedDB is not available in this environment"));
        }
        const request = indexedDB.open(this.dbName, this.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: "filename" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async saveTable(record) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    async getTable(filename) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.get(filename);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    async getAllTables() {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readonly");
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    async deleteTable(filename) {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.delete(filename);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
    async clearAll() {
      const db = await this.openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, "readwrite");
        const store = tx.objectStore(this.storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    }
  };
  var GitHubTableSyncProvider = class {
    constructor(storage) {
      if (storage) {
        this.storage = storage;
      } else if (typeof indexedDB !== "undefined") {
        this.storage = new IndexedDBTableStorage();
      } else {
        this.storage = new MemoryTableStorage();
      }
    }
    getStorage() {
      return this.storage;
    }
    /**
     * Sync tables from a remote GitHub repository.
     */
    async syncFromGitHub(config, onProgress, customFetch = fetch) {
      const branch = config.branch || "main";
      const headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "TTRPG-Generator-Sync"
      };
      if (config.token) {
        headers["Authorization"] = `token ${config.token}`;
      }
      const treeUrl = `https://api.github.com/repos/${config.repoOwner}/${config.repoName}/git/trees/${branch}?recursive=1`;
      const treeRes = await customFetch(treeUrl, { headers });
      if (!treeRes.ok) {
        throw new Error(`Failed to fetch repo tree: ${treeRes.status} ${treeRes.statusText}`);
      }
      const treeData = await treeRes.json();
      if (!treeData.tree || !Array.isArray(treeData.tree)) {
        throw new Error("Invalid repository tree response from GitHub");
      }
      const prefix = config.tablePath ? config.tablePath.replace(/^\/+|\/+$/g, "") + "/" : "";
      const yamlEntries = treeData.tree.filter((item) => {
        if (item.type !== "blob") return false;
        const isYaml = item.path.endsWith(".yaml") || item.path.endsWith(".yml");
        if (!isYaml) return false;
        if (prefix) return item.path.startsWith(prefix);
        return true;
      });
      const totalFiles = yamlEntries.length;
      const parsedTables = [];
      for (let i = 0; i < yamlEntries.length; i++) {
        const entry = yamlEntries[i];
        const filename = entry.path.split("/").pop() || entry.path;
        if (onProgress) {
          onProgress({
            totalFiles,
            completedFiles: i,
            currentFile: filename
          });
        }
        const rawUrl = `https://raw.githubusercontent.com/${config.repoOwner}/${config.repoName}/${branch}/${entry.path}`;
        const fileRes = await customFetch(rawUrl, { headers });
        if (fileRes.ok) {
          const text = await fileRes.text();
          await this.storage.saveTable({
            filename,
            content: text,
            syncedAt: Date.now(),
            hash: entry.sha
          });
          try {
            const parsed = jsYaml.load(text);
            const tables = Array.isArray(parsed) ? parsed : [parsed];
            tables.forEach((t) => {
              normalizeTable(t, filename);
              parsedTables.push(t);
            });
          } catch (e) {
            console.warn(`[Sync] Failed to parse YAML for ${filename}: ${e.message}`);
          }
        }
      }
      if (onProgress) {
        onProgress({
          totalFiles,
          completedFiles: totalFiles,
          currentFile: "Complete"
        });
      }
      return parsedTables;
    }
    /**
     * 4.3 Local Filesystem / Dropped Files parser:
     * Parses multiple local file contents and saves them to local TableStorage.
     */
    async importLocalFiles(files) {
      const tables = [];
      for (const file of files) {
        if (!file.name.endsWith(".yaml") && !file.name.endsWith(".yml")) continue;
        await this.storage.saveTable({
          filename: file.name,
          content: file.content,
          syncedAt: Date.now()
        });
        try {
          const parsed = jsYaml.load(file.content);
          const tableList = Array.isArray(parsed) ? parsed : [parsed];
          tableList.forEach((t) => {
            normalizeTable(t, file.name);
            tables.push(t);
          });
        } catch (e) {
          console.warn(`[Import] Failed to parse ${file.name}: ${e.message}`);
        }
      }
      return tables;
    }
    /**
     * Load and parse all currently stored tables from TableStorage into runtime Tables.
     */
    async loadStoredTables() {
      const records = await this.storage.getAllTables();
      const tables = [];
      for (const rec of records) {
        try {
          const parsed = jsYaml.load(rec.content);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          list.forEach((t) => {
            normalizeTable(t, rec.filename);
            tables.push(t);
          });
        } catch (e) {
          console.warn(`[LoadStored] Could not parse stored ${rec.filename}: ${e.message}`);
        }
      }
      return tables;
    }
  };

  // src/engine/browser.ts
  var TTRPG = {
    TableLoader,
    Renderer,
    ExecutionEngine,
    createCardFromResult,
    updateNodeValue,
    findNodeById,
    serializeCard,
    hydrateCard,
    exportCardToMarkdown,
    parseTemplate,
    walkTemplate,
    GitHubTableSyncProvider,
    IndexedDBTableStorage,
    MemoryTableStorage,
    normalizeTable,
    normalizeSubTable,
    yaml: jsYaml
  };
  if (typeof window !== "undefined") {
    window.TTRPG = TTRPG;
  }
  var browser_default = TTRPG;
  return __toCommonJS(browser_exports);
})();
/*! Bundled license information:

js-yaml/dist/js-yaml.mjs:
  (*! js-yaml 4.1.1 https://github.com/nodeca/js-yaml @license MIT *)
*/
