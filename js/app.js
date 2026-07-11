export const DATA_DIR = new URL("../data/lessons/", import.meta.url);
const STORAGE_KEY = "pythonlearn.progress.v1";

export function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return value && typeof value === "object" && value.lessons && typeof value.lessons === "object" ? value : { lessons: {} };
  } catch { return { lessons: {} }; }
}
export function markPassed(lessonId) {
  const progress = readProgress();
  progress.lessons[lessonId] = { passedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
export function clearProgress() { localStorage.removeItem(STORAGE_KEY); }
export async function loadJson(filename) {
  const response = await fetch(new URL(filename, DATA_DIR));
  if (!response.ok) throw new Error(`${filename} を読み込めませんでした (${response.status})`);
  return response.json();
}
export function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export function appendInline(parent, text) {
  const tokens = String(text).split(/(`[^`]*`|\*\*[^*]+\*\*)/g);
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("`") && token.endsWith("`")) parent.append(element("code", "inline-code", token.slice(1, -1)));
    else if (token.startsWith("**") && token.endsWith("**")) parent.append(element("strong", "", token.slice(2, -2)));
    else {
      const lines = token.split("\n");
      lines.forEach((line, index) => { if (index) parent.append(document.createElement("br")); parent.append(document.createTextNode(line)); });
    }
  }
}
export function renderSections(sections) {
  const fragment = document.createDocumentFragment();
  for (const section of sections || []) {
    if (!section || !section.type) continue;
    if (section.type === "text") { const p = element("p"); appendInline(p, section.body || ""); fragment.append(p); }
    if (section.type === "heading") fragment.append(element("h3", "", section.body || ""));
    if (section.type === "code") {
      const wrap = element("div", "code-block"); if (section.caption) { const cap = element("div", "code-caption"); appendInline(cap, section.caption); wrap.append(cap); }
      const pre = element("pre"); pre.append(element("code", "", section.code || "")); wrap.append(pre); fragment.append(wrap);
    }
    if (section.type === "list") { const ul = element("ul"); for (const item of section.items || []) { const li = element("li"); appendInline(li, item); ul.append(li); } fragment.append(ul); }
    if (section.type === "note") { const note = element("aside", `notice ${section.style === "warning" ? "warning" : "info"}`); appendInline(note, section.body || ""); fragment.append(note); }
  }
  return fragment;
}

async function initHome() {
  const list = document.getElementById("chapter-list");
  if (!list) return;
  try {
    const manifest = await loadJson("manifest.json");
    const chapters = await Promise.all(manifest.chapters.map(loadJson));
    const progress = readProgress();
    const total = chapters.reduce((sum, chapter) => sum + chapter.lessons.length, 0);
    const passed = chapters.flatMap(c => c.lessons).filter(lesson => progress.lessons[lesson.id]).length;
    document.getElementById("progress-text").textContent = `演習の合格：${passed} / ${total} レッスン`;
    document.getElementById("progress-bar-fill").style.width = `${total ? passed / total * 100 : 0}%`;
    for (const chapter of chapters) {
      const completed = chapter.lessons.filter(lesson => progress.lessons[lesson.id]).length;
      const card = element("a", "chapter-card");
      card.href = `./lesson.html?chapter=${chapter.number}&lesson=1`;
      card.append(element("span", "chapter-number", `CHAPTER ${String(chapter.number).padStart(2, "0")}`));
      card.append(element("h3", "", chapter.title)); card.append(element("p", "", chapter.description));
      const meta = element("div", "chapter-meta"); meta.append(document.createTextNode(`演習合格 ${completed} / ${chapter.lessons.length}`));
      if (completed === chapter.lessons.length) meta.append(document.createTextNode(" "), element("span", "complete-badge", "完了"));
      card.append(meta); list.append(card);
    }
  } catch (error) { const notice = document.getElementById("load-error"); notice.hidden = false; notice.textContent = `読み込みに失敗しました。ローカルサーバー経由で開いているか確認してください。${error.message}`; }
  document.getElementById("reset-progress").addEventListener("click", () => { if (confirm("保存した学習進捗をすべてリセットしますか？")) { clearProgress(); location.reload(); } });
}
initHome();
