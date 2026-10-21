import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";

// Execute the actual Android-injected read-only adapter against minimal DOM fixtures.
const java = fs.readFileSync(new URL("../../app/src/main/java/com/local/sgplaykeeper/EquipmentObservationScript.java", import.meta.url), "utf8");
const script = java.match(/READ = """([\s\S]*?)""";/)[1];
function element(attributes = {}, children = [], visible = true) {
  return { getClientRects: () => visible ? [1] : [],
    getAttribute: key => attributes[key] ?? null,
    querySelectorAll: () => children, closest: () => null };
}
function read(panels) {
  return JSON.parse(vm.runInNewContext(script, { document: { querySelectorAll: () => panels } }));
}
function panel(main, slots) {
  const result = element(main ? { "data-pet-scope": "main" } : {});
  result.querySelectorAll = selector => slots[selector] || [];
  return result;
}
test("equipment observation never substitutes requested names for missing data", () => {
  const result = read([panel(true, { ".item1": [element()] })]);
  assert.deepEqual(result.observed, {});
});
test("ambiguous panels and duplicate slots provide no false equipment proof", () => {
  assert.equal(read([panel(true, {}), panel(true, {})]).status, "unknown");
  const slot = element({ "data-equipment-name": "厄菲斯神冠" });
  assert.deepEqual(read([panel(true, { ".item1": [slot, slot] })]).observed, {});
});
test("actual names without proven main-pet identity remain unverified", () => {
  const result = read([panel(false, { ".item1": [element({ "data-equipment-name": "厄菲斯神冠+15" })] })]);
  assert.equal(result.main, false);
  assert.equal(result.observed["头部"], "厄菲斯神冠+15");
});
test("conflicting visible names cannot count as a verified slot", () => {
  const slot = element({ "data-equipment-name": "厄菲斯神冠" }, [element({ alt: "另一件头盔" })]);
  assert.deepEqual(read([panel(true, { ".item1": [slot] })]).observed, {});
});
test("hidden panels are ignored and proven scope retains real slot names", () => {
  const slot = element({}, [element({ alt: "柔情方巾§恋§(+15)" })]);
  const result = read([element({}, [], false), panel(true, { ".item1": [slot] })]);
  assert.equal(result.main, true);
  assert.equal(result.observed["头部"], "柔情方巾§恋§(+15)");
});
