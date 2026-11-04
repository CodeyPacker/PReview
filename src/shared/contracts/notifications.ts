import { z } from 'zod';

// What a notification is about. Each kind but review has a setting that turns its desktop
// notifications off. review is a queued review that was sent or couldn't be.
export const notificationKindSchema = z.enum(['pull-request', 'agent', 'achievement', 'review']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const appNotificationSchema = z.object({
  id: z.number().int(),
  kind: notificationKindSchema,
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  read: z.boolean(),
});
export type AppNotification = z.infer<typeof appNotificationSchema>;

export const notificationsStateSchema = z.object({
  // Newest first.
  notifications: z.array(appNotificationSchema),
  unread: z.number().int(),
});
export type NotificationsState = z.infer<typeof notificationsStateSchema>;

export const setQuietInputSchema = z.object({ quiet: z.boolean() });
