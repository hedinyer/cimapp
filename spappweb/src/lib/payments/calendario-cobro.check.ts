import assert from "node:assert/strict";
import {
  CALENDARIO_LUN_SAB,
  anclaPreviewYmd,
  calendarioFromAdminData,
  diasCobroPorPeriodo,
  fechasTalonarioLunSab,
  periodosAnuales,
  periodosContratoFromAdminData,
  skipSunday,
  parseIsoDateUtc,
  formatIsoDateUtc,
  weekdayUtc,
} from "./calendario-cobro.ts";

assert.equal(diasCobroPorPeriodo("semanal"), 7);
assert.equal(diasCobroPorPeriodo("semanal", CALENDARIO_LUN_SAB), 6);
assert.equal(diasCobroPorPeriodo("quincenal", CALENDARIO_LUN_SAB), 12);
assert.equal(diasCobroPorPeriodo("mensual", CALENDARIO_LUN_SAB), 24);
assert.equal(periodosAnuales("diario", CALENDARIO_LUN_SAB), 312);
assert.equal(periodosAnuales("semanal", CALENDARIO_LUN_SAB), 52);
assert.equal(periodosAnuales("quincenal", CALENDARIO_LUN_SAB), 26);
assert.equal(periodosAnuales("mensual", CALENDARIO_LUN_SAB), 13);

assert.equal(calendarioFromAdminData(null), "lun_dom");
assert.equal(calendarioFromAdminData({ calendario_cobro: "lun_sab" }), "lun_sab");
assert.equal(periodosContratoFromAdminData({ periodos_contrato: 8 }), 8);

const monday = "2026-10-26";
assert.equal(weekdayUtc(monday), 1);

const weeklyFromMonday = fechasTalonarioLunSab({
  anclaYmd: monday,
  frecuencia: "semanal",
  periodos: 8,
});
assert.equal(weeklyFromMonday.length, 8);
assert.equal(weeklyFromMonday[0], "2026-10-31");
assert.equal(weekdayUtc(weeklyFromMonday[0]), 6);
assert.equal(weeklyFromMonday[1], "2026-11-07");
assert.equal(weekdayUtc(weeklyFromMonday[1]), 6);
for (const fecha of weeklyFromMonday) {
  assert.notEqual(weekdayUtc(fecha), 0);
}

const dailyFromMonday = fechasTalonarioLunSab({
  anclaYmd: monday,
  frecuencia: "diario",
  periodos: 8,
});
assert.equal(dailyFromMonday[0], monday);
assert.equal(dailyFromMonday[5], "2026-10-31");
assert.equal(dailyFromMonday[6], "2026-11-02");
assert.equal(weekdayUtc(dailyFromMonday[6]), 1);
for (const fecha of dailyFromMonday) {
  assert.notEqual(weekdayUtc(fecha), 0);
}

const sundayAncla = fechasTalonarioLunSab({
  anclaYmd: "2026-11-01",
  frecuencia: "semanal",
  periodos: 1,
});
assert.equal(sundayAncla[0], "2026-11-07");

const skipped = formatIsoDateUtc(skipSunday(parseIsoDateUtc("2026-11-01")));
assert.equal(skipped, "2026-11-02");

assert.match(anclaPreviewYmd(), /^\d{4}-\d{2}-\d{2}$/);

console.log("calendario-cobro.check OK");
