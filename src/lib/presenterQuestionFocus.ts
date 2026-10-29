type Snapshot = { sessionId: string; questionId: string | null; activeId: string | null; history: boolean; revision: number }

// Adapted from LingoAct's presenterActivityFocus: a dispatch or a deliberate
// history selection invalidates snapshots issued before that navigation.
export function createPresenterQuestionFocus(sessionId = '') {
  let state: Snapshot = { sessionId, questionId: null, activeId: null, history: false, revision: 0 }
  return {
    snapshot: () => ({ ...state }),
    accepts: (snapshot: Snapshot) => snapshot.sessionId === state.sessionId && snapshot.revision === state.revision,
    select(questionId: string) {
      state = { ...state, questionId, history: true, revision: state.revision + 1 }
    },
    dispatch(questionId: string) {
      state = { ...state, questionId, activeId: questionId, history: false, revision: state.revision + 1 }
    },
    reconcile(snapshot: Snapshot, activeId: string | null, ids: string[]) {
      if (snapshot.sessionId !== state.sessionId || snapshot.revision !== state.revision) return null
      const newlyActive = activeId !== null && activeId !== state.activeId
      const history = state.history && !newlyActive
      const questionId = history && state.questionId && ids.includes(state.questionId)
        ? state.questionId : activeId || ids.at(-1) || null
      state = { ...state, questionId, activeId, history }
      return { ...state }
    },
  }
}
