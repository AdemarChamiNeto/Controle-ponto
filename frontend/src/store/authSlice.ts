import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

const KEY = "ponto_token";

function readToken() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export interface AuthState { token: string | null }

const initialState: AuthState = { token: readToken() };

export const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    loggedIn(state, action: PayloadAction<string>) {
      state.token = action.payload;
    },
    loggedOut(state) {
      state.token = null;
    },
  },
});

export const { loggedIn, loggedOut } = authSlice.actions;

/** Mantém o token no localStorage sincronizado com o estado do Redux. */
export function persistToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* modo privado: segue só em memória */ }
}
