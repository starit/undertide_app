import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ViewMode = "grid" | "list";

interface UiState {
  proposalView: ViewMode;
  spaceView: ViewMode;
}

const initialState: UiState = {
  proposalView: "list",
  spaceView: "grid",
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setProposalView(state, action: PayloadAction<ViewMode>) {
      state.proposalView = action.payload;
    },
    setSpaceView(state, action: PayloadAction<ViewMode>) {
      state.spaceView = action.payload;
    },
  },
});

export const { setProposalView, setSpaceView } = uiSlice.actions;
export const uiReducer = uiSlice.reducer;
