'use strict';

/**
 * Auto-computed school grade for the "自我介绍" cards and memoir opener.
 *
 * Enrolled autumn 2025 as a freshman (大一). The school year flips on
 * 1 September, so a build on 2026-03 still reports 大一 while one on
 * 2026-10 reports 大二. intro.yml marks the spots with tokens:
 *
 *   {{grade}}        bare grade name, usable mid-sentence (普通的{{grade}}学生)
 *   {{grade_status}} status phrase for the identity card (大二在读)
 *
 * After 大四 both tokens resolve to a "graduated" label. To change the
 * enrolment year (e.g. a gap year), edit ENROLMENT_YEAR below.
 */

const ENROLMENT_YEAR = 2025;
const SCHOOL_YEAR_START_MONTH = 9; // 1-based: September

const GRADES = {
  'zh-cn': { names: ['大一', '大二', '大三', '大四'], graduated: '已毕业', status: (g) => `${g}在读` },
  'zh-tw': { names: ['大一', '大二', '大三', '大四'], graduated: '已畢業', status: (g) => `${g}在讀` },
  en: { names: ['freshman', 'sophomore', 'junior', 'senior'], graduated: 'college graduate', status: (g) => `college ${g}` },
  ja: { names: ['一年生', '二年生', '三年生', '四年生'], graduated: '大学卒業', status: (g) => `大学${g}` },
};

const DEFAULT_LANG = 'zh-cn';

/** 1-based year of study; clamps to 1 before enrolment. */
function gradeIndex(now = new Date()) {
  const yearsSinceEnrolment = now.getFullYear() - ENROLMENT_YEAR + (now.getMonth() + 1 >= SCHOOL_YEAR_START_MONTH ? 1 : 0);
  return Math.max(yearsSinceEnrolment, 1);
}

/** Token map for one edition's intro strings. */
function gradeTokens(lang, now = new Date()) {
  const table = GRADES[lang] || GRADES[DEFAULT_LANG];
  const graduated = gradeIndex(now) > table.names.length;
  const bare = graduated ? table.graduated : table.names[gradeIndex(now) - 1];
  return { '{{grade}}': bare, '{{grade_status}}': graduated ? table.graduated : table.status(bare) };
}

/** Deep-replace grade tokens in every string of the intro data tree. */
function applyGradeTokens(value, tokens) {
  if (typeof value === 'string') {
    return value.replace(/\{\{grade(_status)?\}\}/g, (m) => tokens[m] || m);
  }
  if (Array.isArray(value)) return value.map((v) => applyGradeTokens(v, tokens));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, applyGradeTokens(v, tokens)]));
  }
  return value;
}

module.exports = { gradeIndex, gradeTokens, applyGradeTokens };
