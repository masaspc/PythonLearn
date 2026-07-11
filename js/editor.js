export async function createEditor(host, fallback, initialCode) {
  let view = null;
  const setFallback = () => { host.hidden = true; fallback.hidden = false; fallback.value = initialCode; };
  try {
    const [{ basicSetup, EditorView }, { python }, { keymap }, { indentWithTab }] = await Promise.all([
      import("codemirror"), import("@codemirror/lang-python"), import("@codemirror/view"), import("@codemirror/commands"),
    ]);
    view = new EditorView({ doc: initialCode, extensions: [basicSetup, python(), keymap.of([indentWithTab])], parent: host });
  } catch (error) { console.warn("CodeMirror の読み込みに失敗しました。テキストエリアを使います。", error); setFallback(); }
  return {
    get: () => view ? view.state.doc.toString() : fallback.value,
    set: (code) => { if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } }); else fallback.value = code; },
    focus: () => { if (view) view.focus(); else fallback.focus(); },
  };
}
