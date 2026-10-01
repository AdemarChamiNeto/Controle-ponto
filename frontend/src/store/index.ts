import { combineReducers, configureStore } from "@reduxjs/toolkit";
import { useDispatch, useSelector } from "react-redux";
import { pontoApi } from "./api";
import { authSlice, loggedOut, persistToken } from "./authSlice";
import { reportSlice } from "./reportSlice";

const rootReducer = combineReducers({
  auth: authSlice.reducer,
  report: reportSlice.reducer,
  [pontoApi.reducerPath]: pontoApi.reducer,
});

export function makeStore(preloadedState?: Partial<ReturnType<typeof rootReducer>>) {
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (gDM) => gDM().concat(pontoApi.middleware),
  });

  // grava/limpa o token sempre que ele mudar
  let last = store.getState().auth.token;
  store.subscribe(() => {
    const token = store.getState().auth.token;
    if (token !== last) {
      last = token;
      persistToken(token);
      // ao sair, descarta o cache da API (dados do usuário anterior)
      if (!token) store.dispatch(pontoApi.util.resetApiState());
    }
  });
  return store;
}

export const store = makeStore();

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
export { loggedOut };
