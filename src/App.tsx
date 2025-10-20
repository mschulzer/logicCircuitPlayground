import React, { useMemo, useState } from "react";

// Simple, dependency-free Boolean expression builder with drag & drop tokens.
// Build expressions from A/B/C/TRUE/FALSE, &&, ||, ! and parentheses.
// Live-evaluates under current input toggles and can generate a truth table.

// --- Token helpers ---
const VARS = ["A", "B", "C", "TRUE", "FALSE"] as const;
const OPS = ["&&", "||", "!"] as const;

type VarToken = { type: "VAR"; value: typeof VARS[number] };
type OpToken = { type: "OP"; value: typeof OPS[number] };
type ParenToken = { type: "LPAREN" | "RPAREN" };

type Token = VarToken | OpToken | ParenToken;

const isOperand = (t?: Token) => t && (t.type === "VAR" || t.type === "RPAREN");
const isOperator = (t?: Token) => t && t.type === "OP";
const isPrefixUnary = (t?: Token) => t && t.type === "OP" && t.value === "!";

// --- Parsing & evaluation (Shunting-yard to RPN) ---
const precedence: Record<string, number> = { "!": 3, "&&": 2, "||": 1 };
const rightAssociative = new Set(["!"]); // ! is right-associative

function toRPN(tokens: Token[]): (Token | string)[] {
  const output: (Token | string)[] = [];
  const stack: OpToken[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "VAR") {
      output.push(t);
    } else if (t.type === "OP") {
      const o1 = t.value;
      while (stack.length) {
        const o2 = stack[stack.length - 1]?.value;
        if (
          o2 &&
          ((rightAssociative.has(o1) && precedence[o1] < precedence[o2]) ||
            (!rightAssociative.has(o1) && precedence[o1] <= precedence[o2]))
        ) {
          output.push(stack.pop()!);
        } else break;
      }
      stack.push(t);
    } else if (t.type === "LPAREN") {
      // push a marker so we can detect mismatched parens more clearly
      (stack as (OpToken | ParenToken)[]).push(t);
    } else if (t.type === "RPAREN") {
      let foundLeft = false;
      while (stack.length) {
        const top = stack.pop() as OpToken | ParenToken | undefined;
        if (!top) break;
        if ((top as ParenToken).type === "LPAREN") {
          foundLeft = true;
          break;
        }
        output.push(top as OpToken);
      }
      if (!foundLeft) throw new Error("Mismatched parentheses");
    }
  }
  while (stack.length) {
    const top = stack.pop() as OpToken | ParenToken;
    if ((top as ParenToken).type === "LPAREN") throw new Error("Mismatched parentheses");
    output.push(top as OpToken);
  }
  return output;
}

function evalRPN(rpn: (Token | string)[], env: Record<string, boolean>): boolean {
  const st: boolean[] = [];
  for (const t of rpn) {
    if (typeof t !== "string" && t.type === "VAR") {
      if (t.value === "TRUE") st.push(true);
      else if (t.value === "FALSE") st.push(false);
      else st.push(Boolean(env[t.value]));
    } else {
      const op = (t as OpToken).value;
      if (op === "!") {
        if (st.length < 1) throw new Error("Invalid unary operator placement");
        st.push(!st.pop()!);
      } else if (op === "&&") {
        if (st.length < 2) throw new Error("Invalid AND placement");
        const b = st.pop()!;
        const a = st.pop()!;
        st.push(a && b);
      } else if (op === "||") {
        if (st.length < 2) throw new Error("Invalid OR placement");
        const b = st.pop()!;
        const a = st.pop()!;
        st.push(a || b);
      } else {
        throw new Error("Unknown operator");
      }
    }
  }
  if (st.length !== 1) throw new Error("Incomplete expression");
  return st[0]!;
}

function safeEvaluate(tokens: Token[], env: Record<string, boolean>) {
  // Quick validity checks for common mistakes
  if (!tokens.length) throw new Error("Empty expression");

  // Disallow two operands in a row, or binary op at start/end
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = tokens[i - 1];
    const next = tokens[i + 1];

    if (t.type === "VAR" && (next?.type === "VAR" || next?.type === "LPAREN")) {
      throw new Error("Missing operator between operands");
    }
    if ((t.type === "RPAREN") && (next?.type === "VAR" || next?.type === "LPAREN")) {
      throw new Error("Missing operator between ) and next token");
    }
    if (t.type === "OP" && t.value !== "!" && (!prev || !next)) {
      throw new Error("Binary operator needs operands on both sides");
    }
    if (t.type === "OP" && t.value !== "!" && (isOperator(prev) || prev?.type === "LPAREN")) {
      throw new Error("Binary operator cannot follow an operator or (");
    }
    if (isPrefixUnary(t) && (next?.type === "OP" && next.value !== "!")) {
      throw new Error("! must be followed by an operand or (");
    }
  }

  const rpn = toRPN(tokens);
  return evalRPN(rpn, env);
}

// --- UI components ---
function Chip({ children, onClick, draggable = false, onDragStart }: any) {
  return (
    <button
      className="px-3 py-1 rounded-2xl shadow-sm border text-sm hover:shadow transition active:scale-[0.98] bg-white"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      type="button"
    >
      {children}
    </button>
  );
}

function TokenChip({ token, onRemove, idx, onDragStart }: { token: Token; onRemove: () => void; idx: number; onDragStart: (e:any)=>void }) {
  const label = token.type === "VAR" ? token.value : token.type === "OP" ? token.value : token.type === "LPAREN" ? "(" : ")";
  return (
    <div
      className="flex items-center gap-1 px-2 py-1 rounded-2xl border bg-white shadow-sm select-none"
      draggable
      onDragStart={onDragStart}
      data-index={idx}
    >
      <span className="text-sm">{label}</span>
      <button className="ml-1 text-xs opacity-60 hover:opacity-100" onClick={onRemove} title="Remove">✕</button>
    </div>
  );
}

export default function App() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [env, setEnv] = useState<Record<string, boolean>>({ A: false, B: false, C: false });
  const [showTable, setShowTable] = useState(false);

  const result = useMemo(() => {
    try {
      const val = safeEvaluate(tokens, env);
      return { ok: true as const, val };
    } catch (e: any) {
      return { ok: false as const, error: e.message as string };
    }
  }, [tokens, env]);

  function addToken(t: Token) {
    setTokens((prev) => [...prev, t]);
  }

  function handleDropAdd(e: React.DragEvent) {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const t = JSON.parse(data) as Token;
    // If dropping between chips, we stored an index in the data
    const insertAtStr = e.dataTransfer.getData("text/insertIndex");
    if (insertAtStr) {
      const insertAt = Number(insertAtStr);
      setTokens((prev) => {
        const next = prev.slice();
        next.splice(insertAt, 0, t);
        return next;
      });
    } else {
      addToken(t);
    }
  }

  function handleReorderDrop(e: React.DragEvent) {
    e.preventDefault();
    const fromStr = e.dataTransfer.getData("text/fromIndex");
    const toStr = e.dataTransfer.getData("text/insertIndex");
    if (!fromStr || !toStr) return;
    const from = Number(fromStr);
    const to = Number(toStr);
    setTokens((prev) => {
      const next = prev.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function paletteDragStart(t: Token) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData("application/json", JSON.stringify(t));
    };
  }

  function tokenDragStart(idx: number) {
    return (e: React.DragEvent) => {
      e.dataTransfer.setData("text/fromIndex", String(idx));
    };
  }

  function allowDrop(e: React.DragEvent) { e.preventDefault(); }

  function insertIndicator(idx: number) {
    return (
      <div
        key={"insert-"+idx}
        className="w-2 h-8 mx-1 rounded bg-transparent"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          // Try reorder first; fall back to add
          if (e.dataTransfer.getData("text/fromIndex")) {
            e.dataTransfer.setData("text/insertIndex", String(idx));
            handleReorderDrop(e);
          } else {
            e.dataTransfer.setData("text/insertIndex", String(idx));
            handleDropAdd(e);
          }
        }}
      />
    );
  }

  const exprChips = (
    <div className="flex flex-wrap items-center gap-2">
      {insertIndicator(0)}
      {tokens.map((t, i) => (
        <React.Fragment key={i}>
          <TokenChip
            token={t}
            idx={i}
            onRemove={() => setTokens((prev) => prev.filter((_, j) => j !== i))}
            onDragStart={tokenDragStart(i)}
          />
          {insertIndicator(i + 1)}
        </React.Fragment>
      ))}
    </div>
  );

  // Build truth table over variables actually used
  const usedVars = useMemo(() => {
    const s = new Set<string>();
    tokens.forEach((t) => { if (t.type === "VAR" && ["A","B","C"].includes(t.value)) s.add(t.value); });
    return Array.from(s).sort();
  }, [tokens]);

  const truthTable = useMemo(() => {
    if (!showTable || usedVars.length === 0) return [] as any[];
    const rows: any[] = [];
    const n = usedVars.length;
    const total = 1 << n;
    for (let mask = 0; mask < total; mask++) {
      const assignment: Record<string, boolean> = { A: false, B: false, C: false };
      usedVars.forEach((v, i) => { assignment[v] = Boolean((mask >> (n - 1 - i)) & 1); });
      try {
        const val = safeEvaluate(tokens, assignment);
        rows.push({ ...assignment, RESULT: val });
      } catch (e) {
        rows.push({ ...assignment, RESULT: "—" });
      }
    }
    return rows;
  }, [showTable, tokens, usedVars]);

  return (
    <div className="min-h-screen w-full bg-slate-50 text-slate-800">
      <div className="max-w-5xl mx-auto p-6">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Logic Circuit Playground</h1>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-xl border bg-white hover:shadow"
              onClick={() => setTokens([])}
            >Clear</button>
            <button
              className="px-3 py-1 rounded-xl border bg-white hover:shadow"
              onClick={() => setShowTable((s) => !s)}
            >{showTable ? "Hide" : "Show"} Truth Table</button>
          </div>
        </header>

        {/* Inputs & palette */}
        <div className="grid md:grid-cols-3 gap-6">
          <section className="md:col-span-1">
            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="font-medium mb-3">Inputs</h2>
              <div className="flex gap-3 mb-4">
                {["A", "B", "C"].map((k) => (
                  <button
                    key={k}
                    className={`px-4 py-2 rounded-xl border shadow-sm ${env[k] ? "bg-green-100" : "bg-white"}`}
                    onClick={() => setEnv((e) => ({ ...e, [k]: !e[k] }))}
                  >{k}: {String(env[k])}</button>
                ))}
              </div>
              <div className="text-xs opacity-70">Click to toggle inputs. Drag or click tokens below to build your expression.</div>
            </div>

            <div className="mt-4 p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="font-medium mb-3">Palette</h2>
              <div className="mb-2 text-xs opacity-70">Drag onto the expression lane or click to append.</div>
              <div className="grid grid-cols-3 gap-2">
                {VARS.map((v) => (
                  <Chip
                    key={v}
                    draggable
                    onDragStart={paletteDragStart({ type: "VAR", value: v })}
                    onClick={() => addToken({ type: "VAR", value: v })}
                  >{v}</Chip>
                ))}
                {OPS.map((o) => (
                  <Chip
                    key={o}
                    draggable
                    onDragStart={paletteDragStart({ type: "OP", value: o })}
                    onClick={() => addToken({ type: "OP", value: o })}
                  >{o}</Chip>
                ))}
                <Chip
                  draggable
                  onDragStart={paletteDragStart({ type: "LPAREN" })}
                  onClick={() => addToken({ type: "LPAREN" })}
                >"("</Chip>
                <Chip
                  draggable
                  onDragStart={paletteDragStart({ type: "RPAREN" })}
                  onClick={() => addToken({ type: "RPAREN" })}
                >")"</Chip>
              </div>
            </div>
          </section>

          {/* Expression lane */}
          <section className="md:col-span-2">
            <div className="p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="font-medium mb-3">Expression</h2>
              <div
                className="min-h-[80px] p-3 rounded-xl bg-slate-100 border border-dashed flex flex-wrap items-center gap-2"
                onDragOver={allowDrop}
                onDrop={handleDropAdd}
                aria-label="Drop tokens here"
              >
                {tokens.length === 0 ? (
                  <span className="text-sm opacity-60">Drag tokens here or click from the palette…</span>
                ) : (
                  exprChips
                )}
              </div>
              <div className="mt-3 text-sm">
                <span className="opacity-60 mr-2">Used variables:</span>
                {usedVars.length ? usedVars.join(", ") : "—"}
              </div>
            </div>

            {/* Result card */}
            <div className="mt-4 p-4 rounded-2xl bg-white shadow-sm border">
              <h2 className="font-medium mb-2">Result</h2>
              {result.ok ? (
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-xl border ${result.val ? "bg-green-100" : "bg-red-100"}`}>
                    {String(result.val).toUpperCase()}
                  </div>
                  <div className="text-xs opacity-70">Evaluated under A={String(env.A)}, B={String(env.B)}, C={String(env.C)}</div>
                </div>
              ) : (
                <div className="text-red-600 text-sm">{result.error}</div>
              )}
            </div>

            {/* Truth table */}
            {showTable && (
              <div className="mt-4 p-4 rounded-2xl bg-white shadow-sm border overflow-x-auto">
                <h2 className="font-medium mb-3">Truth Table (for used variables)</h2>
                {usedVars.length === 0 ? (
                  <div className="text-sm opacity-70">Add A, B, or C to the expression to generate a table.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left border-b">
                        {usedVars.map((v) => (
                          <th key={v} className="py-1 pr-4">{v}</th>
                        ))}
                        <th className="py-1">RESULT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {truthTable.map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {usedVars.map((v) => (
                            <td key={v} className="py-1 pr-4">{String(row[v])}</td>
                          ))}
                          <td className="py-1 font-medium">{String(row.RESULT)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </section>
        </div>

        <footer className="mt-8 text-xs opacity-60">
          Tips: Use <code>!</code> for NOT, <code>&&</code> for AND, <code>||</code> for OR. Parentheses control grouping.
        </footer>
      </div>
    </div>
  );
}
