import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { CapturedNotification } from '../../src/notifications/process';

type Events = { onCaptured: (n: CapturedNotification) => void };

declare class NotificationCaptureNative extends NativeModule<Events> {
  isPermissionGranted(): boolean;
  openPermissionSettings(): void;
  getPending(): CapturedNotification[];
  ack(ids: string[]): void;
  setBlockedPackages(packages: string[]): void;
  clear(): void;
}

// Optional: missing on iOS/web and in Expo Go (needs a development build).
const native = Platform.OS === 'android' ? requireOptionalNativeModule<NotificationCaptureNative>('NotificationCapture') : null;

export const NotificationCapture = {
  isAvailable: native != null,
  isPermissionGranted: () => native?.isPermissionGranted() ?? false,
  openPermissionSettings: () => native?.openPermissionSettings(),
  getPending: (): CapturedNotification[] => native?.getPending() ?? [],
  ack: (ids: string[]) => {
    if (ids.length) native?.ack(ids);
  },
  setBlockedPackages: (packages: string[]) => native?.setBlockedPackages(packages),
  clear: () => native?.clear(),
  addCapturedListener(listener: (n: CapturedNotification) => void): { remove(): void } {
    return native ? native.addListener('onCaptured', listener) : { remove() {} };
  },
};
