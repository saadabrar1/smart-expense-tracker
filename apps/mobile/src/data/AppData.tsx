import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  computeInsight, learnRule, type Category, type CategorizedTransaction, type Direction, type SpendingInsight,
} from '@smart-expense/engine';
import { store, DEFAULT_SETTINGS, type Settings } from '../store';
import { fromStored, mergeTransactions, type StoredTransaction } from '../transactions';
import type { UnparsedAlert } from '../gmail/sync';
import { connectGmail as gmailConnect, disconnectGmail as gmailDisconnect, restoreGmail, type ConnectResult } from '../gmail/auth';
import { runGmailSync } from '../syncRunner';
import { drainNotifications } from '../notifications/runner';
import { NotificationCapture } from '../../modules/notification-capture';
import { enableBackgroundSync, disableBackgroundSync } from '../background';
import { transactionFromFix } from '../review/review';
import { nextPayday } from '../insights';

export interface NewTransaction {
  amount: number;
  direction: Direction;
  merchant: string;
  category: Category;
  /** Set when the user is adding an alert we couldn't read */
  fromAlertId?: string;
}

interface AppDataValue {
  ready: boolean;
  txs: StoredTransaction[];
  unparsed: UnparsedAlert[];
  settings: Settings;
  insight: SpendingInsight | null;
  payday: Date | null;
  gmailEmail: string | null;
  notifAvailable: boolean;
  notifAccess: boolean;
  syncing: boolean;
  toast: string | null;
  showToast(msg: string): void;
  reload(): Promise<void>;
  syncGmail(): Promise<void>;
  connectGmail(): Promise<ConnectResult>;
  disconnectGmail(): Promise<void>;
  openNotificationSettings(): void;
  addTransaction(input: NewTransaction): Promise<void>;
  setCategory(key: string, category: Category, always: boolean): Promise<void>;
  deleteTransaction(key: string): Promise<void>;
  resolveAlert(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): Promise<void>;
  clearAll(): Promise<void>;
}

const Ctx = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAppData must be used inside <AppDataProvider>');
  return v;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [txs, setTxs] = useState<StoredTransaction[]>([]);
  const [unparsed, setUnparsed] = useState<UnparsedAlert[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [notifAccess, setNotifAccess] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  }, []);

  const reload = useCallback(async () => {
    const [t, u, s] = await Promise.all([store.loadTransactions(), store.loadUnparsed(), store.loadSettings()]);
    setTxs(t);
    setUnparsed(u);
    setSettings(s);
  }, []);

  const syncGmail = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await runGmailSync();
      await reload();
      if (r.added) showToast(`${r.added} new from Gmail`);
    } catch {
      showToast('Gmail sync failed. Try again later.');
    } finally {
      setSyncing(false);
    }
  }, [reload, showToast]);

  // Notification capture: re-check access when returning from Settings, drain what
  // was captured while closed, and process new alerts live.
  const refreshNotifications = useCallback(async () => {
    if (!NotificationCapture.isAvailable) return;
    const granted = NotificationCapture.isPermissionGranted();
    setNotifAccess(granted);
    if (!granted) return;
    await enableBackgroundSync();
    const r = await drainNotifications();
    if (r.added || r.unparsed || r.gmailSynced) await reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await reload();
      setReady(true);
      const email = await restoreGmail().catch(() => null);
      if (cancelled) return;
      setGmailEmail(email);
      await refreshNotifications();
      if (email) {
        await enableBackgroundSync();
        await syncGmail();
      }
    })();
    const appState = AppState.addEventListener('change', s => {
      if (s === 'active') refreshNotifications();
    });
    const captured = NotificationCapture.addCapturedListener(() => {
      refreshNotifications();
    });
    return () => {
      cancelled = true;
      appState.remove();
      captured.remove();
    };
  }, [reload, refreshNotifications, syncGmail]);

  const payday = useMemo(() => nextPayday(settings.paydayDay, new Date()), [settings.paydayDay]);
  const insight = useMemo(
    () => (txs.length ? computeInsight(txs.map(fromStored), { now: new Date(), balance: settings.balance, nextIncomeOn: payday }) : null),
    [txs, settings.balance, payday],
  );

  const value: AppDataValue = {
    ready, txs, unparsed, settings, insight, payday, gmailEmail, syncing, toast,
    notifAvailable: NotificationCapture.isAvailable, notifAccess,
    showToast, reload, syncGmail,

    async connectGmail() {
      const r = await gmailConnect();
      if (r.status === 'connected') {
        setGmailEmail(r.email);
        await enableBackgroundSync();
        syncGmail();
      }
      return r;
    },

    async disconnectGmail() {
      if (!NotificationCapture.isPermissionGranted()) await disableBackgroundSync();
      await gmailDisconnect().catch(() => undefined);
      await store.clearGmail();
      setGmailEmail(null);
      await reload();
      showToast('Gmail disconnected');
    },

    openNotificationSettings() {
      NotificationCapture.openPermissionSettings();
    },

    async addTransaction(input) {
      const alert = input.fromAlertId ? unparsed.find(u => u.id === input.fromAlertId) : undefined;
      const tx: CategorizedTransaction = alert
        ? transactionFromFix(alert, input)
        : {
          amount: input.amount, currency: 'PKR', direction: input.direction, merchant: input.merchant.trim() || null,
          balance: null, accountHint: null, isTransfer: input.category === 'Transfers', occurredAt: new Date(),
          sender: 'manual', source: 'manual', parsedBy: 'manual', confidence: 1,
          category: input.direction === 'credit' ? 'Income' : input.category, categorizedBy: 'user-rule',
        };
      await store.updateTransactions(prev => mergeTransactions(prev, [tx]));
      if (input.merchant.trim() && input.direction === 'debit') {
        await store.saveUserRules(learnRule(await store.loadUserRules(), input.merchant, input.category));
      }
      if (alert) await store.removeUnparsed(alert.id);
      await reload();
    },

    async setCategory(key, category, always) {
      const target = txs.find(t => t.key === key);
      const merchant = target?.merchant?.trim().toLowerCase();
      await store.updateTransactions(prev => prev.map(t => {
        const sameMerchant = always && merchant && t.merchant?.trim().toLowerCase() === merchant && t.direction === 'debit';
        return t.key === key || sameMerchant ? { ...t, category, categorizedBy: 'user-rule', isTransfer: category === 'Transfers' } : t;
      }));
      if (always && target?.merchant) {
        await store.saveUserRules(learnRule(await store.loadUserRules(), target.merchant, category));
      }
      await reload();
    },

    async deleteTransaction(key) {
      await store.updateTransactions(prev => prev.filter(t => t.key !== key));
      await reload();
    },

    async resolveAlert(id) {
      await store.removeUnparsed(id);
      await reload();
    },

    async updateSettings(patch) {
      setSettings(await store.updateSettings(patch));
    },

    async clearAll() {
      await disableBackgroundSync();
      await gmailDisconnect().catch(() => undefined);
      NotificationCapture.clear();
      await store.clearAll();
      setGmailEmail(null);
      await reload();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
