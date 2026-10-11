import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { pontoApi } from "./api";
import { reportSlice } from "./reportSlice";

// A sessão agora é um cookie httpOnly. Apaga o token que versões antigas guardavam no localStorage.
try { localStorage.removeItem("ponto_token"); } catch { /* modo privado */ }

const rootReducer = combineReducers({
  report: reportSlice.reducer,
  [pontoApi.reducerPath]: pontoApi.reducer,
});

export function makeStore(preloadedState?: Partial<ReturnType<typeof rootReducer>>) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (gDM) => gDM().concat(pontoApi.middleware),
  });
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
