/**
 * Job search query planner.
 *
 * GET /api/jobs used to only understand single workMode/employmentType
 * values and a raw $text keyword -- everything else (location, experience
 * band, multi-select facets) got fetched wholesale and filtered in the
 * browser (see the frontend's useJobSearch.js / data/jobs.js). That doesn't
 * scale past a small job list.
 *
 * This module is the one place that turns the search UI's filter shape --
 * keyword, location, workMode(s), employmentType(s), experience level(s),
 * sort, page, limit -- into an actual Mongo filter + sort + pagination plan,
 * built against the indexes Jobs.js already declares:
 *   - { title: text, description: text, skills: text }   -> keyword
 *   - { status: 1, workMode: 1, employmentType: 1 }       -> facets
 *   - { status: 1, publishedAt: -1 }                      -> default sort
 *
 * Always scopes to ACTIVE jobs -- this is for the public board only.
 */

const WORK_MODES = new Set(["REMOTE", "HYBRID", "ONSITE"]);
const EMPLOYMENT_TYPES = new Set([
  "FULL_TIME",
  "PART_TIME",
  "CONTRACT",
  "INTERNSHIP",
]);

// Mirrors the frontend's data/jobs.js EXPERIENCE_LEVELS exactly -- keep
// these two in sync if the bands ever change.
const EXPERIENCE_LEVELS = {
  entry: { min: 0, max: 1 },
  mid: { min: 2, max: 5 },
  senior: { min: 6, max: 99 },
};

const SORTS = {
  recent: { publishedAt: -1 },
  applicants: { applicantCount: 1 },
  experience: { "experience.min": 1 },
};

/** Splits "REMOTE,HYBRID" or ["REMOTE","HYBRID"] into a clean array. */
const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) {
    return value.split(",").map((item) => item.trim());
  }
  return [];
};

// Silently drops anything that isn't a real enum value rather than 500ing
// on a typo'd query param.
const onlyKnown = (values, known) =>
  values.map((value) => value.toUpperCase()).filter((value) => known.has(value));

/**
 * A job matches a selected experience band if its [min, max] range overlaps
 * that band's range at all -- not an exact match, an overlap. Multiple
 * selected bands OR together.
 */
const buildExperienceClause = (levelIds) => {
  const bands = levelIds.map((id) => EXPERIENCE_LEVELS[id]).filter(Boolean);

  if (bands.length === 0) return null;

  return {
    $or: bands.map((band) => ({
      "experience.min": { $lte: band.max },
      "experience.max": { $gte: band.min },
    })),
  };
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turns req.query into { filter, sort, page, limit } for Job.find().
 */
const buildJobQueryPlan = (query = {}) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);

  const clauses = [{ status: "ACTIVE" }];

  const workModes = onlyKnown(toList(query.workMode), WORK_MODES);
  if (workModes.length === 1) clauses.push({ workMode: workModes[0] });
  if (workModes.length > 1) clauses.push({ workMode: { $in: workModes } });

  const types = onlyKnown(toList(query.employmentType), EMPLOYMENT_TYPES);
  if (types.length === 1) clauses.push({ employmentType: types[0] });
  if (types.length > 1) clauses.push({ employmentType: { $in: types } });

  const experienceClause = buildExperienceClause(toList(query.level));
  if (experienceClause) clauses.push(experienceClause);

  if (query.location && String(query.location).trim()) {
    const regex = new RegExp(escapeRegExp(String(query.location).trim()), "i");
    clauses.push({
      $or: [
        { "location.city": regex },
        { "location.state": regex },
        { "location.country": regex },
      ],
    });
  }

  // Accept both `q` (old param name) and `keyword` (what the frontend's
  // filter state actually calls it) so nothing breaks mid-migration.
  const keyword = query.q || query.keyword;
  if (keyword) {
    clauses.push({ $text: { $search: String(keyword) } });
  }

  const filter = clauses.length === 1 ? clauses[0] : { $and: clauses };
  const sort = SORTS[query.sort] ?? SORTS.recent;

  return { filter, sort, page, limit };
};

module.exports = { buildJobQueryPlan, EXPERIENCE_LEVELS, SORTS };
