import { configureStore } from "@reduxjs/toolkit";
import { uiReducer } from "@/store/ui-slice";

export const store = configureStore({
  reducer: {
    ui: uiReducer,
  },
});

export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
