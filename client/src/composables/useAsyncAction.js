// Every create/update/delete handler in this app clears a visible error ref,
// runs a mutation, and on failure writes the error message back into that same
// ref, swallowing the exception rather than letting it propagate — surfacing
// it inline is the app's only error-reporting mechanism (no toast/log system).
// This just centralizes that shape instead of repeating it in every handler;
// callers keep their own loading flags (saving/busy/etc.) since those vary
// per component and aren't always tied 1:1 to a single action.
export function useAsyncAction(errorRef) {
  return async function run(fn) {
    errorRef.value = '';
    try {
      return await fn();
    } catch (e) {
      errorRef.value = e.message;
    }
  };
}
