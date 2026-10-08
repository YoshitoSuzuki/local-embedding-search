// ブラウザで動く部分。やっているのは「入力を API に送り、返ってきた JSON を画面に描く」ことだけ。
// Embedding も類似度の計算もサーバー側（backend/）で行い、ブラウザにはモデルを置かない。
// このファイルは `npm run build` で frontend/dist/app.js に変換されてから読み込まれる。

/* ---------- API が返す JSON の形 ---------- */

type Status = { model: string; dtype: string; device: string; offline: boolean };

type SearchResult = { id: number; title: string; description: string; similarity: number };

type SearchResponse = {
  results: SearchResult[];
  trace: {
    request: { query: string };
    embedding: { input: string; dimension: number; vector_head: number[]; ms: number };
    database: { sql: string; rows: number; reembedded: number };
  };
};

type RegisterResponse = {
  id: number;
  trace: {
    embedding: { input: string; dimension: number; vector_head: number[]; bytes: number; ms: number };
    database: { sql: string };
  };
};

type BookSummary = { id: number; title: string; description: string; dimension: number; vector_head: number[] };

type BooksResponse = { books: BookSummary[]; sql: string; total: number };

type BookDetail = BookSummary & { model: string; dtype: string; bytes: number; norm: number; vector: number[] };

/* ---------- 小さな道具 ---------- */

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

type Attrs = Record<string, string | ((event: Event) => void)>;

// 要素を作る。文字は textContent で入れるので、入力に HTML が入っても実行されない
function el(tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === "function") node.addEventListener(key.slice(2), value);
    else if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  node.append(...children);
  return node;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...options });
  if (res.status === 204) return null as T;
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail ?? res.statusText);
  return body as T;
}

const fmt = (x: number) => x.toFixed(4);
const vectorHead = (v: number[]) => `[${v.map(fmt).join(", ")}, …]`;
const pre = (text: string) => el("pre", { class: "mono", text });

function dl(pairs: [string, string][]): HTMLElement {
  const list = el("dl");
  for (const [k, v] of pairs) list.append(el("dt", { text: k }), el("dd", { text: v }));
  return list;
}

function step(num: number, name: string, extra: string, body: HTMLElement[], blue = false): HTMLElement {
  return el("div", { class: "step" },
    el("div", { class: "step-head" },
      el("span", { class: blue ? "num blue" : "num", text: String(num) }),
      el("span", { class: "name", text: name }),
      el("span", { class: "muted", text: extra }),
    ),
    ...body,
  );
}

/* ---------- 画面の切り替え（#search / #register / #database） ---------- */

const views = ["search", "register", "database"];

function showView(): void {
  const hash = location.hash.slice(1);
  const current = views.includes(hash) ? hash : "search";
  for (const name of views) $(`view-${name}`).hidden = name !== current;
  for (const a of document.querySelectorAll<HTMLAnchorElement>(".segmented a")) {
    a.classList.toggle("active", a.dataset.view === current);
  }
  if (current === "database") void loadBooks();
}

window.addEventListener("hashchange", showView);

/* ---------- ヘッダーのモデル表示 ---------- */

async function loadStatus(): Promise<void> {
  const s = await api<Status>("/api/status");
  $("status-text").textContent = `${s.model.split("/").pop()} · ${s.dtype} · ${s.device} · ${s.offline ? "offline" : "online"}`;
  $("status-text").parentElement?.classList.add("ready");
}

/* ---------- 検索 ---------- */

// 類似度のバーは、今回の結果の最小〜最大に引き伸ばして描く（e5 は値が 0.7〜0.9 に集まるため）
function barWidths(results: SearchResult[]): number[] {
  const scores = results.map((r) => r.similarity);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return scores.map((s) => (max === min ? 100 : 8 + (92 * (s - min)) / (max - min)));
}

async function runSearch(event?: SubmitEvent): Promise<void> {
  event?.preventDefault();
  const query = $<HTMLInputElement>("q").value.trim();
  if (!query) return;
  const button = event?.submitter as HTMLButtonElement | null | undefined;
  if (button) button.disabled = true;
  try {
    const data = await api<SearchResponse>("/api/search", { method: "POST", body: JSON.stringify({ query }) });
    renderResults(data.results);
    renderSearchTrace(data.trace);
  } catch (err) {
    $("results").replaceChildren(el("div", { class: "empty", text: (err as Error).message }));
  } finally {
    if (button) button.disabled = false;
  }
}

function renderResults(results: SearchResult[]): void {
  $("result-count").textContent = `${results.length}件`;
  if (results.length === 0) {
    $("results").replaceChildren(el("div", { class: "empty", text: "該当なし" }));
    return;
  }
  const widths = barWidths(results);
  $("results").replaceChildren(...results.map((r, i) => {
    const fill = el("div", { style: "width: 0%" });
    requestAnimationFrame(() => { fill.style.width = `${widths[i]}%`; });
    return el("article", { class: i === 0 ? "result top" : "result" },
      el("div", { class: "rank", text: String(i + 1) }),
      el("div", {},
        el("div", { class: "title", text: r.title }),
        el("div", { class: "desc", text: r.description }),
      ),
      el("div", { class: "score" },
        el("div", { class: "value", text: fmt(r.similarity) }),
        el("div", { class: "bar" }, fill),
      ),
    );
  }));
}

function renderSearchTrace(t: SearchResponse["trace"]): void {
  $("search-trace").replaceChildren(
    step(1, "リクエスト", "", [pre(`POST /api/search\n${JSON.stringify(t.request)}`)]),
    step(2, "Embedding", `${t.embedding.ms} ms`, [dl([
      ["入力", t.embedding.input],
      ["次元", String(t.embedding.dimension)],
      ["出力", vectorHead(t.embedding.vector_head)],
    ])], true),
    step(3, "データベース", `${t.database.rows} 行 · 再Embedding ${t.database.reembedded}`, [pre(t.database.sql)]),
    step(4, "コサイン類似度", "", [pre("query_vec · book_vec  （長さ 1 どうし）")]),
  );
}

$("search-form").addEventListener("submit", (e) => void runSearch(e as SubmitEvent));

/* ---------- アイコン ---------- */

function icon(size: number, strokeWidth: string, paths: string[]): SVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const attrs: Record<string, string> = {
    width: String(size), height: String(size), viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
    "stroke-width": strokeWidth, "stroke-linecap": "round", "stroke-linejoin": "round",
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const d of paths) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const trashIcon = () => icon(17, "1.8", ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"]);
const chevronIcon = () => icon(14, "2.4", ["M9 5l7 7-7 7"]);

/* ---------- 登録 ---------- */

const titleInput = $<HTMLInputElement>("title");
const descInput = $<HTMLTextAreaElement>("desc");

function updatePreview(): void {
  $("passage-preview").textContent = `passage: ${titleInput.value.trim()}\n${descInput.value.trim()}`;
}

titleInput.addEventListener("input", updatePreview);
descInput.addEventListener("input", updatePreview);
$("register-form").addEventListener("reset", () => setTimeout(updatePreview));

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = (event as SubmitEvent).submitter as HTMLButtonElement;
  button.disabled = true;
  $("register-error").hidden = true;
  try {
    const data = await api<RegisterResponse>("/api/books", {
      method: "POST",
      body: JSON.stringify({ title: titleInput.value.trim(), description: descInput.value.trim() }),
    });
    const e = data.trace.embedding;
    $("saved-badge").hidden = false;
    $("register-trace").replaceChildren(
      step(1, "Embedding", `${e.ms} ms`, [dl([
        ["次元", String(e.dimension)],
        ["出力", vectorHead(e.vector_head)],
        ["サイズ", `${e.bytes.toLocaleString()} bytes`],
      ])], true),
      step(2, "データベース", `id ${data.id}`, [pre(data.trace.database.sql.replace(" (title", "\n  (title").replace(" VALUES", "\nVALUES"))]),
      el("a", { href: "#database", class: "row-button" }, el("span", { text: "データベースで見る" }), chevronIcon()),
    );
    selectedId = data.id;
  } catch (err) {
    $("register-error").textContent = (err as Error).message;
    $("register-error").hidden = false;
  } finally {
    button.disabled = false;
  }
});

/* ---------- データベース ---------- */

let selectedId: number | null = null;
let showAll = false;
let searchTimer: number | undefined;

$("dbq").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadBooks(), 150);
});

async function loadBooks(): Promise<void> {
  const q = $<HTMLInputElement>("dbq").value;
  const data = await api<BooksResponse>(`/api/books?q=${encodeURIComponent(q)}`);
  $("db-total").textContent = `books · ${data.total} 行`;
  $("db-sql").textContent = data.sql;
  $("db-count").textContent = `${data.books.length} / ${data.total} 件`;
  $("db-empty").hidden = data.books.length > 0;

  if (!data.books.some((b) => b.id === selectedId)) selectedId = data.books[0]?.id ?? null;

  $("db-rows").replaceChildren(...data.books.map((b) => el("tr", { class: b.id === selectedId ? "selected" : "" },
    el("td", { class: "id", text: String(b.id) }),
    el("td", { class: "title" }, el("button", {
      type: "button", class: "link-button", text: b.title,
      onclick: () => { selectedId = b.id; showAll = false; void loadBooks(); },
    })),
    el("td", { class: "desc", text: b.description }),
    el("td", { class: "vec", text: vectorHead(b.vector_head.slice(0, 2)) }),
    el("td", { class: "ops" }, el("button", {
      type: "button", class: "icon-button", "aria-label": `${b.title} を削除`,
      onclick: () => void removeBook(b),
    }, trashIcon())),
  )));

  await loadVector();
}

async function loadVector(): Promise<void> {
  if (selectedId === null) {
    $("vector-detail").hidden = true;
    return;
  }
  const b = await api<BookDetail>(`/api/books/${selectedId}`);
  $("vector-detail").hidden = false;
  $("vd-title").textContent = b.title;
  $("vd-id").textContent = `id ${b.id}`;
  $("vd-dim").textContent = String(b.dimension);
  $("vd-type").textContent = `${b.dtype} BLOB`;
  $("vd-bytes").textContent = `${b.bytes.toLocaleString()} bytes`;
  $("vd-norm").textContent = fmt(b.norm);
  $("vd-model").textContent = b.model;
  const values = showAll ? b.vector : b.vector.slice(0, 4);
  $("vd-values").replaceChildren(...values.map((v) => el("div", { text: fmt(v) })));
  $("vd-toggle-label").textContent = showAll ? "先頭 4 個" : `全 ${b.dimension} 個`;
  $("vd-toggle").classList.toggle("open", showAll);
}

$("vd-toggle").addEventListener("click", () => {
  showAll = !showAll;
  void loadVector();
});

async function removeBook(book: BookSummary): Promise<void> {
  if (!confirm(`「${book.title}」を削除しますか？`)) return;
  await api<null>(`/api/books/${book.id}`, { method: "DELETE" });
  if (selectedId === book.id) selectedId = null;
  await loadBooks();
}

/* ---------- 起動 ---------- */

updatePreview();
showView();
void loadStatus();
void runSearch();
