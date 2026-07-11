import { element, appendInline, renderSections, loadJson, markPassed, readProgress } from "./app.js";
import { createEditor } from "./editor.js";
import { PythonRunner } from "./runner.js";

const page = document.getElementById("lesson-page");
function parameter(name) { return new URLSearchParams(location.search).get(name); }
function codeBlock(code) { const wrap = element("div", "code-block"); const pre = element("pre"); pre.append(element("code", "", code)); wrap.append(pre); return wrap; }
function outputWriter(output) { return (text, className = "") => { const span = element("span", className, text); output.append(span); output.scrollTop = output.scrollHeight; }; }
function showError(message) { page.replaceChildren(element("section", "error-page", message)); }

async function init() {
  const chapterNumber = Number(parameter("chapter")); const lessonNumber = Number(parameter("lesson"));
  if (!Number.isInteger(chapterNumber) || !Number.isInteger(lessonNumber) || chapterNumber < 1 || chapterNumber > 10 || lessonNumber < 1) { showError("レッスンの指定が正しくありません。章一覧から選び直してください。"); return; }
  let chapter;
  try { chapter = await loadJson(`ch${String(chapterNumber).padStart(2, "0")}.json`); } catch (error) { showError(`レッスンを読み込めませんでした。${error.message}`); return; }
  const lesson = chapter.lessons[lessonNumber - 1];
  if (!lesson) { showError("このレッスンはまだ用意されていません。章一覧に戻って選び直してください。"); return; }
  document.title = `${lesson.title} | PythonLearn`;
  renderLesson(chapter, lesson, lessonNumber);
}

async function renderLesson(chapter, lesson, lessonNumber) {
  const breadcrumb = element("p", "breadcrumb", `第${chapter.number}章 / レッスン ${lessonNumber}`);
  const header = element("header", "lesson-header"); header.append(element("p", "eyebrow", `CHAPTER ${String(chapter.number).padStart(2, "0")}`), element("h1", "", lesson.title));
  if (lesson.estimatedMinutes) header.append(element("p", "", `目安：${lesson.estimatedMinutes}分`));
  const objectives = element("section", "objectives"); objectives.append(element("h2", "", "このレッスンでできるようになること")); const objectiveList = element("ul");
  lesson.objectives.forEach(text => { const li = element("li"); appendInline(li, text); objectiveList.append(li); }); objectives.append(objectiveList); header.append(objectives);
  const content = element("article", "content-column"); content.append(element("h2", "", "解説"), renderSections(lesson.explanation));
  const example = element("section", "example"); example.append(element("h2", "", "実行例"), codeBlock(lesson.example.code)); if (lesson.example.note) { const note = element("p", "example-note"); appendInline(note, lesson.example.note); example.append(note); }
  const tryExample = element("button", "button secondary", "このコードをエディタで試す"); example.append(tryExample); content.append(example);
  const exercise = element("section", "exercise"); exercise.append(element("h2", "", "演習問題"), renderSections(lesson.exercise.prompt));
  lesson.exercise.hints.forEach((hint, index) => { const details = element("details", "hint"); details.append(element("summary", "", `ヒント${index + 1}を見る`)); const body = element("div", "hint-content"); body.append(renderSections(hint)); details.append(body); exercise.append(details); });
  const solution = element("details", "solution"); solution.append(element("summary", "", "模範解答を見る")); const solutionBody = element("div", "hint-content"); solutionBody.append(codeBlock(lesson.exercise.solution.code)); if (lesson.exercise.solution.explanation) solutionBody.append(renderSections(lesson.exercise.solution.explanation)); solution.append(solutionBody); exercise.append(solution);
  const practice = element("aside", "practice-column"); const card = element("section", "practice-card"); card.append(element("h2", "", "コードを書いてみよう"));
  const editorHost = element("div", "editor-host"); const fallback = element("textarea", "fallback-editor"); fallback.hidden = true; fallback.spellcheck = false; fallback.setAttribute("aria-label", "Pythonコード"); card.append(editorHost, fallback);
  const status = element("span", "runner-status", "エディタを準備しています…"); status.setAttribute("role", "status"); const controls = element("div", "button-row"); const run = element("button", "button", "▶ 実行"); const check = element("button", "button secondary", "答えを確認"); run.disabled = true; check.disabled = true; controls.append(run, check); const output = element("pre", "output"); output.setAttribute("aria-label", "実行結果"); card.append(status, controls, output); practice.append(card);
  const main = element("div", "lesson-main"); main.append(content, practice); const result = element("div", "result is-hidden"); exercise.append(result);
  const nav = element("nav", "lesson-nav"); nav.setAttribute("aria-label", "レッスン移動");
  const previous = lessonNumber > 1 ? `./lesson.html?chapter=${chapter.number}&lesson=${lessonNumber - 1}` : "./index.html"; const next = lessonNumber < chapter.lessons.length ? `./lesson.html?chapter=${chapter.number}&lesson=${lessonNumber + 1}` : "./index.html";
  const prevLink = element("a", "", lessonNumber > 1 ? "← 前のレッスン" : "← 章一覧"); prevLink.href = previous; const nextLink = element("a", "", lessonNumber < chapter.lessons.length ? "次のレッスン →" : "章一覧へ →"); nextLink.href = next; nav.append(prevLink, nextLink);
  page.replaceChildren(breadcrumb, header, main, exercise, nav);
  const writeOutput = outputWriter(output);
  const setStatus = (text, kind) => { status.textContent = text; status.dataset.state = kind; run.disabled = kind !== "ready"; check.disabled = kind !== "ready"; };
  const runner = new PythonRunner({ onStatus:setStatus, onOutput:writeOutput, onTimeout:(message) => writeOutput(`[タイムアウト] ${message.error}\n`, "stderr") });
  const editor = await createEditor(editorHost, fallback, lesson.exercise.starterCode);
  tryExample.addEventListener("click", () => { editor.set(lesson.example.code); editor.focus(); writeOutput("--- 実行例を読み込みました ---\n", "system"); });
  run.addEventListener("click", async () => { output.replaceChildren(); writeOutput("--- 実行 ---\n", "system"); try { const response = await runner.run(editor.get()); if (!response.ok) writeOutput(`${response.error}\n`, "stderr"); else writeOutput("--- 実行終了 ---\n", "system"); } catch (error) { writeOutput(`${error.message}\n`, "stderr"); } });
  check.addEventListener("click", async () => { result.className = "result is-hidden"; output.replaceChildren(); try { const response = await runner.judge(editor.get(), lesson.exercise.testCode); if (response.passed) { markPassed(lesson.id); result.className = "result success"; result.textContent = "合格です！ よくできました。次のレッスンへ進みましょう。"; } else { result.className = "result failure"; result.textContent = response.timedOut ? response.error : (response.judgeError ? `判定中にエラーが発生しました: ${response.error}` : `まだ合格ではありません: ${response.error}`); } } catch (error) { result.className = "result failure"; result.textContent = `確認できませんでした: ${error.message}`; } });
  if (readProgress().lessons[lesson.id]) { result.className = "result success"; result.textContent = "この演習はすでに合格しています。もう一度挑戦しても大丈夫です。"; }
}
init();
