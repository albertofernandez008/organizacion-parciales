// Carga el <script> de index.html en un sandbox sin navegador y prueba la lógica de horas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const code = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).find(c => c.includes("const STUDY_PLAN"));
const KEY = "alberto_study_plan_state_v2";

function load() {
  const store = {};
  const ctx = vm.createContext({
    console, Math, Date, JSON, Set, Object, Array, Number, String, setTimeout, clearTimeout,
    document: { addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    window: {},
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => delete store[k] },
  });
  vm.runInContext(code + `
    renderApp = () => {}; showToast = () => {};
    globalThis.__t = { moveDebtToNextTask, undoMove, getTarget, getTaskData, findTaskById, sanitizeState,
      logSession, studyStats, loadState, saveState, generatePlan, validatePlanConfig };`, ctx);
  return { t: ctx.__t, store };
}

test("pulsar 'mover' dos veces no duplica las horas", () => {
  const { t } = load();
  t.getTaskData("d12nov_mates").loggedHours = 1;
  t.moveDebtToNextTask("d12nov_mates");
  t.moveDebtToNextTask("d12nov_mates");
  assert.equal(t.getTaskData("d13nov_mates").extraHours, 1);
  assert.equal(t.getTarget(t.findTaskById("d12nov_mates")), 1);
});

test("deshacer devuelve las horas a su sitio", () => {
  const { t } = load();
  t.getTaskData("d12nov_mates").loggedHours = 1;
  t.moveDebtToNextTask("d12nov_mates");
  t.undoMove("d12nov_mates");
  assert.equal(t.getTaskData("d13nov_mates").extraHours, 0);
  assert.equal(t.getTarget(t.findTaskById("d12nov_mates")), 2);
});

test("las horas pendientes nunca caen en un examen", () => {
  const { t } = load();
  t.getTaskData("d03dic_prog").loggedHours = 1;
  t.moveDebtToNextTask("d03dic_prog");
  assert.equal(t.getTaskData("d04dic_exam_prog").extraHours, 0);
});

test("sanitizeState descarta datos corruptos", () => {
  const { t } = load();
  assert.equal(t.sanitizeState([]), null);
  const clean = t.sanitizeState({ d12nov_mates: { loggedHours: "abc", extraHours: -3 }, inventado: { loggedHours: 1 } });
  assert.equal(JSON.stringify(clean), JSON.stringify({ d12nov_mates: { loggedHours: 0, extraHours: 0, moves: [] } }));
});

test("migra datos antiguos (v2) y guarda en formato v3", () => {
  const { t, store } = load();
  store[KEY] = JSON.stringify({ d12nov_mates: { loggedHours: 1.5, extraHours: 0 } });
  t.loadState();
  assert.equal(t.getTaskData("d12nov_mates").loggedHours, 1.5);
  t.saveState();
  assert.equal(JSON.parse(store[KEY]).v, 3);
});

test("el historial calcula la racha y las horas de la semana", () => {
  const { t } = load();
  t.logSession("d12nov_mates", 1);
  const st = t.studyStats();
  assert.equal(st.streak, 1);
  assert.equal(st.week, 1);
});

test("el plan generado respeta horas, fechas, exámenes y escapa el texto", () => {
  const { t } = load();
  const cfg = { start: "2026-11-02", subjects: [{ name: "Álgebra", exam: "2026-11-12", prio: 1 }, { name: "Física <b>", exam: "2026-11-16", prio: 3 }], hours: [0, 4, 4, 4, 4, 4, 2] };
  assert.equal(t.validatePlanConfig(cfg), null);
  const plan = t.generatePlan(cfg);
  const groups = plan.phases.flatMap(p => p.groups);
  groups.forEach(g => {
    const h = g.tasks.reduce((a, x) => a + x.hours, 0);
    assert.ok(h <= cfg.hours[new Date(g.date + "T00:00:00").getDay()]);
  });
  assert.equal(plan.examIds.length, 2);
  assert.equal(groups[groups.length - 1].date, "2026-11-16");
  assert.ok(!JSON.stringify(plan).includes("<b>"));
  assert.ok(t.validatePlanConfig({ ...cfg, hours: [0, 0, 0, 0, 0, 0, 0] }));
});
