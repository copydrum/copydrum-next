import { create } from 'zustand';

interface DialogState {
  // ━━━ Alert Dialog ━━━
  alertOpen: boolean;
  alertMessage: string;
  alertOnClose: (() => void) | null;

  // ━━━ Confirm Dialog ━━━
  confirmOpen: boolean;
  confirmMessage: string;
  confirmOnResult: ((result: boolean) => void) | null;

  // ━━━ Actions ━━━
  showAlert: (message: string) => Promise<void>;
  showConfirm: (message: string) => Promise<boolean>;
  closeAlert: () => void;
  closeConfirm: (result: boolean) => void;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  // Initial state
  alertOpen: false,
  alertMessage: '',
  alertOnClose: null,

  confirmOpen: false,
  confirmMessage: '',
  confirmOnResult: null,

  // Show alert (returns a promise that resolves when dismissed)
  showAlert: (message: string) => {
    return new Promise<void>((resolve) => {
      set({
        alertOpen: true,
        alertMessage: message,
        alertOnClose: () => resolve(),
      });
    });
  },

  // Show confirm (returns a promise that resolves with true/false)
  showConfirm: (message: string) => {
    return new Promise<boolean>((resolve) => {
      set({
        confirmOpen: true,
        confirmMessage: message,
        confirmOnResult: (result: boolean) => resolve(result),
      });
    });
  },

  // Close alert
  closeAlert: () => {
    const { alertOnClose } = get();
    set({
      alertOpen: false,
      alertMessage: '',
      alertOnClose: null,
    });
    alertOnClose?.();
  },

  // Close confirm with result
  closeConfirm: (result: boolean) => {
    const { confirmOnResult } = get();
    set({
      confirmOpen: false,
      confirmMessage: '',
      confirmOnResult: null,
    });
    confirmOnResult?.(result);
  },
}));
