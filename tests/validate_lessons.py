"""レッスンJSONの最低限の構造と演習判定を検証する（外部依存なし）。"""
from __future__ import annotations

import contextlib
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LESSON_DIR = ROOT / "data" / "lessons"


def fails_or_passes(code: str, test_code: str) -> bool:
    namespace: dict[str, object] = {}
    output = io.StringIO()
    try:
        with contextlib.redirect_stdout(output):
            exec(code, namespace)
        namespace["__stdout__"] = output.getvalue()
        exec(test_code, namespace)
    except BaseException:
        return False
    return True


def main() -> None:
    manifest = json.loads((LESSON_DIR / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["version"] == 1
    assert len(manifest["chapters"]) == 10
    checked = 0
    for filename in manifest["chapters"]:
        chapter = json.loads((LESSON_DIR / filename).read_text(encoding="utf-8"))
        assert re.fullmatch(r"ch\d{2}", chapter["id"])
        assert filename == f"{chapter['id']}.json"
        assert 3 <= len(chapter["lessons"]) <= 5
        for index, lesson in enumerate(chapter["lessons"], start=1):
            assert lesson["id"] == f"{chapter['id']}-{index:02d}"
            exercise = lesson["exercise"]
            assert len(lesson["objectives"]) in (1, 2, 3)
            assert len(exercise["hints"]) == 2
            for field in (lesson["example"]["code"], exercise["starterCode"], exercise["solution"]["code"]):
                assert "input(" not in field
            assert fails_or_passes(exercise["solution"]["code"], exercise["testCode"]), f"solution failed: {lesson['id']}"
            assert not fails_or_passes(exercise["starterCode"], exercise["testCode"]), f"starter passed: {lesson['id']}"
            checked += 1
    assert checked == 43, f"expected 43 lessons, got {checked}"
    print(f"OK: {checked} exercises (solutions pass, starters fail)")


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f"NG: {error}", file=sys.stderr)
        raise SystemExit(1)
