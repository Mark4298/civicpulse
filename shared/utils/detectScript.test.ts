import assert from "node:assert/strict";
import test from "node:test";
import { detectLanguage } from "./detectScript.js";

const examples = [
  {
    text: "in my area's govt hospitals doctor's are not available properly",
    code: "en",
    label: "English",
  },
  { text: "गली में कचरा कई दिनों से नहीं उठा", code: "hi", label: "Hindi" },
  { text: "রাস্তায় বড় গর্ত আছে", code: "bn", label: "Bengali" },
  { text: "தெருவில் தண்ணீர் வரவில்லை", code: "ta", label: "Tamil" },
  {
    text: "Road par bade gadhe hain, gaadi nikalna mushkil hai",
    code: "hi-Latn",
    label: "Hinglish",
  },
  { text: "", code: "en", label: "English" },
] as const;

for (const example of examples) {
  test(`detects ${example.label} from ${JSON.stringify(example.text)}`, () => {
    const result = detectLanguage(example.text);
    assert.equal(result.code, example.code);
    assert.equal(result.label, example.label);
    assert.ok(result.confidence >= 0 && result.confidence <= 1);
  });
}
