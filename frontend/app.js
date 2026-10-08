// ブラウザで動く部分。やっているのは「入力を API に送り、返ってきた JSON を画面に描く」ことだけ。
// Embedding も類似度の計算もサーバー側（backend/）で行い、ブラウザにはモデルを置かない。

const $ = (id) => document.getElementById(id);

// 要素を作る小さなヘルパー。文字は textContent で入れるので、入力に HTML が入っても実行されない
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) node.append(child);
  return node;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (res.status === 204) return null;
  const body = await res.json();
  if (!res.ok) throw new Error(body.detail?.[0]?.msg || body.detail || res.statusText);
  return body;
}

const fmt = (x) => x.toFixed(4);
const vectorHead = (v) => `[${v.map(fmt).join(", ")}, …]`;

function step(num, name, extra, body, blue = false) {
  return el("div", { class: "step" },
    el("div", { class: "step-head" },
      el("span", { class: blue ? "num blue" : "num", text: String(num) }),
      el("span", { class: "name", text: name }),
      el("span", { class: "muted", text: extra || "" }),
    ),
    ...body,
  );
}

const pre = (text) => el("pre", { class: "mono", text });

function dl(pairs) {
  const list = el("dl");
  for (const [k, v] of pairs) list.append(el("dt", { text: k }), el("dd", { text: v }));
  return list;
}

/* ---------- 画面の切り替え（#search / #register / #database） ---------- */

const views = ["search", "register", "database"];

function showView() {
  const current = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : "search";
  for (const name of views) $(`view-${name}`).hidden = name !== current;
  for (const a of document.querySelectorAll(".segmented a")) {
    a.classList.toggle("active", a.dataset.view === current);
  }
  if (current === "database") loadBooks();
}

window.addEventListener("hashchange", showView);

/* ---------- ヘッダーのモデル表示 ---------- */

async function loadStatus() {
  const s = await api("/api/status");
  $("status-text").textContent = `${s.model.split("/").pop()} · ${s.device} · ${s.offline ? "offline" : "online"}`;
  $("status-text").parentElement.classList.add("ready");
}

/* ---------- 検索 ---------- */

// 類似度のバーは、今回の結果の最小〜最大に引き伸ばして描く（e5 は値が 0.7〜0.9 に集まるため）
function barWidths(results) {
  const scores = results.map((r) => r.similarity);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return scores.map((s) => (max === min ? 100 : 8 + (92 * (s - min)) / (max - min)));
}

async function runSearch(event) {
  event?.preventDefault();
  const query = $("q").value.trim();
  if (!query) return;
  const button = event?.submitter;
  if (button) button.disabled = true;
  try {
    const data = await api("/api/search", { method: "POST", body: JSON.stringify({ query }) });
    renderResults(data.results);
    renderSearchTrace(data.trace);
  } catch (err) {
    $("results").replaceChildren(el("div", { class: "empty", text: err.message }));
  } finally {
    if (button) button.disabled = false;
  }
}

function renderResults(results) {
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

function renderSearchTrace(t) {
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

$("search-form").addEventListener("submit", runSearch);

/* ---------- 登録 ---------- */

function updatePreview() {
  $("passage-preview").textContent = `passage: ${$("title").value.trim()}\n${$("desc").value.trim()}`;
}

$("title").addEventListener("input", updatePreview);
$("desc").addEventListener("input", updatePreview);
$("register-form").addEventListener("reset", () => setTimeout(updatePreview));

$("register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  button.disabled = true;
  $("register-error").hidden = true;
  try {
    const data = await api("/api/books", {
      method: "POST",
      body: JSON.stringify({ title: $("title").value.trim(), description: $("desc").value.trim() }),
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
      el("a", { href: "#database", class: "row-button" }, el("span", { text: "データベースで見る" })),
    );
    selectedId = data.id;
  } catch (err) {
    $("register-error").textContent = err.message;
    $("register-error").hidden = false;
  } finally {
    button.disabled = false;
  }
});

/* ---------- データベース ---------- */

let selectedId = null;
let showAll = false;
let searchTimer;

$("dbq").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadBooks, 150);
});

const trashIcon = () => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "17");
  svg.setAttribute("height", "17");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13"]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
};

async function loadBooks() {
  const data = await api(`/api/books?q=${encodeURIComponent($("dbq").value)}`);
  $("db-total").textContent = `books · ${data.total} 行`;
  $("db-sql").textContent = data.sql;
  $("db-count").textContent = `${data.books.length} / ${data.total} 件`;
  $("db-empty").hidden = data.books.length > 0;

  if (!data.books.some((b) => b.id === selectedId)) selectedId = data.books[0]?.id ?? null;

  $("db-rows").replaceChildren(...data.books.map((b) => el("tr", { class: b.id === selectedId ? "selected" : "" },
    el("td", { class: "id", text: String(b.id) }),
    el("td", {}, el("button", {
      type: "button", class: "link-button", text: b.title,
      onclick: () => { selectedId = b.id; showAll = false; loadBooks(); },
    })),
    el("td", { class: "desc", text: b.description }),
    el("td", { class: "vec", text: vectorHead(b.vector_head.slice(0, 3)) }),
    el("td", { class: "ops" }, el("button", {
      type: "button", class: "icon-button", "aria-label": `${b.title} を削除`,
      onclick: () => removeBook(b),
    }, trashIcon())),
  )));

  await loadVector();
}

async function loadVector() {
  if (selectedId === null) {
    $("vector-detail").hidden = true;
    return;
  }
  const b = await api(`/api/books/${selectedId}`);
  $("vector-detail").hidden = false;
  $("vd-title").textContent = b.title;
  $("vd-id").textContent = `id ${b.id}`;
  $("vd-dim").textContent = String(b.dimension);
  $("vd-type").textContent = `${b.dtype} BLOB`;
  $("vd-bytes").textContent = `${b.bytes.toLocaleString()} bytes`;
  $("vd-norm").textContent = fmt(b.norm);
  const values = showAll ? b.vector : b.vector.slice(0, 4);
  $("vd-values").replaceChildren(...values.map((v) => el("div", { text: fmt(v) })));
  $("vd-toggle-label").textContent = showAll ? "先頭 4 個" : `全 ${b.dimension} 個`;
  $("vd-toggle").classList.toggle("open", showAll);
}

$("vd-toggle").addEventListener("click", () => {
  showAll = !showAll;
  loadVector();
});

async function removeBook(book) {
  if (!confirm(`「${book.title}」を削除しますか？`)) return;
  await api(`/api/books/${book.id}`, { method: "DELETE" });
  if (selectedId === book.id) selectedId = null;
  loadBooks();
}

/* ---------- 起動 ---------- */

updatePreview();
showView();
loadStatus();
runSearch();
