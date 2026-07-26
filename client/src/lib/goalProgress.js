// Requirements optionally link to the goal they serve (requirements.goal_id).
// A goal's progress is derived from its linked requirements rather than stored,
// same "computed, not stored" philosophy as the RAG scorecard (scorecard.js).
export function goalProgress(goalId, requirements) {
  const linked = requirements.filter((r) => r.goal_id === goalId);
  return { total: linked.length, done: linked.filter((r) => r.done).length };
}
