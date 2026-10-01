import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export const TZ = "America/Sao_Paulo";
export const todayKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });

export interface ReportState { month: string }

export const reportSlice = createSlice({
  name: "report",
  initialState: (): ReportState => ({ month: todayKey().slice(0, 7) }),
  reducers: {
    monthChanged(state, action: PayloadAction<string>) {
      if (/^\d{4}-(0[1-9]|1[0-2])$/.test(action.payload)) state.month = action.payload;
    },
  },
});

export const { monthChanged } = reportSlice.actions;
