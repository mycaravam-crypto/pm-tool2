// Shared row classes for every data table in the app (AggregatedTabs' tabs,
// ImportEventsModal's CSV preview, StakeholderDirectoryModal, MembersModal).
// A single source of truth here means a table can't quietly drift onto a
// different header/row style the way copy-pasted class strings did before.
export const TABLE_HEADER_ROW = 'text-left text-xs uppercase tracking-wide text-slate-500 border-b border-white/10';
export const TABLE_BODY_ROW = 'border-b border-white/6';
